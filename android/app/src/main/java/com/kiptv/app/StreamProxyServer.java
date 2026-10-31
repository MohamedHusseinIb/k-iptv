package com.kiptv.app;

import android.util.Base64;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PushbackInputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Loopback HTTP proxy that sits between the WebView's media stack and the IPTV
 * provider.
 *
 * The WebView is much less forgiving than desktop Chrome about how a stream is
 * served. Providers routinely answer with {@code application/octet-stream} for
 * an MP4, serve HLS without CORS headers, or sit on plain HTTP while the app is
 * served from {@code https://localhost}. Each of those alone is enough to abort
 * playback with a {@code MediaError} that carries no usable detail.
 *
 * Every request the player makes is therefore rewritten to this server, which
 * fetches the real resource and re-serves it as something the WebView accepts:
 * a sane {@code Content-Type}, permissive CORS, honoured {@code Range}
 * requests so seeking works, and HLS manifests rewritten so their segment URIs
 * come back through the proxy as well.
 */
final class StreamProxyServer {

    private static final String TAG = "StreamProxy";
    private static final int MAX_REDIRECTS = 5;
    private static final int CONNECT_TIMEOUT_MS = 20000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int TRANSFER_BUFFER = 64 * 1024;
    private static final long MAX_MANIFEST_BYTES = 8L * 1024 * 1024;

    /**
     * Sent upstream in place of the WebView's own agent. Some providers reject
     * or throttle requests whose agent they do not recognise.
     */
    private static final String UPSTREAM_USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

    private static final Pattern URI_ATTRIBUTE = Pattern.compile("URI=\"([^\"]*)\"");

    private ServerSocket serverSocket;
    private ExecutorService workers;
    private Thread acceptThread;
    private volatile boolean running;

    /**
     * Last upstream outcome. A provider that rejects a stream (expired token,
     * user-agent filtering, exhausted connection slots) answers with a status
     * and content type that explain a failure the media element can only report
     * as a generic decode error, so it is surfaced through diagnostics.
     */
    private volatile int lastUpstreamStatus;
    private volatile String lastUpstreamType = "";
    private volatile String lastUpstreamError = "";
    private volatile UpstreamListener upstreamListener;

    /** Receives upstream outcomes, notified only when the outcome changes. */
    public interface UpstreamListener {
        void onUpstream(int status, String contentType, String error);
    }

    public void setUpstreamListener(UpstreamListener listener) {
        this.upstreamListener = listener;
    }

    public int getLastUpstreamStatus() {
        return lastUpstreamStatus;
    }

    public String getLastUpstreamType() {
        return lastUpstreamType;
    }

    public String getLastUpstreamError() {
        return lastUpstreamError;
    }

    /**
     * Segment requests repeat the same outcome many times per minute, so the
     * listener only fires when something actually changes.
     */
    private void recordUpstream(int status, String contentType, String error) {
        String type = contentType == null ? "" : contentType;
        String reason = error == null ? "" : error;
        if (status == lastUpstreamStatus
            && type.equals(lastUpstreamType)
            && reason.equals(lastUpstreamError)) {
            return;
        }
        lastUpstreamStatus = status;
        lastUpstreamType = type;
        lastUpstreamError = reason;
        UpstreamListener listener = upstreamListener;
        if (listener != null) {
            listener.onUpstream(status, type, reason);
        }
    }
    private int port = -1;

    synchronized int start() throws IOException {
        if (running) {
            return port;
        }
        serverSocket = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        port = serverSocket.getLocalPort();
        workers = Executors.newCachedThreadPool();
        running = true;

        acceptThread = new Thread(this::acceptLoop, "stream-proxy-accept");
        acceptThread.setDaemon(true);
        acceptThread.start();

        Log.i(TAG, "listening on 127.0.0.1:" + port);
        return port;
    }

    synchronized void stop() {
        running = false;
        closeQuietly(serverSocket);
        if (workers != null) {
            workers.shutdownNow();
            workers = null;
        }
        serverSocket = null;
        port = -1;
    }

    synchronized int getPort() {
        return port;
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket client = serverSocket.accept();
                ExecutorService pool = workers;
                if (pool == null) {
                    closeQuietly(client);
                    break;
                }
                pool.execute(() -> handleClient(client));
            } catch (IOException e) {
                if (running) {
                    Log.w(TAG, "accept failed", e);
                }
            }
        }
    }

    private void handleClient(Socket client) {
        try {
            client.setSoTimeout(READ_TIMEOUT_MS);
            client.setTcpNoDelay(true);
            PushbackInputStream in = new PushbackInputStream(client.getInputStream(), 8192);
            OutputStream rawOut = client.getOutputStream();
            BufferedOutputStream out = new BufferedOutputStream(rawOut, TRANSFER_BUFFER);

            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) {
                return;
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeSimple(out, 400, "Bad Request");
                return;
            }
            String method = parts[0];
            String target = parts[1];

            Map<String, String> requestHeaders = readHeaders(in);

            if ("OPTIONS".equalsIgnoreCase(method)) {
                writePreflight(out);
                return;
            }
            if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
                writeSimple(out, 405, "Method Not Allowed");
                return;
            }

            String upstreamUrl = extractTargetUrl(target);
            if (upstreamUrl == null) {
                writeSimple(out, 400, "Missing or malformed target");
                return;
            }

            proxy(upstreamUrl, method, requestHeaders, out);
        } catch (IOException e) {
            // A player that seeks or switches channel simply drops the socket.
            Log.d(TAG, "client ended: " + e.getMessage());
        } finally {
            closeQuietly(client);
        }
    }

    /** Decodes {@code /s?u=<base64url>} into the absolute upstream URL. */
    private String extractTargetUrl(String target) {
        int q = target.indexOf('?');
        if (q < 0) {
            return null;
        }
        for (String pair : target.substring(q + 1).split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0 || !"u".equals(pair.substring(0, eq))) {
                continue;
            }
            try {
                byte[] decoded = Base64.decode(
                    pair.substring(eq + 1),
                    Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP
                );
                String url = new String(decoded, StandardCharsets.UTF_8);
                String lower = url.toLowerCase(Locale.US);
                if (lower.startsWith("http://") || lower.startsWith("https://")) {
                    return url;
                }
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }
        return null;
    }

    private void proxy(
        String upstreamUrl,
        String method,
        Map<String, String> requestHeaders,
        BufferedOutputStream out
    ) throws IOException {
        HttpURLConnection connection = null;
        String finalUrl = upstreamUrl;

        try {
            connection = openFollowingRedirects(upstreamUrl, method, requestHeaders);
            if (connection == null) {
                recordUpstream(0, "", "TooManyRedirects");
                writeSimple(out, 502, "Too many redirects");
                return;
            }
            finalUrl = connection.getURL().toString();

            int status = connection.getResponseCode();
            recordUpstream(status, connection.getContentType(), "");
            InputStream body = status >= 400
                ? connection.getErrorStream()
                : connection.getInputStream();

            String contentType = resolveContentType(connection.getContentType(), finalUrl);

            if (isManifest(contentType, finalUrl)) {
                byte[] rewritten = rewriteManifest(body, finalUrl);
                writeManifest(out, status, contentType, rewritten);
                return;
            }

            writeStreamedResponse(out, status, contentType, connection, body, "HEAD".equalsIgnoreCase(method));
        } catch (IOException e) {
            Log.w(TAG, "upstream failed for " + finalUrl + ": " + e.getMessage());
            recordUpstream(0, "", e.getClass().getSimpleName());
            try {
                writeSimple(out, 502, "Upstream request failed");
            } catch (IOException ignored) {
                // client already gone
            }
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    /**
     * {@link HttpURLConnection} refuses to follow a redirect that switches
     * between http and https, which providers do constantly, so redirects are
     * followed by hand.
     */
    private HttpURLConnection openFollowingRedirects(
        String url,
        String method,
        Map<String, String> requestHeaders
    ) throws IOException {
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = (HttpURLConnection) new URL(current).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestMethod("HEAD".equalsIgnoreCase(method) ? "HEAD" : "GET");
            connection.setRequestProperty("User-Agent", UPSTREAM_USER_AGENT);
            connection.setRequestProperty("Accept", "*/*");

            copyHeader(requestHeaders, connection, "range");
            copyHeader(requestHeaders, connection, "if-range");
            copyHeader(requestHeaders, connection, "if-modified-since");
            copyHeader(requestHeaders, connection, "if-none-match");

            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isEmpty()) {
                    return null;
                }
                current = new URL(new URL(current), location).toString();
                continue;
            }
            return connection;
        }
        return null;
    }

    private void copyHeader(Map<String, String> headers, HttpURLConnection connection, String name) {
        String value = headers.get(name);
        if (value != null && !value.isEmpty()) {
            connection.setRequestProperty(name, value);
        }
    }

    /**
     * Providers very often label media {@code application/octet-stream} or omit
     * the type entirely. Desktop Chrome sniffs the container regardless; the
     * Android WebView does not, so the type is reconstructed from the URL.
     */
    private String resolveContentType(String upstreamType, String url) {
        String normalised = upstreamType == null ? "" : upstreamType.trim().toLowerCase(Locale.US);
        int semi = normalised.indexOf(';');
        String bare = semi >= 0 ? normalised.substring(0, semi).trim() : normalised;

        boolean useless = bare.isEmpty()
            || bare.equals("application/octet-stream")
            || bare.equals("binary/octet-stream")
            || bare.equals("text/plain")
            || bare.equals("text/html")
            || bare.equals("application/force-download");

        if (!useless) {
            return upstreamType;
        }

        String guessed = guessTypeFromUrl(url);
        return guessed != null ? guessed : "application/octet-stream";
    }

    private String guessTypeFromUrl(String url) {
        String path = url;
        int cut = path.indexOf('?');
        if (cut >= 0) {
            path = path.substring(0, cut);
        }
        cut = path.indexOf('#');
        if (cut >= 0) {
            path = path.substring(0, cut);
        }
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot < path.lastIndexOf('/')) {
            return null;
        }
        switch (path.substring(dot + 1).toLowerCase(Locale.US)) {
            case "mp4":
            case "m4v":
                return "video/mp4";
            case "mkv":
                return "video/x-matroska";
            case "webm":
                return "video/webm";
            case "mov":
                return "video/quicktime";
            case "avi":
                return "video/x-msvideo";
            case "ts":
            case "mpegts":
                return "video/mp2t";
            case "m3u8":
                return "application/vnd.apple.mpegurl";
            case "mpd":
                return "application/dash+xml";
            case "mp3":
                return "audio/mpeg";
            case "aac":
                return "audio/aac";
            case "m4a":
                return "audio/mp4";
            case "flac":
                return "audio/flac";
            case "ogg":
                return "audio/ogg";
            case "wav":
                return "audio/wav";
            case "vtt":
                return "text/vtt";
            case "srt":
                return "application/x-subrip";
            case "key":
                return "application/octet-stream";
            default:
                return null;
        }
    }

    private boolean isManifest(String contentType, String url) {
        String type = contentType == null ? "" : contentType.toLowerCase(Locale.US);
        if (type.contains("mpegurl") || type.contains("x-mpegurl")) {
            return true;
        }
        String path = url.toLowerCase(Locale.US);
        int cut = path.indexOf('?');
        if (cut >= 0) {
            path = path.substring(0, cut);
        }
        return path.endsWith(".m3u8") || path.endsWith(".m3u");
    }

    /**
     * Rewrites every URI in an HLS manifest to point back at this proxy.
     *
     * Without this the player resolves relative segment names against the
     * proxy's own origin and requests segments that do not exist here, while
     * absolute ones would go straight to the provider and hit the very CORS
     * and mixed-content limits the proxy exists to remove.
     */
    private byte[] rewriteManifest(InputStream body, String manifestUrl) throws IOException {
        if (body == null) {
            return new byte[0];
        }
        URL base = new URL(manifestUrl);
        StringBuilder rewritten = new StringBuilder();

        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        long total = 0;
        while ((read = body.read(buffer)) != -1) {
            total += read;
            if (total > MAX_MANIFEST_BYTES) {
                break;
            }
            raw.write(buffer, 0, read);
        }

        String text = new String(raw.toByteArray(), StandardCharsets.UTF_8);
        for (String line : text.split("\n", -1)) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                rewritten.append(line).append('\n');
                continue;
            }
            if (trimmed.startsWith("#")) {
                rewritten.append(rewriteTagUris(line, base)).append('\n');
                continue;
            }
            rewritten.append(proxyUrlFor(resolve(base, trimmed))).append('\n');
        }
        return rewritten.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** Handles {@code URI="..."} inside EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA and friends. */
    private String rewriteTagUris(String line, URL base) {
        Matcher matcher = URI_ATTRIBUTE.matcher(line);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) {
            String resolved = resolve(base, matcher.group(1));
            String replacement = "URI=\"" + proxyUrlFor(resolved) + "\"";
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    private String resolve(URL base, String reference) {
        try {
            return new URL(base, reference).toString();
        } catch (IOException e) {
            return reference;
        }
    }

    String proxyUrlFor(String absoluteUrl) {
        String encoded = Base64.encodeToString(
            absoluteUrl.getBytes(StandardCharsets.UTF_8),
            Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP
        );
        return "http://127.0.0.1:" + port + "/s?u=" + encoded;
    }

    private void writeManifest(
        BufferedOutputStream out,
        int status,
        String contentType,
        byte[] payload
    ) throws IOException {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        head.append("Content-Type: ").append(contentType).append("\r\n");
        head.append("Content-Length: ").append(payload.length).append("\r\n");
        head.append("Cache-Control: no-cache\r\n");
        appendCors(head);
        head.append("Connection: close\r\n\r\n");

        out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.write(payload);
        out.flush();
    }

    private void writeStreamedResponse(
        BufferedOutputStream out,
        int status,
        String contentType,
        HttpURLConnection connection,
        InputStream body,
        boolean headOnly
    ) throws IOException {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        head.append("Content-Type: ").append(contentType).append("\r\n");
        head.append("Accept-Ranges: bytes\r\n");

        passThrough(connection, head, "Content-Length");
        passThrough(connection, head, "Content-Range");
        passThrough(connection, head, "Last-Modified");
        passThrough(connection, head, "ETag");

        appendCors(head);
        head.append("Connection: close\r\n\r\n");
        out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));

        if (headOnly || body == null) {
            out.flush();
            return;
        }

        byte[] buffer = new byte[TRANSFER_BUFFER];
        int read;
        try {
            while ((read = body.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
        } catch (IOException e) {
            // Seeking and channel changes abort the socket mid-transfer; that
            // is ordinary player behaviour, not an error worth surfacing.
            Log.d(TAG, "transfer ended early: " + e.getMessage());
        } finally {
            closeQuietly(body);
        }
    }

    private void passThrough(HttpURLConnection connection, StringBuilder head, String name) {
        String value = connection.getHeaderField(name);
        if (value != null && !value.isEmpty()) {
            head.append(name).append(": ").append(value).append("\r\n");
        }
    }

    private void appendCors(StringBuilder head) {
        head.append("Access-Control-Allow-Origin: *\r\n");
        head.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
        head.append("Access-Control-Allow-Headers: *\r\n");
        head.append("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n");
    }

    private void writePreflight(BufferedOutputStream out) throws IOException {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 204 No Content\r\n");
        appendCors(head);
        head.append("Content-Length: 0\r\n");
        head.append("Connection: close\r\n\r\n");
        out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.flush();
    }

    private void writeSimple(BufferedOutputStream out, int status, String message) throws IOException {
        byte[] payload = message.getBytes(StandardCharsets.UTF_8);
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        head.append("Content-Type: text/plain; charset=utf-8\r\n");
        head.append("Content-Length: ").append(payload.length).append("\r\n");
        appendCors(head);
        head.append("Connection: close\r\n\r\n");
        out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.write(payload);
        out.flush();
    }

    private String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 204: return "No Content";
            case 206: return "Partial Content";
            case 302: return "Found";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 502: return "Bad Gateway";
            default: return status < 400 ? "OK" : "Error";
        }
    }

    private String readLine(PushbackInputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(128);
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\n') {
                break;
            }
            if (b != '\r') {
                buffer.write(b);
            }
        }
        if (b == -1 && buffer.size() == 0) {
            return null;
        }
        return new String(buffer.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    private Map<String, String> readHeaders(PushbackInputStream in) throws IOException {
        Map<String, String> headers = new LinkedHashMap<>();
        String line;
        while ((line = readLine(in)) != null && !line.isEmpty()) {
            int colon = line.indexOf(':');
            if (colon > 0) {
                headers.put(
                    line.substring(0, colon).trim().toLowerCase(Locale.US),
                    line.substring(colon + 1).trim()
                );
            }
        }
        return headers;
    }

    private static void closeQuietly(java.io.Closeable closeable) {
        if (closeable == null) {
            return;
        }
        try {
            closeable.close();
        } catch (IOException ignored) {
            // nothing useful to do
        }
    }
}

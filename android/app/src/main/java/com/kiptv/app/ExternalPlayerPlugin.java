package com.kiptv.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.Locale;

/**
 * Hands a stream to a video player installed on the device.
 *
 * The WebView can only play what the system WebView itself decodes. HEVC in a
 * Matroska container, AC-3 audio, and several other combinations IPTV
 * providers use every day have no decoder there, and no amount of header
 * correction in {@link StreamProxyServer} changes that. VLC and MX Player ship
 * their own software decoders, so handing the URL over is the only remaining
 * way to watch those streams.
 *
 * The launch is deliberately fire-and-forget. Capacitor cannot observe another
 * app's playback state, so this plugin reports only whether the hand-off
 * started — it does not pretend to manage a session the way the desktop
 * build's MPV/VLC integration does.
 */
@CapacitorPlugin(name = "ExternalPlayer")
public class ExternalPlayerPlugin extends Plugin {

    private static final String TAG = "ExternalPlayer";

    /**
     * Matches more players than any specific type would. VLC, MX Player, Just
     * Player and the rest all declare {@code video/*}; several of them do not
     * declare {@code application/vnd.apple.mpegurl}, so narrowing the type
     * here would hide working players from the chooser.
     */
    private static final String DEFAULT_MIME_TYPE = "video/*";

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", !resolveTargets(DEFAULT_MIME_TYPE).isEmpty());
        call.resolve(result);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (TextUtils.isEmpty(url)) {
            call.reject("A stream URL is required.");
            return;
        }

        String scheme = schemeOf(url);
        if (!"http".equals(scheme) && !"https".equals(scheme) && !"rtmp".equals(scheme) && !"rtsp".equals(scheme)) {
            call.reject("Only http, https, rtmp and rtsp streams can be handed to another app.");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app is not in the foreground.");
            return;
        }

        String mimeType = call.getString("mimeType");
        if (TextUtils.isEmpty(mimeType)) {
            mimeType = DEFAULT_MIME_TYPE;
        }
        String title = call.getString("title");

        Intent view = buildViewIntent(url, mimeType, title);
        if (resolveTargets(mimeType).isEmpty()) {
            call.reject("NO_PLAYER");
            return;
        }

        try {
            activity.startActivity(Intent.createChooser(view, title));
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            Log.w(TAG, "could not start an external player", error);
            call.reject("NO_PLAYER");
        }
    }

    private Intent buildViewIntent(String url, String mimeType, String title) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(Uri.parse(url), mimeType);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (!TextUtils.isEmpty(title)) {
            // VLC and MX Player both read a plain "title" extra; the platform
            // extra is there for players that follow the documented key.
            intent.putExtra("title", title);
            intent.putExtra(Intent.EXTRA_TITLE, title);
        }
        return intent;
    }

    /**
     * Requires the {@code <queries>} block in the manifest. Without it this
     * returns nothing on Android 11 and newer regardless of what is installed,
     * because package visibility is filtered by default.
     */
    private List<ResolveInfo> resolveTargets(String mimeType) {
        Intent probe = new Intent(Intent.ACTION_VIEW);
        probe.setDataAndType(Uri.parse("https://example.invalid/stream"), mimeType);
        PackageManager packageManager = getContext().getPackageManager();
        return packageManager.queryIntentActivities(probe, PackageManager.MATCH_DEFAULT_ONLY);
    }

    private String schemeOf(String url) {
        int colon = url.indexOf(':');
        return colon <= 0 ? "" : url.substring(0, colon).toLowerCase(Locale.US);
    }
}

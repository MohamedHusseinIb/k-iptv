package com.kiptv.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;

/**
 * Exposes the loopback {@link StreamProxyServer} to the web layer.
 *
 * The server binds an ephemeral port, so the web layer cannot know its address
 * ahead of time and asks for it during application start-up, before the first
 * stream is resolved.
 */
@CapacitorPlugin(name = "StreamProxy")
public class StreamProxyPlugin extends Plugin {

    private final StreamProxyServer server = new StreamProxyServer();

    @Override
    public void load() {
        server.setUpstreamListener((status, contentType, error) -> {
            JSObject data = new JSObject();
            data.put("status", status);
            data.put("contentType", contentType);
            data.put("error", error);
            notifyListeners("upstream", data);
        });
    }

    /**
     * Reports what the provider actually answered for the most recent stream
     * request. The media element collapses every upstream failure into the same
     * generic error, so this is the only way to tell a rejected request apart
     * from an undecodable one.
     */
    @PluginMethod
    public void getLastUpstream(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", server.getLastUpstreamStatus());
        result.put("contentType", server.getLastUpstreamType());
        result.put("error", server.getLastUpstreamError());
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            int port = server.start();
            JSObject result = new JSObject();
            result.put("port", port);
            result.put("baseUrl", "http://127.0.0.1:" + port);
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Unable to start the stream proxy: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getPort(PluginCall call) {
        JSObject result = new JSObject();
        result.put("port", server.getPort());
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        server.stop();
    }
}

package com.kiptv.app;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hides every system bar for fullscreen playback.
 *
 * The StatusBar plugin only controls the status bar. On a handset the
 * navigation bar is the taller of the two, and while it is visible the
 * WebView is laid out above it, so a player that fills the viewport still
 * stops short of filling the screen. Nothing in Capacitor's plugin set hides
 * it, hence this one.
 *
 * The window work lives in {@link MainActivity} because the same state has to
 * survive a focus change, which only the activity sees.
 */
@CapacitorPlugin(name = "Immersive")
public class ImmersivePlugin extends Plugin {

    @PluginMethod
    public void enter(PluginCall call) {
        apply(call, true);
    }

    @PluginMethod
    public void exit(PluginCall call) {
        apply(call, false);
    }

    private void apply(PluginCall call, boolean enabled) {
        final Activity activity = getActivity();
        if (!(activity instanceof MainActivity)) {
            call.reject("Immersive mode needs the Capacitor activity");
            return;
        }

        final MainActivity main = (MainActivity) activity;
        // Window flags and the insets controller are main-thread only, while
        // plugin calls arrive on a bridge thread.
        activity.runOnUiThread(() -> {
            try {
                main.applyImmersiveMode(enabled);
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Could not change immersive mode", error);
            }
        });
    }
}

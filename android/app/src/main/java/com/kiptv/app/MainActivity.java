package com.kiptv.app;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Both registrations must happen before the bridge is built: Capacitor
        // snapshots its plugin table during super.onCreate, and anything added
        // afterwards is invisible to the WebView.
        registerPlugin(StreamProxyPlugin.class);
        registerPlugin(ExternalPlayerPlugin.class);

        super.onCreate(savedInstanceState);

        // A channel can play for hours without a single touch event, and the
        // WebView's <video> element holds no wake lock of its own, so the
        // screen would otherwise dim in the middle of a programme.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        applySystemBarInsets();
    }

    /**
     * Android 15 forces edge-to-edge for anything targeting SDK 35, so the
     * WebView is laid out behind the status and navigation bars. The shell's
     * top row is a 52px icon rail — that is exactly what disappears under the
     * status bar, taking the settings button with it.
     *
     * Padding the WebView's parent by the system-bar insets gives the layout
     * back its usable area. The listener is used rather than
     * `fitsSystemWindows` because the latter is ignored once a window opts
     * into edge-to-edge, and rather than the StatusBar plugin's
     * `setOverlaysWebView` because that is a no-op under the enforced
     * behaviour.
     */
    private void applySystemBarInsets() {
        final View content = findViewById(android.R.id.content);
        if (content == null) {
            return;
        }
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            // Fullscreen video hides the bars; the insets collapse to zero on
            // their own, so no separate fullscreen branch is needed here.
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }
}

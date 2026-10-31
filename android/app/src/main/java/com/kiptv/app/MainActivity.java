package com.kiptv.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Whether the player asked for an undecorated screen. Read by the insets
     * listener, which runs again every time the bars are shown or hidden.
     */
    private boolean immersive = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // All registrations must happen before the bridge is built: Capacitor
        // snapshots its plugin table during super.onCreate, and anything added
        // afterwards is invisible to the WebView.
        registerPlugin(StreamProxyPlugin.class);
        registerPlugin(ExternalPlayerPlugin.class);
        registerPlugin(ImmersivePlugin.class);

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
            if (immersive) {
                // Hidden bars report zero insets, but a cutout keeps reporting
                // its own. Honouring it here would letterbox the video down
                // the long edge of a notched handset, so fullscreen takes the
                // whole surface and the cutout is allowed to overlap it.
                view.setPadding(0, 0, 0, 0);
                return WindowInsetsCompat.CONSUMED;
            }
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }

    /**
     * Shows or hides every system bar, for {@link ImmersivePlugin}.
     *
     * Hiding the status bar alone still leaves the navigation bar holding a
     * strip of the screen, which is what made "fullscreen" look like a
     * maximised window. Hiding {@code systemBars()} covers both.
     *
     * The transient behaviour is what makes it usable: a swipe from either
     * edge brings the bars back as an overlay that disappears again on its
     * own, instead of permanently resizing the player underneath.
     *
     * Named to stay clear of {@link android.app.Activity#setImmersive(boolean)},
     * which is an unrelated flag on the activity record.
     *
     * Must run on the main thread.
     */
    void applyImmersiveMode(boolean enabled) {
        immersive = enabled;

        final Window window = getWindow();
        final WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());

        if (enabled) {
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars());
        }

        applyCutoutMode(enabled);

        final View content = findViewById(android.R.id.content);
        if (content != null) {
            ViewCompat.requestApplyInsets(content);
        }
    }

    /**
     * Lets fullscreen video extend under a notch. Outside fullscreen the
     * default keeps the layout clear of it.
     */
    private void applyCutoutMode(boolean enabled) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            return;
        }
        final Window window = getWindow();
        final WindowManager.LayoutParams params = window.getAttributes();
        params.layoutInDisplayCutoutMode = enabled
            ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
        window.setAttributes(params);
    }

    /**
     * Android restores the system bars whenever the window loses focus, so
     * pulling down the notification shade and dismissing it would otherwise
     * leave the bars sitting on top of a still-playing video.
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && immersive) {
            applyImmersiveMode(true);
        }
    }
}

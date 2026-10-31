import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the same Angular application the desktop and PWA builds use.
 *
 * `webDir` points at the output of `nx build web --configuration=android`,
 * which differs from the PWA build only in that it drops the service worker
 * (Capacitor already serves the bundle from its own local server) and swaps in
 * `environment.android.ts`.
 *
 * `CapacitorHttp` is deliberately left disabled. Enabling it patches `fetch`
 * and `XMLHttpRequest` globally, which would drag every HLS segment request
 * through the JavaScript bridge and base64-encode it. The provider backend
 * calls `CapacitorHttp.request()` directly instead, so only playlist, Xtream,
 * Stalker and EPG traffic takes the native path.
 */
const config: CapacitorConfig = {
    appId: 'com.kiptv.app',
    appName: 'K-IPTV',
    webDir: 'dist/apps/web',
    android: {
        // IPTV providers are routinely plain HTTP while the WebView origin is
        // https://localhost, so the WebView has to be allowed to mix the two.
        allowMixedContent: true,
    },
    server: {
        androidScheme: 'https',
    },
    plugins: {
        CapacitorHttp: {
            enabled: false,
        },
        SplashScreen: {
            launchShowDuration: 600,
            launchAutoHide: true,
            backgroundColor: '#12111a',
            androidSplashResourceName: 'splash',
            showSpinner: false,
        },
    },
};

export default config;

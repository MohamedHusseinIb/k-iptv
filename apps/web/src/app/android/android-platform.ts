/**
 * Android shell behaviours that have no web equivalent.
 *
 * Everything here is wired from the outside — listeners on the document and
 * on the Capacitor bridge — so no component or service in the shared codebase
 * has to know it is running inside an app.
 */

import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isAndroidNativeRuntime } from './android-runtime';
import { exitAndroidFullscreen } from './fullscreen-strategy';

export async function initializeAndroidPlatform(): Promise<void> {
    if (!isAndroidNativeRuntime()) return;

    // Each step is independent: a plugin missing from a given build must not
    // stop the rest from being wired up.
    await ignoreFailure(configureStatusBar());
    await ignoreFailure(registerBackButton());

    // Hidden only once Angular has rendered, so the splash covers bootstrap
    // instead of handing over to a blank WebView.
    await ignoreFailure(SplashScreen.hide());
}

function ignoreFailure(work: Promise<unknown>): Promise<unknown> {
    return work.catch(() => undefined);
}

async function configureStatusBar(): Promise<void> {
    // The app is dark by default, so light glyphs on the dark chrome colour.
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    await StatusBar.setBackgroundColor({ color: '#12111a' }).catch(
        () => undefined
    );
}

/**
 * Android's back gesture has to behave like the browser's back button, which
 * is what the app's routing already expects. The two exceptions are leaving
 * fullscreen playback and leaving the app when there is nothing left to pop.
 */
async function registerBackButton(): Promise<void> {
    await App.addListener('backButton', ({ canGoBack }) => {
        if (exitAndroidFullscreen()) {
            return;
        }

        // A dialog or overlay is open: let it close itself the way Escape
        // would, rather than navigating out from under it.
        if (document.querySelector('.cdk-overlay-container .cdk-overlay-pane')) {
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true,
                })
            );
            return;
        }

        if (canGoBack) {
            window.history.back();
            return;
        }
        void App.exitApp();
    });
}

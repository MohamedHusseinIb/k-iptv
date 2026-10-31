import { HTTP_INTERCEPTORS } from '@angular/common/http';
import {
    EnvironmentProviders,
    Provider,
    provideAppInitializer,
} from '@angular/core';
import { initializeAndroidPlatform } from '../app/android/android-platform';
import { installExternalPlayerLauncher } from '../app/android/external-player';
import { installAndroidFullscreen } from '../app/android/fullscreen-strategy';
import { installPlatformDiagnostics } from '../app/android/platform-diagnostics';
import { installPlayerTechOverrides } from '../app/android/player-tech';
import {
    AndroidProviderBackendInterceptor,
    installProviderBackendFetch,
} from '../app/android/provider-backend-bridge';
import { startStreamProxy } from '../app/android/stream-proxy';

/**
 * Replaces platform.providers.ts in the android build configuration.
 *
 * The `fetch` patch is installed from an initializer because `PwaService` can
 * issue its first backend call while the first route is still resolving.
 */
export const platformProviders: (Provider | EnvironmentProviders)[] = [
    {
        provide: HTTP_INTERCEPTORS,
        useClass: AndroidProviderBackendInterceptor,
        multi: true,
    },
    provideAppInitializer(() => {
        installProviderBackendFetch();
        installExternalPlayerLauncher();
        installPlayerTechOverrides();
        installPlatformDiagnostics();
        // Before Angular renders: a player surface subscribes to the active
        // strategy as it is constructed.
        installAndroidFullscreen();
        void initializeAndroidPlatform();

        // Awaited: the proxy binds an ephemeral port, and a stream resolved
        // before that port is known would be sent to the provider directly.
        return startStreamProxy();
    }),
];

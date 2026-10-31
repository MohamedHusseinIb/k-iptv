import { version as appVersion } from '@package';

/**
 * `BACKEND_URL` is a sentinel origin rather than a reachable server.
 *
 * On Android the provider routes that the PWA calls on its web backend are
 * served in-process by `androidProviderBackendInterceptor`, which recognises
 * this origin and never lets a request leave the Angular HTTP stack. Keeping
 * it a syntactically valid absolute URL means `PwaService` keeps building its
 * request URLs exactly as it does for a self-hosted backend.
 */
export const ANDROID_BACKEND_URL = 'https://provider-backend.kiptv.invalid';

export const AppConfig = {
    production: true,
    environment: 'ANDROID',
    version: appVersion,
    BACKEND_URL: ANDROID_BACKEND_URL,
};

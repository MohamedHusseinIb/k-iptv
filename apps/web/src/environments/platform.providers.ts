import { EnvironmentProviders, Provider } from '@angular/core';

// Desktop, PWA and development builds need no extra platform wiring. The
// android build configuration replaces this file with
// platform.providers.android.ts, so no Capacitor code enters those bundles.
export const platformProviders: (Provider | EnvironmentProviders)[] = [];

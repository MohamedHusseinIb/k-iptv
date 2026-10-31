/**
 * Platform-supplied Video.js tech options, merged into every player it builds.
 *
 * This exists for one reason: a platform can advertise media support it does
 * not actually have, and Video.js has no way to know. Android's WebView
 * answers `canPlayType('application/vnd.apple.mpegurl')` with `"maybe"`, so
 * videojs-http-streaming politely steps aside and hands the manifest to the
 * native element — which then fails with MEDIA_ERR_SRC_NOT_SUPPORTED, because
 * the WebView's HLS support is not real. The failure carries no VHS evidence
 * at all (no manifest stage, no request), which is how it is told apart from a
 * stream that genuinely cannot be played.
 *
 * Nothing registers overrides on the web or in Electron, where the browser's
 * answer can be trusted — notably Safari, whose native HLS is better than the
 * MSE path and must keep winning.
 */

export interface PlayerTechOverrides {
    readonly html5?: Record<string, unknown>;
}

let registered: PlayerTechOverrides | null = null;

export function registerPlayerTechOverrides(
    overrides: PlayerTechOverrides | null
): void {
    registered = overrides;
}

export function getPlayerTechOverrides(): PlayerTechOverrides | null {
    return registered;
}

/**
 * Merges the registered overrides into player options. `html5` is merged one
 * level deep so a caller's own tech settings survive, and the call is a
 * pass-through when no platform registered anything.
 */
export function withPlayerTechOverrides<T extends Record<string, unknown>>(
    options: T
): T {
    const overrides = registered;
    if (!overrides?.html5) {
        return options;
    }
    const existing =
        (options['html5'] as Record<string, unknown> | undefined) ?? {};
    return {
        ...options,
        html5: { ...overrides.html5, ...existing },
    };
}

/**
 * Runtime detection for the Capacitor Android shell.
 *
 * The same bundle has to survive being opened in a desktop browser (useful
 * when debugging the android build configuration with `nx serve`), so every
 * native call site checks this first and falls back to a web implementation.
 */

interface CapacitorGlobal {
    // A method since Capacitor 3, not a boolean property. Reading it as a
    // property yields a truthy function that never equals `true`, which
    // silently disables every native path while the web fallbacks keep
    // working — so the app looks healthy and only playback fails.
    readonly isNativePlatform?: (() => boolean) | boolean;
    getPlatform?(): string;
    isPluginAvailable?(name: string): boolean;
}

function capacitorGlobal(): CapacitorGlobal | undefined {
    return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Tolerates both the modern method and the pre-3.x boolean property. */
function isNativePlatform(capacitor: CapacitorGlobal): boolean {
    const native = capacitor.isNativePlatform;
    return typeof native === 'function' ? native() === true : native === true;
}

/** True inside the Android WebView, false in a browser or Electron. */
export function isAndroidNativeRuntime(): boolean {
    const capacitor = capacitorGlobal();
    if (!capacitor) return false;
    return isNativePlatform(capacitor) && capacitor.getPlatform?.() === 'android';
}

/** True whenever the Capacitor bridge exists, native or not. */
export function hasCapacitorBridge(): boolean {
    return capacitorGlobal() !== undefined;
}

export function isCapacitorPluginAvailable(name: string): boolean {
    return capacitorGlobal()?.isPluginAvailable?.(name) === true;
}

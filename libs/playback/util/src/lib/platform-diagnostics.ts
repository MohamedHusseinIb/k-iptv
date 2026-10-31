/**
 * Platform-supplied facts attached to the copyable diagnostic report.
 *
 * A packaged runtime can install machinery the web build has no concept of —
 * on Android a native loopback stream proxy and an external-player launcher —
 * and when playback fails there is otherwise no way to tell whether any of it
 * actually came up. A report saying the proxy never bound points somewhere
 * completely different from one saying it bound and the stream still failed.
 *
 * The report is an explicit allowlist that must never leak a stream URL, so
 * values are sanitized here rather than trusted: only primitives survive, and
 * strings that look like a URL or run long are dropped. Nothing registers a
 * provider on the web or in Electron, where the key is simply absent.
 */

export type PlatformDiagnosticValue = string | number | boolean;
export type PlatformDiagnostics = Readonly<
    Record<string, PlatformDiagnosticValue>
>;

const MAX_ENTRIES = 12;
const MAX_STRING_LENGTH = 64;

let provider: (() => PlatformDiagnostics) | null = null;

export function registerPlatformDiagnostics(
    next: (() => PlatformDiagnostics) | null
): void {
    provider = next;
}

/** Drops anything that is not a short, URL-free primitive. */
function sanitize(value: unknown): PlatformDiagnosticValue | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value !== 'string') return undefined;
    if (value.length > MAX_STRING_LENGTH) return undefined;
    return value.includes('://') ? undefined : value;
}

/**
 * The sanitized platform facts, or `undefined` when nothing is registered so
 * `JSON.stringify` omits the key entirely.
 */
export function getPlatformDiagnostics(): PlatformDiagnostics | undefined {
    if (!provider) return undefined;
    let raw: PlatformDiagnostics;
    try {
        raw = provider();
    } catch {
        // Diagnostics must never be the reason a failure screen cannot render.
        return undefined;
    }
    const safe: Record<string, PlatformDiagnosticValue> = {};
    for (const [key, value] of Object.entries(raw).slice(0, MAX_ENTRIES)) {
        const clean = sanitize(value);
        if (clean !== undefined) safe[key] = clean;
    }
    return Object.keys(safe).length > 0 ? safe : undefined;
}

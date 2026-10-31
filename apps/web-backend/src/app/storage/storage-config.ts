export interface ServerStorageConfig {
    /** `KIPTV_STORAGE=server`; the Docker image sets it. */
    readonly enabled: boolean;
    /** `KIPTV_ACCESS_TOKEN`; guards every non-public route when set. */
    readonly accessToken: string | null;
    /** Largest accepted playlist document (`KIPTV_MAX_DOCUMENT_MB`). */
    readonly maxDocumentBytes: number;
}

const DEFAULT_MAX_DOCUMENT_MB = 64;
const BYTES_PER_MB = 1024 * 1024;

/**
 * A combination the browser app cannot use, as a start-up message, or
 * `null`. The PWA asks for the access token only in server storage mode,
 * so a token on a stateless backend would lock every browser out.
 */
export function serverStorageConfigProblem(
    config: ServerStorageConfig
): string | null {
    return config.accessToken && !config.enabled
        ? 'KIPTV_ACCESS_TOKEN needs KIPTV_STORAGE=server: the browser app asks for the token only when the server stores its playlists. Unset the token, or protect a stateless backend in your reverse proxy.'
        : null;
}

export function readServerStorageConfig(
    env: Record<string, string | undefined> = process.env
): ServerStorageConfig {
    const mode = env['KIPTV_STORAGE']?.trim().toLowerCase();
    const token = env['KIPTV_ACCESS_TOKEN']?.trim();
    const megabytes = Number(env['KIPTV_MAX_DOCUMENT_MB']);

    return {
        enabled: mode === 'server',
        accessToken: token ? token : null,
        maxDocumentBytes:
            (Number.isFinite(megabytes) && megabytes > 0
                ? megabytes
                : DEFAULT_MAX_DOCUMENT_MB) * BYTES_PER_MB,
    };
}

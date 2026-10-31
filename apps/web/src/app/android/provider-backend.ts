/**
 * The web backend's provider routes, re-implemented inside the Android app.
 *
 * On the web, `PwaService` talks to `apps/web-backend`, which proxies playlist
 * downloads and Xtream/Stalker calls so the browser never has to deal with
 * CORS. An installed Android app has no such server, so the same routes run
 * in-process here and reach providers through `CapacitorHttp`.
 *
 * This is a port of `apps/web-backend/src/app/web-backend-app.ts`, and the
 * request/response contract is deliberately identical — `PwaService` is used
 * unmodified. The pieces that do not apply on a single-user device are left
 * out on purpose:
 *
 * - No CORS layer: nothing crosses an origin boundary here.
 * - No SSRF URL policy: on a phone the user's own LAN is a legitimate target
 *   (many people run their playlist server at home), and there is no other
 *   tenant to protect.
 * - No per-host circuit breaker: it exists so one dead provider cannot
 *   exhaust a shared server's sockets. Every request here is user-initiated.
 */

import {
    buildStalkerIdentityRequestContext,
    buildStalkerRequestUrl,
    describeXtreamConnectionFailure,
    normalizeXtreamServerUrl,
} from '@kiptv/shared/interfaces';
import { extractDrmFromRaw } from '@kiptv/shared/m3u-utils';
import {
    NativeHttpError,
    nativeHttpGet,
    PROVIDER_REQUEST_TIMEOUT_MS,
} from './native-http';

export interface BackendRequest {
    readonly method: string;
    readonly path: string;
    readonly query: Record<string, string>;
    readonly body?: unknown;
}

export interface BackendReply {
    readonly status: number;
    readonly body: unknown;
}

/**
 * Registered provider targets, exactly as the web backend keeps them: callers
 * exchange a URL for an opaque id once and then pass the id, so credentials in
 * the URL never travel on later request lines.
 */
const providerTargets = new Map<string, URL>();

export async function handleProviderBackendRequest(
    request: BackendRequest
): Promise<BackendReply> {
    const method = request.method.toUpperCase();
    const path = request.path.replace(/\/+$/, '') || '/';

    if (method === 'OPTIONS') return { status: 200, body: null };

    if (method === 'POST' && path === '/provider-targets') {
        return registerProviderTarget(request);
    }
    if (method === 'POST' && path === '/connectivity-guard/reset') {
        return resetConnectivityGuard(request);
    }
    if (method === 'GET' && path === '/parse') {
        return parsePlaylistRoute(request);
    }
    if (method === 'GET' && path === '/parse-xml') {
        return parseEpgRoute(request);
    }
    if (method === 'GET' && path === '/xtream') {
        return xtreamRoute(request);
    }
    if (method === 'GET' && path === '/stalker') {
        return stalkerRoute(request);
    }
    if (method === 'GET' && path === '/health') {
        return {
            status: 200,
            body: { status: 'ok', service: 'kiptv-android-backend' },
        };
    }

    return {
        status: 404,
        body: { message: 'Not Found', status: 404 },
    };
}

async function registerProviderTarget(
    request: BackendRequest
): Promise<BackendReply> {
    const rawUrl = readBodyUrl(request.body);
    if (!rawUrl) {
        return { status: 400, body: { message: 'Missing url', status: 400 } };
    }

    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return {
            status: 400,
            body: { message: 'Invalid url', status: 400 },
        };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return {
            status: 400,
            body: { message: 'Unsupported protocol', status: 400 },
        };
    }

    const targetId = await createProviderTargetId(url);
    providerTargets.set(targetId, url);
    return { status: 200, body: { targetId } };
}

function resetConnectivityGuard(request: BackendRequest): BackendReply {
    const rawUrl = readBodyUrl(request.body);
    if (!rawUrl) {
        return { status: 400, body: { message: 'Missing url', status: 400 } };
    }
    // Nothing to reset: this build never trips a breaker, so the host is
    // always immediately available again, which is what `reset: true` means
    // to the caller.
    return { status: 200, body: { reset: true } };
}

async function parsePlaylistRoute(
    request: BackendRequest
): Promise<BackendReply> {
    const target = resolveTarget(request);
    if ('status' in target) return target;

    const userAgent = normalizeQueryValue(request.query['userAgent']);
    try {
        const response = await nativeHttpGet<string>({
            url: target.url.href,
            timeout: PROVIDER_REQUEST_TIMEOUT_MS.playlist,
            responseType: 'text',
            ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
        });
        const parsed = await parseM3u(String(response.data));
        return {
            status: 200,
            body: {
                ...createPlaylistObject({
                    playlist: parsed,
                    title: getLastUrlSegment(target.url.href),
                    url: target.url.href,
                }),
                ...(userAgent ? { userAgent } : {}),
            },
        };
    } catch (error) {
        const code = providerErrorCode(error);
        const response = (error as NativeHttpError).response;
        if (response?.statusText !== undefined) {
            return {
                status: response.status,
                body: {
                    status: response.status,
                    message: response.statusText,
                },
            };
        }
        return {
            status: 500,
            body: {
                status: 500,
                message: code
                    ? `Error, something went wrong (${code})`
                    : 'Error, something went wrong',
                ...(code ? { code } : {}),
            },
        };
    }
}

async function parseEpgRoute(request: BackendRequest): Promise<BackendReply> {
    const target = resolveTarget(request);
    if ('status' in target) return target;

    const compressed = target.url.pathname.endsWith('.gz');
    try {
        const response = await nativeHttpGet<string | Uint8Array>({
            url: target.url.href,
            timeout: PROVIDER_REQUEST_TIMEOUT_MS.epg,
            responseType: compressed ? 'arraybuffer' : 'text',
        });
        const xml = compressed
            ? await gunzipToString(response.data as Uint8Array)
            : String(response.data);
        return { status: 200, body: await parseEpg(xml) };
    } catch (error) {
        const normalized = normalizeProviderError(error);
        return { status: normalized.status, body: normalized };
    }
}

async function xtreamRoute(request: BackendRequest): Promise<BackendReply> {
    const target = resolveTarget(request);
    if ('status' in target) return target;

    const action = normalizeQueryValue(request.query['action']);
    const userAgent = normalizeQueryValue(request.query['userAgent']);
    try {
        const url = new URL(target.url.href);
        url.href = normalizeXtreamServerUrl(url.href);
        const requestUrl = appendPathSegment(url, 'player_api.php');

        const response = await nativeHttpGet({
            url: requestUrl,
            params: proxyParams(request.query, [
                'targetId',
                'connectionTest',
                'userAgent',
            ]),
            ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
            timeout: PROVIDER_REQUEST_TIMEOUT_MS.xtream,
            responseType: 'text',
        });

        return {
            status: 200,
            body: { action, payload: parseJsonPayload(response.data) },
        };
    } catch (error) {
        // Provider failures are answered with HTTP 200 and an error body, the
        // way the web backend does, so the UI can tell "the provider said no"
        // apart from "the proxy itself broke".
        if (normalizeQueryValue(request.query['connectionTest']) === 'true') {
            return {
                status: 200,
                body: {
                    connectionFailure: describeXtreamConnectionFailure(
                        error,
                        true
                    ),
                },
            };
        }
        return { status: 200, body: normalizeProviderError(error) };
    }
}

async function stalkerRoute(request: BackendRequest): Promise<BackendReply> {
    const target = resolveTarget(request);
    if ('status' in target) return target;

    const macAddress = normalizeQueryValue(request.query['macAddress']);
    const token = normalizeQueryValue(request.query['token']);
    const serialNumber = normalizeQueryValue(request.query['serialNumber']);
    const action = normalizeQueryValue(request.query['action']);

    try {
        // `macAddress`, `token` and `serialNumber` are credentials, not
        // protocol content: they reach the portal as Cookie / Authorization /
        // SN headers, never in its query string. `handshake` is the one
        // exception, since it presents its candidate token as a parameter.
        const params: Record<string, string | number> = proxyParams(
            request.query,
            [
                'targetId',
                'macAddress',
                'token',
                'serialNumber',
                'skipConnectionGuard',
            ]
        );
        if (params['action'] === 'handshake' && token) {
            params['token'] = token;
        }

        const identity = buildStalkerIdentityRequestContext({
            macAddress: macAddress ?? '',
            params,
            ...(token ? { token } : {}),
            ...(serialNumber ? { serialNumber } : {}),
        });
        const headers: Record<string, string> = { ...identity.headers };
        if (!macAddress) {
            // No MAC means no session cookie, rather than an empty `mac=`.
            delete headers['Cookie'];
        }

        const requestUrl = buildStalkerRequestUrl(
            target.url.href,
            identity.requestParams
        );

        const response = await nativeHttpGet({
            url: requestUrl,
            headers,
            // `create_link` gets the longer budget: the portal mints a stream
            // URL before it answers.
            timeout:
                params['action'] === 'create_link'
                    ? PROVIDER_REQUEST_TIMEOUT_MS.stalkerCreateLink
                    : PROVIDER_REQUEST_TIMEOUT_MS.stalker,
            responseType: 'text',
            preEncoded: true,
        });

        return {
            status: 200,
            body: { action, payload: parseJsonPayload(response.data) },
        };
    } catch (error) {
        return { status: 200, body: normalizeProviderError(error) };
    }
}

function resolveTarget(
    request: BackendRequest
): { readonly url: URL } | BackendReply {
    const targetId = normalizeQueryValue(request.query['targetId']);
    if (!targetId) {
        return { status: 400, body: { message: 'Missing targetId', status: 400 } };
    }
    const url = providerTargets.get(targetId);
    if (!url) {
        return {
            status: 404,
            body: { message: 'Provider target not found', status: 404 },
        };
    }
    return { url };
}

async function createProviderTargetId(url: URL): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(url.href)
    );
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function readBodyUrl(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const value = (body as Record<string, unknown>)['url'];
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeQueryValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function proxyParams(
    query: Record<string, string>,
    excludedKeys: string[]
): Record<string, string> {
    const excluded = new Set(excludedKeys);
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
        if (excluded.has(key)) continue;
        const normalized = normalizeQueryValue(value);
        if (normalized) params[key] = normalized;
    }
    return params;
}

function appendPathSegment(url: URL, segment: string): string {
    const nextUrl = new URL(url.href);
    nextUrl.pathname = `${nextUrl.pathname.replace(/\/+$/, '')}/${segment}`;
    nextUrl.search = '';
    nextUrl.hash = '';
    return nextUrl.href;
}

/**
 * Providers answer `player_api.php` with JSON, but a misconfigured one can
 * return an HTML error page with a 200. Returning the raw text in that case
 * matches what axios does on the web backend.
 */
function parseJsonPayload(data: unknown): unknown {
    if (typeof data !== 'string') return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

interface NormalizedProviderError {
    readonly message: string;
    readonly status: number;
    readonly code?: string;
}

function normalizeProviderError(error: unknown): NormalizedProviderError {
    const response = (error as NativeHttpError | undefined)?.response;
    if (response) {
        return {
            message: response.statusText ?? 'Bad Gateway',
            status: response.status ?? 502,
        };
    }
    const code = providerErrorCode(error);
    return {
        message: code ? `Bad Gateway (${code})` : 'Bad Gateway',
        status: 502,
        ...(code ? { code } : {}),
    };
}

function providerErrorCode(error: unknown): string | undefined {
    const code = (error as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' && code.length > 0 ? code : undefined;
}

/**
 * `zlib.gunzipSync` has no browser equivalent, but `DecompressionStream` is
 * available in the Android System WebView versions this app targets.
 */
async function gunzipToString(bytes: Uint8Array): Promise<string> {
    const stream = new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
}

interface ParsedPlaylist {
    readonly items: Array<Record<string, unknown>>;
}

interface LazyParserModule<T> {
    readonly parse?: (input: string) => T;
    readonly default?: { readonly parse?: (input: string) => T };
}

/**
 * Both parsers are CommonJS and are loaded lazily so they stay out of the
 * initial bundle; the `default` fallback mirrors `PlaylistsService`, whose
 * interop shape depends on how the bundler wraps the module.
 */
async function parseM3u(playlist: string): Promise<ParsedPlaylist> {
    const module = (await import(
        'iptv-playlist-parser'
    )) as unknown as LazyParserModule<ParsedPlaylist>;
    const parse = module.parse ?? module.default?.parse;
    if (typeof parse !== 'function') {
        throw new Error('iptv-playlist-parser parse export was not found');
    }
    return parse(playlist);
}

async function parseEpg(xml: string): Promise<unknown> {
    const module = (await import(
        'epg-parser'
    )) as unknown as LazyParserModule<unknown>;
    const parse = module.parse ?? module.default?.parse;
    if (typeof parse !== 'function') {
        throw new Error('epg-parser parse export was not found');
    }
    return parse(xml);
}

function createPlaylistObject(options: {
    readonly playlist: ParsedPlaylist;
    readonly title: string;
    readonly url: string;
}): Record<string, unknown> {
    const timestamp = new Date().toISOString();
    const id = createGuid();
    return {
        id,
        _id: id,
        filename: options.title,
        title: options.title,
        count: options.playlist.items.length,
        playlist: {
            ...options.playlist,
            items: options.playlist.items.map((item) => {
                // Kept aligned with the shared createPlaylistObject() in
                // @kiptv/shared/m3u-utils: KODIPROP ClearKey DRM must
                // survive the URL-import path too.
                const drm = extractDrmFromRaw(
                    typeof item['raw'] === 'string' ? item['raw'] : undefined
                );
                return {
                    id: createGuid(),
                    ...item,
                    ...(drm ? { drm } : {}),
                };
            }),
        },
        importDate: timestamp,
        lastUsage: timestamp,
        favorites: [],
        autoRefresh: false,
        url: options.url,
    };
}

function getLastUrlSegment(value: string): string {
    const segment = value.slice(value.lastIndexOf('/') + 1).trim();
    return segment.length > 0 ? segment : 'Playlist without title';
}

function createGuid(): string {
    return Math.random().toString(36).slice(2);
}

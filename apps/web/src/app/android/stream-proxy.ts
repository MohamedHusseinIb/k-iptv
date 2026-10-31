/**
 * Routes playback traffic through the native loopback proxy.
 *
 * The Android WebView rejects streams that desktop Chrome plays without
 * complaint: a provider that labels an MP4 `application/octet-stream`, an HLS
 * manifest served without CORS headers, or plain HTTP media on a page loaded
 * from `https://localhost`. `StreamProxyServer` re-serves all of it correctly,
 * and this module makes the players ask it instead of the provider.
 *
 * The rewrite is applied at the lowest shared level — media element sources,
 * `XMLHttpRequest` and `fetch` — rather than inside any one player, so all
 * four engines (video.js, ArtPlayer, Shaka and the plain `<video>` element)
 * are covered without modifying upstream playback code.
 */

import { registerPlugin } from '@capacitor/core';
import { AppConfig } from '../../environments/environment';
import { isAndroidNativeRuntime } from './android-runtime';

/** What the provider answered, as opposed to what the player could decode. */
interface UpstreamOutcome {
    status: number;
    contentType: string;
    error: string;
}

interface StreamProxyPlugin {
    start(): Promise<{ port: number; baseUrl: string }>;
    getPort(): Promise<{ port: number }>;
    getLastUpstream(): Promise<UpstreamOutcome>;
    addListener(
        eventName: 'upstream',
        listener: (outcome: UpstreamOutcome) => void
    ): Promise<unknown>;
}

const StreamProxy = registerPlugin<StreamProxyPlugin>('StreamProxy');

let proxyBaseUrl: string | null = null;
let patchesInstalled = false;

/** Reported in the diagnostic report so a failure can be placed correctly. */
export type StreamProxyStatus = 'unsupported' | 'starting' | 'active' | 'failed';
let proxyStatus: StreamProxyStatus = 'unsupported';

export function getStreamProxyStatus(): StreamProxyStatus {
    return proxyStatus;
}

let lastUpstream: UpstreamOutcome | null = null;

/**
 * The provider's answer to the most recent stream request, as a short token
 * such as `403 text/html` or `SocketTimeoutException`. A media element reports
 * every one of these as the same generic decode failure, so this is what
 * separates a rejected request from genuinely undecodable media. Carries no
 * URL, so it is safe for the diagnostic report.
 */
export function getLastUpstreamSummary(): string {
    if (!lastUpstream) return '';
    const { status, contentType, error } = lastUpstream;
    if (error) return error;
    const type = (contentType ?? '').split(';')[0]?.trim() ?? '';
    return type ? `${status} ${type}` : String(status);
}

/** `0` whenever the proxy is not bound; never the full loopback URL. */
export function getStreamProxyPort(): number {
    if (!proxyBaseUrl) return 0;
    const port = Number.parseInt(new URL(proxyBaseUrl).port, 10);
    return Number.isInteger(port) ? port : 0;
}

/** Origins that must never be sent through the proxy. */
function excludedOrigins(): ReadonlySet<string> {
    const origins = new Set<string>();
    try {
        origins.add(new URL(AppConfig.BACKEND_URL).origin);
    } catch {
        // A malformed sentinel simply means nothing extra to exclude.
    }
    if (globalThis.location?.origin) {
        origins.add(globalThis.location.origin);
    }
    return origins;
}

let excluded: ReadonlySet<string> = new Set();

/** Binding a loopback socket is near-instant; this only bounds a wedge. */
const PROXY_START_TIMEOUT_MS = 5000;

export async function startStreamProxy(): Promise<void> {
    if (!isAndroidNativeRuntime()) return;
    proxyStatus = 'starting';

    try {
        // This initializer gates the first route, so a plugin that never
        // settles would leave the user on a blank screen with no way back.
        // Losing the proxy only costs stream rewriting.
        const { baseUrl } = await Promise.race([
            StreamProxy.start(),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error('stream proxy start timed out')),
                    PROXY_START_TIMEOUT_MS
                )
            ),
        ]);
        proxyBaseUrl = baseUrl;
        excluded = excludedOrigins();
        installStreamProxyPatches();
        proxyStatus = 'active';
        void trackUpstreamOutcomes();
    } catch (error) {
        // Playback should still be attempted directly if the proxy refuses to
        // bind; it works for providers that already serve usable headers.
        proxyStatus = 'failed';
        console.warn('[kiptv] stream proxy unavailable', error);
    }
}

/**
 * The native side only emits when the outcome changes, so a long HLS session
 * costs a single bridge message rather than one per segment.
 */
async function trackUpstreamOutcomes(): Promise<void> {
    try {
        await StreamProxy.addListener('upstream', (outcome) => {
            lastUpstream = outcome;
        });
    } catch (error) {
        // Diagnostics are a convenience; playback must not depend on them.
        console.warn('[kiptv] upstream diagnostics unavailable', error);
    }
}

function encodeTarget(url: string): string {
    const bytes = new TextEncoder().encode(url);
    let binary = '';
    for (let index = 0; index < bytes.length; index++) {
        binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function isLoopback(hostname: string): boolean {
    return (
        hostname === '127.0.0.1' ||
        hostname === 'localhost' ||
        hostname === '::1' ||
        hostname === '[::1]'
    );
}

/**
 * Absolute http(s) URLs that are not the app itself, the in-app provider
 * backend, or the proxy. Everything else is left exactly as the caller wrote
 * it.
 */
function shouldProxy(url: string): boolean {
    if (!proxyBaseUrl) return false;
    let parsed: URL;
    try {
        parsed = new URL(url, globalThis.location?.href);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
    }
    if (excluded.has(parsed.origin) || isLoopback(parsed.hostname)) {
        return false;
    }
    return true;
}

export function toProxiedUrl(url: string): string {
    if (!shouldProxy(url)) return url;
    const absolute = new URL(url, globalThis.location?.href).toString();
    return `${proxyBaseUrl}/s?u=${encodeTarget(absolute)}`;
}

function patchSrcProperty(prototype: object, property: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor?.set || !descriptor.get) return;

    const originalSet = descriptor.set;
    const originalGet = descriptor.get;

    Object.defineProperty(prototype, property, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get(this: unknown) {
            return originalGet.call(this);
        },
        set(this: unknown, value: unknown) {
            originalSet.call(
                this,
                typeof value === 'string' ? toProxiedUrl(value) : value
            );
        },
    });
}

function patchXhr(): void {
    const originalOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        ...rest: unknown[]
    ) {
        const target =
            method?.toUpperCase() === 'GET' && typeof url !== 'undefined'
                ? toProxiedUrl(url.toString())
                : url;
        return (
            originalOpen as unknown as (
                this: XMLHttpRequest,
                method: string,
                url: string | URL,
                ...rest: unknown[]
            ) => void
        ).call(this, method, target, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
}

function patchFetch(): void {
    const originalFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = (
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> => {
        const method = (
            init?.method ??
            (typeof input === 'object' && 'method' in input
                ? input.method
                : 'GET')
        )?.toUpperCase();

        if (method !== 'GET') {
            return originalFetch(input as RequestInfo, init);
        }

        if (typeof input === 'string') {
            return originalFetch(toProxiedUrl(input), init);
        }
        if (input instanceof URL) {
            return originalFetch(toProxiedUrl(input.href), init);
        }
        if (input && typeof input === 'object' && 'url' in input) {
            const proxied = toProxiedUrl(input.url);
            return proxied === input.url
                ? originalFetch(input, init)
                : originalFetch(new Request(proxied, input), init);
        }
        return originalFetch(input as RequestInfo, init);
    };
}

/**
 * Installed after `installProviderBackendFetch()`, so a sentinel-origin
 * request still reaches the in-app backend: this wrapper excludes that origin
 * and hands the call down to the provider-backend wrapper untouched.
 */
function installStreamProxyPatches(): void {
    if (patchesInstalled || !proxyBaseUrl) return;
    patchesInstalled = true;

    patchSrcProperty(HTMLMediaElement.prototype, 'src');
    patchSrcProperty(HTMLSourceElement.prototype, 'src');
    patchXhr();
    patchFetch();
}

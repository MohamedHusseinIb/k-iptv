/**
 * Outbound HTTP for the in-app provider backend.
 *
 * The WebView page is served from `https://localhost`, so every provider call
 * is cross-origin and almost no IPTV provider sends CORS headers. Requests
 * therefore go through `CapacitorHttp`, which performs them natively and is
 * not subject to the same-origin policy.
 *
 * `CapacitorHttp` is NOT enabled globally in `capacitor.config.ts`: doing so
 * patches `fetch`/`XMLHttpRequest` for the whole app and would route HLS
 * segment downloads through the JavaScript bridge as base64. Only this module
 * takes the native path; media keeps using the WebView's own networking.
 */

import { CapacitorHttp } from '@capacitor/core';
import { isAndroidNativeRuntime } from './android-runtime';

export const PROVIDER_REQUEST_TIMEOUT_MS = {
    epg: 30_000,
    playlist: 30_000,
    stalker: 15_000,
    stalkerCreateLink: 30_000,
    xtream: 30_000,
} as const;

export interface NativeHttpRequest {
    readonly url: string;
    readonly headers?: Record<string, string>;
    readonly params?: Record<string, string>;
    readonly timeout?: number;
    readonly responseType?: 'text' | 'json' | 'arraybuffer';
    /**
     * Stalker portal URLs are built by `buildStalkerRequestUrl`, whose `cmd`
     * encoding is part of the protocol, so those must be sent verbatim.
     */
    readonly preEncoded?: boolean;
}

export interface NativeHttpResponse<T> {
    readonly data: T;
    readonly status: number;
    readonly headers: Record<string, string>;
}

/**
 * Mirrors the shape of an axios error closely enough that the error
 * normalization copied from the web backend keeps working unchanged.
 */
export class NativeHttpError extends Error {
    readonly code?: string;
    readonly response?: {
        readonly status: number;
        readonly statusText: string;
    };

    constructor(
        message: string,
        options: {
            readonly code?: string;
            readonly response?: {
                readonly status: number;
                readonly statusText: string;
            };
        } = {}
    ) {
        super(message);
        this.name = 'NativeHttpError';
        if (options.code) this.code = options.code;
        if (options.response) this.response = options.response;
    }
}

const STATUS_TEXT: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
};

export function statusTextFor(status: number): string {
    return STATUS_TEXT[status] ?? `HTTP ${status}`;
}

export async function nativeHttpGet<T = unknown>(
    request: NativeHttpRequest
): Promise<NativeHttpResponse<T>> {
    const response = isAndroidNativeRuntime()
        ? await capacitorGet(request)
        : await browserGet(request);

    if (response.status >= 400) {
        throw new NativeHttpError(statusTextFor(response.status), {
            response: {
                status: response.status,
                statusText: statusTextFor(response.status),
            },
        });
    }
    return response as NativeHttpResponse<T>;
}

async function capacitorGet(
    request: NativeHttpRequest
): Promise<NativeHttpResponse<unknown>> {
    const timeout = request.timeout ?? PROVIDER_REQUEST_TIMEOUT_MS.xtream;
    try {
        const response = await CapacitorHttp.request({
            url: request.url,
            method: 'GET',
            ...(request.params ? { params: request.params } : {}),
            ...(request.headers ? { headers: request.headers } : {}),
            connectTimeout: timeout,
            readTimeout: timeout,
            shouldEncodeUrlParams: request.preEncoded !== true,
            responseType: request.responseType === 'json' ? 'json' : 'text',
        });
        return {
            data: decodeBody(request, response.data),
            status: response.status,
            headers: normalizeHeaders(response.headers),
        };
    } catch (error) {
        throw toNetworkError(error);
    }
}

async function browserGet(
    request: NativeHttpRequest
): Promise<NativeHttpResponse<unknown>> {
    const url = new URL(request.url);
    for (const [key, value] of Object.entries(request.params ?? {})) {
        url.searchParams.set(key, value);
    }
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        request.timeout ?? PROVIDER_REQUEST_TIMEOUT_MS.xtream
    );
    try {
        const response = await fetch(url.href, {
            headers: request.headers ?? {},
            signal: controller.signal,
        });
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });
        const data =
            request.responseType === 'arraybuffer'
                ? new Uint8Array(await response.arrayBuffer())
                : request.responseType === 'json'
                  ? await response.json()
                  : await response.text();
        return { data, status: response.status, headers };
    } catch (error) {
        throw toNetworkError(error);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * `CapacitorHttp` hands binary payloads back as base64 text, so a gzipped EPG
 * document has to be decoded here before it can be inflated.
 */
function decodeBody(request: NativeHttpRequest, data: unknown): unknown {
    if (request.responseType !== 'arraybuffer') return data;
    if (typeof data !== 'string') return data;
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function normalizeHeaders(headers: unknown): Record<string, string> {
    if (!headers || typeof headers !== 'object') return {};
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(
        headers as Record<string, unknown>
    )) {
        normalized[key.toLowerCase()] = String(value);
    }
    return normalized;
}

/**
 * Native failures arrive as plain messages rather than Node error codes, so
 * the recognisable ones are mapped back onto the codes the UI already knows
 * how to explain.
 */
function toNetworkError(error: unknown): NativeHttpError {
    if (error instanceof NativeHttpError) return error;
    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'unknown network error';
    const lowered = message.toLowerCase();
    let code: string | undefined;
    if (lowered.includes('timeout') || lowered.includes('timed out')) {
        code = 'ETIMEDOUT';
    } else if (
        lowered.includes('unable to resolve host') ||
        lowered.includes('name not resolved') ||
        lowered.includes('nodename nor servname')
    ) {
        code = 'ENOTFOUND';
    } else if (
        lowered.includes('econnrefused') ||
        lowered.includes('refused')
    ) {
        code = 'ECONNREFUSED';
    } else if (lowered.includes('unreachable')) {
        code = 'ENETUNREACH';
    } else if (lowered.includes('abort')) {
        code = 'ETIMEDOUT';
    }
    return new NativeHttpError(message, { ...(code ? { code } : {}) });
}

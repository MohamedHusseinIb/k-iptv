/**
 * Connects the in-app provider backend to the two ways `PwaService` issues
 * requests.
 *
 * `PwaService` reaches its backend through Angular's `HttpClient` for
 * `/provider-targets`, `/parse` and `/xtream`, and through plain `fetch` for
 * `/connectivity-guard/reset` and `/stalker` (the latter needs the raw
 * response to tell a provider error apart from a transport error). Both paths
 * have to be answered, so there is an interceptor for the first and a narrow
 * `fetch` patch for the second.
 *
 * Neither adapter touches a request whose origin is not the sentinel backend
 * origin, so a user who points the app at a real self-hosted IPTVnator server
 * still talks to that server.
 */

import {
    HttpErrorResponse,
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest,
    HttpResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfig } from '../../environments/environment';
import {
    BackendReply,
    BackendRequest,
    handleProviderBackendRequest,
} from './provider-backend';

const BACKEND_ORIGIN = safeOrigin(AppConfig.BACKEND_URL);

function safeOrigin(value: string): string | null {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function isProviderBackendUrl(url: string): boolean {
    if (!BACKEND_ORIGIN) return false;
    try {
        return new URL(url, globalThis.location?.href).origin === BACKEND_ORIGIN;
    } catch {
        return false;
    }
}

function toBackendRequest(
    method: string,
    url: URL,
    extraParams: Record<string, string>,
    body: unknown
): BackendRequest {
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
        query[key] = value;
    });
    return {
        method,
        path: url.pathname,
        query: { ...query, ...extraParams },
        body,
    };
}

/**
 * Registered through `HTTP_INTERCEPTORS` rather than `withInterceptors()`,
 * because the application already enables `withInterceptorsFromDi()` and that
 * keeps `app.config.ts` untouched by the Android build.
 */
@Injectable()
export class AndroidProviderBackendInterceptor implements HttpInterceptor {
    intercept(
        request: HttpRequest<unknown>,
        next: HttpHandler
    ): Observable<HttpEvent<unknown>> {
        if (!isProviderBackendUrl(request.url)) return next.handle(request);

        const url = new URL(request.url, globalThis.location?.href);
        const params: Record<string, string> = {};
        for (const key of request.params.keys()) {
            const value = request.params.get(key);
            if (value !== null) params[key] = value;
        }

        return new Observable<HttpEvent<unknown>>((subscriber) => {
            let cancelled = false;
            handleProviderBackendRequest(
                toBackendRequest(request.method, url, params, request.body)
            )
                .then((reply) => {
                    if (cancelled) return;
                    if (reply.status >= 400) {
                        subscriber.error(
                            new HttpErrorResponse({
                                url: request.url,
                                status: reply.status,
                                statusText: 'Error',
                                error: reply.body,
                            })
                        );
                        return;
                    }
                    subscriber.next(
                        new HttpResponse({
                            url: request.url,
                            status: reply.status,
                            body: reply.body,
                        })
                    );
                    subscriber.complete();
                })
                .catch((error: unknown) => {
                    if (cancelled) return;
                    subscriber.error(
                        new HttpErrorResponse({
                            url: request.url,
                            status: 500,
                            statusText: 'Internal Error',
                            error: describe(error),
                        })
                    );
                });
            return () => {
                cancelled = true;
            };
        });
    }
}

let fetchPatched = false;

/**
 * Replaces `fetch` with one that answers sentinel-origin requests locally and
 * delegates everything else untouched. Installed once, before the first
 * component renders.
 */
export function installProviderBackendFetch(): void {
    if (fetchPatched || !BACKEND_ORIGIN) return;
    fetchPatched = true;

    const originalFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> => {
        const requestUrl = resolveRequestUrl(input);
        if (!requestUrl || !isProviderBackendUrl(requestUrl)) {
            return originalFetch(input as RequestInfo, init);
        }

        const url = new URL(requestUrl, globalThis.location?.href);
        const method =
            init?.method ??
            (typeof input === 'object' && 'method' in input
                ? input.method
                : 'GET');

        let reply: BackendReply;
        try {
            reply = await handleProviderBackendRequest(
                toBackendRequest(
                    method ?? 'GET',
                    url,
                    {},
                    parseBody(init?.body)
                )
            );
        } catch (error) {
            reply = {
                status: 500,
                body: { message: describe(error), status: 500 },
            };
        }

        return new Response(
            reply.body === null ? null : JSON.stringify(reply.body),
            {
                status: reply.status,
                statusText: reply.status >= 400 ? 'Error' : 'OK',
                headers: { 'content-type': 'application/json' },
            }
        );
    };
}

function resolveRequestUrl(input: RequestInfo | URL): string | null {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input === 'object' && 'url' in input) return input.url;
    return null;
}

function parseBody(body: BodyInit | null | undefined): unknown {
    if (typeof body !== 'string') return undefined;
    try {
        return JSON.parse(body);
    } catch {
        return undefined;
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

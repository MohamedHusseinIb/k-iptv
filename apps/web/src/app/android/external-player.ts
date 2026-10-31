/**
 * Lets the user send a stream to VLC, MX Player or anything else installed.
 *
 * `StreamProxyServer` fixes streams the WebView rejects for the wrong reason —
 * a bad `Content-Type`, a missing CORS header, a redirect it will not follow.
 * It cannot fix a stream the WebView has no decoder for. HEVC in Matroska and
 * AC-3 audio are both common in IPTV catalogues and both absent from many
 * devices' WebView, and for those the only way to watch is another app.
 */

import { registerPlugin } from '@capacitor/core';
import {
    registerExternalPlaybackLauncher,
    type ExternalPlaybackLaunchRequest,
} from '@kiptv/playback/util';
import { isAndroidNativeRuntime } from './android-runtime';

interface ExternalPlayerPlugin {
    isAvailable(): Promise<{ available: boolean }>;
    open(options: {
        url: string;
        title?: string;
        mimeType?: string;
    }): Promise<{ opened: boolean }>;
}

const ExternalPlayer = registerPlugin<ExternalPlayerPlugin>('ExternalPlayer');

/**
 * Starts optimistic. The probe is a single binder call that normally lands
 * long before a playback error screen can appear, but if it is slow or fails
 * outright, offering the option and explaining a failure beats hiding a
 * working escape route.
 */
let available = true;

export function installExternalPlayerLauncher(): void {
    if (!isAndroidNativeRuntime()) return;

    registerExternalPlaybackLauncher({
        isAvailable: () => available,
        open: async (request: ExternalPlaybackLaunchRequest) => {
            await ExternalPlayer.open({
                url: request.url,
                title: request.title,
            });
        },
    });

    void ExternalPlayer.isAvailable()
        .then((result) => {
            available = result.available;
        })
        .catch(() => {
            // Leave it optimistic; `open()` reports the real outcome.
        });
}

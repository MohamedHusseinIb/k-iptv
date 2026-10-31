/**
 * Forces Video.js to demux HLS itself instead of trusting the WebView.
 *
 * Android's WebView answers `canPlayType('application/vnd.apple.mpegurl')`
 * with `"maybe"`, which videojs-http-streaming reads as "the platform handles
 * this better than I would" and so declines to attach. The manifest then goes
 * straight to the `<video>` element, which cannot actually play it, and the
 * result is MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) with no VHS diagnostics
 * attached to it at all — no manifest stage, no failed request, nothing,
 * because VHS was never in the pipeline.
 *
 * `overrideNative` tells VHS to attach regardless. The native track lists go
 * with it: leaving them on while the tech is overridden gives Video.js two
 * sources of track state that disagree.
 */

import { registerPlayerTechOverrides } from '@kiptv/playback/util';
import { isAndroidNativeRuntime } from './android-runtime';

export function installPlayerTechOverrides(): void {
    if (!isAndroidNativeRuntime()) return;

    registerPlayerTechOverrides({
        html5: {
            vhs: { overrideNative: true },
            nativeAudioTracks: false,
            nativeVideoTracks: false,
        },
    });
}

/**
 * Reports what the Android native layer actually brought up.
 *
 * Every Android-only fix — the loopback stream proxy, the external-player
 * launcher, the Video.js tech overrides — is invisible from the failure
 * screen, so a report cannot distinguish "the proxy never bound" from "the
 * proxy bound and the stream still failed". Those point at opposite causes.
 *
 * Only short primitives are published; the loopback port is included but the
 * proxy URL deliberately is not.
 */

import { registerPlatformDiagnostics } from '@kiptv/playback/util';
import { isAndroidNativeRuntime } from './android-runtime';
import {
    getLastUpstreamSummary,
    getStreamProxyPort,
    getStreamProxyStatus,
} from './stream-proxy';

export function installPlatformDiagnostics(): void {
    if (!isAndroidNativeRuntime()) return;

    registerPlatformDiagnostics(() => ({
        shell: 'capacitor',
        streamProxy: getStreamProxyStatus(),
        streamProxyPort: getStreamProxyPort(),
        upstream: getLastUpstreamSummary(),
    }));
}

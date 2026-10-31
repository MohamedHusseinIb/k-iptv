/**
 * Optional hand-off of a stream to a player outside the browser.
 *
 * This is deliberately not the same thing as the desktop build's managed
 * MPV/VLC integration, which starts a process it can watch and report on.
 * A platform may only be able to pass the URL along and lose sight of it —
 * Android's intent system works exactly that way — so the contract promises
 * nothing beyond "the hand-off started".
 *
 * Platforms that can do this register a launcher during startup. Nothing
 * registers one on the web or in Electron, so `getExternalPlaybackLauncher()`
 * returns null there and the UI leaves the option out entirely.
 */

export interface ExternalPlaybackLaunchRequest {
    readonly url: string;
    readonly title?: string;
}

export interface ExternalPlaybackLauncher {
    /**
     * Whether the device has anything that could take the stream. Answering
     * optimistically is correct when the real answer is not known yet: the
     * cost of offering an option that turns out to be unavailable is one
     * explanatory message, while hiding a working option is unrecoverable.
     */
    isAvailable(): boolean;

    /**
     * Resolves once another app has accepted the stream. Rejects with
     * {@link NO_EXTERNAL_PLAYER} when nothing on the device can play it.
     */
    open(request: ExternalPlaybackLaunchRequest): Promise<void>;
}

/** Rejection reason meaning "nothing installed can open this". */
export const NO_EXTERNAL_PLAYER = 'NO_PLAYER';

let registered: ExternalPlaybackLauncher | null = null;

export function registerExternalPlaybackLauncher(
    launcher: ExternalPlaybackLauncher | null
): void {
    registered = launcher;
}

export function getExternalPlaybackLauncher(): ExternalPlaybackLauncher | null {
    return registered;
}

export function isNoExternalPlayerError(error: unknown): boolean {
    if (typeof error === 'string') {
        return error.includes(NO_EXTERNAL_PLAYER);
    }
    return (
        error instanceof Error && error.message.includes(NO_EXTERNAL_PLAYER)
    );
}

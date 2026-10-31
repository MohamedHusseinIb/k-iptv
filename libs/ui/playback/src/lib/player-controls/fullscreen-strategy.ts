/**
 * Indirection over "make this element fill the screen".
 *
 * The browser Fullscreen API is the right answer everywhere except inside an
 * Android WebView. Capacitor's `BridgeWebChromeClient` answers
 * `onShowCustomView` by immediately calling `callback.onCustomViewHidden()`,
 * so Chromium tears down the view that would have hosted the fullscreen DOM
 * while the video itself stays composited full-screen natively. The result is
 * a full-screen picture with no overlay above it: the controls are still in
 * the document and still react to taps, but nothing of them is painted.
 *
 * Rather than replace Capacitor's chrome client — whose constructor registers
 * activity-result launchers that must not be registered twice — the Android
 * shell registers a strategy that never leaves the document at all.
 */

export interface FullscreenStrategy {
    /** Whether this target can be taken fullscreen at all. */
    isSupported(target: HTMLElement): boolean;
    isActive(target: HTMLElement): boolean;
    enter(target: HTMLElement): Promise<void>;
    exit(target: HTMLElement): Promise<void>;
    /** Observe changes made outside `enter`/`exit`; returns an unsubscribe. */
    subscribe(listener: () => void): () => void;
}

const noop = (): void => undefined;

/** The standard API, used on the web and in Electron. */
export const documentFullscreenStrategy: FullscreenStrategy = {
    isSupported: (target) =>
        typeof document !== 'undefined' &&
        Boolean(target.requestFullscreen) &&
        Boolean(document.exitFullscreen),
    isActive: (target) =>
        typeof document !== 'undefined' &&
        document.fullscreenElement === target,
    enter: (target) => target.requestFullscreen(),
    exit: () => document.exitFullscreen(),
    subscribe: (listener) => {
        if (typeof document === 'undefined') return noop;
        document.addEventListener('fullscreenchange', listener);
        return () => document.removeEventListener('fullscreenchange', listener);
    },
};

let strategy: FullscreenStrategy = documentFullscreenStrategy;

export function registerFullscreenStrategy(next: FullscreenStrategy): void {
    strategy = next;
}

export function getFullscreenStrategy(): FullscreenStrategy {
    return strategy;
}

/** Restores the browser default; used by tests. */
export function resetFullscreenStrategy(): void {
    strategy = documentFullscreenStrategy;
}

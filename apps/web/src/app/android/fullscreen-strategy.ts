/**
 * Fullscreen that survives an Android WebView.
 *
 * Calling `requestFullscreen()` here produces a full-screen video with no
 * controls: Capacitor's chrome client dismisses the custom view that would
 * have hosted the fullscreen DOM, leaving the player overlay unpainted while
 * the video stays composited full-screen. Taps land on controls that are
 * present in the document but invisible, so playback cannot be managed at all.
 *
 * This strategy never calls the Fullscreen API. It promotes the player surface
 * to a fixed overlay covering the viewport, which keeps the whole player —
 * video and controls alike — in the normal document, and hides the system bars
 * so the result still looks full-screen.
 */

import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
// Deep import: the ui/playback barrel would pull every player component into
// the bootstrap chunk.
import {
    registerFullscreenStrategy,
    type FullscreenStrategy,
} from '@iptvnator/ui/playback/fullscreen-strategy';
import { isAndroidNativeRuntime } from './android-runtime';

/**
 * Longhand offsets rather than `inset`, which a device still running an older
 * System WebView would drop silently, leaving the surface unpositioned.
 */
const OVERLAY_STYLE: ReadonlyArray<readonly [string, string]> = [
    ['position', 'fixed'],
    ['top', '0px'],
    ['right', '0px'],
    ['bottom', '0px'],
    ['left', '0px'],
    ['width', '100%'],
    ['height', '100%'],
    ['max-width', '100%'],
    ['max-height', '100%'],
    ['margin', '0px'],
    ['padding', '0px'],
    ['border-radius', '0px'],
    ['z-index', '2147483647'],
    ['background-color', '#000'],
];

/**
 * An ancestor with any of these becomes the containing block for a
 * `position: fixed` descendant, which would pin the player inside its layout
 * box instead of the viewport. The app shell nests the player under Material
 * containers that animate with transforms, so the chain is neutralised for
 * the duration of fullscreen. Anything shifted by this is behind an opaque
 * full-screen surface, and the original values are restored on exit.
 */
const CONTAINING_BLOCK_PROPERTIES = [
    'transform',
    'perspective',
    'filter',
    'backdrop-filter',
    'contain',
    'will-change',
] as const;

interface NeutralizedStyle {
    element: HTMLElement;
    property: string;
    previous: string;
}

let activeTarget: HTMLElement | null = null;
let savedStyle: Map<string, string> | null = null;
let savedBodyOverflow: string | null = null;
let neutralized: NeutralizedStyle[] = [];

const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of [...listeners]) {
        try {
            listener();
        } catch {
            // One misbehaving subscriber must not strand the others.
        }
    }
}

function createsContainingBlock(property: string, value: string): boolean {
    if (!value) return false;
    if (property === 'contain') {
        return /\b(layout|paint|strict|content)\b/.test(value);
    }
    if (property === 'will-change') {
        return /\b(transform|perspective|filter)\b/.test(value);
    }
    return value !== 'none';
}

function neutralizeContainingBlocks(target: HTMLElement): void {
    const saved: NeutralizedStyle[] = [];

    for (
        let element = target.parentElement;
        element && element !== document.documentElement;
        element = element.parentElement
    ) {
        const computed = getComputedStyle(element);
        for (const property of CONTAINING_BLOCK_PROPERTIES) {
            if (!createsContainingBlock(property, computed.getPropertyValue(property))) {
                continue;
            }
            saved.push({
                element,
                property,
                previous: element.style.getPropertyValue(property),
            });
            element.style.setProperty(
                property,
                property === 'will-change' ? 'auto' : 'none',
                'important'
            );
        }
    }

    neutralized = saved;
}

function restoreContainingBlocks(): void {
    for (const { element, property, previous } of neutralized) {
        if (previous) element.style.setProperty(property, previous);
        else element.style.removeProperty(property);
    }
    neutralized = [];
}

function applyOverlay(target: HTMLElement): void {
    neutralizeContainingBlocks(target);

    const previous = new Map<string, string>();
    for (const [property, value] of OVERLAY_STYLE) {
        previous.set(property, target.style.getPropertyValue(property));
        target.style.setProperty(property, value);
    }
    savedStyle = previous;

    savedBodyOverflow = document.body.style.getPropertyValue('overflow');
    document.body.style.setProperty('overflow', 'hidden');
}

function restoreOverlay(target: HTMLElement): void {
    if (savedStyle) {
        for (const [property, value] of savedStyle) {
            if (value) target.style.setProperty(property, value);
            else target.style.removeProperty(property);
        }
        savedStyle = null;
    }

    if (savedBodyOverflow !== null) {
        if (savedBodyOverflow) {
            document.body.style.setProperty('overflow', savedBodyOverflow);
        } else {
            document.body.style.removeProperty('overflow');
        }
        savedBodyOverflow = null;
    }

    restoreContainingBlocks();
}

/**
 * Filling the screen on a handset means landscape, and the system bars would
 * otherwise sit on top of the video. Neither is essential, so a plugin that
 * refuses must not abort the transition.
 */
async function enterSystemFullscreen(): Promise<void> {
    await StatusBar.hide().catch(() => undefined);
    await ScreenOrientation.lock({ orientation: 'landscape' }).catch(
        () => undefined
    );
}

async function exitSystemFullscreen(): Promise<void> {
    await ScreenOrientation.unlock().catch(() => undefined);
    await StatusBar.show().catch(() => undefined);
}

export const androidFullscreenStrategy: FullscreenStrategy = {
    // A fixed overlay works for any element, so the capability never depends
    // on the target the way `requestFullscreen` does.
    isSupported: () => typeof document !== 'undefined',
    isActive: (target) => activeTarget === target,

    async enter(target) {
        if (activeTarget === target) return;
        if (activeTarget) await this.exit(activeTarget);

        activeTarget = target;
        applyOverlay(target);
        notify();
        await enterSystemFullscreen();
    },

    async exit(target) {
        if (!activeTarget || (target && activeTarget !== target)) return;

        const current = activeTarget;
        activeTarget = null;
        restoreOverlay(current);
        notify();
        await exitSystemFullscreen();
    },

    subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

/**
 * Lets the hardware back button leave fullscreen before it is treated as a
 * navigation. Returns whether it had anything to close.
 */
export function exitAndroidFullscreen(): boolean {
    if (!activeTarget) return false;
    void androidFullscreenStrategy.exit(activeTarget);
    return true;
}

export function installAndroidFullscreen(): void {
    if (!isAndroidNativeRuntime()) return;
    registerFullscreenStrategy(androidFullscreenStrategy);
}

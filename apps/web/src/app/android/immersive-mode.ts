/**
 * Undecorated playback, which the Capacitor plugin set cannot express.
 *
 * `StatusBar.hide()` reaches only the status bar. The navigation bar keeps its
 * strip of the screen, and because the WebView is laid out above it, a player
 * filling the viewport still stops short of filling the display — fullscreen
 * that looks like a maximised window. The `Immersive` plugin hides both bars.
 */

import { registerPlugin } from '@capacitor/core';

interface ImmersivePlugin {
    enter(): Promise<void>;
    exit(): Promise<void>;
}

const Immersive = registerPlugin<ImmersivePlugin>('Immersive');

/**
 * Reports whether the bars were actually hidden, so the caller can fall back
 * to hiding just the status bar on a build without the plugin.
 */
export async function enterImmersiveMode(): Promise<boolean> {
    try {
        await Immersive.enter();
        return true;
    } catch {
        return false;
    }
}

export async function exitImmersiveMode(): Promise<boolean> {
    try {
        await Immersive.exit();
        return true;
    } catch {
        return false;
    }
}

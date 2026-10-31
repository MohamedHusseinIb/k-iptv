import { signal } from '@angular/core';
import { getFullscreenStrategy } from './fullscreen-strategy';

/**
 * Owns the fullscreen lifecycle for a player surface: tracks the current
 * fullscreen state, observes external changes, and toggles fullscreen on the
 * target element. The component keeps the capability gating and the
 * label/icon derivation; this helper only deals with the mechanism.
 *
 * The mechanism itself is pluggable because the Fullscreen API does not
 * survive an Android WebView — see `fullscreen-strategy`.
 */
export class ControlsFullscreen {
    readonly isFullscreen = signal(false);

    private readonly unsubscribe: () => void;

    private readonly onFullscreenChange = () => {
        this.sync();
        this.onChange?.();
    };

    constructor(
        private readonly target: () => HTMLElement | null,
        private readonly onChange?: () => void
    ) {
        this.unsubscribe = getFullscreenStrategy().subscribe(
            this.onFullscreenChange
        );
    }

    sync(): void {
        const target = this.target();
        this.isFullscreen.set(
            Boolean(target && getFullscreenStrategy().isActive(target))
        );
    }

    canFullscreen(): boolean {
        const target = this.target();
        return Boolean(target && getFullscreenStrategy().isSupported(target));
    }

    async toggle(): Promise<void> {
        const target = this.target();
        if (!target || !this.canFullscreen()) {
            return;
        }
        const strategy = getFullscreenStrategy();
        try {
            if (strategy.isActive(target)) {
                await strategy.exit(target);
            } else {
                await strategy.enter(target);
            }
        } catch {
            return;
        }
    }

    dispose(): void {
        this.unsubscribe();
    }
}

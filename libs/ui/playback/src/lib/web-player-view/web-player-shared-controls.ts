import { inject } from '@angular/core';
import { SettingsStore } from '@kiptv/services';
import { WEB_PLAYER_SHARED_CONTROLS_ENABLED } from '../player-controls';

export function resolveWebPlayerSharedControls(): boolean {
    const storedValue = inject(SettingsStore).webPlayerSharedControls?.();
    return typeof storedValue === 'boolean'
        ? storedValue
        : WEB_PLAYER_SHARED_CONTROLS_ENABLED;
}

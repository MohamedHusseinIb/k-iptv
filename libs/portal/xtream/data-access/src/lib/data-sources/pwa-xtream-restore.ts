import type { UserDataStorage } from '@kiptv/services';
import { PwaXtreamBackupStorage } from '@kiptv/services/pwa-xtream-backup-storage';
import type { XtreamPendingRestoreState } from '@kiptv/shared/interfaces';

/** Load backup persistence only for a restore, sharing the initial import contract. */
export function restorePwaXtreamUserData(
    storage: UserDataStorage,
    playlistId: string,
    state: XtreamPendingRestoreState
): Promise<void> {
    return new PwaXtreamBackupStorage(storage).restore(playlistId, state);
}

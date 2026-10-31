import type { RecordingItem } from '@kiptv/services';

export type RecordingItemActionType =
    | 'open-detail'
    | 'play'
    | 'remove'
    | 'reveal'
    | 'stop';

export type RecordingActionResult =
    | 'success'
    | 'file-missing'
    | 'failed'
    | 'ignored';

export interface RecordingItemAction {
    readonly type: RecordingItemActionType;
    readonly item: RecordingItem;
}

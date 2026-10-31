import { createPlaybackSessionKey } from '@kiptv/playback/util';
import type { XtreamSerieEpisode } from '@kiptv/shared/interfaces';
import type { SeriesPlaybackEpisodeState } from '@kiptv/ui/playback';

export function createSerialPlaybackSessionKey(
    sourceId: string | undefined,
    seriesId: number | string | undefined,
    episodeState: SeriesPlaybackEpisodeState<XtreamSerieEpisode> | null
): string {
    const normalizedSeriesId = Number(seriesId);
    if (
        !sourceId ||
        !Number.isSafeInteger(normalizedSeriesId) ||
        normalizedSeriesId <= 0 ||
        !episodeState
    ) {
        return '';
    }

    return createPlaybackSessionKey({
        kind: 'episode',
        sourceId,
        contentId: episodeState.episode.id,
        seriesId: normalizedSeriesId,
        seasonNumber: episodeState.seasonNumber,
        episodeNumber: episodeState.episodeNumber,
    });
}

import { ChannelActions } from '@kiptv/m3u-state';
import { Channel } from '@kiptv/shared/interfaces';

export function createM3uChannelPlaybackRequest(channel: Channel) {
    return ChannelActions.setActiveChannel({
        channel,
        startPlayback: true,
    });
}

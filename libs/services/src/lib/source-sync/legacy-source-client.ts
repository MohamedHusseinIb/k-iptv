import { SERVER_USER_STATE_NAMESPACES } from '@kiptv/shared/interfaces';

/** Presence on this device, not a server read, establishes an upgrading client. */
export function wasLegacySourceClient(instanceId: string): boolean {
    if (localStorage.getItem('kiptv-server:cache-owner') === instanceId)
        return true;
    if (
        SERVER_USER_STATE_NAMESPACES.some(
            (key) =>
                localStorage.getItem(
                    `kiptv-server:cache:${instanceId}:${key}`
                ) !== null
        )
    )
        return true;
    try {
        const remembered = JSON.parse(
            localStorage.getItem('kiptv-server:instance') ?? 'null'
        );
        return (
            remembered?.instance?.storage === 'server' &&
            remembered.instance.instanceId === instanceId
        );
    } catch {
        return false;
    }
}

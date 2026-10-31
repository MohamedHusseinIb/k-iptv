import {
    readServerStorageConfig,
    serverStorageConfigProblem,
} from './storage-config';

describe('readServerStorageConfig', () => {
    it('keeps storage off and the API open by default', () => {
        expect(readServerStorageConfig({})).toEqual({
            enabled: false,
            accessToken: null,
            maxDocumentBytes: 64 * 1024 * 1024,
        });
    });

    it('enables storage only for KIPTV_STORAGE=server', () => {
        expect(
            readServerStorageConfig({ KIPTV_STORAGE: ' Server ' }).enabled
        ).toBe(true);
        expect(
            readServerStorageConfig({ KIPTV_STORAGE: 'none' }).enabled
        ).toBe(false);
        expect(
            readServerStorageConfig({ KIPTV_STORAGE: '1' }).enabled
        ).toBe(false);
    });

    it('reads a trimmed access token and ignores a blank one', () => {
        expect(
            readServerStorageConfig({ KIPTV_ACCESS_TOKEN: ' s3cret ' })
                .accessToken
        ).toBe('s3cret');
        expect(
            readServerStorageConfig({ KIPTV_ACCESS_TOKEN: '  ' })
                .accessToken
        ).toBeNull();
    });

    it('reads a positive document limit in megabytes', () => {
        expect(
            readServerStorageConfig({ KIPTV_MAX_DOCUMENT_MB: '8' })
                .maxDocumentBytes
        ).toBe(8 * 1024 * 1024);
        expect(
            readServerStorageConfig({ KIPTV_MAX_DOCUMENT_MB: '-1' })
                .maxDocumentBytes
        ).toBe(64 * 1024 * 1024);
    });

    it('refuses an access token without server storage', () => {
        const problem = (env: Record<string, string>) =>
            serverStorageConfigProblem(readServerStorageConfig(env));

        expect(problem({ KIPTV_ACCESS_TOKEN: 's3cret' })).toContain(
            'KIPTV_STORAGE=server'
        );
        expect(
            problem({
                KIPTV_ACCESS_TOKEN: 's3cret',
                KIPTV_STORAGE: 'server',
            })
        ).toBeNull();
        expect(problem({})).toBeNull();
    });
});

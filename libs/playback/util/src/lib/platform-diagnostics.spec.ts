import {
    getPlatformDiagnostics,
    registerPlatformDiagnostics,
} from './platform-diagnostics';

describe('platform diagnostics', () => {
    afterEach(() => registerPlatformDiagnostics(null));

    it('is absent until a platform registers, so the key is omitted', () => {
        expect(getPlatformDiagnostics()).toBeUndefined();
    });

    it('publishes short primitives', () => {
        registerPlatformDiagnostics(() => ({
            shell: 'capacitor',
            streamProxy: 'active',
            streamProxyPort: 41234,
            patched: true,
        }));
        expect(getPlatformDiagnostics()).toEqual({
            shell: 'capacitor',
            streamProxy: 'active',
            streamProxyPort: 41234,
            patched: true,
        });
    });

    it('drops URLs, long strings and non-primitives', () => {
        registerPlatformDiagnostics(
            () =>
                ({
                    base: 'http://127.0.0.1:41234',
                    long: 'x'.repeat(65),
                    nested: { secret: 1 },
                    broken: Number.NaN,
                    kept: 'active',
                }) as never
        );
        expect(getPlatformDiagnostics()).toEqual({ kept: 'active' });
    });

    it('never lets a throwing provider break the failure screen', () => {
        registerPlatformDiagnostics(() => {
            throw new Error('boom');
        });
        expect(getPlatformDiagnostics()).toBeUndefined();
    });

    it('reports nothing when every value was rejected', () => {
        registerPlatformDiagnostics(() => ({ base: 'https://secret.test' }));
        expect(getPlatformDiagnostics()).toBeUndefined();
    });
});

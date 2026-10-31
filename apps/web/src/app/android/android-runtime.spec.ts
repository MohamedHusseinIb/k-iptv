import {
    hasCapacitorBridge,
    isAndroidNativeRuntime,
    isCapacitorPluginAvailable,
} from './android-runtime';

type Global = { Capacitor?: unknown };

function setCapacitor(value: unknown): void {
    if (value === undefined) delete (globalThis as Global).Capacitor;
    else (globalThis as Global).Capacitor = value;
}

describe('android runtime detection', () => {
    afterEach(() => setCapacitor(undefined));

    // Capacitor 3+ exposes isNativePlatform as a method. Reading it as a
    // property returns a function, which is truthy but never `=== true`, so
    // every native path silently disabled itself on a real device while the
    // web fallbacks kept the rest of the app working.
    it('detects the Android shell when isNativePlatform is a method', () => {
        setCapacitor({
            isNativePlatform: () => true,
            getPlatform: () => 'android',
        });
        expect(isAndroidNativeRuntime()).toBe(true);
    });

    it('still accepts the legacy boolean property', () => {
        setCapacitor({ isNativePlatform: true, getPlatform: () => 'android' });
        expect(isAndroidNativeRuntime()).toBe(true);
    });

    it('is false in a plain browser with no bridge', () => {
        setCapacitor(undefined);
        expect(isAndroidNativeRuntime()).toBe(false);
        expect(hasCapacitorBridge()).toBe(false);
    });

    it('is false for the Capacitor web platform', () => {
        setCapacitor({
            isNativePlatform: () => false,
            getPlatform: () => 'web',
        });
        expect(isAndroidNativeRuntime()).toBe(false);
        expect(hasCapacitorBridge()).toBe(true);
    });

    it('is false on iOS, which has its own native paths', () => {
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'ios' });
        expect(isAndroidNativeRuntime()).toBe(false);
    });

    it('is false when the bridge is present but incomplete', () => {
        setCapacitor({});
        expect(isAndroidNativeRuntime()).toBe(false);
    });

    it('reports plugin availability through the bridge', () => {
        setCapacitor({ isPluginAvailable: (name: string) => name === 'Live' });
        expect(isCapacitorPluginAvailable('Live')).toBe(true);
        expect(isCapacitorPluginAvailable('Missing')).toBe(false);
    });
});

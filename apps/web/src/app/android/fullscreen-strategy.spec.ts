import {
    getFullscreenStrategy,
    resetFullscreenStrategy,
} from '@kiptv/ui/playback/fullscreen-strategy';

type FullscreenModule = typeof import('./fullscreen-strategy');

const statusBar = { hide: jest.fn(), show: jest.fn() };
const screenOrientation = { lock: jest.fn(), unlock: jest.fn() };

type Global = { Capacitor?: unknown };

function setAndroidRuntime(enabled: boolean): void {
    if (!enabled) delete (globalThis as Global).Capacitor;
    else
        (globalThis as Global).Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
        };
}

describe('android fullscreen strategy', () => {
    let androidFullscreenStrategy: FullscreenModule['androidFullscreenStrategy'];
    let exitAndroidFullscreen: FullscreenModule['exitAndroidFullscreen'];
    let installAndroidFullscreen: FullscreenModule['installAndroidFullscreen'];
    let target: HTMLElement;

    beforeAll(async () => {
        jest.unstable_mockModule('@capacitor/status-bar', () => ({
            StatusBar: statusBar,
        }));
        jest.unstable_mockModule('@capacitor/screen-orientation', () => ({
            ScreenOrientation: screenOrientation,
        }));

        const strategyModule = await import('./fullscreen-strategy');
        androidFullscreenStrategy = strategyModule.androidFullscreenStrategy;
        exitAndroidFullscreen = strategyModule.exitAndroidFullscreen;
        installAndroidFullscreen = strategyModule.installAndroidFullscreen;
    });

    beforeEach(() => {
        for (const fn of [
            statusBar.hide,
            statusBar.show,
            screenOrientation.lock,
            screenOrientation.unlock,
        ]) {
            fn.mockReset();
            fn.mockResolvedValue(undefined);
        }
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        await androidFullscreenStrategy.exit(target);
        target.remove();
        setAndroidRuntime(false);
        resetFullscreenStrategy();
    });

    it('covers the viewport without using the Fullscreen API', async () => {
        await androidFullscreenStrategy.enter(target);

        expect(target.style.position).toBe('fixed');
        expect(target.style.width).toBe('100%');
        expect(target.style.height).toBe('100%');
        expect(target.style.zIndex).toBe('2147483647');
        expect(androidFullscreenStrategy.isActive(target)).toBe(true);
    });

    it('hides the system bars and goes landscape', async () => {
        await androidFullscreenStrategy.enter(target);

        expect(statusBar.hide).toHaveBeenCalled();
        expect(screenOrientation.lock).toHaveBeenCalledWith({
            orientation: 'landscape',
        });
    });

    // The player surface is styled by the app, so leaving fullscreen must put
    // back exactly what was there rather than blanking the properties.
    it('restores the styles the element had before', async () => {
        target.style.setProperty('position', 'relative');
        target.style.setProperty('background-color', 'rgb(1, 2, 3)');

        await androidFullscreenStrategy.enter(target);
        await androidFullscreenStrategy.exit(target);

        expect(target.style.position).toBe('relative');
        expect(target.style.backgroundColor).toBe('rgb(1, 2, 3)');
        expect(target.style.getPropertyValue('z-index')).toBe('');
        expect(androidFullscreenStrategy.isActive(target)).toBe(false);
    });

    it('restores page scrolling and orientation', async () => {
        await androidFullscreenStrategy.enter(target);
        expect(document.body.style.overflow).toBe('hidden');

        await androidFullscreenStrategy.exit(target);
        expect(document.body.style.overflow).toBe('');
        expect(screenOrientation.unlock).toHaveBeenCalled();
        expect(statusBar.show).toHaveBeenCalled();
    });

    // A transformed ancestor would otherwise become the containing block and
    // pin the "fullscreen" surface inside the page layout.
    it('neutralises ancestors that would capture a fixed surface', async () => {
        const ancestor = document.createElement('div');
        ancestor.style.setProperty('transform', 'translateX(10px)');
        ancestor.style.setProperty('will-change', 'transform');
        document.body.appendChild(ancestor);
        ancestor.appendChild(target);

        await androidFullscreenStrategy.enter(target);
        expect(ancestor.style.getPropertyValue('transform')).toBe('none');
        expect(ancestor.style.getPropertyValue('will-change')).toBe('auto');

        await androidFullscreenStrategy.exit(target);
        expect(ancestor.style.getPropertyValue('transform')).toBe(
            'translateX(10px)'
        );
        expect(ancestor.style.getPropertyValue('will-change')).toBe(
            'transform'
        );
        ancestor.remove();
    });

    it('leaves untransformed ancestors untouched', async () => {
        const ancestor = document.createElement('div');
        document.body.appendChild(ancestor);
        ancestor.appendChild(target);

        await androidFullscreenStrategy.enter(target);
        expect(ancestor.getAttribute('style')).toBeNull();

        await androidFullscreenStrategy.exit(target);
        ancestor.remove();
    });

    it('notifies subscribers on both transitions', async () => {
        const listener = jest.fn();
        const stop = androidFullscreenStrategy.subscribe(listener);

        await androidFullscreenStrategy.enter(target);
        expect(listener).toHaveBeenCalledTimes(1);

        await androidFullscreenStrategy.exit(target);
        expect(listener).toHaveBeenCalledTimes(2);

        stop();
        await androidFullscreenStrategy.enter(target);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('ignores an exit for a surface that is not the active one', async () => {
        const other = document.createElement('div');
        await androidFullscreenStrategy.enter(target);

        await androidFullscreenStrategy.exit(other);

        expect(androidFullscreenStrategy.isActive(target)).toBe(true);
    });

    it('lets the back button close fullscreen exactly once', async () => {
        expect(exitAndroidFullscreen()).toBe(false);

        await androidFullscreenStrategy.enter(target);
        expect(exitAndroidFullscreen()).toBe(true);
        expect(exitAndroidFullscreen()).toBe(false);
    });

    // A plugin that rejects must not leave a half-entered surface behind.
    it('still covers the viewport when the plugins refuse', async () => {
        statusBar.hide.mockRejectedValue(new Error('no status bar'));
        screenOrientation.lock.mockRejectedValue(new Error('locked'));

        await androidFullscreenStrategy.enter(target);

        expect(androidFullscreenStrategy.isActive(target)).toBe(true);
        expect(target.style.position).toBe('fixed');
    });

    it('is installed only inside the Android shell', () => {
        setAndroidRuntime(false);
        installAndroidFullscreen();
        expect(getFullscreenStrategy()).not.toBe(androidFullscreenStrategy);

        setAndroidRuntime(true);
        installAndroidFullscreen();
        expect(getFullscreenStrategy()).toBe(androidFullscreenStrategy);
    });
});

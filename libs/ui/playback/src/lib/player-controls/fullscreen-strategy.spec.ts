import {
    documentFullscreenStrategy,
    getFullscreenStrategy,
    registerFullscreenStrategy,
    resetFullscreenStrategy,
    type FullscreenStrategy,
} from './fullscreen-strategy';

function stubStrategy(): FullscreenStrategy {
    return {
        isSupported: () => true,
        isActive: () => false,
        enter: () => Promise.resolve(),
        exit: () => Promise.resolve(),
        subscribe: () => () => undefined,
    };
}

function setFullscreenElement(element: Element | null): void {
    Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: element,
    });
}

describe('fullscreen strategy', () => {
    afterEach(() => {
        resetFullscreenStrategy();
        setFullscreenElement(null);
    });

    it('uses the browser Fullscreen API until a platform overrides it', () => {
        expect(getFullscreenStrategy()).toBe(documentFullscreenStrategy);
    });

    it('returns the registered strategy', () => {
        const strategy = stubStrategy();
        registerFullscreenStrategy(strategy);
        expect(getFullscreenStrategy()).toBe(strategy);
    });

    it('restores the browser default on reset', () => {
        registerFullscreenStrategy(stubStrategy());
        resetFullscreenStrategy();
        expect(getFullscreenStrategy()).toBe(documentFullscreenStrategy);
    });

    it('treats a target without requestFullscreen as unsupported', () => {
        expect(documentFullscreenStrategy.isSupported({} as HTMLElement)).toBe(
            false
        );
    });

    it('reports only the current fullscreen element as active', () => {
        const target = document.createElement('div');
        const other = document.createElement('div');
        setFullscreenElement(target);

        expect(documentFullscreenStrategy.isActive(target)).toBe(true);
        expect(documentFullscreenStrategy.isActive(other)).toBe(false);
    });

    it('stops notifying once unsubscribed', () => {
        let calls = 0;
        const stop = documentFullscreenStrategy.subscribe(() => calls++);

        document.dispatchEvent(new Event('fullscreenchange'));
        expect(calls).toBe(1);

        stop();
        document.dispatchEvent(new Event('fullscreenchange'));
        expect(calls).toBe(1);
    });
});

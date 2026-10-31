const homedirMock = jest.fn<string, []>();

jest.mock('os', () => ({
    ...jest.requireActual('os'),
    homedir: () => homedirMock(),
}));

import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    KIPTV_DATA_DIR_ENV,
    KIPTV_E2E_DATA_DIR_ENV,
    getElectronConfigDirectory,
    getElectronUserDataPath,
    getKiptvDataRoot,
    getKiptvDatabaseDirectory,
    getKiptvDatabasePath,
} from './path-utils';

describe('path-utils', () => {
    let tempRoot: string;
    let originalEnvValue: string | undefined;
    let originalDataDirValue: string | undefined;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'kiptv-path-utils-'));
        homedirMock.mockReturnValue(join(tempRoot, 'home'));
        originalEnvValue = process.env[KIPTV_E2E_DATA_DIR_ENV];
        delete process.env[KIPTV_E2E_DATA_DIR_ENV];
        originalDataDirValue = process.env[KIPTV_DATA_DIR_ENV];
        delete process.env[KIPTV_DATA_DIR_ENV];
    });

    afterEach(() => {
        if (originalEnvValue === undefined) {
            delete process.env[KIPTV_E2E_DATA_DIR_ENV];
        } else {
            process.env[KIPTV_E2E_DATA_DIR_ENV] = originalEnvValue;
        }
        if (originalDataDirValue === undefined) {
            delete process.env[KIPTV_DATA_DIR_ENV];
        } else {
            process.env[KIPTV_DATA_DIR_ENV] = originalDataDirValue;
        }
        rmSync(tempRoot, { force: true, recursive: true });
    });

    it('uses and creates KIPTV_DATA_DIR as the data root', () => {
        const dataDir = join(tempRoot, 'volume');
        process.env[KIPTV_DATA_DIR_ENV] = ` ${dataDir} `;

        expect(getKiptvDataRoot()).toBe(dataDir);
        expect(existsSync(dataDir)).toBe(true);
        expect(getKiptvDatabasePath()).toBe(
            join(dataDir, 'databases', 'kiptv.db')
        );
    });

    it('isolates a selected server profile without changing the standalone data root', () => {
        const previous = process.env['KIPTV_SOURCE_PROFILE'];
        const profile = 'a'.repeat(64);
        process.env['KIPTV_SOURCE_PROFILE'] = profile;
        process.env[KIPTV_DATA_DIR_ENV] = tempRoot;
        try {
            expect(getKiptvDatabasePath()).toBe(join(tempRoot, 'server-profiles', profile, 'databases', 'kiptv.db'));
            expect(getKiptvDataRoot()).toBe(tempRoot);
            process.env['KIPTV_SOURCE_PROFILE'] = '../outside';
            expect(getKiptvDatabasePath()).toBe(join(tempRoot, 'databases', 'kiptv.db'));
        } finally {
            if (previous === undefined) delete process.env['KIPTV_SOURCE_PROFILE'];
            else process.env['KIPTV_SOURCE_PROFILE'] = previous;
        }
    });

    it('lets the E2E override win over KIPTV_DATA_DIR', () => {
        const e2eDir = join(tempRoot, 'e2e');
        process.env[KIPTV_E2E_DATA_DIR_ENV] = e2eDir;
        process.env[KIPTV_DATA_DIR_ENV] = join(tempRoot, 'volume');

        expect(getKiptvDataRoot()).toBe(e2eDir);
    });

    it('ignores a blank KIPTV_DATA_DIR', () => {
        process.env[KIPTV_DATA_DIR_ENV] = '   ';

        expect(getKiptvDataRoot()).toBe(
            join(tempRoot, 'home', '.kiptv')
        );
    });

    it('uses and creates the E2E data dir override when the env variable is set', () => {
        const e2eDataDir = join(tempRoot, 'e2e-data');
        process.env[KIPTV_E2E_DATA_DIR_ENV] = e2eDataDir;

        expect(getKiptvDataRoot()).toBe(e2eDataDir);
        expect(existsSync(e2eDataDir)).toBe(true);
    });

    it('falls back to ~/.kiptv when the env override is blank', () => {
        process.env[KIPTV_E2E_DATA_DIR_ENV] = '   ';

        const expectedRoot = join(tempRoot, 'home', '.kiptv');

        expect(getKiptvDataRoot()).toBe(expectedRoot);
        expect(existsSync(expectedRoot)).toBe(true);
    });

    it('places the databases directory and database file under the data root', () => {
        const e2eDataDir = join(tempRoot, 'e2e-data');
        process.env[KIPTV_E2E_DATA_DIR_ENV] = e2eDataDir;

        const databaseDirectory = getKiptvDatabaseDirectory();

        expect(databaseDirectory).toBe(join(e2eDataDir, 'databases'));
        expect(existsSync(databaseDirectory)).toBe(true);
        expect(getKiptvDatabasePath()).toBe(
            join(e2eDataDir, 'databases', 'kiptv.db')
        );
    });

    it('returns null Electron user-data and config paths outside E2E runs', () => {
        expect(getElectronUserDataPath()).toBeNull();
        expect(getElectronConfigDirectory()).toBeNull();
    });

    it('creates Electron user-data and config directories under the E2E root', () => {
        const e2eDataDir = join(tempRoot, 'e2e-data');
        process.env[KIPTV_E2E_DATA_DIR_ENV] = e2eDataDir;

        const userDataPath = getElectronUserDataPath();
        const configDirectory = getElectronConfigDirectory();

        expect(userDataPath).toBe(join(e2eDataDir, 'user-data'));
        expect(configDirectory).toBe(join(e2eDataDir, 'config'));
        expect(existsSync(userDataPath as string)).toBe(true);
        expect(existsSync(configDirectory as string)).toBe(true);
    });
});

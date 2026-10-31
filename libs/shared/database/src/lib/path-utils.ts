import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const KIPTV_E2E_DATA_DIR_ENV = 'KIPTV_E2E_DATA_DIR';

/**
 * Operator-selected data root for deployments that keep the database on a
 * mounted volume, for example `/data`. The E2E override wins.
 */
export const KIPTV_DATA_DIR_ENV = 'KIPTV_DATA_DIR';

function ensureDirectory(dirPath: string): string {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }

    return dirPath;
}

export function getKiptvDataRoot(): string {
    const e2eDataDir = process.env[KIPTV_E2E_DATA_DIR_ENV]?.trim();

    if (e2eDataDir) {
        return ensureDirectory(e2eDataDir);
    }

    const dataDir = process.env[KIPTV_DATA_DIR_ENV]?.trim();

    if (dataDir) {
        return ensureDirectory(dataDir);
    }

    return ensureDirectory(join(homedir(), '.kiptv'));
}

export function getKiptvDatabaseDirectory(): string {
    const profile = process.env['KIPTV_SOURCE_PROFILE'];
    if (profile && /^[a-f0-9]{64}$/.test(profile)) {
        return ensureDirectory(join(getKiptvDataRoot(), 'server-profiles', profile, 'databases'));
    }
    return ensureDirectory(join(getKiptvDataRoot(), 'databases'));
}

export function getKiptvDatabasePath(): string {
    return join(getKiptvDatabaseDirectory(), 'kiptv.db');
}

export function getElectronUserDataPath(): string | null {
    const e2eDataDir = process.env[KIPTV_E2E_DATA_DIR_ENV]?.trim();

    if (!e2eDataDir) {
        return null;
    }

    return ensureDirectory(join(e2eDataDir, 'user-data'));
}

export function getElectronConfigDirectory(): string | null {
    const e2eDataDir = process.env[KIPTV_E2E_DATA_DIR_ENV]?.trim();

    if (!e2eDataDir) {
        return null;
    }

    return ensureDirectory(join(e2eDataDir, 'config'));
}

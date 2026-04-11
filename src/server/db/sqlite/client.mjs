import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

export const openSqliteDatabase = (dbPath, options = {}) => {
    mkdirSync(dirname(dbPath), { recursive: true });
    return new Database(dbPath, options);
};

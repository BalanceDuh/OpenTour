import { join } from 'node:path';

import { getEnv } from '../../config/env.mjs';
import { openSqliteDatabase } from '../sqlite/client.mjs';
import { createSqliteStatementRepository } from './statement-repository.mjs';

export const createLiveStreamRepository = (service = 'ot-live-stream') => {
    const { dataDir } = getEnv();
    const db = openSqliteDatabase(join(dataDir, 'opentour.db'));
    db.exec(`
CREATE TABLE IF NOT EXISTS ot_live_stream_source_config (
    Id INTEGER PRIMARY KEY CHECK (Id = 1),
    SourceMode TEXT NOT NULL CHECK (SourceMode IN ('server','local')),
    ServerFolderPath TEXT,
    Confirmed INTEGER NOT NULL CHECK (Confirmed IN (0,1)) DEFAULT 0,
    UpdatedAt TEXT NOT NULL
);
`);

    const repository = createSqliteStatementRepository({
        service,
        db,
        statements: {
            getSourceConfig: `
SELECT SourceMode, ServerFolderPath, Confirmed, UpdatedAt
FROM ot_live_stream_source_config
WHERE Id = 1
`,
            upsertSourceConfig: `
INSERT INTO ot_live_stream_source_config (Id, SourceMode, ServerFolderPath, Confirmed, UpdatedAt)
VALUES (1, @source_mode, @server_folder_path, @confirmed, @updated_at)
ON CONFLICT(Id) DO UPDATE SET
    SourceMode = excluded.SourceMode,
    ServerFolderPath = excluded.ServerFolderPath,
    Confirmed = excluded.Confirmed,
    UpdatedAt = excluded.UpdatedAt
`
        }
    });

    return {
        ...repository,
        readSourceConfig: () => {
            const row = repository.get('getSourceConfig');
            if (!row) {
                return {
                    sourceMode: 'server',
                    serverFolderPath: null,
                    confirmed: false,
                    updatedAt: null
                };
            }
            return {
                sourceMode: row.SourceMode === 'local' ? 'local' : 'server',
                serverFolderPath: row.ServerFolderPath ? String(row.ServerFolderPath) : null,
                confirmed: Number(row.Confirmed) === 1,
                updatedAt: row.UpdatedAt || null
            };
        },
        saveSourceConfig: ({ sourceMode, serverFolderPath, confirmed }) => {
            const normalizedMode = sourceMode === 'local' ? 'local' : 'server';
            const normalizedPath = String(serverFolderPath || '').trim();
            repository.run('upsertSourceConfig', {
                source_mode: normalizedMode,
                server_folder_path: normalizedMode === 'server' ? (normalizedPath || null) : null,
                confirmed: confirmed ? 1 : 0,
                updated_at: new Date().toISOString()
            });
            return repository.readSourceConfig();
        }
    };
};

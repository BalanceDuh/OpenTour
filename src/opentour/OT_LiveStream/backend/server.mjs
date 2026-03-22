import { createReadStream, mkdirSync } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const port = Number(process.env.OT_LIVE_STREAM_PORT || 3035);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../../../../');
const dataDir = join(repoRoot, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'opentour.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS ot_live_stream_source_config (
    Id INTEGER PRIMARY KEY CHECK (Id = 1),
    SourceMode TEXT NOT NULL CHECK (SourceMode IN ('server','local')),
    ServerFolderPath TEXT,
    Confirmed INTEGER NOT NULL CHECK (Confirmed IN (0,1)) DEFAULT 0,
    UpdatedAt TEXT NOT NULL
);
`);

const getSourceConfigStmt = db.prepare(`
SELECT SourceMode, ServerFolderPath, Confirmed, UpdatedAt
FROM ot_live_stream_source_config
WHERE Id = 1
`);

const upsertSourceConfigStmt = db.prepare(`
INSERT INTO ot_live_stream_source_config (Id, SourceMode, ServerFolderPath, Confirmed, UpdatedAt)
VALUES (1, @source_mode, @server_folder_path, @confirmed, @updated_at)
ON CONFLICT(Id) DO UPDATE SET
    SourceMode = excluded.SourceMode,
    ServerFolderPath = excluded.ServerFolderPath,
    Confirmed = excluded.Confirmed,
    UpdatedAt = excluded.UpdatedAt
`);

const MODEL_EXTS = new Set(['.ply', '.splat', '.ksplat', '.spz', '.sog', '.lcc']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);

const sseClients = new Set();
let currentSession = null;

const json = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(payload);
};

const sendSse = (event, payload) => {
    const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach((res) => res.write(line));
};

const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
});

const fileMime = (filePath) => {
    switch (extname(filePath).toLowerCase()) {
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'application/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.csv': return 'text/csv; charset=utf-8';
        case '.mp4': return 'video/mp4';
        case '.mov': return 'video/quicktime';
        case '.webm': return 'video/webm';
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        case '.flac': return 'audio/flac';
        case '.ply': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
};

const safeName = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const readSourceConfig = () => {
    const row = getSourceConfigStmt.get();
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
};

const saveSourceConfig = ({ sourceMode, serverFolderPath, confirmed }) => {
    const normalizedMode = sourceMode === 'local' ? 'local' : 'server';
    const normalizedPath = String(serverFolderPath || '').trim();
    upsertSourceConfigStmt.run({
        source_mode: normalizedMode,
        server_folder_path: normalizedMode === 'server' ? (normalizedPath || null) : null,
        confirmed: confirmed ? 1 : 0,
        updated_at: new Date().toISOString()
    });
    return readSourceConfig();
};

const maybeFile = async (filePath) => {
    try {
        const info = await stat(filePath);
        return info.isFile() ? filePath : null;
    } catch {
        return null;
    }
};

const collectIntros = async (rootPath) => {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const videos = [];
    for (const entry of entries) {
        const fullPath = join(rootPath, entry.name);
        if (entry.isFile() && VIDEO_EXTS.has(extname(entry.name).toLowerCase())) {
            videos.push(fullPath);
        }
        if (entry.isDirectory() && entry.name.toLowerCase() === 'intros') {
            const nested = await readdir(fullPath, { withFileTypes: true });
            nested.forEach((child) => {
                if (child.isFile() && VIDEO_EXTS.has(extname(child.name).toLowerCase())) {
                    videos.push(join(fullPath, child.name));
                }
            });
        }
    }
    return videos.sort((a, b) => a.localeCompare(b, 'en'));
};

const selectFirst = (items, predicate) => items.find(predicate) || null;

const scanModelFolder = async (folderPath, rootPath, index) => {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => join(folderPath, entry.name));
    const byExt = (set) => files.filter((filePath) => set.has(extname(filePath).toLowerCase()));
    const calibrationPath = selectFirst(files, (filePath) => /calibration/i.test(basename(filePath)) && extname(filePath).toLowerCase() === '.json');
    const csvPath = selectFirst(files, (filePath) => extname(filePath).toLowerCase() === '.csv');
    const audioPath = selectFirst(files, (filePath) => AUDIO_EXTS.has(extname(filePath).toLowerCase()));
    const modelPath = selectFirst(byExt(MODEL_EXTS), (filePath) => filePath !== calibrationPath && !/calibration/i.test(basename(filePath)));

    const errors = [];
    if (!modelPath) errors.push('missing model file');
    if (!calibrationPath) errors.push('missing calibration json');
    if (!csvPath) errors.push('missing csv');
    if (!audioPath) errors.push('missing audio');

    return {
        id: `model_${index + 1}`,
        displayName: basename(folderPath),
        folderName: basename(folderPath),
        folderPath,
        relativeFolder: folderPath.slice(rootPath.length + 1),
        modelPath,
        calibrationPath,
        csvPath,
        audioPath,
        valid: errors.length < 1,
        errors
    };
};

const createAssetMap = (manifest) => {
    const assets = new Map();
    manifest.intros.forEach((intro) => assets.set(intro.assetId, intro.path));
    manifest.models.forEach((model) => {
        [
            ['model', model.modelPath],
            ['calibration', model.calibrationPath],
            ['csv', model.csvPath],
            ['audio', model.audioPath]
        ].forEach(([kind, filePath]) => {
            if (!filePath) return;
            assets.set(`${model.id}:${kind}`, filePath);
        });
    });
    return assets;
};

const toClientManifest = (session) => ({
    sessionId: session.id,
    rootPath: session.rootPath,
    startedAt: session.startedAt,
    intros: session.manifest.intros.map((intro) => ({
        id: intro.id,
        name: intro.name,
        assetId: intro.assetId,
        url: `/api/ot-live-stream/file?session_id=${encodeURIComponent(session.id)}&asset_id=${encodeURIComponent(intro.assetId)}`
    })),
    models: session.manifest.models.map((model) => ({
        id: model.id,
        displayName: model.displayName,
        folderName: model.folderName,
        relativeFolder: model.relativeFolder,
        valid: model.valid,
        errors: model.errors,
        assets: {
            model: model.modelPath ? {
                name: basename(model.modelPath),
                assetId: `${model.id}:model`,
                url: `/api/ot-live-stream/file?session_id=${encodeURIComponent(session.id)}&asset_id=${encodeURIComponent(`${model.id}:model`)}`
            } : null,
            calibration: model.calibrationPath ? {
                name: basename(model.calibrationPath),
                assetId: `${model.id}:calibration`,
                url: `/api/ot-live-stream/file?session_id=${encodeURIComponent(session.id)}&asset_id=${encodeURIComponent(`${model.id}:calibration`)}`
            } : null,
            csv: model.csvPath ? {
                name: basename(model.csvPath),
                assetId: `${model.id}:csv`,
                url: `/api/ot-live-stream/file?session_id=${encodeURIComponent(session.id)}&asset_id=${encodeURIComponent(`${model.id}:csv`)}`
            } : null,
            audio: model.audioPath ? {
                name: basename(model.audioPath),
                assetId: `${model.id}:audio`,
                url: `/api/ot-live-stream/file?session_id=${encodeURIComponent(session.id)}&asset_id=${encodeURIComponent(`${model.id}:audio`)}`
            } : null
        }
    }))
});

const scanFolder = async (folderPath) => {
    const rootPath = resolve(String(folderPath || '').trim());
    if (!rootPath) throw new Error('folderPath required');
    await access(rootPath);
    const info = await stat(rootPath);
    if (!info.isDirectory()) throw new Error('folderPath must be a directory');

    const entries = await readdir(rootPath, { withFileTypes: true });
    const intros = await collectIntros(rootPath);
    const models = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.toLowerCase() === 'intros') continue;
        models.push(await scanModelFolder(join(rootPath, entry.name), rootPath, models.length));
    }
    models.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en'));

    return {
        rootPath,
        scannedAt: new Date().toISOString(),
        intros: intros.map((filePath, index) => ({
            id: `intro_${index + 1}`,
            name: basename(filePath),
            path: filePath,
            assetId: `intro_${index + 1}`
        })),
        models
    };
};

const createSession = async (folderPath) => {
    const manifest = await scanFolder(folderPath);
    const session = {
        id: `live_${Date.now().toString(36)}`,
        rootPath: manifest.rootPath,
        startedAt: new Date().toISOString(),
        manifest,
        assets: createAssetMap(manifest)
    };
    currentSession = session;
    sendSse('session.started', { ok: true, session: toClientManifest(session) });
    return session;
};

const server = createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') {
            json(res, 200, { ok: true });
            return;
        }

        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/api/ot-live-stream/health' && req.method === 'GET') {
            json(res, 200, { ok: true, service: 'ot-live-stream' });
            return;
        }

        if (url.pathname === '/api/ot-live-stream/source-config' && req.method === 'GET') {
            json(res, 200, { ok: true, config: readSourceConfig() });
            return;
        }

        if (url.pathname === '/api/ot-live-stream/source-config' && req.method === 'PUT') {
            const body = JSON.parse(await readBody(req) || '{}');
            const config = saveSourceConfig({
                sourceMode: safeName(body.sourceMode).toLowerCase() === 'local' ? 'local' : 'server',
                serverFolderPath: safeName(body.serverFolderPath),
                confirmed: Boolean(body.confirmed)
            });
            json(res, 200, { ok: true, config });
            return;
        }

        if (url.pathname === '/api/ot-live-stream/events' && req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });
            sseClients.add(res);
            res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, hasSession: Boolean(currentSession) })}\n\n`);
            if (currentSession) {
                res.write(`event: session.current\ndata: ${JSON.stringify({ ok: true, session: toClientManifest(currentSession) })}\n\n`);
            }
            req.on('close', () => sseClients.delete(res));
            return;
        }

        if (url.pathname === '/api/ot-live-stream/scan' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const manifest = await scanFolder(body.folderPath || '');
            json(res, 200, { ok: true, manifest: {
                rootPath: manifest.rootPath,
                scannedAt: manifest.scannedAt,
                intros: manifest.intros.map((item) => ({ id: item.id, name: item.name })),
                models: manifest.models.map((model) => ({
                    id: model.id,
                    displayName: model.displayName,
                    relativeFolder: model.relativeFolder,
                    valid: model.valid,
                    errors: model.errors,
                    files: {
                        model: model.modelPath ? basename(model.modelPath) : null,
                        calibration: model.calibrationPath ? basename(model.calibrationPath) : null,
                        csv: model.csvPath ? basename(model.csvPath) : null,
                        audio: model.audioPath ? basename(model.audioPath) : null
                    }
                }))
            } });
            return;
        }

        if (url.pathname === '/api/ot-live-stream/session/start' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const session = await createSession(body.folderPath || '');
            json(res, 200, { ok: true, session: toClientManifest(session) });
            return;
        }

        if (url.pathname === '/api/ot-live-stream/session/current' && req.method === 'GET') {
            json(res, 200, { ok: true, session: currentSession ? toClientManifest(currentSession) : null });
            return;
        }

        if (url.pathname === '/api/ot-live-stream/session/current' && req.method === 'DELETE') {
            const cleared = currentSession?.id || null;
            currentSession = null;
            sendSse('session.cleared', { ok: true, sessionId: cleared });
            json(res, 200, { ok: true, cleared });
            return;
        }

        if (url.pathname === '/api/ot-live-stream/file' && req.method === 'GET') {
            const sessionId = safeName(url.searchParams.get('session_id'));
            const assetId = safeName(url.searchParams.get('asset_id'));
            if (!currentSession || currentSession.id !== sessionId) {
                json(res, 404, { ok: false, error: 'session not found' });
                return;
            }
            const filePath = currentSession.assets.get(assetId);
            if (!filePath) {
                json(res, 404, { ok: false, error: 'asset not found' });
                return;
            }
            const normalized = normalize(filePath);
            if (!normalized.startsWith(currentSession.rootPath)) {
                json(res, 403, { ok: false, error: 'asset outside session root' });
                return;
            }
            const realPath = await maybeFile(normalized);
            if (!realPath) {
                json(res, 404, { ok: false, error: 'file missing' });
                return;
            }
            res.writeHead(200, {
                'Content-Type': fileMime(realPath),
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
            });
            createReadStream(realPath).pipe(res);
            return;
        }

        json(res, 404, { ok: false, error: 'route not found' });
    } catch (error) {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
});

server.listen(port, () => {
    console.log(`[ot-live-stream] listening on http://localhost:${port}`);
});

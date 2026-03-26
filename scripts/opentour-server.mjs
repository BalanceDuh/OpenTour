import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '..'));
const distDir = join(repoRoot, 'dist-opentour');
const dataDir = join(repoRoot, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'opentour.db'));
const schemaSql = readFileSync(join(__dirname, 'opentour-db-schema.sql'), 'utf8');
db.exec(schemaSql);

const ensureColumn = (tableName, columnDef) => {
    try {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
    } catch (error) {
        const message = String(error?.message || error || '');
        if (!/duplicate column name/i.test(message)) throw error;
    }
};

ensureColumn('ot_model_calibration', 'SourceAxisPresetId TEXT');
ensureColumn('ot_model_calibration', 'TargetAxisPresetId TEXT');
ensureColumn('ot_model_calibration', 'CanonicalTopSelectionJson TEXT');
ensureColumn('ot_model_calibration', 'CanonicalFrontSelectionJson TEXT');
ensureColumn('ot_model_calibration', 'BestCameraJson TEXT');
ensureColumn('ot_model_calibration', 'SelectedBestCameraId TEXT');
ensureColumn('ot_model_calibration', 'ImageMime TEXT');

const upsertSnapshotStmt = db.prepare(`
INSERT INTO ot_workflow_snapshot (ModelFilename, PayloadJson, UpdatedAt)
VALUES (@model_filename, @payload_json, @updated_at)
ON CONFLICT(ModelFilename) DO UPDATE SET
    PayloadJson = excluded.PayloadJson,
    UpdatedAt = excluded.UpdatedAt
`);

const getSnapshotStmt = db.prepare(`
SELECT ModelFilename, PayloadJson, UpdatedAt
FROM ot_workflow_snapshot
WHERE ModelFilename = ?
`);

const upsertModelStmt = db.prepare(`
INSERT INTO ot_model (ModelKey, ModelName, FileExt, CreatedAt, UpdatedAt)
VALUES (@model_key, @model_name, @file_ext, @created_at, @updated_at)
ON CONFLICT(ModelKey) DO UPDATE SET
    ModelName = excluded.ModelName,
    FileExt = excluded.FileExt,
    UpdatedAt = excluded.UpdatedAt
`);

const getModelNameByKeyStmt = db.prepare(`
SELECT ModelName
FROM ot_model
WHERE ModelKey = ?
`);

const upsertCalibrationStmt = db.prepare(`
INSERT INTO ot_model_calibration (
    ModelKey,
    AxisPresetId,
    ViewRangeJson,
    VerticalMapImage, FrontViewImage,
    SourceAxisPresetId,
    TargetAxisPresetId,
    CanonicalTopSelectionJson,
    CanonicalFrontSelectionJson,
    BestCameraJson,
    SelectedBestCameraId,
    ImageMime,
    UpdatedAt
) VALUES (
    @model_key,
    @axis_preset_id,
    @view_range_json,
    @vertical_map_image, @front_view_image,
    @source_axis_preset_id,
    @target_axis_preset_id,
    @canonical_top_selection_json,
    @canonical_front_selection_json,
    @best_camera_json,
    @selected_best_camera_id,
    @image_mime,
    @updated_at
)
ON CONFLICT(ModelKey) DO UPDATE SET
    AxisPresetId = excluded.AxisPresetId,
    ViewRangeJson = excluded.ViewRangeJson,
    VerticalMapImage = excluded.VerticalMapImage,
    FrontViewImage = excluded.FrontViewImage,
    SourceAxisPresetId = excluded.SourceAxisPresetId,
    TargetAxisPresetId = excluded.TargetAxisPresetId,
    CanonicalTopSelectionJson = excluded.CanonicalTopSelectionJson,
    CanonicalFrontSelectionJson = excluded.CanonicalFrontSelectionJson,
    BestCameraJson = excluded.BestCameraJson,
    SelectedBestCameraId = excluded.SelectedBestCameraId,
    ImageMime = excluded.ImageMime,
    UpdatedAt = excluded.UpdatedAt
`);

const getCalibrationStmt = db.prepare(`
SELECT
    m.ModelName,
    c.AxisPresetId,
    c.ViewRangeJson,
    c.VerticalMapImage, c.FrontViewImage,
    c.SourceAxisPresetId,
    c.TargetAxisPresetId,
    c.CanonicalTopSelectionJson,
    c.CanonicalFrontSelectionJson,
    c.BestCameraJson,
    c.SelectedBestCameraId,
    c.ImageMime,
    c.UpdatedAt
FROM ot_model_calibration c
JOIN ot_model m ON m.ModelKey = c.ModelKey
WHERE c.ModelKey = ?
`);

const getCalibrationAxisStmt = db.prepare(`
SELECT AxisPresetId, UpdatedAt
FROM ot_model_calibration
WHERE ModelKey = ?
`);

const getCoordinateStmt = db.prepare(`
SELECT
    m.ModelName,
    c.CoordinateSystem,
    c.UpAxis,
    c.UpDirection,
    c.UpdatedAt
FROM ot_model_coordinate c
JOIN ot_model m ON m.ModelKey = c.ModelKey
WHERE c.ModelKey = ?
`);

const clearAllSnapshotsStmt = db.prepare('DELETE FROM ot_workflow_snapshot');
const clearAllCalibrationsStmt = db.prepare('DELETE FROM ot_model_calibration');
const clearAllCoordinatesStmt = db.prepare('DELETE FROM ot_model_coordinate');
const clearAllModelsStmt = db.prepare('DELETE FROM ot_model');

const clearAllOpentourData = db.transaction(() => {
    const snapshots = clearAllSnapshotsStmt.run().changes;
    const calibrations = clearAllCalibrationsStmt.run().changes;
    const coordinates = clearAllCoordinatesStmt.run().changes;
    const models = clearAllModelsStmt.run().changes;
    return {
        snapshots,
        calibrations,
        coordinates,
        models
    };
});

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

const getMimeType = (filePath) => {
    const ext = extname(filePath).toLowerCase();
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'application/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.csv': return 'text/csv; charset=utf-8';
        case '.map': return 'application/json; charset=utf-8';
        case '.svg': return 'image/svg+xml';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.mp4': return 'video/mp4';
        case '.mp3': return 'audio/mpeg';
        case '.wasm': return 'application/wasm';
        default: return 'application/octet-stream';
    }
};

const sendStatic = (res, urlPath) => {
    let requestPath = decodeURIComponent(urlPath.split('?')[0]);
    if (requestPath === '/') requestPath = '/index.html';
    if (requestPath === '/live') requestPath = '/live.html';

    const safePath = normalize(requestPath).replace(/^\/+/, '');
    const fullPath = join(distDir, safePath);
    if (!fullPath.startsWith(distDir) || !existsSync(fullPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
    }

    const stream = createReadStream(fullPath);
    res.writeHead(200, { 'Content-Type': getMimeType(fullPath) });
    stream.pipe(res);
};

const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
});

const managedBackends = [
    {
        name: 'ot-tour-loader',
        port: 3031,
        script: join(repoRoot, 'src/opentour/OT_TourLoader/backend/server.mjs'),
        env: { OT_TOUR_LOADER_PORT: '3031' }
    },
    {
        name: 'ot-cinematic-workspace',
        port: 3032,
        script: join(repoRoot, 'src/opentour/OT_CinematicWorkspace/backend/server.mjs'),
        env: {
            OT_CINEMATIC_WORKSPACE_PORT: '3032',
            OT_TL_API_BASE: 'http://localhost:3031/api/ot-tour-loader'
        }
    },
    {
        name: 'ot-tour-player',
        port: 3033,
        script: join(repoRoot, 'src/opentour/OT_TourPlayer/backend/server.mjs'),
        env: { OT_TOUR_PLAYER_PORT: '3033' }
    },
    {
        name: 'ot-tour-download',
        port: 3034,
        script: join(repoRoot, 'src/opentour/OT_TourDownload/backend/server.mjs'),
        env: { PORT: '3034' }
    },
    {
        name: 'ot-tour-producer',
        port: 3035,
        script: join(repoRoot, 'src/opentour/OT_TourProducer/backend/server.mjs'),
        env: {
            OT_TOUR_PRODUCER_PORT: '3035',
            FFMPEG_PATH: join(repoRoot, '../tools/bin/ffmpeg'),
            FFPROBE_PATH: join(repoRoot, '../tools/bin/ffprobe')
        }
    },
    {
        name: 'ot-live-stream',
        port: 3036,
        script: join(repoRoot, 'src/opentour/OT_LiveStream/backend/server.mjs'),
        env: { OT_LIVE_STREAM_PORT: '3036' }
    }
];
const spawnedBackends = [];

const isPortOpen = (port) => new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (open) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(800, () => finish(false));
});

const ensureManagedBackends = async () => {
    for (const backend of managedBackends) {
        const open = await isPortOpen(backend.port);
        if (open) continue;
        const child = spawn(process.execPath, [backend.script], {
            cwd: repoRoot,
            stdio: 'ignore',
            env: {
                ...process.env,
                ...backend.env
            }
        });
        spawnedBackends.push(child);
    }
};

const stopManagedBackends = () => {
    for (const child of spawnedBackends) {
        try {
            child.kill();
        } catch {}
    }
};

process.on('exit', stopManagedBackends);
process.on('SIGINT', () => {
    stopManagedBackends();
    process.exit(0);
});
process.on('SIGTERM', () => {
    stopManagedBackends();
    process.exit(0);
});

const validatePayload = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return 'payload must be an object';
    }
    const modelFilename = String(payload.modelFilename || '').trim();
    if (!modelFilename) return 'payload.modelFilename is required';
    if (!payload.projection || typeof payload.projection !== 'object') {
        return 'payload.projection is required';
    }
    if (!('top3' in payload) || !Array.isArray(payload.top3)) {
        return 'payload.top3 must be an array';
    }
    return null;
};

const modelKeyFromName = (name) => String(name || '').trim().toLowerCase();

const splitNameExt = (name) => {
    const m = String(name || '').match(/^(.*?)(\.[^.]+)?$/);
    return {
        base: m?.[1] || name,
        ext: (m?.[2] || '').toLowerCase()
    };
};

const assertModelFilenameMatchesExistingKey = (modelKey, modelFilename) => {
    const row = getModelNameByKeyStmt.get(modelKey);
    if (!row?.ModelName) return null;
    if (String(row.ModelName) !== String(modelFilename)) {
        return `ModelFileName mismatch: existing='${row.ModelName}' request='${modelFilename}'`;
    }
    return null;
};

const saveSnapshot = (modelFilename, payload) => {
    upsertSnapshotStmt.run({
        model_filename: modelFilename,
        payload_json: JSON.stringify(payload),
        updated_at: new Date().toISOString()
    });
};

const loadSnapshot = (modelFilename) => {
    const row = getSnapshotStmt.get(modelFilename);
    if (!row) return null;
    return {
        modelFilename: row.ModelFilename,
        payload: JSON.parse(row.PayloadJson),
        updatedAt: row.UpdatedAt
    };
};

const server = createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') {
            json(res, 200, { ok: true });
            return;
        }

        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/api/workflow/full' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) {
                json(res, 400, { ok: false, error: 'modelFilename required' });
                return;
            }
            const snapshot = loadSnapshot(modelFilename);
            if (!snapshot) {
                json(res, 200, { ok: true, found: false });
                return;
            }
            json(res, 200, {
                ok: true,
                found: true,
                modelFilename: snapshot.modelFilename,
                payload: snapshot.payload,
                updatedAt: snapshot.updatedAt
            });
            return;
        }

        if (url.pathname === '/api/workflow/full' && req.method === 'PUT') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const payload = body.payload;
            if (!modelFilename || !payload) {
                json(res, 400, { ok: false, error: 'modelFilename and payload required' });
                return;
            }
            const payloadErr = validatePayload(payload);
            if (payloadErr) {
                json(res, 400, { ok: false, error: payloadErr });
                return;
            }
            if (String(payload.modelFilename || '').trim() !== modelFilename) {
                json(res, 400, { ok: false, error: 'payload.modelFilename mismatch' });
                return;
            }
            saveSnapshot(modelFilename, payload);
            json(res, 200, { ok: true, modelFilename });
            return;
        }

        if (url.pathname === '/api/workflow/export' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) {
                json(res, 400, { ok: false, error: 'modelFilename required' });
                return;
            }
            const snapshot = loadSnapshot(modelFilename);
            if (!snapshot) {
                json(res, 200, { ok: true, found: false });
                return;
            }
            json(res, 200, {
                ok: true,
                found: true,
                modelFilename: snapshot.modelFilename,
                payload: snapshot.payload,
                updatedAt: snapshot.updatedAt
            });
            return;
        }

        if (url.pathname === '/api/workflow/import' && req.method === 'POST') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const payload = body.payload;
            const payloadErr = validatePayload(payload);
            if (payloadErr) {
                json(res, 400, { ok: false, error: payloadErr });
                return;
            }
            const payloadModelFilename = String(payload.modelFilename || '').trim();
            if (!modelFilename) {
                json(res, 400, { ok: false, error: 'modelFilename required' });
                return;
            }
            if (payloadModelFilename !== modelFilename) {
                json(res, 400, { ok: false, error: 'ModelFileName mismatch between request and payload' });
                return;
            }
            saveSnapshot(modelFilename, payload);
            json(res, 200, {
                ok: true,
                modelFilename,
                payload
            });
            return;
        }

        if (url.pathname === '/api/model/calibration' && req.method === 'PUT') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const calibration = body.calibration;
            if (!modelFilename || !calibration || typeof calibration !== 'object') {
                json(res, 400, { ok: false, error: 'modelFilename and calibration required' });
                return;
            }
            const axisPresetId = String(calibration.axisPresetId || '').trim().toLowerCase();
            const viewRange = calibration.viewRange;
            if (!axisPresetId || !viewRange || typeof viewRange !== 'object') {
                json(res, 400, { ok: false, error: 'axisPresetId and viewRange required' });
                return;
            }
            const calibrationModelFilename = String(calibration.modelFilename || modelFilename).trim();
            if (calibrationModelFilename !== modelFilename) {
                json(res, 400, { ok: false, error: 'ModelFileName mismatch between request and calibration payload' });
                return;
            }

            const key = modelKeyFromName(modelFilename);
            const nameMismatchError = assertModelFilenameMatchesExistingKey(key, modelFilename);
            if (nameMismatchError) {
                json(res, 400, { ok: false, error: nameMismatchError });
                return;
            }
            const now = new Date().toISOString();
            const { ext } = splitNameExt(modelFilename);

            upsertModelStmt.run({
                model_key: key,
                model_name: modelFilename,
                file_ext: ext || null,
                created_at: now,
                updated_at: now
            });

            const decodeImage = (val) => {
                if (!val || typeof val !== 'string') return null;
                const b64 = val.startsWith('data:') ? val.slice(val.indexOf(',') + 1) : val;
                return Buffer.from(b64, 'base64');
            };

            upsertCalibrationStmt.run({
                model_key: key,
                axis_preset_id: axisPresetId,
                view_range_json: JSON.stringify(viewRange),
                vertical_map_image: decodeImage(calibration.verticalMapImage),
                front_view_image: decodeImage(calibration.frontViewImage),
                source_axis_preset_id: calibration.sourceAxisPresetId ? String(calibration.sourceAxisPresetId).trim().toLowerCase() : null,
                target_axis_preset_id: calibration.targetAxisPresetId ? String(calibration.targetAxisPresetId).trim().toLowerCase() : null,
                canonical_top_selection_json: calibration.canonicalTopSelection ? JSON.stringify(calibration.canonicalTopSelection) : null,
                canonical_front_selection_json: calibration.canonicalFrontSelection ? JSON.stringify(calibration.canonicalFrontSelection) : null,
                best_camera_json: calibration.bestCamera ? JSON.stringify(calibration.bestCamera) : null,
                selected_best_camera_id: calibration.selectedBestCameraId ? String(calibration.selectedBestCameraId) : null,
                image_mime: calibration.imageMime ? String(calibration.imageMime) : null,
                updated_at: now
            });

            json(res, 200, { ok: true, modelFilename, modelKey: key, updatedAt: now });
            return;
        }

        if (url.pathname === '/api/model/calibration' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) {
                json(res, 400, { ok: false, error: 'modelFilename required' });
                return;
            }
            const key = modelKeyFromName(modelFilename);
            const nameMismatchError = assertModelFilenameMatchesExistingKey(key, modelFilename);
            if (nameMismatchError) {
                json(res, 400, { ok: false, error: nameMismatchError });
                return;
            }
            const row = getCalibrationStmt.get(key);
            if (!row) {
                json(res, 200, { ok: true, found: false });
                return;
            }
            json(res, 200, {
                ok: true,
                found: true,
                modelFilename: row.ModelName,
                calibration: {
                    axisPresetId: row.AxisPresetId,
                    viewRange: row.ViewRangeJson ? JSON.parse(row.ViewRangeJson) : null,
                    verticalMapImage: row.VerticalMapImage ? Buffer.from(row.VerticalMapImage).toString('base64') : null,
                    frontViewImage: row.FrontViewImage ? Buffer.from(row.FrontViewImage).toString('base64') : null,
                    sourceAxisPresetId: row.SourceAxisPresetId || null,
                    targetAxisPresetId: row.TargetAxisPresetId || null,
                    canonicalTopSelection: row.CanonicalTopSelectionJson ? JSON.parse(row.CanonicalTopSelectionJson) : null,
                    canonicalFrontSelection: row.CanonicalFrontSelectionJson ? JSON.parse(row.CanonicalFrontSelectionJson) : null,
                    bestCamera: row.BestCameraJson ? JSON.parse(row.BestCameraJson) : null,
                    selectedBestCameraId: row.SelectedBestCameraId || null,
                    imageMime: row.ImageMime || 'image/png'
                },
                updatedAt: row.UpdatedAt
            });
            return;
        }

        if (url.pathname === '/api/model/coordinate' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) {
                json(res, 400, { ok: false, error: 'modelFilename required' });
                return;
            }

            const key = modelKeyFromName(modelFilename);
            const nameMismatchError = assertModelFilenameMatchesExistingKey(key, modelFilename);
            if (nameMismatchError) {
                json(res, 400, { ok: false, error: nameMismatchError });
                return;
            }
            const calibrationRow = getCalibrationAxisStmt.get(key);
            if (calibrationRow?.AxisPresetId) {
                json(res, 200, {
                    ok: true,
                    found: true,
                    modelFilename,
                    coordinate: {
                        axisPresetId: String(calibrationRow.AxisPresetId).toLowerCase()
                    },
                    source: 'ot_model_calibration',
                    updatedAt: calibrationRow.UpdatedAt
                });
                return;
            }

            const coordinateRow = getCoordinateStmt.get(key);
            if (coordinateRow) {
                json(res, 200, {
                    ok: true,
                    found: false,
                    modelFilename: coordinateRow.ModelName,
                    coordinate: {
                        coordinateSystem: coordinateRow.CoordinateSystem,
                        upAxis: coordinateRow.UpAxis,
                        upDirection: coordinateRow.UpDirection,
                        axisPresetId: null
                    },
                    source: 'ot_model_coordinate_no_axis_preset_id',
                    updatedAt: coordinateRow.UpdatedAt
                });
                return;
            }

            json(res, 200, {
                ok: true,
                found: false,
                modelFilename,
                coordinate: null,
                source: 'none'
            });
            return;
        }

        if (url.pathname === '/api/model/calibration/clear-all' && req.method === 'POST') {
            const deleted = clearAllOpentourData();
            json(res, 200, {
                ok: true,
                deleted
            });
            return;
        }

        sendStatic(res, url.pathname);
    } catch (error) {
        json(res, 500, { ok: false, error: String(error) });
    }
});

const port = Number(process.env.PORT || 3001);
await ensureManagedBackends();
server.listen(port, () => {
    process.stdout.write(`OpenTour server listening on http://127.0.0.1:${port}\n`);
});

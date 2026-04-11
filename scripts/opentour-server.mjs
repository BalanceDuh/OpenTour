import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorkflowRepository } from '../src/server/db/repositories/workflow-repository.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '..'));
const distDir = join(repoRoot, 'dist-opentour');
const dataDir = join(repoRoot, 'data');
mkdirSync(dataDir, { recursive: true });

const workflowRepo = createWorkflowRepository('opentour-gateway');

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

const proxyRoutes = [
    { prefix: '/api/ot-tour-loader', port: 3031 },
    { prefix: '/api/ot-cinematic-workspace', port: 3032 },
    { prefix: '/api/ot-tour-player', port: 3033 },
    { prefix: '/api/ot-tour-download', port: 3034 },
    { prefix: '/api/ot-tour-producer', port: 3035 },
    { prefix: '/api/ot-live-stream', port: 3036 }
];

const hopByHopHeaders = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);

const sanitizeProxyHeaders = (headers) => {
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        if (hopByHopHeaders.has(key.toLowerCase())) continue;
        out[key] = value;
    }
    return out;
};

const matchProxyRoute = (pathname) => proxyRoutes.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || null;

const proxyRequest = (req, res, port) => new Promise((resolve) => {
    const forwardedFor = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
    const headers = sanitizeProxyHeaders({
        ...req.headers,
        host: `127.0.0.1:${port}`,
        'x-forwarded-host': req.headers.host || '',
        'x-forwarded-proto': req.socket.encrypted ? 'https' : 'http',
        'x-forwarded-for': forwardedFor
    });
    const upstream = httpRequest({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port,
        method: req.method,
        path: req.url,
        headers
    }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, sanitizeProxyHeaders(upstreamRes.headers));
        upstreamRes.pipe(res);
        upstreamRes.on('end', resolve);
        upstreamRes.on('error', () => resolve());
    });

    upstream.on('error', (error) => {
        if (!res.headersSent) {
            json(res, 502, {
                ok: false,
                error: `Proxy request failed for backend port ${port}`,
                detail: String(error?.message || error || '')
            });
        } else {
            res.destroy(error);
        }
        resolve();
    });

    req.on('aborted', () => upstream.destroy());
    req.on('error', () => upstream.destroy());
    req.pipe(upstream);
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
const spawnedBackends = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        if (!open) {
            const child = spawn(process.execPath, [backend.script], {
                cwd: repoRoot,
                stdio: 'ignore',
                env: {
                    ...process.env,
                    ...backend.env
                }
            });
            spawnedBackends.set(backend.port, child);
        }

        for (let attempt = 0; attempt < 20; attempt += 1) {
            if (await isPortOpen(backend.port)) break;
            await sleep(250);
        }
    }
};

const ensureManagedBackend = async (port) => {
    const backend = managedBackends.find((item) => item.port === port);
    if (!backend) return false;
    if (await isPortOpen(port)) return true;
    const existing = spawnedBackends.get(port);
    if (!existing || existing.exitCode !== null || existing.killed) {
        const child = spawn(process.execPath, [backend.script], {
            cwd: repoRoot,
            stdio: 'ignore',
            env: {
                ...process.env,
                ...backend.env
            }
        });
        spawnedBackends.set(port, child);
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await isPortOpen(port)) return true;
        await sleep(250);
    }
    return false;
};

const stopManagedBackends = () => {
    for (const child of spawnedBackends.values()) {
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
    const row = workflowRepo.get('getModelNameByKey', modelKey);
    if (!row?.ModelName) return null;
    if (String(row.ModelName) !== String(modelFilename)) {
        return `ModelFileName mismatch: existing='${row.ModelName}' request='${modelFilename}'`;
    }
    return null;
};

const saveSnapshot = (modelFilename, payload) => {
    workflowRepo.run('upsertSnapshot', {
        model_filename: modelFilename,
        payload_json: JSON.stringify(payload),
        updated_at: new Date().toISOString()
    });
};

const loadSnapshot = (modelFilename) => {
    const row = workflowRepo.get('getSnapshot', modelFilename);
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
        const proxyRoute = matchProxyRoute(url.pathname);
        if (proxyRoute) {
            await ensureManagedBackend(proxyRoute.port);
            await proxyRequest(req, res, proxyRoute.port);
            return;
        }

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

            workflowRepo.run('upsertModel', {
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

            workflowRepo.run('upsertCalibration', {
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
            const row = workflowRepo.get('getCalibration', key);
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
            const calibrationRow = workflowRepo.get('getCalibrationAxis', key);
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

            const coordinateRow = workflowRepo.get('getCoordinate', key);
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
            const deleted = workflowRepo.clearAllOpentourData();
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

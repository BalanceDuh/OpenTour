import { createServer } from 'node:http';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '../../../../..'));
const dataDir = join(repoRoot, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'ot-tour-producer.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS producer_videos (
    id TEXT PRIMARY KEY,
    model_filename TEXT,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_sec REAL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT,
    thumbnail_jpeg BLOB,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS producer_video_snapshots (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    timestamp_sec REAL NOT NULL,
    mime_type TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(video_id) REFERENCES producer_videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS producer_assets (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT,
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_sec REAL,
    size_bytes INTEGER NOT NULL,
    data BLOB NOT NULL,
    meta_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS producer_output_records (
    id TEXT PRIMARY KEY,
    model_filename TEXT,
    asset_id TEXT NOT NULL,
    name TEXT,
    saved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(asset_id) REFERENCES producer_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_producer_videos_updated
ON producer_videos(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_producer_video_snapshots_video
ON producer_video_snapshots(video_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_producer_assets_kind_updated
ON producer_assets(kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_producer_outputs_model_saved_updated
ON producer_output_records(model_filename, saved, updated_at DESC);
`);

const ensureColumn = (tableName, columnDef) => {
    try {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
    } catch (error) {
        const message = String(error?.message || error || '');
        if (!/duplicate column name/i.test(message)) throw error;
    }
};

ensureColumn('producer_videos', 'model_filename TEXT');
ensureColumn('producer_videos', 'sha256 TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_producer_videos_model_updated ON producer_videos(model_filename, updated_at DESC)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_producer_videos_model_sha256 ON producer_videos(model_filename, sha256)');

const upsertVideoStmt = db.prepare(`
INSERT INTO producer_videos (
    id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, thumbnail_jpeg, data, created_at, updated_at
) VALUES (
    @id, @model_filename, @name, @mime_type, @width, @height, @duration_sec, @size_bytes, @sha256, @thumbnail_jpeg, @data, @created_at, @updated_at
)
ON CONFLICT(id) DO UPDATE SET
    model_filename = excluded.model_filename,
    name = excluded.name,
    mime_type = excluded.mime_type,
    width = excluded.width,
    height = excluded.height,
    duration_sec = excluded.duration_sec,
    size_bytes = excluded.size_bytes,
    sha256 = excluded.sha256,
    thumbnail_jpeg = excluded.thumbnail_jpeg,
    data = excluded.data,
    updated_at = excluded.updated_at
`);

const listVideosStmt = db.prepare(`
SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, created_at, updated_at
FROM producer_videos
ORDER BY updated_at DESC, created_at DESC
`);

const listVideosByModelStmt = db.prepare(`
SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, created_at, updated_at
FROM producer_videos
WHERE model_filename = ?
ORDER BY updated_at DESC, created_at DESC
`);

const getVideoByIdStmt = db.prepare(`
SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, thumbnail_jpeg, data, created_at, updated_at
FROM producer_videos
WHERE id = ?
`);

const getVideoByModelAndShaStmt = db.prepare(`
SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, created_at, updated_at
FROM producer_videos
WHERE model_filename = ? AND sha256 = ?
LIMIT 1
`);

const deleteVideoSnapshotsByVideoStmt = db.prepare('DELETE FROM producer_video_snapshots WHERE video_id = ?');

const insertVideoSnapshotStmt = db.prepare(`
INSERT INTO producer_video_snapshots (
    id, video_id, sort_order, timestamp_sec, mime_type, data, created_at
) VALUES (
    @id, @video_id, @sort_order, @timestamp_sec, @mime_type, @data, @created_at
)
`);

const listVideoSnapshotsByVideoStmt = db.prepare(`
SELECT id, video_id, sort_order, timestamp_sec, mime_type, created_at
FROM producer_video_snapshots
WHERE video_id = ?
ORDER BY sort_order ASC
`);

const getVideoSnapshotByIdStmt = db.prepare(`
SELECT id, video_id, sort_order, timestamp_sec, mime_type, data, created_at
FROM producer_video_snapshots
WHERE id = ?
`);

const insertAssetStmt = db.prepare(`
INSERT INTO producer_assets (
    id, kind, name, mime_type, width, height, duration_sec, size_bytes, data, meta_json, created_at, updated_at
) VALUES (
    @id, @kind, @name, @mime_type, @width, @height, @duration_sec, @size_bytes, @data, @meta_json, @created_at, @updated_at
)
`);

const getAssetByIdStmt = db.prepare(`
SELECT id, kind, name, mime_type, width, height, duration_sec, size_bytes, data, meta_json, created_at, updated_at
FROM producer_assets
WHERE id = ?
`);

const listAssetsByKindStmt = db.prepare(`
SELECT id, kind, name, mime_type, width, height, duration_sec, size_bytes, created_at, updated_at
FROM producer_assets
WHERE kind = ?
ORDER BY updated_at DESC
`);

const deleteAssetByIdStmt = db.prepare('DELETE FROM producer_assets WHERE id = ?');

const insertOutputRecordStmt = db.prepare(`
INSERT INTO producer_output_records (
    id, model_filename, asset_id, name, saved, created_at, updated_at
) VALUES (
    @id, @model_filename, @asset_id, @name, @saved, @created_at, @updated_at
)
`);

const getOutputRecordByIdStmt = db.prepare(`
SELECT r.id, r.model_filename, r.asset_id, r.name, r.saved, r.created_at, r.updated_at,
       a.mime_type, a.width, a.height, a.duration_sec, a.size_bytes
FROM producer_output_records r
JOIN producer_assets a ON a.id = r.asset_id
WHERE r.id = ?
LIMIT 1
`);

const listOutputRecordsStmt = db.prepare(`
SELECT r.id, r.model_filename, r.asset_id, r.name, r.saved, r.created_at, r.updated_at,
       a.mime_type, a.width, a.height, a.duration_sec, a.size_bytes
FROM producer_output_records r
JOIN producer_assets a ON a.id = r.asset_id
ORDER BY r.updated_at DESC
`);

const listOutputRecordsByModelStmt = db.prepare(`
SELECT r.id, r.model_filename, r.asset_id, r.name, r.saved, r.created_at, r.updated_at,
       a.mime_type, a.width, a.height, a.duration_sec, a.size_bytes
FROM producer_output_records r
JOIN producer_assets a ON a.id = r.asset_id
WHERE r.model_filename = ?
ORDER BY r.updated_at DESC
`);

const updateOutputRecordSaveStmt = db.prepare(`
UPDATE producer_output_records
SET saved = @saved, updated_at = @updated_at
WHERE id = @id
`);

const deleteOutputRecordByIdStmt = db.prepare('DELETE FROM producer_output_records WHERE id = ?');

const json = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-OT-Name,X-OT-Mime-Type,X-OT-Model-Filename'
    });
    res.end(payload);
};

const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
});

const readBodyBuffer = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
});

const ffmpegPath = () => process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobePath = () => process.env.FFPROBE_PATH || 'ffprobe';

const runSpawn = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
    });
    child.on('error', (error) => reject(new Error(`${command} unavailable: ${String(error?.message || error)}`)));
    child.on('close', (code) => {
        if (code === 0) {
            resolve({ stdout, stderr });
            return;
        }
        reject(new Error(`${command} exited with code ${code}: ${stderr || stdout || 'unknown error'}`));
    });
});

const parseDataUrl = (value) => {
    const raw = String(value || '').trim();
    const match = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
    if (!match) return { mimeType: null, data: null };
    try {
        return {
            mimeType: match[1] || 'image/png',
            data: Buffer.from(match[2], 'base64')
        };
    } catch {
        return { mimeType: null, data: null };
    }
};

const mapVideoRow = (row) => ({
    id: row.id,
    modelFilename: row.model_filename || null,
    name: row.name,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    durationSec: row.duration_sec,
    sizeBytes: row.size_bytes,
    sha256: row.sha256 || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    thumbnailUrl: `/api/ot-tour-producer/videos/${encodeURIComponent(row.id)}/thumbnail`
});

const mapAssetRow = (row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    durationSec: row.duration_sec,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileUrl: `/api/ot-tour-producer/assets/${encodeURIComponent(row.id)}/file`
});

const mapOutputRecordRow = (row) => ({
    id: row.id,
    modelFilename: row.model_filename || null,
    assetId: row.asset_id,
    name: row.name || 'output.mp4',
    saved: Number(row.saved || 0) === 1,
    mimeType: row.mime_type || 'video/mp4',
    width: row.width || null,
    height: row.height || null,
    durationSec: row.duration_sec || null,
    sizeBytes: row.size_bytes || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileUrl: `/api/ot-tour-producer/outputs/${encodeURIComponent(row.id)}/file`
});

const extractGeminiImage = (jsonObj) => {
    const parts = jsonObj?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    for (const part of parts) {
        const inline = part?.inlineData || part?.inline_data;
        if (inline?.data) {
            return {
                mimeType: inline.mimeType || inline.mime_type || 'image/png',
                data: Buffer.from(String(inline.data), 'base64')
            };
        }
    }
    return null;
};

const defaultTourLoaderDb = join(repoRoot, 'data', 'ot-tour-loader.db');
const legacyTourLoaderDb = join(repoRoot, 'supersplat', 'data', 'ot-tour-loader.db');
const pickReadableDbPath = () => {
    if (existsSync(defaultTourLoaderDb)) {
        try {
            if (statSync(defaultTourLoaderDb).size > 0) return defaultTourLoaderDb;
        } catch {
            // fallback
        }
    }
    return legacyTourLoaderDb;
};

const llmDbPath = process.env.OT_TOUR_LOADER_DB_PATH || pickReadableDbPath();
let llmDb = null;
let getGlobalLlmStmt = null;
try {
    llmDb = new Database(llmDbPath, { readonly: true });
    getGlobalLlmStmt = llmDb.prepare(`
        SELECT selected_provider, gemini_model_name, gemini_api_key, llm_model_name, llm_api_key
        FROM model_llm_configs
        WHERE model_filename = '__GLOBAL__'
    `);
} catch {
    llmDb = null;
    getGlobalLlmStmt = null;
}

const resolveGeminiConfig = () => {
    const row = getGlobalLlmStmt?.get?.() || null;
    const modelName = String(row?.gemini_model_name || row?.llm_model_name || process.env.OT_TOUR_PRODUCER_IMAGE_MODEL || 'gemini-2.5-flash-image').trim();
    const apiKey = String(row?.gemini_api_key || row?.llm_api_key || process.env.GEMINI_API_KEY || '').trim();
    return { modelName, apiKey };
};

const generateCoverWithGemini = async ({ title, promptText, baseImage, referenceImages }) => {
    const config = resolveGeminiConfig();
    if (!config.apiKey) {
        throw new Error('gemini_api_key_missing');
    }

    const imageParts = [];
    if (baseImage?.data?.length) {
        imageParts.push({
            inline_data: {
                mime_type: baseImage.mimeType || 'image/png',
                data: baseImage.data.toString('base64')
            }
        });
    }
    for (const item of referenceImages) {
        if (!item?.data?.length) continue;
        imageParts.push({
            inline_data: {
                mime_type: item.mimeType || 'image/png',
                data: item.data.toString('base64')
            }
        });
    }

    if (imageParts.length < 1) {
        throw new Error('cover_base_image_required');
    }

    const payload = {
        contents: [{
            parts: [
                {
                    text: [
                        'Generate a cinematic video cover image.',
                        `Use all attached images as references (count=${imageParts.length}).`,
                        'The generated image MUST contain clearly readable Chinese text exactly matching this title:',
                        `TITLE: ${title}`,
                        'Do not paraphrase, shorten, translate, or change any character in TITLE.',
                        'No watermark, no extra random text.',
                        promptText ? `Additional creative prompt: ${promptText}` : ''
                    ].filter(Boolean).join('\n')
                },
                ...imageParts
            ]
        }],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE']
        }
    };

    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelName)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const text = await response.text();
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('gemini_cover_parse_failed');
    }
    if (!response.ok || parsed?.error) {
        throw new Error(parsed?.error?.message || `gemini_cover_http_${response.status}`);
    }
    const image = extractGeminiImage(parsed);
    if (!image?.data?.length) {
        throw new Error('gemini_cover_no_image_output');
    }
    return image;
};

const probeMedia = async (filePath) => {
    try {
        const { stdout } = await runSpawn(ffprobePath(), [
            '-v', 'error',
            '-show_entries', 'stream=codec_type,width,height:format=duration',
            '-print_format', 'json',
            filePath
        ]);
        const jsonObj = JSON.parse(stdout || '{}');
        const streams = Array.isArray(jsonObj.streams) ? jsonObj.streams : [];
        const video = streams.find((item) => item.codec_type === 'video') || null;
        const hasAudio = streams.some((item) => item.codec_type === 'audio');
        const durationSec = Number(jsonObj?.format?.duration || 0) || 0;
        return {
            width: Number(video?.width || 0) || 0,
            height: Number(video?.height || 0) || 0,
            durationSec,
            hasAudio
        };
    } catch {
        let text = '';
        try {
            const result = await runSpawn(ffmpegPath(), ['-i', filePath]);
            text = String(result.stderr || result.stdout || '');
        } catch (error) {
            text = String(error?.message || error || '');
        }
        const durationMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
        const durationSec = durationMatch
            ? (Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]))
            : 0;
        const sizeMatch = text.match(/,\s*(\d{2,5})x(\d{2,5})[\s,]/);
        const hasAudio = /Audio:/i.test(text);
        return {
            width: sizeMatch ? Number(sizeMatch[1]) || 0 : 0,
            height: sizeMatch ? Number(sizeMatch[2]) || 0 : 0,
            durationSec,
            hasAudio
        };
    }
};

const extractVideoFrameJpeg = async ({ inputPath, outputPath, second }) => {
    await runSpawn(ffmpegPath(), [
        '-y',
        '-ss', String(Math.max(0, second).toFixed(3)),
        '-i', inputPath,
        '-frames:v', '1',
        '-vf', 'scale=960:-2:flags=lanczos',
        '-q:v', '4',
        outputPath
    ]);
};

const buildAtempoFilter = (factor) => {
    const safe = Math.max(0.05, Math.min(100, Number(factor) || 1));
    if (Math.abs(safe - 1) < 0.001) return 'atempo=1';
    const chain = [];
    let remain = safe;
    while (remain > 2.0) {
        chain.push('atempo=2.0');
        remain /= 2.0;
    }
    while (remain < 0.5) {
        chain.push('atempo=0.5');
        remain /= 0.5;
    }
    chain.push(`atempo=${remain.toFixed(5)}`);
    return chain.join(',');
};

const normalizeVideo = async ({ inputPath, outputPath, width, height, hasAudio, speedFactor = 1 }) => {
    const safeSpeed = Math.max(0.05, Math.min(100, Number(speedFactor) || 1));
    const scaleFilter = `${Math.abs(safeSpeed - 1) > 0.001 ? `setpts=PTS/${safeSpeed},` : ''}fps=30,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p`;
    const audioFilter = buildAtempoFilter(safeSpeed);
    const args = hasAudio
        ? [
            '-y',
            '-i', inputPath,
            '-map', '0:v:0',
            '-map', '0:a:0',
            '-vf', scaleFilter,
            '-af', audioFilter,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '22',
            '-c:a', 'aac',
            '-ar', '48000',
            '-ac', '2',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputPath
        ]
        : [
            '-y',
            '-i', inputPath,
            '-f', 'lavfi',
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-vf', scaleFilter,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '22',
            '-c:a', 'aac',
            '-ar', '48000',
            '-ac', '2',
            '-b:a', '128k',
            '-shortest',
            '-movflags', '+faststart',
            outputPath
        ];
    await runSpawn(ffmpegPath(), args);
};

const createCoverVideo = async ({ imagePath, outputPath, width, height, durationSec }) => {
    const safeDuration = Math.max(0.2, Math.min(8, Number(durationSec) || 2));
    await runSpawn(ffmpegPath(), [
        '-y',
        '-loop', '1',
        '-t', safeDuration.toFixed(3),
        '-i', imagePath,
        '-f', 'lavfi',
        '-t', safeDuration.toFixed(3),
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-vf', `fps=30,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-c:a', 'aac',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        outputPath
    ]);
};

const normalizeIntroTransitionType = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    if (key === 'none') return 'none';
    if (key === 'dissolve') return 'fade';
    if (key === 'fade_black' || key === 'fadeblack') return 'fadeblack';
    if (key === 'push_left' || key === 'slideleft') return 'slideleft';
    if (key === 'push_right' || key === 'slideright') return 'slideright';
    if (key === 'zoom_in' || key === 'zoomin') return 'circleopen';
    return 'fadeblack';
};

const mergeIntroWithMain = async ({ introPath, mainPath, outputPath, introDurationSec, transitionType, transitionDurationSec }) => {
    const transition = normalizeIntroTransitionType(transitionType);
    if (transition === 'none') {
        throw new Error('transition_none_should_use_concat');
    }
    const introDur = Math.max(0.3, Number(introDurationSec) || 3.2);
    const transDur = Math.max(0.2, Math.min(1.5, Number(transitionDurationSec) || 0.9, introDur - 0.05));
    const offset = Math.max(0.02, introDur - transDur);
    const audioCross = Math.max(0.2, Math.min(1.0, transDur * 0.7));

    await runSpawn(ffmpegPath(), [
        '-y',
        '-i', introPath,
        '-i', mainPath,
        '-filter_complex',
        `[0:v][1:v]xfade=transition=${transition}:duration=${transDur.toFixed(3)}:offset=${offset.toFixed(3)},format=yuv420p[v];[0:a][1:a]acrossfade=d=${audioCross.toFixed(3)}:c1=tri:c2=tri[a]`,
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-c:a', 'aac',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
    ]);
};

const composeJobs = new Map();

const serializeJob = (job) => ({
    jobId: job.jobId,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error,
    outputAssetId: job.outputAssetId,
    outputRecordId: job.outputRecordId || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    resultUrl: job.outputAssetId ? `/api/ot-tour-producer/compose/jobs/${encodeURIComponent(job.jobId)}/result` : null
});

const createAsset = ({ kind, name, mimeType, data, width = null, height = null, durationSec = null, meta = null }) => {
    const id = `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    insertAssetStmt.run({
        id,
        kind,
        name: name || null,
        mime_type: mimeType || 'application/octet-stream',
        width,
        height,
        duration_sec: Number.isFinite(Number(durationSec)) ? Number(durationSec) : null,
        size_bytes: data.length,
        data,
        meta_json: meta ? JSON.stringify(meta) : null,
        created_at: now,
        updated_at: now
    });
    return id;
};

const createOutputRecord = ({ modelFilename, assetId, name, saved = 0 }) => {
    const now = new Date().toISOString();
    const id = `output_rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    insertOutputRecordStmt.run({
        id,
        model_filename: String(modelFilename || '__UNSCOPED__').trim() || '__UNSCOPED__',
        asset_id: assetId,
        name: name || null,
        saved: Number(saved) ? 1 : 0,
        created_at: now,
        updated_at: now
    });
    return id;
};

const registerVideo = async ({ name, mimeType, modelFilename, buffer }) => {
    const hash = createHash('sha256').update(buffer).digest('hex');
    const modelKey = String(modelFilename || '__UNSCOPED__').trim() || '__UNSCOPED__';
    const existing = getVideoByModelAndShaStmt.get(modelKey, hash);
    if (existing) {
        return {
            video: mapVideoRow(existing),
            existed: true
        };
    }
    const videoId = `video_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const workdir = await mkdtemp(join(tmpdir(), 'ot-tour-producer-'));
    const inputPath = join(workdir, 'input.mp4');
    try {
        await writeFile(inputPath, buffer);
        const info = await probeMedia(inputPath).catch(() => ({ width: 0, height: 0, durationSec: 0, hasAudio: true }));
        const thumbnailPath = join(workdir, 'thumb.jpg');
        const thumbAt = Math.max(0, Math.min(info.durationSec > 0 ? info.durationSec * 0.15 : 0, Math.max(0, info.durationSec - 0.2)));
        await extractVideoFrameJpeg({ inputPath, outputPath: thumbnailPath, second: thumbAt }).catch(() => {});
        const thumbnailBuffer = existsSync(thumbnailPath) ? await readFile(thumbnailPath) : null;

        const now = new Date().toISOString();
        try {
            upsertVideoStmt.run({
                id: videoId,
                model_filename: modelKey,
                name,
                mime_type: mimeType || 'video/mp4',
                width: info.width || null,
                height: info.height || null,
                duration_sec: info.durationSec || null,
                size_bytes: buffer.length,
                sha256: hash,
                thumbnail_jpeg: thumbnailBuffer,
                data: buffer,
                created_at: now,
                updated_at: now
            });
        } catch (error) {
            const message = String(error?.message || error || '');
            if (/unique constraint failed/i.test(message)) {
                const dup = getVideoByModelAndShaStmt.get(modelKey, hash);
                if (dup) {
                    return {
                        video: mapVideoRow(dup),
                        existed: true
                    };
                }
            }
            throw error;
        }

        deleteVideoSnapshotsByVideoStmt.run(videoId);
        const baseDuration = Math.max(0.4, Number(info.durationSec) || 4);
        const points = [0.1, 0.35, 0.6, 0.85].map((r) => Math.max(0, Math.min(baseDuration - 0.12, baseDuration * r)));
        for (let i = 0; i < points.length; i += 1) {
            const snapshotPath = join(workdir, `snap-${i + 1}.jpg`);
            await extractVideoFrameJpeg({ inputPath, outputPath: snapshotPath, second: points[i] }).catch(() => {});
            if (!existsSync(snapshotPath)) continue;
            const data = await readFile(snapshotPath);
            insertVideoSnapshotStmt.run({
                id: `${videoId}_snap_${i + 1}`,
                video_id: videoId,
                sort_order: i + 1,
                timestamp_sec: points[i],
                mime_type: 'image/jpeg',
                data,
                created_at: now
            });
        }
        return {
            video: mapVideoRow(getVideoByIdStmt.get(videoId)),
            existed: false
        };
    } finally {
        await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
};

const runComposeJob = async (job) => {
    const payload = job.payload;
    const video = getVideoByIdStmt.get(payload.videoId);
    if (!video) {
        throw new Error('video_not_found');
    }
    const workdir = await mkdtemp(join(tmpdir(), 'ot-tour-producer-compose-'));
    job.phase = 'preparing';
    job.progress = 8;
    job.updatedAt = new Date().toISOString();
    try {
        const sourcePath = join(workdir, 'main-source.mp4');
        await writeFile(sourcePath, video.data);
        const sourceInfo = await probeMedia(sourcePath);
        const outputWidth = sourceInfo.width > 0 ? sourceInfo.width : 1080;
        const outputHeight = sourceInfo.height > 0 ? sourceInfo.height : 1920;

        const normalizedSegments = [];

        const mainNormPath = join(workdir, 'seg-main.mp4');
        await normalizeVideo({ inputPath: sourcePath, outputPath: mainNormPath, width: outputWidth, height: outputHeight, hasAudio: sourceInfo.hasAudio });
        normalizedSegments.push(mainNormPath);
        job.phase = 'normalizing_main';
        job.progress = 34;
        job.updatedAt = new Date().toISOString();

        if (payload.introEnabled && payload.introAssetId) {
            const introAsset = getAssetByIdStmt.get(payload.introAssetId);
            if (!introAsset || introAsset.kind !== 'intro_video') {
                throw new Error('intro_asset_not_found');
            }
            const introPath = join(workdir, 'intro-source.mp4');
            const introNormPath = join(workdir, 'seg-intro.mp4');
            await writeFile(introPath, introAsset.data);
            const introInfo = await probeMedia(introPath);
            const introTargetDuration = Math.max(0.2, Math.min(30, Number(payload.introTargetDurationSeconds) || 2.2));
            const introSpeedFactor = introInfo.durationSec > 0 ? (introInfo.durationSec / introTargetDuration) : 1;
            await normalizeVideo({
                inputPath: introPath,
                outputPath: introNormPath,
                width: outputWidth,
                height: outputHeight,
                hasAudio: introInfo.hasAudio,
                speedFactor: introSpeedFactor
            });
            const transitionType = normalizeIntroTransitionType(payload.introTransitionType);
            if (transitionType === 'none') {
                normalizedSegments.unshift(introNormPath);
            } else {
                const introMainPath = join(workdir, 'seg-intro-main-transition.mp4');
                await mergeIntroWithMain({
                    introPath: introNormPath,
                    mainPath: mainNormPath,
                    outputPath: introMainPath,
                    introDurationSec: introTargetDuration,
                    transitionType,
                    transitionDurationSec: payload.introTransitionDurationSeconds
                });
                normalizedSegments.splice(0, normalizedSegments.length, introMainPath);
            }
            job.phase = 'normalizing_intro';
            job.progress = 52;
            job.updatedAt = new Date().toISOString();
        }

        if (payload.coverEnabled && payload.coverAssetId) {
            const coverAsset = getAssetByIdStmt.get(payload.coverAssetId);
            if (!coverAsset || !String(coverAsset.mime_type || '').startsWith('image/')) {
                throw new Error('cover_asset_not_found');
            }
            const coverPath = join(workdir, 'cover-source.png');
            const coverClipPath = join(workdir, 'seg-cover.mp4');
            await writeFile(coverPath, coverAsset.data);
            await createCoverVideo({
                imagePath: coverPath,
                outputPath: coverClipPath,
                width: outputWidth,
                height: outputHeight,
                durationSec: payload.coverDurationSeconds
            });
            normalizedSegments.unshift(coverClipPath);
            job.phase = 'normalizing_cover';
            job.progress = 66;
            job.updatedAt = new Date().toISOString();
        }

        const listPath = join(workdir, 'concat.txt');
        await writeFile(listPath, normalizedSegments.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
        const outputPath = join(workdir, 'output.mp4');
        await runSpawn(ffmpegPath(), [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-c', 'copy',
            outputPath
        ]);

        job.phase = 'finalizing';
        job.progress = 90;
        job.updatedAt = new Date().toISOString();

        const outputBuffer = await readFile(outputPath);
        const outputInfo = await probeMedia(outputPath).catch(() => ({ width: outputWidth, height: outputHeight, durationSec: null }));
        const outputAssetId = createAsset({
            kind: 'output_video',
            name: `${video.name.replace(/\.[^.]+$/, '')}-produced.mp4`,
            mimeType: 'video/mp4',
            data: outputBuffer,
            width: outputInfo.width || outputWidth,
            height: outputInfo.height || outputHeight,
            durationSec: outputInfo.durationSec || null,
            meta: {
                sourceVideoId: payload.videoId,
                coverEnabled: Boolean(payload.coverEnabled),
                introEnabled: Boolean(payload.introEnabled),
                introTargetDurationSeconds: Number(payload.introTargetDurationSeconds) || null,
                introTransitionType: String(payload.introTransitionType || 'none'),
                introTransitionDurationSeconds: Number(payload.introTransitionDurationSeconds) || null
            }
        });
        const outputRecordId = createOutputRecord({
            modelFilename: video.model_filename || '__UNSCOPED__',
            assetId: outputAssetId,
            name: `${video.name.replace(/\.[^.]+$/, '')}-produced.mp4`,
            saved: 0
        });
        job.outputAssetId = outputAssetId;
        job.outputRecordId = outputRecordId;
        job.progress = 100;
        job.phase = 'done';
        job.status = 'done';
        job.updatedAt = new Date().toISOString();
    } finally {
        await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
};

const server = createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') {
            json(res, 200, { ok: true });
            return;
        }

        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/api/ot-tour-producer/health' && req.method === 'GET') {
            json(res, 200, { ok: true, service: 'ot-tour-producer', version: '1.0.0' });
            return;
        }

        if (url.pathname === '/api/ot-tour-producer/videos' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            const videos = modelFilename
                ? listVideosByModelStmt.all(modelFilename).map(mapVideoRow)
                : listVideosStmt.all().map(mapVideoRow);
            json(res, 200, { ok: true, videos });
            return;
        }

        const videoFileMatch = url.pathname.match(/^\/api\/ot-tour-producer\/videos\/([^/]+)\/file$/);
        if (videoFileMatch && req.method === 'GET') {
            const video = getVideoByIdStmt.get(decodeURIComponent(videoFileMatch[1]));
            if (!video) {
                json(res, 404, { ok: false, error: 'video_not_found' });
                return;
            }
            res.writeHead(200, {
                'Content-Type': video.mime_type || 'video/mp4',
                'Content-Length': video.data.length,
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(video.data);
            return;
        }

        const videoThumbMatch = url.pathname.match(/^\/api\/ot-tour-producer\/videos\/([^/]+)\/thumbnail$/);
        if (videoThumbMatch && req.method === 'GET') {
            const video = getVideoByIdStmt.get(decodeURIComponent(videoThumbMatch[1]));
            if (!video || !video.thumbnail_jpeg) {
                res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
                res.end();
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': video.thumbnail_jpeg.length,
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(video.thumbnail_jpeg);
            return;
        }

        const videoSnapshotsMatch = url.pathname.match(/^\/api\/ot-tour-producer\/videos\/([^/]+)\/snapshots$/);
        if (videoSnapshotsMatch && req.method === 'GET') {
            const videoId = decodeURIComponent(videoSnapshotsMatch[1]);
            const rows = listVideoSnapshotsByVideoStmt.all(videoId);
            const snapshots = rows.map((row) => ({
                id: row.id,
                videoId: row.video_id,
                order: row.sort_order,
                timestampSec: row.timestamp_sec,
                mimeType: row.mime_type,
                createdAt: row.created_at,
                fileUrl: `/api/ot-tour-producer/snapshots/${encodeURIComponent(row.id)}/file`
            }));
            json(res, 200, { ok: true, snapshots });
            return;
        }

        const snapshotFileMatch = url.pathname.match(/^\/api\/ot-tour-producer\/snapshots\/([^/]+)\/file$/);
        if (snapshotFileMatch && req.method === 'GET') {
            const snapshot = getVideoSnapshotByIdStmt.get(decodeURIComponent(snapshotFileMatch[1]));
            if (!snapshot) {
                json(res, 404, { ok: false, error: 'snapshot_not_found' });
                return;
            }
            res.writeHead(200, {
                'Content-Type': snapshot.mime_type || 'image/jpeg',
                'Content-Length': snapshot.data.length,
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(snapshot.data);
            return;
        }

        if (url.pathname === '/api/ot-tour-producer/videos/register' && req.method === 'POST') {
            const buffer = await readBodyBuffer(req);
            if (!buffer?.length) {
                json(res, 400, { ok: false, error: 'video_payload_required' });
                return;
            }
            const name = String(req.headers['x-ot-name'] || '').trim() || `tour-video-${Date.now()}.mp4`;
            const mimeType = String(req.headers['x-ot-mime-type'] || 'video/mp4').trim() || 'video/mp4';
            const modelFilename = String(req.headers['x-ot-model-filename'] || '').trim() || '__UNSCOPED__';
            const saved = await registerVideo({ name, mimeType, modelFilename, buffer });
            json(res, 200, { ok: true, video: saved.video, existed: saved.existed });
            return;
        }

        if (url.pathname === '/api/ot-tour-producer/intro/upload' && req.method === 'POST') {
            const buffer = await readBodyBuffer(req);
            if (!buffer?.length) {
                json(res, 400, { ok: false, error: 'intro_payload_required' });
                return;
            }
            const workdir = await mkdtemp(join(tmpdir(), 'ot-tour-producer-intro-'));
            const introPath = join(workdir, 'intro.mp4');
            try {
                await writeFile(introPath, buffer);
                const meta = await probeMedia(introPath).catch(() => ({ width: null, height: null, durationSec: null }));
                const assetId = createAsset({
                    kind: 'intro_video',
                    name: String(req.headers['x-ot-name'] || '').trim() || `intro-${Date.now()}.mp4`,
                    mimeType: String(req.headers['x-ot-mime-type'] || 'video/mp4').trim() || 'video/mp4',
                    data: buffer,
                    width: meta.width || null,
                    height: meta.height || null,
                    durationSec: meta.durationSec || null
                });
                const row = getAssetByIdStmt.get(assetId);
                json(res, 200, { ok: true, asset: mapAssetRow(row) });
                return;
            } finally {
                await rm(workdir, { recursive: true, force: true }).catch(() => {});
            }
        }

        if (url.pathname === '/api/ot-tour-producer/cover/upload' && req.method === 'POST') {
            const buffer = await readBodyBuffer(req);
            if (!buffer?.length) {
                json(res, 400, { ok: false, error: 'cover_payload_required' });
                return;
            }
            const assetId = createAsset({
                kind: 'cover_image',
                name: String(req.headers['x-ot-name'] || '').trim() || `cover-${Date.now()}.png`,
                mimeType: String(req.headers['x-ot-mime-type'] || 'image/png').trim() || 'image/png',
                data: buffer
            });
            const row = getAssetByIdStmt.get(assetId);
            json(res, 200, { ok: true, asset: mapAssetRow(row) });
            return;
        }

        if (url.pathname === '/api/ot-tour-producer/cover/generate' && req.method === 'POST') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const title = String(body.title || '').trim();
            const promptText = String(body.prompt || '').trim();
            if (!title) {
                json(res, 400, { ok: false, error: 'cover_title_required' });
                return;
            }

            let baseImage = null;
            const snapshotId = String(body.baseSnapshotId || '').trim();
            const coverAssetId = String(body.baseCoverAssetId || '').trim();
            if (snapshotId) {
                const row = getVideoSnapshotByIdStmt.get(snapshotId);
                if (row) {
                    baseImage = {
                        mimeType: row.mime_type,
                        data: Buffer.from(row.data)
                    };
                }
            }
            if (!baseImage && coverAssetId) {
                const row = getAssetByIdStmt.get(coverAssetId);
                if (row && String(row.mime_type || '').startsWith('image/')) {
                    baseImage = {
                        mimeType: row.mime_type,
                        data: Buffer.from(row.data)
                    };
                }
            }

            const refs = [];
            const refRows = Array.isArray(body.referenceImageDataUrls) ? body.referenceImageDataUrls : [];
            for (const rawRef of refRows) {
                const parsed = parseDataUrl(rawRef);
                if (parsed.data?.length) {
                    refs.push({
                        mimeType: parsed.mimeType || 'image/png',
                        data: parsed.data
                    });
                }
            }

            const generated = await generateCoverWithGemini({
                title,
                promptText,
                baseImage,
                referenceImages: refs
            });

            const assetId = createAsset({
                kind: 'cover_image',
                name: `cover-generated-${Date.now()}.png`,
                mimeType: generated.mimeType || 'image/png',
                data: generated.data,
                meta: {
                    title,
                    prompt: promptText,
                    referenceCount: refs.length,
                    source: 'gemini'
                }
            });
            const asset = mapAssetRow(getAssetByIdStmt.get(assetId));
            json(res, 200, { ok: true, asset });
            return;
        }

        if (url.pathname === '/api/ot-tour-producer/assets' && req.method === 'GET') {
            const kind = String(url.searchParams.get('kind') || '').trim();
            if (!kind) {
                json(res, 400, { ok: false, error: 'kind_required' });
                return;
            }
            const assets = listAssetsByKindStmt.all(kind).map(mapAssetRow);
            json(res, 200, { ok: true, assets });
            return;
        }

        const assetFileMatch = url.pathname.match(/^\/api\/ot-tour-producer\/assets\/([^/]+)\/file$/);
        if (assetFileMatch && req.method === 'GET') {
            const row = getAssetByIdStmt.get(decodeURIComponent(assetFileMatch[1]));
            if (!row) {
                json(res, 404, { ok: false, error: 'asset_not_found' });
                return;
            }
            res.writeHead(200, {
                'Content-Type': row.mime_type || 'application/octet-stream',
                'Content-Length': row.data.length,
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(row.data);
            return;
        }

        if (url.pathname === '/api/ot-tour-producer/outputs' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            const savedOnly = String(url.searchParams.get('saved') || '1').trim() !== '0';
            const rows = modelFilename
                ? listOutputRecordsByModelStmt.all(modelFilename)
                : listOutputRecordsStmt.all();
            const outputs = rows
                .filter((row) => (savedOnly ? Number(row.saved || 0) === 1 : true))
                .map(mapOutputRecordRow);
            json(res, 200, { ok: true, outputs });
            return;
        }

        const outputFileMatch = url.pathname.match(/^\/api\/ot-tour-producer\/outputs\/([^/]+)\/file$/);
        if (outputFileMatch && req.method === 'GET') {
            const record = getOutputRecordByIdStmt.get(decodeURIComponent(outputFileMatch[1]));
            if (!record) {
                json(res, 404, { ok: false, error: 'output_not_found' });
                return;
            }
            const asset = getAssetByIdStmt.get(record.asset_id);
            if (!asset) {
                json(res, 404, { ok: false, error: 'output_asset_not_found' });
                return;
            }
            res.writeHead(200, {
                'Content-Type': asset.mime_type || 'video/mp4',
                'Content-Length': asset.data.length,
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(asset.data);
            return;
        }

        const outputSaveMatch = url.pathname.match(/^\/api\/ot-tour-producer\/outputs\/([^/]+)\/save$/);
        if (outputSaveMatch && req.method === 'POST') {
            const id = decodeURIComponent(outputSaveMatch[1]);
            const existing = getOutputRecordByIdStmt.get(id);
            if (!existing) {
                json(res, 404, { ok: false, error: 'output_not_found' });
                return;
            }
            updateOutputRecordSaveStmt.run({
                id,
                saved: 1,
                updated_at: new Date().toISOString()
            });
            const updated = getOutputRecordByIdStmt.get(id);
            json(res, 200, { ok: true, output: mapOutputRecordRow(updated) });
            return;
        }

        const outputDeleteMatch = url.pathname.match(/^\/api\/ot-tour-producer\/outputs\/([^/]+)$/);
        if (outputDeleteMatch && req.method === 'DELETE') {
            const id = decodeURIComponent(outputDeleteMatch[1]);
            const existing = getOutputRecordByIdStmt.get(id);
            if (!existing) {
                json(res, 404, { ok: false, error: 'output_not_found' });
                return;
            }
            deleteOutputRecordByIdStmt.run(id);
            deleteAssetByIdStmt.run(existing.asset_id);
            json(res, 200, { ok: true, deleted: id });
            return;
        }

        if (url.pathname === '/api/ot-tour-producer/compose/jobs' && req.method === 'POST') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const videoId = String(body.videoId || '').trim();
            if (!videoId) {
                json(res, 400, { ok: false, error: 'video_id_required' });
                return;
            }
            const jobId = `compose_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const job = {
                jobId,
                status: 'running',
                phase: 'queued',
                progress: 0,
                error: null,
                outputAssetId: null,
                outputRecordId: null,
                payload: {
                    videoId,
                    coverEnabled: Boolean(body.coverEnabled),
                    coverAssetId: String(body.coverAssetId || '').trim() || null,
                    coverDurationSeconds: Math.max(0.2, Math.min(8, Number(body.coverDurationSeconds) || 2)),
                    introEnabled: Boolean(body.introEnabled),
                    introAssetId: String(body.introAssetId || '').trim() || null,
                    introTargetDurationSeconds: Math.max(0.2, Math.min(30, Number(body.introTargetDurationSeconds) || 3.2)),
                    introTransitionType: String(body.introTransitionType || 'fade_black'),
                    introTransitionDurationSeconds: Math.max(0.2, Math.min(1.5, Number(body.introTransitionDurationSeconds) || 0.9))
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            composeJobs.set(jobId, job);
            runComposeJob(job).catch((error) => {
                job.status = 'error';
                job.phase = 'error';
                job.error = {
                    message: String(error?.message || error || 'compose_failed')
                };
                job.updatedAt = new Date().toISOString();
            });
            json(res, 202, { ok: true, job: serializeJob(job) });
            return;
        }

        const composeJobMatch = url.pathname.match(/^\/api\/ot-tour-producer\/compose\/jobs\/([^/]+)$/);
        if (composeJobMatch && req.method === 'GET') {
            const job = composeJobs.get(decodeURIComponent(composeJobMatch[1]));
            if (!job) {
                json(res, 404, { ok: false, error: 'compose_job_not_found' });
                return;
            }
            json(res, 200, { ok: true, job: serializeJob(job) });
            return;
        }

        const composeResultMatch = url.pathname.match(/^\/api\/ot-tour-producer\/compose\/jobs\/([^/]+)\/result$/);
        if (composeResultMatch && req.method === 'GET') {
            const job = composeJobs.get(decodeURIComponent(composeResultMatch[1]));
            if (!job) {
                json(res, 404, { ok: false, error: 'compose_job_not_found' });
                return;
            }
            if (job.status === 'error') {
                json(res, 500, { ok: false, error: job.error || { message: 'compose_failed' } });
                return;
            }
            if (job.status !== 'done' || !job.outputAssetId) {
                json(res, 409, { ok: false, error: 'compose_job_not_ready', job: serializeJob(job) });
                return;
            }
            const asset = getAssetByIdStmt.get(job.outputAssetId);
            if (!asset) {
                json(res, 404, { ok: false, error: 'output_asset_not_found' });
                return;
            }
            res.writeHead(200, {
                'Content-Type': asset.mime_type || 'video/mp4',
                'Content-Length': asset.data.length,
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(asset.data);
            return;
        }

        json(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message || error) });
    }
});

const port = Number(process.env.OT_TOUR_PRODUCER_PORT || process.env.PORT || 3034);
server.listen(port, () => {
    process.stdout.write(`[ot-tour-producer] listening on http://localhost:${port}\n`);
});

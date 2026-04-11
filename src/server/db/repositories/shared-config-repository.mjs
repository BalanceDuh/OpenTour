import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '../../../../'));
const dbPath = join(repoRoot, 'data', 'ot-tour-loader.db');

const GLOBAL_LLM_CONFIG_KEY = '__GLOBAL__';
const GLOBAL_TTS_CONFIG_KEY = '__GLOBAL__';
const DEFAULT_GEMINI_MODEL = 'qwen3.5-flash';
const DEFAULT_QWEN_MODEL = 'qwen3.5-flash';
const FAST_MODELS = {
    gemini: ['qwen3.5-flash'],
    qwen: ['qwen3.5-flash'],
    geminiLive: ['qwen3.5-flash']
};
const DEFAULT_ASR_MODEL = 'fun-asr-realtime';
const ASR_MODELS = [
    'fun-asr-realtime',
    'fun-asr-realtime-2026-02-28',
    'paraformer-realtime-v2',
    'gummy-realtime-v1',
    'gummy-chat-v1',
    'fun-asr-flash-8k-realtime'
];
const DEFAULT_TTS_MODEL = 'cosyvoice-v3-plus';
const DEFAULT_TTS_VOICE = 'longyuan_v3';
const DEFAULT_TTS_FORMAT = 'mp3';
const TTS_VOICE_OPTIONS_BY_MODEL = {
    'cosyvoice-v3-plus': [
        'longyuan_v3', 'longyue_v3', 'longsanshu_v3', 'longshuo_v3', 'loongbella_v3', 'longxiaochun_v3',
        'longxiaoxia_v3', 'longanwen_v3', 'longanli_v3', 'longanlang_v3', 'longyingling_v3', 'longanzhi_v3'
    ],
    'cosyvoice-v3-flash': [
        'longyuan_v3', 'longyue_v3', 'longsanshu_v3', 'longshuo_v3', 'loongbella_v3', 'longxiaochun_v3',
        'longxiaoxia_v3', 'longanwen_v3', 'longanli_v3', 'longanlang_v3', 'longyingling_v3', 'longanzhi_v3'
    ]
};

const normalizeAngle = (value) => {
    let result = Number(value || 0) % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return result;
};

const normalizeModelFilename = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || raw;
};

const modelAliases = (value) => {
    const raw = String(value || '').trim();
    const canonical = normalizeModelFilename(raw);
    return [...new Set([raw, canonical].filter(Boolean))];
};

const placeholders = (values) => values.map(() => '?').join(',');

const deriveMviewFromLegacy = (row) => {
    const pivotX = Number(row.look_at_x || 0);
    const pivotY = Number(row.look_at_y || 0);
    const pivotZ = Number(row.look_at_z || 0);
    const dx = Number(row.camera_x || 0) - pivotX;
    const dy = Number(row.camera_y || 0) - pivotY;
    const dz = Number(row.camera_z || 0) - pivotZ;
    const radius = Math.max(0.001, Math.sqrt((dx * dx) + (dy * dy) + (dz * dz)) || Number(row.radius || 1));
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(-dy, Math.sqrt((dx * dx) + (dz * dz)) || 0.0001);
    return {
        pivot: [pivotX, pivotY, pivotZ],
        rotation: [pitch, yaw],
        radius,
        fov: Number(row.fov_deg || 40)
    };
};

const hasStoredMview = (row) => {
    const values = [row.pivot_x, row.pivot_y, row.pivot_z, row.rotation_x, row.rotation_y, row.mview_radius, row.mview_fov].map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value))) return false;
    const [pivotX, pivotY, pivotZ, rotationX, rotationY, radius, fov] = values;
    return !(pivotX === 0 && pivotY === 0 && pivotZ === 0 && rotationX === 0 && rotationY === 0 && radius === 1 && fov === 40);
};

const migrateLegacyMviewColumns = (db) => {
    const rows = db.prepare(`
        SELECT capture_id, camera_x, camera_y, camera_z, look_at_x, look_at_y, look_at_z, fov_deg, radius,
               pivot_x, pivot_y, pivot_z, rotation_x, rotation_y, mview_radius, mview_fov
        FROM cinematic_lite_captures
    `).all();
    const update = db.prepare(`
        UPDATE cinematic_lite_captures
        SET pivot_x = @pivot_x,
            pivot_y = @pivot_y,
            pivot_z = @pivot_z,
            rotation_x = @rotation_x,
            rotation_y = @rotation_y,
            mview_radius = @mview_radius,
            mview_fov = @mview_fov
        WHERE capture_id = @capture_id
    `);
    for (const row of rows) {
        if (hasStoredMview(row)) continue;
        const derived = deriveMviewFromLegacy(row);
        update.run({
            capture_id: row.capture_id,
            pivot_x: derived.pivot[0],
            pivot_y: derived.pivot[1],
            pivot_z: derived.pivot[2],
            rotation_x: derived.rotation[0],
            rotation_y: derived.rotation[1],
            mview_radius: derived.radius,
            mview_fov: derived.fov
        });
    }
};

let dbInstance = null;

const getDb = () => {
    if (!dbInstance) {
        dbInstance = new Database(dbPath);
        dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS cinematic_lite_captures (
                capture_id TEXT PRIMARY KEY,
                model_filename TEXT NOT NULL,
                view_id TEXT NOT NULL,
                source TEXT NOT NULL,
                note TEXT NOT NULL,
                image_data_url TEXT NOT NULL,
                camera_x REAL NOT NULL,
                camera_y REAL NOT NULL,
                camera_z REAL NOT NULL,
                look_at_x REAL NOT NULL,
                look_at_y REAL NOT NULL,
                look_at_z REAL NOT NULL,
                yaw_deg REAL NOT NULL,
                pitch_deg REAL NOT NULL,
                fov_deg REAL NOT NULL,
                radius REAL NOT NULL,
                captured_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cinematic_lite_capture_model_view
            ON cinematic_lite_captures(model_filename, view_id);

            CREATE TABLE IF NOT EXISTS cinematic_lite_csv_versions (
                id TEXT PRIMARY KEY,
                model_filename TEXT NOT NULL,
                version_name TEXT NOT NULL,
                csv_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_cinematic_lite_csv_versions_model_updated
            ON cinematic_lite_csv_versions(model_filename, updated_at DESC);

            CREATE TABLE IF NOT EXISTS cinematic_lite_narrations (
                model_filename TEXT PRIMARY KEY,
                narration_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS camera_tester_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                model_filename TEXT NOT NULL,
                snapshot_name TEXT NOT NULL,
                note TEXT NOT NULL,
                source TEXT NOT NULL,
                pivot_x REAL NOT NULL,
                pivot_y REAL NOT NULL,
                pivot_z REAL NOT NULL,
                rotation_x REAL NOT NULL,
                rotation_y REAL NOT NULL,
                mview_radius REAL NOT NULL,
                mview_fov REAL NOT NULL,
                camera_x REAL NOT NULL,
                camera_y REAL NOT NULL,
                camera_z REAL NOT NULL,
                look_at_x REAL NOT NULL,
                look_at_y REAL NOT NULL,
                look_at_z REAL NOT NULL,
                yaw_deg REAL NOT NULL,
                pitch_deg REAL NOT NULL,
                fov_deg REAL NOT NULL,
                derived_radius REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_camera_tester_snapshots_model_updated
            ON camera_tester_snapshots(model_filename, updated_at DESC);

            CREATE TABLE IF NOT EXISTS global_tts_configs (
                config_key TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                tts_model TEXT NOT NULL,
                tts_voice TEXT NOT NULL,
                api_key TEXT NOT NULL,
                audio_format TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        `);
        const captureColumns = dbInstance.prepare('PRAGMA table_info(cinematic_lite_captures)').all().map((row) => String(row.name || ''));
        if (!captureColumns.includes('pivot_x')) dbInstance.exec('ALTER TABLE cinematic_lite_captures ADD COLUMN pivot_x REAL NOT NULL DEFAULT 0');
        if (!captureColumns.includes('pivot_y')) dbInstance.exec('ALTER TABLE cinematic_lite_captures ADD COLUMN pivot_y REAL NOT NULL DEFAULT 0');
        if (!captureColumns.includes('pivot_z')) dbInstance.exec('ALTER TABLE cinematic_lite_captures ADD COLUMN pivot_z REAL NOT NULL DEFAULT 0');
        if (!captureColumns.includes('rotation_x')) dbInstance.exec('ALTER TABLE cinematic_lite_captures ADD COLUMN rotation_x REAL NOT NULL DEFAULT 0');
        if (!captureColumns.includes('rotation_y')) dbInstance.exec('ALTER TABLE cinematic_lite_captures ADD COLUMN rotation_y REAL NOT NULL DEFAULT 0');
        if (!captureColumns.includes('mview_radius')) dbInstance.exec('ALTER TABLE cinematic_lite_captures ADD COLUMN mview_radius REAL NOT NULL DEFAULT 1');
        if (!captureColumns.includes('mview_fov')) dbInstance.exec('ALTER TABLE cinematic_lite_captures ADD COLUMN mview_fov REAL NOT NULL DEFAULT 40');
        migrateLegacyMviewColumns(dbInstance);
    }
    return dbInstance;
};

const getGlobalLlmRow = () => {
    const db = getDb();
    return db.prepare(`
        SELECT selected_provider, gemini_model_name, gemini_api_key, qwen_model_name, qwen_api_key, llm_model_name, llm_api_key, updated_at
        FROM model_llm_configs WHERE model_filename = ?
    `).get(GLOBAL_LLM_CONFIG_KEY) || null;
};

export const getModelLlmRow = (modelFilename) => {
    const normalized = normalizeModelFilename(modelFilename);
    if (!normalized) return null;
    const db = getDb();
    return db.prepare(`
        SELECT model_filename, llm_model_name, llm_api_key, selected_provider, gemini_model_name, gemini_api_key, qwen_model_name, qwen_api_key, updated_at
        FROM model_llm_configs
        WHERE model_filename = ?
        LIMIT 1
    `).get(normalized) || null;
};

export const getGeminiConfig = () => {
    const row = getGlobalLlmRow();
    const selectedProvider = String(row?.selected_provider || 'gemini').trim() || 'gemini';
    const model = String(row?.gemini_model_name || (selectedProvider === 'gemini' ? row?.llm_model_name : '') || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
    const apiKey = String(row?.gemini_api_key || (selectedProvider === 'gemini' ? row?.llm_api_key : '') || '').trim();
    return { provider: 'gemini', selectedProvider, model, apiKey, configured: apiKey.length > 0, updatedAt: row?.updated_at ? String(row.updated_at) : null };
};

export const getLlmConfig = (provider = 'gemini') => {
    const row = getGlobalLlmRow();
    const selectedProvider = String(row?.selected_provider || 'gemini').trim() === 'qwen' ? 'qwen' : 'gemini';
    const targetProvider = String(provider || selectedProvider).trim() === 'qwen' ? 'qwen' : 'gemini';
    if (targetProvider === 'qwen') {
        const model = String(row?.qwen_model_name || (selectedProvider === 'qwen' ? row?.llm_model_name : '') || DEFAULT_QWEN_MODEL).trim() || DEFAULT_QWEN_MODEL;
        const apiKey = String(row?.qwen_api_key || (selectedProvider === 'qwen' ? row?.llm_api_key : '') || '').trim();
        return { provider: 'qwen', selectedProvider, model, apiKey, configured: apiKey.length > 0, updatedAt: row?.updated_at ? String(row.updated_at) : null };
    }
    return getGeminiConfig();
};

export const getRealtimeConfig = () => {
    const gemini = getLlmConfig('gemini');
    const qwen = getLlmConfig('qwen');
    const asr = getAsrConfig();
    return {
        llm: {
            selectedProvider: qwen.selectedProvider,
            providers: {
                gemini: {
                    configured: gemini.configured,
                    model: gemini.model,
                    models: FAST_MODELS.gemini,
                    updatedAt: gemini.updatedAt
                },
                qwen: {
                    configured: qwen.configured,
                    model: qwen.model,
                    models: FAST_MODELS.qwen,
                    updatedAt: qwen.updatedAt
                }
            }
        },
        asr: {
            provider: asr.provider,
            model: asr.model,
            configured: asr.configured,
            endpoint: asr.endpoint,
            models: asr.models
        },
        live: {
            provider: asr.provider,
            model: asr.model,
            providers: {
                aliyun: {
                    configured: asr.configured,
                    model: asr.model,
                    models: asr.models,
                    endpoint: asr.endpoint
                },
                gemini_live: {
                    configured: gemini.configured,
                    model: FAST_MODELS.geminiLive[0],
                    models: FAST_MODELS.geminiLive,
                    updatedAt: gemini.updatedAt
                }
            }
        }
    };
};

export const getTtsConfig = () => {
    const db = getDb();
    const row = db.prepare(`
        SELECT config_key, provider, tts_model, tts_voice, api_key, audio_format, updated_at
        FROM global_tts_configs
        ORDER BY CASE WHEN config_key = '__GLOBAL__' THEN 0 WHEN config_key = 'aliyun' THEN 1 ELSE 2 END, updated_at DESC
        LIMIT 1
    `).get() || null;
    return {
        provider: String(row?.provider || 'aliyun').trim() || 'aliyun',
        configKey: String(row?.config_key || '').trim() || null,
        model: String(row?.tts_model || DEFAULT_TTS_MODEL).trim() || DEFAULT_TTS_MODEL,
        voice: String(row?.tts_voice || DEFAULT_TTS_VOICE).trim() || DEFAULT_TTS_VOICE,
        apiKey: String(row?.api_key || '').trim(),
        format: String(row?.audio_format || DEFAULT_TTS_FORMAT).trim() || DEFAULT_TTS_FORMAT,
        configured: String(row?.api_key || '').trim().length > 0,
        updatedAt: row?.updated_at ? String(row.updated_at) : null
    };
};

export const upsertTtsConfig = (tts) => {
    const db = getDb();
    const now = new Date().toISOString();
    const normalized = normalizeTtsSelection({
        model: tts?.model,
        voice: tts?.voice
    });
    const provider = String(tts?.provider || 'aliyun').trim() || 'aliyun';
    const apiKey = String(tts?.apiKey || '').trim();
    const format = String(tts?.format || DEFAULT_TTS_FORMAT).trim() || DEFAULT_TTS_FORMAT;
    db.prepare(`
        INSERT INTO global_tts_configs (
            config_key, provider, tts_model, tts_voice, api_key, audio_format, updated_at
        ) VALUES (
            @config_key, @provider, @tts_model, @tts_voice, @api_key, @audio_format, @updated_at
        )
        ON CONFLICT(config_key) DO UPDATE SET
            provider = excluded.provider,
            tts_model = excluded.tts_model,
            tts_voice = excluded.tts_voice,
            api_key = excluded.api_key,
            audio_format = excluded.audio_format,
            updated_at = excluded.updated_at
    `).run({
        config_key: GLOBAL_TTS_CONFIG_KEY,
        provider,
        tts_model: normalized.model,
        tts_voice: normalized.voice,
        api_key: apiKey,
        audio_format: format,
        updated_at: now
    });
    return getTtsConfig();
};

export const getAsrConfig = () => {
    const tts = getTtsConfig();
    const endpoint = String(process.env.DASHSCOPE_ASR_WS_URL
        || (String(process.env.CINEMATIC_LITE_ASR_REGION || '').trim().toLowerCase() === 'intl'
            ? 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference'
            : 'wss://dashscope.aliyuncs.com/api-ws/v1/inference')).trim();
    const model = String(process.env.CINEMATIC_LITE_ASR_MODEL || DEFAULT_ASR_MODEL).trim() || DEFAULT_ASR_MODEL;
    return {
        provider: 'aliyun',
        apiKey: tts.apiKey,
        configured: tts.configured,
        endpoint,
        model,
        models: ASR_MODELS.slice(),
        updatedAt: tts.updatedAt
    };
};

export const normalizeTtsSelection = (selection) => {
    const requestedModel = String(selection?.model || '').trim();
    const model = Object.prototype.hasOwnProperty.call(TTS_VOICE_OPTIONS_BY_MODEL, requestedModel) ? requestedModel : DEFAULT_TTS_MODEL;
    const allowedVoices = TTS_VOICE_OPTIONS_BY_MODEL[model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
    const requestedVoice = String(selection?.voice || '').trim();
    const voice = allowedVoices.includes(requestedVoice)
        ? requestedVoice
        : (allowedVoices.includes(DEFAULT_TTS_VOICE) ? DEFAULT_TTS_VOICE : (allowedVoices[0] || DEFAULT_TTS_VOICE));
    return { model, voice, voiceOptions: allowedVoices.slice() };
};

const mapCaptureRow = (row) => row ? ({
    captureId: row.capture_id,
    modelFilename: row.model_filename,
    view: row.view_id,
    source: row.source,
    note: row.note,
    imageDataUrl: row.image_data_url,
    camera: {
        mview: hasStoredMview(row)
            ? {
                pivot: [Number(row.pivot_x), Number(row.pivot_y), Number(row.pivot_z)],
                rotation: [Number(row.rotation_x), Number(row.rotation_y)],
                radius: Number(row.mview_radius),
                fov: Number(row.mview_fov || row.fov_deg || 40)
            }
            : deriveMviewFromLegacy(row),
        cameraX: Number(row.camera_x),
        cameraY: Number(row.camera_y),
        cameraZ: Number(row.camera_z),
        lookAtX: Number(row.look_at_x),
        lookAtY: Number(row.look_at_y),
        lookAtZ: Number(row.look_at_z),
        yawDeg: normalizeAngle(row.yaw_deg),
        pitchDeg: Math.max(-89, Math.min(89, normalizeAngle(row.pitch_deg))),
        fovDeg: Number(row.fov_deg),
        radius: Number(row.radius)
    }
}) : null;

export const upsertCapture = ({ modelFilename, capture }) => {
    const db = getDb();
    const now = new Date().toISOString();
    const captureId = String(capture.captureId || randomUUID());
    const normalizedModelFilename = normalizeModelFilename(modelFilename);
    db.prepare(`
        INSERT INTO cinematic_lite_captures (
            capture_id, model_filename, view_id, source, note, image_data_url,
            camera_x, camera_y, camera_z, look_at_x, look_at_y, look_at_z,
            yaw_deg, pitch_deg, fov_deg, radius,
            pivot_x, pivot_y, pivot_z, rotation_x, rotation_y, mview_radius, mview_fov,
            captured_at, updated_at
        ) VALUES (
            @capture_id, @model_filename, @view_id, @source, @note, @image_data_url,
            @camera_x, @camera_y, @camera_z, @look_at_x, @look_at_y, @look_at_z,
            @yaw_deg, @pitch_deg, @fov_deg, @radius,
            @pivot_x, @pivot_y, @pivot_z, @rotation_x, @rotation_y, @mview_radius, @mview_fov,
            @captured_at, @updated_at
        )
        ON CONFLICT(model_filename, view_id) DO UPDATE SET
            capture_id = excluded.capture_id,
            source = excluded.source,
            note = excluded.note,
            image_data_url = excluded.image_data_url,
            camera_x = excluded.camera_x,
            camera_y = excluded.camera_y,
            camera_z = excluded.camera_z,
            look_at_x = excluded.look_at_x,
            look_at_y = excluded.look_at_y,
            look_at_z = excluded.look_at_z,
            yaw_deg = excluded.yaw_deg,
            pitch_deg = excluded.pitch_deg,
            fov_deg = excluded.fov_deg,
            radius = excluded.radius,
            pivot_x = excluded.pivot_x,
            pivot_y = excluded.pivot_y,
            pivot_z = excluded.pivot_z,
            rotation_x = excluded.rotation_x,
            rotation_y = excluded.rotation_y,
            mview_radius = excluded.mview_radius,
            mview_fov = excluded.mview_fov,
            updated_at = excluded.updated_at
    `).run({
        capture_id: captureId,
        model_filename: normalizedModelFilename,
        view_id: capture.view,
        source: String(capture.source || 'manual'),
        note: String(capture.note || ''),
        image_data_url: String(capture.imageDataUrl || ''),
        camera_x: Number(capture.camera.cameraX || 0),
        camera_y: Number(capture.camera.cameraY || 0),
        camera_z: Number(capture.camera.cameraZ || 0),
        look_at_x: Number(capture.camera.lookAtX || 0),
        look_at_y: Number(capture.camera.lookAtY || 0),
        look_at_z: Number(capture.camera.lookAtZ || 0),
        yaw_deg: Number(capture.camera.yawDeg || 0),
        pitch_deg: Number(capture.camera.pitchDeg || 0),
        fov_deg: Number(capture.camera.fovDeg || 40),
        radius: Number(capture.camera.radius || 1),
        pivot_x: Number(capture.camera.mview?.pivot?.[0] ?? capture.camera.lookAtX ?? 0),
        pivot_y: Number(capture.camera.mview?.pivot?.[1] ?? capture.camera.lookAtY ?? 0),
        pivot_z: Number(capture.camera.mview?.pivot?.[2] ?? capture.camera.lookAtZ ?? 0),
        rotation_x: Number(capture.camera.mview?.rotation?.[0] ?? 0),
        rotation_y: Number(capture.camera.mview?.rotation?.[1] ?? 0),
        mview_radius: Number(capture.camera.mview?.radius ?? capture.camera.radius ?? 1),
        mview_fov: Number(capture.camera.mview?.fov ?? capture.camera.fovDeg ?? 40),
        captured_at: now,
        updated_at: now
    });
    return getCapture(normalizedModelFilename, capture.view);
};

export const getCapture = (modelFilename, viewId) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return null;
    return mapCaptureRow(db.prepare(`SELECT * FROM cinematic_lite_captures WHERE model_filename IN (${placeholders(aliases)}) AND view_id = ? ORDER BY updated_at DESC LIMIT 1`).get(...aliases, viewId));
};

export const listCaptures = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return [];
    return db.prepare(`SELECT * FROM cinematic_lite_captures WHERE model_filename IN (${placeholders(aliases)}) ORDER BY updated_at DESC`).all(...aliases)
        .map(mapCaptureRow)
        .filter((capture, index, list) => capture && list.findIndex((item) => item?.view === capture.view) === index);
};

export const deleteCaptures = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return 0;
    return db.prepare(`DELETE FROM cinematic_lite_captures WHERE model_filename IN (${placeholders(aliases)})`).run(...aliases).changes;
};

export const listCsvVersions = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return [];
    return db.prepare(`SELECT id, version_name, created_at, updated_at FROM cinematic_lite_csv_versions WHERE model_filename IN (${placeholders(aliases)}) ORDER BY updated_at DESC`).all(...aliases);
};

export const getCsvVersion = (id, modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return null;
    return db.prepare(`SELECT id, version_name, csv_text, created_at, updated_at FROM cinematic_lite_csv_versions WHERE id = ? AND model_filename IN (${placeholders(aliases)}) LIMIT 1`).get(id, ...aliases) || null;
};

export const createCsvVersion = ({ id, modelFilename, versionName, csvText }) => {
    const db = getDb();
    const now = new Date().toISOString();
    const normalizedModelFilename = normalizeModelFilename(modelFilename);
    db.prepare('INSERT INTO cinematic_lite_csv_versions (id, model_filename, version_name, csv_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, normalizedModelFilename, versionName, csvText, now, now);
    return getCsvVersion(id, normalizedModelFilename);
};

export const updateCsvVersion = ({ id, modelFilename, versionName, csvText }) => {
    const db = getDb();
    const now = new Date().toISOString();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return null;
    db.prepare(`UPDATE cinematic_lite_csv_versions SET model_filename = ?, version_name = ?, csv_text = ?, updated_at = ? WHERE id = ? AND model_filename IN (${placeholders(aliases)})`).run(normalizeModelFilename(modelFilename), versionName, csvText, now, id, ...aliases);
    return getCsvVersion(id, normalizeModelFilename(modelFilename));
};

export const deleteCsvVersion = (id, modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return;
    db.prepare(`DELETE FROM cinematic_lite_csv_versions WHERE id = ? AND model_filename IN (${placeholders(aliases)})`).run(id, ...aliases);
};

export const deleteCsvVersionsByModel = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return 0;
    return db.prepare(`DELETE FROM cinematic_lite_csv_versions WHERE model_filename IN (${placeholders(aliases)})`).run(...aliases).changes;
};

export const getNarration = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return null;
    return db.prepare(`SELECT model_filename, narration_text, created_at, updated_at FROM cinematic_lite_narrations WHERE model_filename IN (${placeholders(aliases)}) LIMIT 1`).get(...aliases) || null;
};

export const upsertNarration = ({ modelFilename, narrationText }) => {
    const db = getDb();
    const normalizedModelFilename = normalizeModelFilename(modelFilename);
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO cinematic_lite_narrations (model_filename, narration_text, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(model_filename) DO UPDATE SET
            narration_text = excluded.narration_text,
            updated_at = excluded.updated_at
    `).run(normalizedModelFilename, String(narrationText || ''), now, now);
    return getNarration(normalizedModelFilename);
};

export const deleteNarration = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return 0;
    return db.prepare(`DELETE FROM cinematic_lite_narrations WHERE model_filename IN (${placeholders(aliases)})`).run(...aliases).changes;
};

export const clearCinematicLiteModelData = (modelFilename) => ({
    capturesDeleted: deleteCaptures(modelFilename),
    csvVersionsDeleted: deleteCsvVersionsByModel(modelFilename),
    narrationsDeleted: deleteNarration(modelFilename)
});

const mapCameraTesterSnapshotRow = (row) => row ? ({
    snapshotId: row.snapshot_id,
    modelFilename: row.model_filename,
    name: row.snapshot_name,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    camera: {
        mview: {
            pivot: [Number(row.pivot_x), Number(row.pivot_y), Number(row.pivot_z)],
            rotation: [Number(row.rotation_x), Number(row.rotation_y)],
            radius: Number(row.mview_radius),
            fov: Number(row.mview_fov)
        },
        cameraX: Number(row.camera_x),
        cameraY: Number(row.camera_y),
        cameraZ: Number(row.camera_z),
        lookAtX: Number(row.look_at_x),
        lookAtY: Number(row.look_at_y),
        lookAtZ: Number(row.look_at_z),
        yawDeg: normalizeAngle(row.yaw_deg),
        pitchDeg: Math.max(-89, Math.min(89, normalizeAngle(row.pitch_deg))),
        fovDeg: Number(row.fov_deg),
        radius: Number(row.derived_radius)
    }
}) : null;

export const listCameraTesterSnapshots = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return [];
    return db.prepare(`SELECT * FROM camera_tester_snapshots WHERE model_filename IN (${placeholders(aliases)}) ORDER BY updated_at DESC`).all(...aliases).map(mapCameraTesterSnapshotRow);
};

export const upsertCameraTesterSnapshot = ({ modelFilename, snapshot }) => {
    const db = getDb();
    const normalizedModelFilename = normalizeModelFilename(modelFilename);
    const now = new Date().toISOString();
    const snapshotId = String(snapshot.snapshotId || randomUUID());
    db.prepare(`
        INSERT INTO camera_tester_snapshots (
            snapshot_id, model_filename, snapshot_name, note, source,
            pivot_x, pivot_y, pivot_z, rotation_x, rotation_y, mview_radius, mview_fov,
            camera_x, camera_y, camera_z, look_at_x, look_at_y, look_at_z,
            yaw_deg, pitch_deg, fov_deg, derived_radius,
            created_at, updated_at
        ) VALUES (
            @snapshot_id, @model_filename, @snapshot_name, @note, @source,
            @pivot_x, @pivot_y, @pivot_z, @rotation_x, @rotation_y, @mview_radius, @mview_fov,
            @camera_x, @camera_y, @camera_z, @look_at_x, @look_at_y, @look_at_z,
            @yaw_deg, @pitch_deg, @fov_deg, @derived_radius,
            @created_at, @updated_at
        )
        ON CONFLICT(snapshot_id) DO UPDATE SET
            model_filename = excluded.model_filename,
            snapshot_name = excluded.snapshot_name,
            note = excluded.note,
            source = excluded.source,
            pivot_x = excluded.pivot_x,
            pivot_y = excluded.pivot_y,
            pivot_z = excluded.pivot_z,
            rotation_x = excluded.rotation_x,
            rotation_y = excluded.rotation_y,
            mview_radius = excluded.mview_radius,
            mview_fov = excluded.mview_fov,
            camera_x = excluded.camera_x,
            camera_y = excluded.camera_y,
            camera_z = excluded.camera_z,
            look_at_x = excluded.look_at_x,
            look_at_y = excluded.look_at_y,
            look_at_z = excluded.look_at_z,
            yaw_deg = excluded.yaw_deg,
            pitch_deg = excluded.pitch_deg,
            fov_deg = excluded.fov_deg,
            derived_radius = excluded.derived_radius,
            updated_at = excluded.updated_at
    `).run({
        snapshot_id: snapshotId,
        model_filename: normalizedModelFilename,
        snapshot_name: String(snapshot.name || snapshotId),
        note: String(snapshot.note || ''),
        source: String(snapshot.source || 'manual'),
        pivot_x: Number(snapshot.camera.mview?.pivot?.[0] ?? 0),
        pivot_y: Number(snapshot.camera.mview?.pivot?.[1] ?? 0),
        pivot_z: Number(snapshot.camera.mview?.pivot?.[2] ?? 0),
        rotation_x: Number(snapshot.camera.mview?.rotation?.[0] ?? 0),
        rotation_y: Number(snapshot.camera.mview?.rotation?.[1] ?? 0),
        mview_radius: Number(snapshot.camera.mview?.radius ?? 1),
        mview_fov: Number(snapshot.camera.mview?.fov ?? 40),
        camera_x: Number(snapshot.camera.cameraX ?? 0),
        camera_y: Number(snapshot.camera.cameraY ?? 0),
        camera_z: Number(snapshot.camera.cameraZ ?? 0),
        look_at_x: Number(snapshot.camera.lookAtX ?? 0),
        look_at_y: Number(snapshot.camera.lookAtY ?? 0),
        look_at_z: Number(snapshot.camera.lookAtZ ?? 0),
        yaw_deg: Number(snapshot.camera.yawDeg ?? 0),
        pitch_deg: Number(snapshot.camera.pitchDeg ?? 0),
        fov_deg: Number(snapshot.camera.fovDeg ?? 40),
        derived_radius: Number(snapshot.camera.radius ?? snapshot.camera.mview?.radius ?? 1),
        created_at: String(snapshot.createdAt || now),
        updated_at: now
    });
    return mapCameraTesterSnapshotRow(db.prepare('SELECT * FROM camera_tester_snapshots WHERE snapshot_id = ?').get(snapshotId));
};

export const deleteCameraTesterSnapshot = (snapshotId, modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return 0;
    return db.prepare(`DELETE FROM camera_tester_snapshots WHERE snapshot_id = ? AND model_filename IN (${placeholders(aliases)})`).run(snapshotId, ...aliases).changes;
};

export const clearCameraTesterSnapshots = (modelFilename) => {
    const db = getDb();
    const aliases = modelAliases(modelFilename);
    if (aliases.length < 1) return 0;
    return db.prepare(`DELETE FROM camera_tester_snapshots WHERE model_filename IN (${placeholders(aliases)})`).run(...aliases).changes;
};

export const getDbStatus = () => ({
    dbPath,
    gemini: getGeminiConfig(),
    llm: getRealtimeConfig().llm,
    tts: getTtsConfig(),
    ttsCatalog: { models: Object.keys(TTS_VOICE_OPTIONS_BY_MODEL), voicesByModel: TTS_VOICE_OPTIONS_BY_MODEL }
});

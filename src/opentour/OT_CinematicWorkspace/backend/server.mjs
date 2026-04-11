import { createServer } from 'node:http';
import { chmodSync, createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Agent as UndiciAgent, ProxyAgent as UndiciProxyAgent } from 'undici';

import { createTourLoaderRepository } from '../../../server/db/repositories/tour-loader-repository.mjs';
import { getTtsConfig } from '../../../server/db/repositories/shared-config-repository.mjs';
import { resolveGlobalLlmConfig } from '../../../shared/llm/global-config.mjs';
import WebSocket from 'ws';

const DEFAULT_PROMPT_TEMPLATE = '你是世界级的，正在描述你的视角给观众讲解，不要旁白和画外音。content 只允许使用：中文、英文、数字、空格，以及中文标点 `，。；：！？（）`禁止使用任何英文 CSV 控制字符，尤其是 `,` 和 `"`，绝对不要让 content 出现真实换行，不包含：\\r \\n \\t ，整体文字少于100字。';
const DEFAULT_CSV_PROMPT_TEMPLATE = `You are a CSV tour route planner.
Given POI data (poi_id, poi_name, content), output the best ordered tour steps.

Rules:
1) Output JSON only, no extra text.
2) Do not output from/to fields.
3) Every step must include: poi_id, action, audio_mode.
4) action should be one of MOVE/LOOK/SPEAK when possible.
5) audio_mode must be INTERRUPTIBLE or BLOCKING.
6) steps must cover all poi_id values from POI_DATA_JSON at least once.
7) Prefer each poi_id to appear once (duplicates only if truly necessary).

Output format:
{"steps":[{"poi_id":"kitchen","action":"MOVE","audio_mode":"INTERRUPTIBLE"}]}`;
const DEFAULT_MOVE_PROMPT_TEMPLATE = `You are a tour navigation copywriter for MOVE steps.
Given ordered MOVE contexts, produce concise transition narration for each step.

Rules:
1) Output JSON only, no extra text.
2) Keep each content to one short sentence.
3) Mention from -> to clearly.
4) Do not repeat scenic description from POI content.
5) Follow language field strictly: zh-CN => Chinese, en-US => English.

Output format:
{"moves":[{"seq":1,"content":"我们从起点前往大厅，向前移动约6米。"}]}`;
const DEFAULT_LLM_MODEL = 'gemini-2.5-pro';
const DEFAULT_QWEN_MODEL = 'qwen3.6-plus';
const DEFAULT_TTS_MODEL = 'cosyvoice-v3-plus';
const DEFAULT_TTS_VOICE = 'longyuan_v3';
const DEFAULT_TTS_FORMAT = 'mp3';
const DASHSCOPE_TTS_WS_URL = process.env.DASHSCOPE_TTS_WS_URL || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const TTS_CONNECT_TIMEOUT_MS = 30000;
const DEFAULT_CSV_TARGET_DURATION_SEC = 30;
const DEFAULT_POI_FOV = 60;
const MIN_POI_FOV = 20;
const MAX_POI_FOV = 120;
const CSV_PLAN_ACTIONS = new Set(['MOVE', 'LOOK', 'SPEAK', 'PAUSE', 'EMPHASIZE', 'END']);
const CSV_AUDIO_MODES = new Set(['INTERRUPTIBLE', 'BLOCKING']);
const CSV_VOICE_MODES = new Set(['fixed', 'shuffle_round_robin']);
const CSV_TIMING_MIN_MOVE_SPEED = 0.6;
const CSV_TIMING_MAX_MOVE_SPEED = 2.2;
const CSV_TIMING_MIN_MOVE_DWELL_MS = 200;
const CSV_TIMING_MAX_MOVE_DWELL_MS = 1600;
const CSV_TIMING_MIN_LOOK_DWELL_MS = 500;
const CSV_TIMING_MAX_LOOK_DWELL_MS = 5000;
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
const TTS_MODEL_FALLBACKS = {
    'cosyvoice-v3-plus': ['cosyvoice-v3-flash']
};
const GLOBAL_LLM_CONFIG_KEY = '__GLOBAL__';
const LLM_CONNECT_TIMEOUT_MS = 30000;
const TL_API_BASE = process.env.OT_TL_API_BASE || 'http://localhost:3031/api/ot-tour-loader';
const resolveProxyUrl = () => {
    const candidates = [
        process.env.HTTPS_PROXY,
        process.env.https_proxy,
        process.env.HTTP_PROXY,
        process.env.http_proxy
    ];
    for (let i = 0; i < candidates.length; i += 1) {
        const v = String(candidates[i] || '').trim();
        if (v) return v;
    }
    return '';
};
const LLM_PROXY_URL = resolveProxyUrl();
const llmDirectDispatcher = new UndiciAgent({
    connect: { timeout: LLM_CONNECT_TIMEOUT_MS }
});
const llmFetchDispatcher = LLM_PROXY_URL
    ? new UndiciProxyAgent({
        uri: LLM_PROXY_URL,
        connect: { timeout: LLM_CONNECT_TIMEOUT_MS }
    })
    : llmDirectDispatcher;

const shouldRetryDirectWithoutProxy = (error) => {
    if (!LLM_PROXY_URL) return false;
    const code = String(error?.code || error?.cause?.code || '').trim().toUpperCase();
    return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ETIMEDOUT';
};

const fetchWithLlmDispatcher = async (url, init = {}) => {
    try {
        return await fetch(url, {
            ...init,
            dispatcher: llmFetchDispatcher
        });
    } catch (error) {
        if (!shouldRetryDirectWithoutProxy(error)) throw error;
        console.warn(`[ot-cinematic-workspace] llm proxy unavailable, retry direct: ${String(error?.message || error)}`);
        return fetch(url, {
            ...init,
            dispatcher: llmDirectDispatcher
        });
    }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '../../../../..'));
const dataDir = join(repoRoot, 'data');
const cinematicMediaDir = join(dataDir, 'cinematic-media');
const dbPath = join(dataDir, 'ot-tour-loader.db');
mkdirSync(dataDir, { recursive: true });
mkdirSync(cinematicMediaDir, { recursive: true });
const tourLoaderRepo = createTourLoaderRepository('ot-cinematic-workspace');
const runRepo = (name, ...args) => tourLoaderRepo.run(name, ...args);
const getRepo = (name, ...args) => tourLoaderRepo.get(name, ...args);
const allRepo = (name, ...args) => tourLoaderRepo.all(name, ...args);
const transactionRepo = (name, fn) => tourLoaderRepo.transaction(name, fn);
const migrateLlmConfigStorage = () => {
    const now = new Date().toISOString();
    const legacyRows = allRepo('listLegacyLlmPromptRows', GLOBAL_LLM_CONFIG_KEY);

    legacyRows.forEach((row) => {
        runRepo('upsertPromptConfig', {
            model_filename: String(row.model_filename || '').trim(),
            prompt_template: String(row.prompt_template || DEFAULT_PROMPT_TEMPLATE),
            csv_prompt_template: String(row.csv_prompt_template || DEFAULT_CSV_PROMPT_TEMPLATE),
            move_prompt_template: String(row.move_prompt_template || DEFAULT_MOVE_PROMPT_TEMPLATE),
            updated_at: String(row.updated_at || now)
        });
    });

    const globalRow = getRepo('getLlmConfig', GLOBAL_LLM_CONFIG_KEY);
    if (!globalRow) {
        const seed = getRepo('getLatestLlmConfig');
        runRepo('upsertGlobalLlmConfig', {
            model_filename: GLOBAL_LLM_CONFIG_KEY,
            llm_model_name: String(seed?.llm_model_name || DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL,
            llm_api_key: String(seed?.llm_api_key || '').trim(),
            selected_provider: String(seed?.selected_provider || 'gemini').trim() || 'gemini',
            gemini_model_name: String(seed?.gemini_model_name || seed?.llm_model_name || DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL,
            gemini_api_key: String(seed?.gemini_api_key || seed?.llm_api_key || '').trim(),
            qwen_model_name: String(seed?.qwen_model_name || DEFAULT_QWEN_MODEL).trim() || DEFAULT_QWEN_MODEL,
            qwen_api_key: String(seed?.qwen_api_key || '').trim(),
            prompt_template: null,
            csv_prompt_template: null,
            move_prompt_template: null,
            updated_at: now
        });
    }

    runRepo('deleteNonGlobalLlmConfigs', GLOBAL_LLM_CONFIG_KEY);
};

migrateLlmConfigStorage();

const getGlobalLlmConfig = () => resolveGlobalLlmConfig(getRepo('getLlmConfig', GLOBAL_LLM_CONFIG_KEY), {
    defaultGeminiModel: DEFAULT_LLM_MODEL,
    defaultQwenModel: DEFAULT_QWEN_MODEL
});

const json = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(payload);
};

const csvResponse = (res, text, filename) => {
    const payload = Buffer.from(text, 'utf8');
    res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': payload.length,
        'Access-Control-Allow-Origin': '*'
    });
    res.end(payload);
};

const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
});

const fail = (res, status, code, message, details = {}) => {
    json(res, status, { ok: false, error: { code, message, details } });
};

const fetchTlJson = async (path, init = {}) => {
    const response = await fetch(`${TL_API_BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
};

const getTlState = async (modelFilename) => {
    const { response, data } = await fetchTlJson(`/state?modelFilename=${encodeURIComponent(String(modelFilename || ''))}`);
    if (!response.ok || !data?.ok) {
        throw new Error(String(data?.error?.message || `TL state request failed (${response.status})`));
    }
    return data;
};

const mapTlPoiToDbRow = (poi) => ({
    poi_id: String(poi?.poiId || ''),
    poi_name: String(poi?.poiName || ''),
    sort_order: Number(toNum(poi?.sortOrder, 0)),
    target_x: Number(toNum(poi?.targetX, 0)),
    target_y: Number(toNum(poi?.targetY, 0)),
    target_z: Number(toNum(poi?.targetZ, 0)),
    target_yaw: Number(toNum(poi?.targetYaw, 0)),
    target_pitch: Number(toNum(poi?.targetPitch, 0)),
    target_fov: Number(toFov(poi?.targetFov, DEFAULT_POI_FOV)),
    move_speed_mps: Number(toNum(poi?.moveSpeedMps, 0.8)),
    dwell_ms: Number(toNum(poi?.dwellMs, 1200)),
    content: String(poi?.content || ''),
    tts_lang: String(poi?.ttsLang || ''),
    prompt_template: String(poi?.promptTemplate || ''),
    screenshot_data_url: String(poi?.screenshotDataUrl || ''),
    screenshot_updated_at: String(poi?.screenshotUpdatedAt || ''),
    content_updated_at: String(poi?.contentUpdatedAt || ''),
    prompt_updated_at: String(poi?.promptUpdatedAt || '')
});

const getTlPoiRows = async (modelFilename) => {
    const data = await getTlState(modelFilename);
    return {
        profile: {
            eye_height_m: Number(toNum(data?.profile?.eyeHeightM, 1.65)),
            updated_at: String(data?.profile?.updatedAt || '') || null
        },
        rows: Array.isArray(data?.pois) ? data.pois.map(mapTlPoiToDbRow).filter((row) => row.poi_id) : []
    };
};

const toNum = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const toFov = (value, fallback = DEFAULT_POI_FOV) => {
    const n = toNum(value, fallback);
    return Math.max(MIN_POI_FOV, Math.min(MAX_POI_FOV, n));
};

const parseCsvLine = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') {
                cur += '"';
                i += 1;
            } else {
                quoted = !quoted;
            }
            continue;
        }
        if (ch === ',' && !quoted) {
            out.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur.trim());
    return out;
};

const escapeCsv = (value) => {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
};

const decodeDataUrl = (dataUrl) => {
    const raw = String(dataUrl || '').trim();
    if (!raw) return { blob: null, mime: null };
    const m = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
    if (!m) return { blob: null, mime: null };
    try {
        return { blob: Buffer.from(m[2], 'base64'), mime: m[1] || 'image/png' };
    } catch {
        return { blob: null, mime: null };
    }
};

const encodeDataUrl = (blob, mime) => {
    if (!blob) return null;
    const b = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    const type = String(mime || 'image/png');
    return `data:${type};base64,${b.toString('base64')}`;
};

const guessMimeFromPath = (filePath) => {
    const ext = String(extname(filePath || '') || '').toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.webp': return 'image/webp';
        case '.mp4': return 'video/mp4';
        case '.mov': return 'video/quicktime';
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        case '.flac': return 'audio/flac';
        default: return 'application/octet-stream';
    }
};

const sanitizeStoredMediaName = (value) => String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'media.bin';

const storeCinematicMedia = ({ fileName, dataBase64 }) => {
    const originalName = sanitizeStoredMediaName(fileName || 'media.bin');
    const ext = String(extname(originalName || '') || '').toLowerCase() || '.bin';
    const buffer = Buffer.from(String(dataBase64 || ''), 'base64');
    const hash = createHash('sha1').update(buffer).digest('hex');
    const storedName = `${hash}${ext}`;
    const absolutePath = join(cinematicMediaDir, storedName);
    writeFileSync(absolutePath, buffer);
    return {
        storedName,
        fileName: originalName,
        absolutePath
    };
};

const streamLocalFile = (req, res, rawPath) => {
    const requested = String(rawPath || '').trim();
    if (!requested) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'path required');
    const absolute = requested.startsWith('/') ? resolve(requested) : resolve(repoRoot, requested);
    let stats;
    try {
        stats = statSync(absolute);
    } catch {
        return fail(res, 404, 'OT_TL_NOT_FOUND', 'asset file not found');
    }
    if (!stats.isFile()) return fail(res, 404, 'OT_TL_NOT_FOUND', 'asset file not found');
    const mime = guessMimeFromPath(absolute);
    const range = String(req.headers.range || '').trim();
    if (range && mime.startsWith('video/')) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match && match[1] ? Math.max(0, Number(match[1])) : 0;
        const end = match && match[2] ? Math.min(stats.size - 1, Number(match[2])) : stats.size - 1;
        if (start > end || start >= stats.size) return fail(res, 416, 'OT_TL_RANGE_INVALID', 'invalid range');
        res.writeHead(206, {
            'Content-Type': mime,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${stats.size}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
        });
        createReadStream(absolute, { start, end }).pipe(res);
        return;
    }
    res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stats.size,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
    });
    createReadStream(absolute).pipe(res);
};

const mapRow = (row) => ({
    poiId: row.poi_id,
    poiName: row.poi_name,
    sortOrder: row.sort_order,
    targetX: row.target_x,
    targetY: row.target_y,
    targetZ: row.target_z,
    targetYaw: row.target_yaw,
    targetPitch: row.target_pitch,
    targetFov: toFov(row.target_fov, DEFAULT_POI_FOV),
    moveSpeedMps: row.move_speed_mps,
    dwellMs: row.dwell_ms,
    content: row.content,
    ttsLang: row.tts_lang,
    promptTemplate: row.prompt_template ?? DEFAULT_PROMPT_TEMPLATE,
    screenshotDataUrl: row.screenshot_data_url || encodeDataUrl(row.screenshot_blob, row.screenshot_blob_mime),
    screenshotUpdatedAt: row.screenshot_updated_at,
    contentUpdatedAt: row.content_updated_at,
    promptUpdatedAt: row.prompt_updated_at,
    updatedAt: row.updated_at
});

const mapHotspotRow = (row) => ({
    hotspotId: String(row.hotspot_id || ''),
    title: String(row.title || ''),
    enabled: Boolean(Number(row.enabled || 0)),
    sortOrder: Number(row.sort_order || 0),
    triggerMode: String(row.trigger_mode || 'click'),
    delayMs: Math.max(0, Math.floor(Number(row.delay_ms || 0))),
    payloadType: String(row.payload_type || 'image'),
    displayMode: String(row.display_mode || 'floating-dom'),
    region: {
        x: Number(row.region_x || 0),
        y: Number(row.region_y || 0),
        width: Number(row.region_width || 0),
        height: Number(row.region_height || 0)
    },
    mediaSrc: String(row.media_src || ''),
    caption: String(row.caption || ''),
    ttsText: String(row.tts_text || ''),
    confirmMessage: String(row.confirm_message || ''),
    confirmConfirmText: String(row.confirm_confirm_text || ''),
    confirmCancelText: String(row.confirm_cancel_text || ''),
    anchorWorld: Number.isFinite(Number(row.anchor_world_x))
        ? {
            x: Number(row.anchor_world_x),
            y: Number(row.anchor_world_y),
            z: Number(row.anchor_world_z)
        }
        : null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || '')
});

const mapCsvVersionRow = (row, withText = false) => {
    const base = {
        id: Number(row.id || 0),
        modelFilename: String(row.model_filename || ''),
        versionNo: Number(row.version_no || 0),
        status: String(row.status || 'draft'),
        source: String(row.source || 'manual'),
        llmModel: row.llm_model ? String(row.llm_model) : null,
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
        csvChars: Number(row.csv_chars || String(row.csv_text || '').length || 0)
    };
    if (!withText) return base;
    return {
        ...base,
        csvText: String(row.csv_text || ''),
        csvPromptTemplate: row.csv_prompt_template ? String(row.csv_prompt_template) : null,
        movePromptTemplate: row.move_prompt_template ? String(row.move_prompt_template) : null
    };
};

const mapCinematicVersionRow = (row, withText = false) => {
    const base = {
        id: Number(row.id || 0),
        modelFilename: String(row.model_filename || ''),
        versionNo: Number(row.version_no || 0),
        status: String(row.status || 'draft'),
        source: String(row.source || 'manual'),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
        planChars: Number(row.plan_chars || String(row.plan_json || '').length || 0)
    };
    if (!withText) return base;
    let selectedPoiIds = [];
    let plan = null;
    try {
        const parsedIds = JSON.parse(String(row.selected_poi_ids_json || '[]'));
        selectedPoiIds = Array.isArray(parsedIds) ? parsedIds.map((item) => String(item || '')) : [];
    } catch {}
    try {
        plan = row.plan_json ? JSON.parse(String(row.plan_json)) : null;
    } catch {}
    return {
        ...base,
        simplePrompt: String(row.simple_prompt || ''),
        plannerPrompt: String(row.planner_prompt || ''),
        sceneDescription: String(row.scene_description || ''),
        storyBackground: String(row.story_background || ''),
        styleText: String(row.style_text || ''),
        targetDurationSec: Number(row.target_duration_sec || 0) || null,
        selectedPoiIds,
        plan,
        csvText: String(row.csv_text || '')
    };
};

const cleanupOrphanCinematicBgmRefs = () => {
    const rows = allRepo('listNonEmptyCinematicPlans');
    let cleaned = 0;
    rows.forEach((row) => {
        try {
            const plan = JSON.parse(String(row.plan_json || ''));
            if (!plan || typeof plan !== 'object' || !plan.bgm || typeof plan.bgm !== 'object') return;
            const bgm = plan.bgm;
            const audioPath = String(bgm.audioPath || '').trim();
            const sourceKey = String(bgm.sourceKey || '').trim();
            const stablePath = /^(https?:\/\/|data:|blob:|\/|[A-Za-z]:\\)/.test(audioPath);
            if (!stablePath && !sourceKey) {
                plan.bgm = null;
                runRepo('updateCinematicPlanJson', { id: Number(row.id), plan_json: JSON.stringify(plan), updated_at: new Date().toISOString() });
                cleaned += 1;
            }
        } catch {}
    });
    return cleaned;
};

const createCsvVersion = ({
    modelFilename,
    status = 'draft',
    source = 'manual',
    csvText,
    llmModel = null,
    csvPromptTemplate = null,
    movePromptTemplate = null,
    confirmedAt = null
}) => {
    const now = new Date().toISOString();
    const nextNoRow = getRepo('getCsvVersionMaxNo', modelFilename);
    const versionNo = Math.max(1, Number(nextNoRow?.next_version_no || 1));
    const result = runRepo('insertCsvVersion', {
        model_filename: modelFilename,
        version_no: versionNo,
        status,
        source,
        csv_text: String(csvText || ''),
        llm_model: llmModel ? String(llmModel) : null,
        csv_prompt_template: csvPromptTemplate ? String(csvPromptTemplate) : null,
        move_prompt_template: movePromptTemplate ? String(movePromptTemplate) : null,
        created_at: now,
        updated_at: now,
        confirmed_at: confirmedAt ? String(confirmedAt) : null
    });
    const row = getRepo('getCsvVersionById', Number(result.lastInsertRowid), modelFilename);
    return row ? mapCsvVersionRow(row, true) : null;
};

const createCinematicVersion = ({
    modelFilename,
    status = 'draft',
    source = 'manual',
    simplePrompt = '',
    plannerPrompt = '',
    sceneDescription = '',
    storyBackground = '',
    styleText = '',
    targetDurationSec = null,
    selectedPoiIds = [],
    plan = null,
    csvText = '',
    confirmedAt = null
}) => {
    const now = new Date().toISOString();
    const nextNoRow = getRepo('getCinematicVersionMaxNo', modelFilename);
    const versionNo = Math.max(1, Number(nextNoRow?.next_version_no || 1));
    const result = runRepo('insertCinematicVersion', {
        model_filename: modelFilename,
        version_no: versionNo,
        status,
        source,
        simple_prompt: String(simplePrompt || ''),
        planner_prompt: String(plannerPrompt || ''),
        scene_description: String(sceneDescription || ''),
        story_background: String(storyBackground || ''),
        style_text: String(styleText || ''),
        target_duration_sec: targetDurationSec === null || targetDurationSec === undefined ? null : Number(targetDurationSec),
        selected_poi_ids_json: JSON.stringify(Array.isArray(selectedPoiIds) ? selectedPoiIds : []),
        plan_json: plan ? JSON.stringify(plan) : '',
        csv_text: String(csvText || ''),
        created_at: now,
        updated_at: now,
        confirmed_at: confirmedAt ? String(confirmedAt) : null
    });
    const row = getRepo('getCinematicVersionById', Number(result.lastInsertRowid), modelFilename);
    return row ? mapCinematicVersionRow(row, true) : null;
};

const cleanedOrphanBgmCount = cleanupOrphanCinematicBgmRefs();

const saveState = transactionRepo('saveState', (modelFilename, profile, pois) => {
    const now = new Date().toISOString();
    runRepo('upsertProfile', { model_filename: modelFilename, eye_height_m: toNum(profile?.eyeHeightM, 1.65), updated_at: now });
    runRepo('clearModelPois', modelFilename);
    runRepo('clearModelHotspots', modelFilename);
    pois.forEach((poi, idx) => {
        const poiId = String(poi.poiId || `poi_${Date.now().toString(36)}_${idx}`).trim();
        const shot = String(poi.screenshotDataUrl || '').trim();
        const shotBlob = decodeDataUrl(shot);
        runRepo('upsertPoi', {
            model_filename: modelFilename,
            poi_id: poiId,
            poi_name: String(poi.poiName || poiId),
            sort_order: Number.isFinite(Number(poi.sortOrder)) ? Number(poi.sortOrder) : idx,
            target_x: toNum(poi.targetX, 0),
            target_y: toNum(poi.targetY, 0),
            target_z: toNum(poi.targetZ, 0),
            target_yaw: toNum(poi.targetYaw, 0),
            target_pitch: toNum(poi.targetPitch, 0),
            target_fov: toFov(poi.targetFov, DEFAULT_POI_FOV),
            move_speed_mps: toNum(poi.moveSpeedMps, 0.8),
            dwell_ms: Math.max(0, Math.floor(toNum(poi.dwellMs, 1500))),
            content: String(poi.content || ''),
            tts_lang: String(poi.ttsLang || ''),
            prompt_template: poi.promptTemplate === undefined || poi.promptTemplate === null
                ? DEFAULT_PROMPT_TEMPLATE
                : String(poi.promptTemplate || ''),
            screenshot_data_url: shot || null,
            screenshot_blob: shotBlob.blob,
            screenshot_blob_mime: shotBlob.mime,
            screenshot_updated_at: poi.screenshotUpdatedAt ? String(poi.screenshotUpdatedAt) : null,
            content_updated_at: poi.contentUpdatedAt ? String(poi.contentUpdatedAt) : null,
            prompt_updated_at: poi.promptUpdatedAt ? String(poi.promptUpdatedAt) : null,
            updated_at: now
        });
        const hotspots = Array.isArray(poi.hotspots) ? poi.hotspots : [];
        hotspots.forEach((hotspot, hotspotIdx) => {
            const anchor = hotspot?.anchorWorld || null;
            runRepo('upsertHotspot', {
                model_filename: modelFilename,
                poi_id: poiId,
                hotspot_id: String(hotspot?.hotspotId || `hotspot_${Date.now().toString(36)}_${hotspotIdx}`),
                title: String(hotspot?.title || `Hotspot ${hotspotIdx + 1}`),
                sort_order: Number.isFinite(Number(hotspot?.sortOrder)) ? Number(hotspot.sortOrder) : hotspotIdx,
                enabled: hotspot?.enabled === false ? 0 : 1,
                trigger_mode: String(hotspot?.triggerMode || 'click'),
                delay_ms: Math.max(0, Math.floor(toNum(hotspot?.delayMs, 0))),
                payload_type: String(hotspot?.payloadType || 'image'),
                display_mode: String(hotspot?.displayMode || 'floating-dom'),
                region_x: clamp01(toNum(hotspot?.region?.x, 0)),
                region_y: clamp01(toNum(hotspot?.region?.y, 0)),
                region_width: clamp01(Math.max(0.02, toNum(hotspot?.region?.width, 0.12))),
                region_height: clamp01(Math.max(0.02, toNum(hotspot?.region?.height, 0.12))),
                media_src: hotspot?.mediaSrc ? String(hotspot.mediaSrc) : null,
                caption: hotspot?.caption ? String(hotspot.caption) : null,
                tts_text: hotspot?.ttsText ? String(hotspot.ttsText) : null,
                confirm_message: hotspot?.confirmMessage ? String(hotspot.confirmMessage) : null,
                confirm_confirm_text: hotspot?.confirmConfirmText ? String(hotspot.confirmConfirmText) : null,
                confirm_cancel_text: hotspot?.confirmCancelText ? String(hotspot.confirmCancelText) : null,
                anchor_world_x: anchor && Number.isFinite(Number(anchor.x)) ? Number(anchor.x) : null,
                anchor_world_y: anchor && Number.isFinite(Number(anchor.y)) ? Number(anchor.y) : null,
                anchor_world_z: anchor && Number.isFinite(Number(anchor.z)) ? Number(anchor.z) : null,
                created_at: hotspot?.createdAt ? String(hotspot.createdAt) : now,
                updated_at: hotspot?.updatedAt ? String(hotspot.updatedAt) : now
            });
        });
    });
    return now;
});

const jobStore = new Map();
const sseStore = new Map();
const eventHistoryStore = new Map();

const pushEventHistory = (jobId, event, payload) => {
    if (!eventHistoryStore.has(jobId)) eventHistoryStore.set(jobId, []);
    const arr = eventHistoryStore.get(jobId);
    arr.push({ event, payload });
    if (arr.length > 300) arr.splice(0, arr.length - 300);
};

const sendSse = (jobId, event, payload, storeHistory = true) => {
    if (storeHistory) pushEventHistory(jobId, event, payload);
    const clients = sseStore.get(jobId);
    if (!clients) return;
    const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((res) => {
        if (!res.writableEnded) res.write(body);
    });
};

const hasCjk = (text) => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(text || ''));

const guessProvider = (model) => {
    const m = String(model || '').toLowerCase();
    if (m.startsWith('gemini')) return 'gemini';
    if (m.startsWith('qwen')) return 'qwen';
    if (m.startsWith('gpt')) return 'openai';
    return 'openai';
};

const normalizeLlmProvider = (provider) => {
    const normalized = String(provider || '').trim().toLowerCase();
    if (normalized === 'qwen') return 'qwen';
    if (normalized === 'gemini') return 'gemini';
    return '';
};

const resolveLlmProvider = ({ provider, model }) => {
    const explicitProvider = normalizeLlmProvider(provider);
    if (explicitProvider) return explicitProvider;
    const guessedProvider = guessProvider(model);
    if (guessedProvider === 'qwen') return 'qwen';
    if (guessedProvider === 'gemini') return 'gemini';
    return 'gemini';
};

const endpointForModel = (model, provider) => {
    const resolvedProvider = resolveLlmProvider({ provider, model });
    if (resolvedProvider === 'gemini') {
        return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`;
    }
    if (resolvedProvider === 'qwen') {
        return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    }
    return 'https://api.openai.com/v1/chat/completions';
};

const clampRange = (value, min, max) => Math.max(min, Math.min(max, value));

const geminiMaxOutputTokens = (model) => {
    const m = String(model || '').toLowerCase();
    if (m.includes('2.5-pro') || m.includes('3-pro') || m.includes('pro-preview') || m.includes('pro')) return 4096;
    if (m.includes('2.5-flash') || m.includes('3-flash') || m.includes('flash-preview') || m.includes('flash')) return 2048;
    return 2048;
};

const geminiThinkingConfig = (model) => {
    const m = String(model || '').toLowerCase();
    if (m.includes('2.5-pro') || m.includes('3-pro') || m.includes('pro-preview')) {
        return { thinkingBudget: 256 };
    }
    return null;
};

const languageInstruction = (poiName) => {
    return hasCjk(poiName)
        ? 'Output language requirement: Chinese (Simplified Chinese, zh-CN).'
        : 'Output language requirement: English (en-US).';
};

const inferTtsLang = ({ ttsLang, poiName, content }) => {
    const text = `${String(poiName || '')}\n${String(content || '')}`;
    const normalized = String(ttsLang || '').trim();
    const lower = normalized.toLowerCase();
    if (hasCjk(text)) {
        if (!normalized || lower.startsWith('en')) return 'zh-CN';
        return normalized;
    }
    if (lower.startsWith('zh')) return 'en-US';
    return normalized || 'en-US';
};

const shuffleArray = (items) => {
    const out = Array.isArray(items) ? items.slice() : [];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
};

const normalizeVoiceConfig = (rawConfig) => {
    const requestedModel = String(rawConfig?.model || '').trim();
    const model = Object.prototype.hasOwnProperty.call(TTS_VOICE_OPTIONS_BY_MODEL, requestedModel)
        ? requestedModel
        : DEFAULT_TTS_MODEL;
    const allowedVoices = TTS_VOICE_OPTIONS_BY_MODEL[model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
    const requestedFixedVoice = String(rawConfig?.fixedVoice || '').trim();
    const fixedVoice = allowedVoices.includes(requestedFixedVoice)
        ? requestedFixedVoice
        : (allowedVoices.includes(DEFAULT_TTS_VOICE) ? DEFAULT_TTS_VOICE : (allowedVoices[0] || DEFAULT_TTS_VOICE));
    const voicePool = Array.isArray(rawConfig?.voicePool)
        ? Array.from(new Set(rawConfig.voicePool.map((item) => String(item || '').trim()).filter((item) => allowedVoices.includes(item))))
        : [];
    const requestedMode = String(rawConfig?.mode || '').trim();
    const enabled = Boolean(rawConfig?.enabled) && requestedMode === 'shuffle_round_robin' && voicePool.length > 0;
    return {
        enabled,
        mode: enabled ? 'shuffle_round_robin' : 'fixed',
        model,
        fixedVoice,
        voicePool,
        resolvedPool: enabled ? voicePool : [fixedVoice]
    };
};

const wsDataToBuffer = async (data) => {
    if (!data) return null;
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (typeof Blob !== 'undefined' && data instanceof Blob) return Buffer.from(await data.arrayBuffer());
    if (typeof data === 'string') return null;
    return null;
};

const synthesizeDashscopeSpeech = async ({ apiKey, model, voice, format, text }) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { audioUrl: null, debug: { status: 'skipped', reason: 'empty-text' } };
    return new Promise((resolve, reject) => {
        const taskId = randomUUID();
        const chunks = [];
        let settled = false;
        let continued = false;
        const timeoutId = setTimeout(() => {
            fail(new Error('Alibaba TTS timeout'));
        }, TTS_CONNECT_TIMEOUT_MS);
        const cleanup = () => {
            clearTimeout(timeoutId);
            try {
                ws.close();
            } catch {}
        };
        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
        };
        const succeed = () => {
            if (settled) return;
            settled = true;
            cleanup();
            const audioBuffer = Buffer.concat(chunks);
            if (audioBuffer.length < 1) {
                reject(new Error('Alibaba TTS returned empty audio'));
                return;
            }
            const mimeType = String(format || DEFAULT_TTS_FORMAT).toLowerCase() === 'wav' ? 'audio/wav' : 'audio/mpeg';
            resolve({
                audioUrl: `data:${mimeType};base64,${audioBuffer.toString('base64')}`,
                debug: {
                    status: 'ok',
                    provider: 'aliyun',
                    endpoint: DASHSCOPE_TTS_WS_URL,
                    model,
                    voice,
                    format,
                    taskId,
                    bytes: audioBuffer.length,
                    textLength: trimmed.length
                }
            });
        };
        const ws = new WebSocket(DASHSCOPE_TTS_WS_URL, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            handshakeTimeout: TTS_CONNECT_TIMEOUT_MS
        });
        ws.binaryType = 'arraybuffer';
        ws.on('open', () => {
            ws.send(JSON.stringify({
                header: {
                    action: 'run-task',
                    task_id: taskId,
                    streaming: 'duplex'
                },
                payload: {
                    task_group: 'audio',
                    task: 'tts',
                    function: 'SpeechSynthesizer',
                    model,
                    parameters: {
                        text_type: 'PlainText',
                        voice,
                        format: String(format || DEFAULT_TTS_FORMAT).trim() || DEFAULT_TTS_FORMAT
                    },
                    input: {}
                }
            }));
        });
        ws.on('message', (data, isBinary) => {
            void (async () => {
                const maybeBuffer = isBinary ? await wsDataToBuffer(data) : null;
                if (maybeBuffer) {
                    chunks.push(maybeBuffer);
                    return;
                }
                const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '');
                if (!raw) return;
                let payload = null;
                try {
                    payload = JSON.parse(raw);
                } catch {
                    return;
                }
                const eventName = String(payload?.header?.event || payload?.header?.name || payload?.header?.status || payload?.event || payload?.type || '').toLowerCase();
                const errorMessage = payload?.header?.error_message || payload?.payload?.error?.message || payload?.message || '';
                if (eventName.includes('failed') || errorMessage) {
                    fail(new Error(String(errorMessage || 'Alibaba TTS failed')));
                    return;
                }
                if (!continued && eventName.includes('started')) {
                    continued = true;
                    ws.send(JSON.stringify({
                        header: {
                            action: 'continue-task',
                            task_id: taskId,
                            streaming: 'duplex'
                        },
                        payload: {
                            input: { text: trimmed }
                        }
                    }));
                    ws.send(JSON.stringify({
                        header: {
                            action: 'finish-task',
                            task_id: taskId,
                            streaming: 'duplex'
                        },
                        payload: {
                            input: {}
                        }
                    }));
                    return;
                }
                if (eventName.includes('finished')) {
                    succeed();
                }
            })().catch((error) => fail(error));
        });
        ws.on('error', (error) => fail(new Error(`Alibaba TTS websocket error: ${String(error?.message || 'unknown')}`)));
        ws.on('close', (code) => {
            if (settled) return;
            if (chunks.length > 0) {
                succeed();
                return;
            }
            fail(new Error(`Alibaba TTS websocket closed (${code})`));
        });
    });
};

const synthesizeDashscopeSpeechWithFallback = async ({ apiKey, model, voice, format, text }) => {
    const candidates = [String(model || '').trim() || DEFAULT_TTS_MODEL, ...(TTS_MODEL_FALLBACKS[String(model || '').trim()] || [])]
        .filter(Boolean)
        .filter((item, index, arr) => arr.indexOf(item) === index);
    let lastError = null;
    for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        try {
            const result = await synthesizeDashscopeSpeech({ apiKey, model: candidate, voice, format, text });
            return { ...result, debug: { ...(result.debug || {}), triedModels: candidates.slice(0, i + 1) } };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Alibaba TTS failed');
};

const createVoicePicker = (voiceConfig) => {
    const normalized = normalizeVoiceConfig(voiceConfig);
    const basePool = normalized.resolvedPool.length > 0 ? normalized.resolvedPool : [normalized.fixedVoice || DEFAULT_TTS_VOICE];
    let queue = [];
    let index = 0;
    const refill = () => {
        queue = basePool.length > 1 ? shuffleArray(basePool) : basePool.slice();
        index = 0;
    };
    refill();
    return {
        config: normalized,
        next() {
            if (queue.length < 1 || index >= queue.length) refill();
            const voice = String(queue[index] || normalized.fixedVoice || DEFAULT_TTS_VOICE);
            index += 1;
            return voice;
        }
    };
};

const normalizeTimingConfig = (rawConfig) => {
    const targetDurationSec = Math.max(5, Math.min(900, Number(rawConfig?.targetDurationSec) || DEFAULT_CSV_TARGET_DURATION_SEC));
    return {
        enabled: Boolean(rawConfig?.enabled),
        targetDurationSec
    };
};

const estimateSpeechDurationSec = (text, ttsLang) => {
    const content = String(text || '').trim();
    if (!content) return 0;
    const lang = String(ttsLang || '').trim().toLowerCase();
    if (lang.startsWith('zh') || hasCjk(content)) {
        const chars = (content.match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length;
        const punctuation = (content.match(/[，。；：！？,.!?]/g) || []).length;
        return Math.max(1.2, (chars / 4.4) + (punctuation * 0.18));
    }
    const words = content.split(/\s+/).filter(Boolean).length;
    const punctuation = (content.match(/[,.!?;:]/g) || []).length;
    return Math.max(1.2, (words / 2.8) + (punctuation * 0.12));
};

const roundDurationMs = (value, minValue, maxValue) => {
    return Math.max(minValue, Math.min(maxValue, Math.round(value / 50) * 50));
};

const timingSummaryFromError = (error, fallbackTargetDurationSec = DEFAULT_CSV_TARGET_DURATION_SEC) => {
    const direct = error && typeof error === 'object' ? error.timingSummary : null;
    if (direct && typeof direct === 'object') return direct;
    const message = String(error?.message || error || '');
    const match = message.match(/Target duration\s+([0-9.]+)s\s+is too short\. Minimum achievable is\s+([0-9.]+)s/i);
    if (!match) return null;
    return {
        enabled: true,
        targetDurationSec: Number(match[1]) || fallbackTargetDurationSec,
        minimumAchievableSec: Number(match[2]) || null,
        estimatedDurationSec: null
    };
};

const buildTimingPlan = ({ planSteps, poiRowsById, moveContents, timingConfig }) => {
    const normalized = normalizeTimingConfig(timingConfig);
    if (!normalized.enabled) {
        return {
            enabled: false,
            targetDurationSec: normalized.targetDurationSec,
            estimatedDurationSec: null,
            stepTiming: new Map()
        };
    }

    const stepDetails = [];
    for (let i = 0; i < planSteps.length; i += 1) {
        const step = planSteps[i];
        const poiRow = poiRowsById.get(step.poiId);
        if (!poiRow) continue;
        const prevStep = i > 0 ? planSteps[i - 1] : null;
        const prevRow = prevStep ? (poiRowsById.get(prevStep.poiId) || null) : null;
        const content = step.action === 'MOVE'
            ? String(moveContents.get(i + 1) || poiRow.content || '')
            : String(poiRow.content || '');
        const ttsLang = inferTtsLang({ ttsLang: poiRow.tts_lang, poiName: poiRow.poi_name, content });
        const speechSec = estimateSpeechDurationSec(content, ttsLang);
        const distanceM = step.action === 'MOVE' ? (moveDistanceMeters(prevRow, poiRow) || 0) : 0;
        const minMoveSec = step.action === 'MOVE'
            ? (distanceM / CSV_TIMING_MAX_MOVE_SPEED)
            : 0.26;
        const maxMoveSec = step.action === 'MOVE'
            ? (distanceM / CSV_TIMING_MIN_MOVE_SPEED)
            : 0.26;
        const minDwellMs = step.action === 'MOVE' ? CSV_TIMING_MIN_MOVE_DWELL_MS : CSV_TIMING_MIN_LOOK_DWELL_MS;
        const maxDwellMs = step.action === 'MOVE' ? CSV_TIMING_MAX_MOVE_DWELL_MS : CSV_TIMING_MAX_LOOK_DWELL_MS;
        const minStepSec = step.action === 'MOVE'
            ? (minMoveSec + minDwellMs / 1000)
            : Math.max(minMoveSec + minDwellMs / 1000, speechSec);
        const maxStepSec = step.action === 'MOVE'
            ? (maxMoveSec + maxDwellMs / 1000)
            : Math.max(maxMoveSec + maxDwellMs / 1000, speechSec);
        stepDetails.push({
            index: i,
            step,
            distanceM,
            speechSec,
            minMoveSec,
            maxMoveSec,
            minDwellMs,
            maxDwellMs,
            minStepSec,
            maxStepSec
        });
    }

    const minTotalSec = stepDetails.reduce((sum, item) => sum + item.minStepSec, 0);
    if (minTotalSec > normalized.targetDurationSec + 0.05) {
        const error = new Error(`Target duration ${normalized.targetDurationSec}s is too short. Minimum achievable is ${minTotalSec.toFixed(1)}s.`);
        error.timingSummary = {
            enabled: true,
            targetDurationSec: normalized.targetDurationSec,
            minimumAchievableSec: Number(minTotalSec.toFixed(2)),
            estimatedDurationSec: null
        };
        throw error;
    }

    let extraBudgetSec = Math.max(0, normalized.targetDurationSec - minTotalSec);
    const slackTotalSec = stepDetails.reduce((sum, item) => sum + Math.max(0, item.maxStepSec - item.minStepSec), 0);
    const stepTiming = new Map();

    stepDetails.forEach((item) => {
        const slackSec = Math.max(0, item.maxStepSec - item.minStepSec);
        const allocatedExtraSec = slackTotalSec > 0 ? (extraBudgetSec * (slackSec / slackTotalSec)) : 0;
        const targetStepSec = Math.min(item.maxStepSec, item.minStepSec + allocatedExtraSec);
        let moveSec = item.minMoveSec;
        let dwellMs = item.minDwellMs;
        if (item.step.action === 'MOVE') {
            const targetMovePlusDwellSec = Math.max(targetStepSec, item.minMoveSec + item.minDwellMs / 1000);
            dwellMs = roundDurationMs(
                Math.min(item.maxDwellMs, Math.max(item.minDwellMs, (targetMovePlusDwellSec - item.minMoveSec) * 1000)),
                item.minDwellMs,
                item.maxDwellMs
            );
            const remainingMoveSec = Math.max(item.minMoveSec, targetMovePlusDwellSec - dwellMs / 1000);
            moveSec = Math.min(item.maxMoveSec, Math.max(item.minMoveSec, remainingMoveSec));
        } else {
            const desiredMovePlusDwellSec = Math.max(item.speechSec, targetStepSec);
            dwellMs = roundDurationMs(
                Math.min(item.maxDwellMs, Math.max(item.minDwellMs, (desiredMovePlusDwellSec - item.minMoveSec) * 1000)),
                item.minDwellMs,
                item.maxDwellMs
            );
            moveSec = item.minMoveSec;
        }
        const moveSpeedMps = item.step.action === 'MOVE' && item.distanceM > 0.001
            ? Math.max(CSV_TIMING_MIN_MOVE_SPEED, Math.min(CSV_TIMING_MAX_MOVE_SPEED, item.distanceM / Math.max(moveSec, 0.01)))
            : Number(toNum(poiRowsById.get(item.step.poiId)?.move_speed_mps, 0.8));
        const realizedStepSec = item.step.action === 'MOVE'
            ? moveSec + dwellMs / 1000
            : Math.max(moveSec + dwellMs / 1000, item.speechSec);
        stepTiming.set(item.index, {
            moveSpeedMps,
            dwellMs,
            estimatedStepSec: realizedStepSec,
            speechSec: item.speechSec,
            distanceM: item.distanceM
        });
    });

    const estimatedDurationSec = Array.from(stepTiming.values()).reduce((sum, item) => sum + item.estimatedStepSec, 0);
    return {
        enabled: true,
        targetDurationSec: normalized.targetDurationSec,
        minimumAchievableSec: Number(minTotalSec.toFixed(2)),
        estimatedDurationSec,
        stepTiming
    };
};

const moveDirectionLabel = (dx, dz, language) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
        return language === 'zh-CN' ? '前方' : 'ahead';
    }
    const angleDeg = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    if (language === 'zh-CN') {
        if (angleDeg >= 337.5 || angleDeg < 22.5) return '前方';
        if (angleDeg < 67.5) return '右前方';
        if (angleDeg < 112.5) return '右侧';
        if (angleDeg < 157.5) return '右后方';
        if (angleDeg < 202.5) return '后方';
        if (angleDeg < 247.5) return '左后方';
        if (angleDeg < 292.5) return '左侧';
        return '左前方';
    }
    if (angleDeg >= 337.5 || angleDeg < 22.5) return 'ahead';
    if (angleDeg < 67.5) return 'front-right';
    if (angleDeg < 112.5) return 'to the right';
    if (angleDeg < 157.5) return 'back-right';
    if (angleDeg < 202.5) return 'behind';
    if (angleDeg < 247.5) return 'back-left';
    if (angleDeg < 292.5) return 'to the left';
    return 'front-left';
};

const moveDistanceMeters = (fromRow, toRow) => {
    if (!fromRow || !toRow) return null;
    const dx = toNum(toRow.target_x, 0) - toNum(fromRow.target_x, 0);
    const dy = toNum(toRow.target_y, 0) - toNum(fromRow.target_y, 0);
    const dz = toNum(toRow.target_z, 0) - toNum(fromRow.target_z, 0);
    return Math.hypot(dx, dy, dz);
};

const buildMoveFallbackContent = ({ fromName, toName, distanceM, direction, language }) => {
    const clampedDistance = Number.isFinite(distanceM) ? Math.max(0, distanceM) : null;
    const readableDistance = clampedDistance === null ? null : Number(clampedDistance.toFixed(1));
    if (language === 'zh-CN') {
        if (!fromName) {
            return readableDistance === null
                ? `我们从起点前往${toName}。`
                : `我们从起点前往${toName}，向${direction}移动约${readableDistance}米。`;
        }
        if ((readableDistance ?? 0) < 0.4) {
            return `我们在${toName}附近小幅调整到最佳观察位置。`;
        }
        return readableDistance === null
            ? `我们从${fromName}前往${toName}。`
            : `我们从${fromName}前往${toName}，向${direction}移动约${readableDistance}米。`;
    }
    if (!fromName) {
        return readableDistance === null
            ? `We move from the start point to ${toName}.`
            : `We move from the start point to ${toName}, heading ${direction} for about ${readableDistance} meters.`;
    }
    if ((readableDistance ?? 0) < 0.4) {
        return `We make a small adjustment near ${toName} for a better viewpoint.`;
    }
    return readableDistance === null
        ? `We move from ${fromName} to ${toName}.`
        : `We move from ${fromName} to ${toName}, heading ${direction} for about ${readableDistance} meters.`;
};

const normalizeMoveNarratives = (payload) => {
    const arr = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.moves) ? payload.moves : []);
    const map = new Map();
    arr.forEach((item) => {
        const seq = Number(item?.seq ?? item?.step ?? item?.index);
        const content = String(item?.content || '').trim();
        if (!Number.isFinite(seq) || seq < 1 || !content) return;
        map.set(seq, content);
    });
    return map;
};

const parseDataUrl = (dataUrl) => {
    const raw = String(dataUrl || '').trim();
    const m = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
    if (!m) return { mime: null, base64: null };
    return { mime: m[1] || 'image/png', base64: m[2] || null };
};

const describeErrorCause = (error) => {
    const source = error?.cause && typeof error.cause === 'object' ? error.cause : error;
    if (!source || typeof source !== 'object') return null;
    const detail = {
        name: source.name || null,
        message: source.message || null,
        code: source.code || null,
        errno: source.errno || null,
        syscall: source.syscall || null,
        hostname: source.hostname || null,
        address: source.address || null,
        port: source.port || null
    };
    const compact = Object.fromEntries(Object.entries(detail).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    if (Object.keys(compact).length < 1) return null;
    return JSON.stringify(compact);
};

const sanitizePromptRequestBody = (body, imageMeta = null) => {
    const cloned = JSON.parse(JSON.stringify(body || {}));
    const replaceImageEntry = (entry, meta) => {
        if (entry?.inline_data) {
            return {
                inline_data: {
                    mime_type: entry.inline_data.mime_type || meta?.mime || 'image/png',
                    data: '<omitted-base64>'
                }
            };
        }
        if (entry?.image_url?.url && String(entry.image_url.url).startsWith('data:')) {
            return {
                ...entry,
                image_url: {
                    url: '<omitted-data-url>',
                    mime_type: meta?.mime || null,
                    bytes: meta?.bytes || 0,
                    sha256: meta?.sha256 || null
                }
            };
        }
        return entry;
    };
    const parts = cloned?.contents?.[0]?.parts;
    if (Array.isArray(parts)) {
        for (let i = 0; i < parts.length; i += 1) {
            const meta = Array.isArray(imageMeta) ? imageMeta[i - 1] || imageMeta[i] || null : imageMeta;
            parts[i] = replaceImageEntry(parts[i], meta);
        }
    }
    const messages = cloned?.messages;
    if (Array.isArray(messages)) {
        let imageIdx = 0;
        for (const message of messages) {
            if (!Array.isArray(message?.content)) continue;
            for (let i = 0; i < message.content.length; i += 1) {
                const entry = message.content[i];
                const meta = Array.isArray(imageMeta) ? imageMeta[imageIdx] || null : imageMeta;
                const next = replaceImageEntry(entry, meta);
                message.content[i] = next;
                if (entry?.image_url?.url || entry?.inline_data) imageIdx += 1;
            }
        }
    }
    return cloned;
};

const imageDigest = (dataUrl) => {
    const decoded = decodeDataUrl(dataUrl);
    const blob = decoded.blob;
    if (!blob || !blob.length) {
        return { mime: decoded.mime || null, bytes: 0, sha256: null };
    }
    return {
        mime: decoded.mime || 'image/png',
        bytes: blob.length,
        sha256: createHash('sha256').update(blob).digest('hex')
    };
};

const extractGeminiText = (json) => {
    const c = json?.candidates?.[0];
    const parts = c?.content?.parts;
    if (Array.isArray(parts)) {
        const text = parts.map((p) => String(p?.text || '')).join('');
        if (text.trim()) return text;
    }
    if (typeof c?.output === 'string' && c.output.trim()) return c.output;
    if (typeof json?.text === 'string' && json.text.trim()) return json.text;
    return '';
};

const readSseStream = async (response, onData) => {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepMatch = buffer.match(/\r?\n\r?\n/);
        while (sepMatch) {
            const idx = Number(sepMatch.index || 0);
            const sepLen = sepMatch[0].length;
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + sepLen);
            const lines = frame.split(/\r?\n/);
            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                onData(payload);
            }
            sepMatch = buffer.match(/\r?\n\r?\n/);
        }
    }
};

const callOpenAI = async ({
    model,
    apiKey,
    prompt,
    poiName,
    screenshotDataUrl,
    onChunk,
    onRequestPayload,
    onRawFrame,
    appendLanguageInstruction = true,
    systemInstruction = 'You are a professional tour narration assistant.',
    providerName = 'openai',
    endpoint = 'https://api.openai.com/v1/chat/completions',
    requestBodyOverride = null,
    requestImageMetas = null
}) => {
    const userText = appendLanguageInstruction
        ? `${prompt}\n${languageInstruction(poiName)}`
        : String(prompt || '');
    const content = [{ type: 'text', text: userText }];
    if (screenshotDataUrl) content.push({ type: 'image_url', image_url: { url: screenshotDataUrl } });
    const messages = [];
    if (String(systemInstruction || '').trim()) {
        messages.push({ role: 'system', content: String(systemInstruction) });
    }
    messages.push({ role: 'user', content });
    const requestBody = requestBodyOverride || {
        model,
        stream: true,
        temperature: 0.7,
        max_tokens: 1400,
        messages
    };
    const imageMeta = requestImageMetas || imageDigest(screenshotDataUrl);
    if (typeof onRequestPayload === 'function') {
        onRequestPayload({
            provider: providerName,
            endpoint,
            requestBody: sanitizePromptRequestBody(requestBody, imageMeta),
            hasImage: Array.isArray(imageMeta) ? imageMeta.length > 0 : Boolean(screenshotDataUrl),
            imageMime: Array.isArray(imageMeta) ? null : imageMeta.mime,
            imageBytes: Array.isArray(imageMeta) ? imageMeta.reduce((sum, item) => sum + Number(item?.bytes || 0), 0) : imageMeta.bytes,
            imageSha256: Array.isArray(imageMeta) ? null : imageMeta.sha256,
            imageCount: Array.isArray(imageMeta) ? imageMeta.length : (screenshotDataUrl ? 1 : 0),
            imageMetas: Array.isArray(imageMeta) ? imageMeta : [imageMeta]
        });
    }
    let response;
    try {
        response = await fetchWithLlmDispatcher(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
    } catch (fetchError) {
        const error = new Error(`${providerName} fetch failed: ${String(fetchError?.message || fetchError)}`);
        error.provider = providerName;
        error.endpoint = endpoint;
        error.status = null;
        error.requestId = null;
        error.errorCause = describeErrorCause(fetchError);
        throw error;
    }
    const requestId = response.headers.get('x-request-id') || response.headers.get('request-id') || null;
    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        const error = new Error(`${providerName} ${response.status}: ${errText.slice(0, 240)}`);
        error.provider = providerName;
        error.endpoint = endpoint;
        error.status = response.status;
        error.requestId = requestId;
        error.rawResponse = errText;
        throw error;
    }
    let text = '';
    let chunkCount = 0;
    let finishReason = null;
    await readSseStream(response, (payload) => {
        if (typeof onRawFrame === 'function') onRawFrame(payload);
        try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (json?.choices?.[0]?.finish_reason) finishReason = json.choices[0].finish_reason;
            if (typeof delta === 'string' && delta) {
                text += delta;
                chunkCount += 1;
                onChunk({
                    text: delta,
                    chunkIndex: chunkCount,
                    chunkChars: delta.length,
                    contentCharsSoFar: text.length
                });
            }
        } catch {
            // ignore malformed chunk
        }
    });
    return {
        text: text.trim(),
        provider: providerName,
        endpoint,
        status: response.status,
        requestId,
        chunkCount,
        finishReason,
        usageMetadata: null
    };
};

const callGemini = async ({
    model,
    apiKey,
    prompt,
    poiName,
    screenshotDataUrl,
    onChunk,
    onRequestPayload,
    onRawFrame,
    responseMimeType,
    appendLanguageInstruction = true
}) => {
    const { mime, base64 } = parseDataUrl(screenshotDataUrl);
    const imageMeta = imageDigest(screenshotDataUrl);
    const promptText = appendLanguageInstruction
        ? `${prompt}\n${languageInstruction(poiName)}`
        : String(prompt || '');
    const parts = [{ text: promptText }];
    if (base64) {
        parts.push({ inline_data: { mime_type: mime || 'image/png', data: base64 } });
    }
    const endpointBase = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`;
    const requestUrl = `${endpointBase}?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const thinkingConfig = geminiThinkingConfig(model);
    const generationConfig = {
        temperature: 0.7,
        maxOutputTokens: geminiMaxOutputTokens(model),
        ...(String(responseMimeType || '').trim() ? { responseMimeType: String(responseMimeType).trim() } : {}),
        ...(thinkingConfig ? { thinkingConfig } : {})
    };
    const requestBody = {
        contents: [{ role: 'user', parts }],
        generationConfig
    };
    if (typeof onRequestPayload === 'function') {
        onRequestPayload({
            provider: 'gemini',
            endpoint: endpointBase,
            requestBody: sanitizePromptRequestBody(requestBody, imageMeta),
            hasImage: Boolean(base64),
            imageMime: imageMeta.mime,
            imageBytes: imageMeta.bytes,
            imageSha256: imageMeta.sha256
        });
    }
    let response;
    try {
        response = await fetchWithLlmDispatcher(requestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream'
            },
            body: JSON.stringify(requestBody)
        });
    } catch (fetchError) {
        const error = new Error(`Gemini fetch failed: ${String(fetchError?.message || fetchError)}`);
        error.provider = 'gemini';
        error.endpoint = endpointBase;
        error.status = null;
        error.requestId = null;
        error.errorCause = describeErrorCause(fetchError);
        throw error;
    }
    const requestId = response.headers.get('x-request-id') || response.headers.get('x-guploader-uploadid') || null;
    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        const error = new Error(`Gemini ${response.status}: ${errText.slice(0, 240)}`);
        error.provider = 'gemini';
        error.endpoint = endpointBase;
        error.status = response.status;
        error.requestId = requestId;
        error.rawResponse = errText;
        throw error;
    }
    let text = '';
    let chunkCount = 0;
    let finishReason = null;
    let usageMetadata = null;
    let lastFramePreview = '';
    await readSseStream(response, (payload) => {
        if (typeof onRawFrame === 'function') onRawFrame(payload);
        try {
            const json = JSON.parse(payload);
            lastFramePreview = JSON.stringify(json).slice(0, 240);
            const frameFinish = json?.candidates?.[0]?.finishReason || null;
            if (frameFinish) finishReason = frameFinish;
            if (json?.usageMetadata) usageMetadata = json.usageMetadata;
            const frameText = String(extractGeminiText(json) || '');
            if (!frameText) return;
            const delta = frameText.startsWith(text) ? frameText.slice(text.length) : frameText;
            if (!delta) return;
            text += delta;
            chunkCount += 1;
            onChunk({
                text: delta,
                chunkIndex: chunkCount,
                chunkChars: delta.length,
                contentCharsSoFar: text.length
            });
        } catch {
            // ignore malformed chunk
        }
    });
    text = text.trim();
    if (!text) {
        const error = new Error(`Gemini empty response: ${lastFramePreview}`);
        error.provider = 'gemini';
        error.endpoint = endpointBase;
        error.status = response.status;
        error.requestId = requestId;
        error.finishReason = finishReason;
        error.usageMetadata = usageMetadata;
        throw error;
    }
    return {
        text,
        provider: 'gemini',
        endpoint: endpointBase,
        status: response.status,
        requestId,
        chunkCount,
        finishReason,
        usageMetadata
    };
};

const callQwen = async ({
    model,
    apiKey,
    prompt,
    poiName,
    screenshotDataUrl,
    onChunk,
    onRequestPayload,
    onRawFrame,
    appendLanguageInstruction = true,
    systemInstruction
}) => {
    return callOpenAI({
        model,
        apiKey,
        prompt,
        poiName,
        screenshotDataUrl,
        onChunk,
        onRequestPayload,
        onRawFrame,
        appendLanguageInstruction,
        systemInstruction,
        providerName: 'qwen',
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    });
};

const callRealLlm = async ({
    provider,
    model,
    apiKey,
    prompt,
    poiName,
    screenshotDataUrl,
    onChunk,
    onRequestPayload,
    onRawFrame,
    responseMimeType,
    appendLanguageInstruction = true,
    systemInstruction
}) => {
    const resolvedProvider = resolveLlmProvider({ provider, model });
    if (resolvedProvider === 'gemini') {
        return callGemini({
            model,
            apiKey,
            prompt,
            poiName,
            screenshotDataUrl,
            onChunk,
            onRequestPayload,
            onRawFrame,
            responseMimeType,
            appendLanguageInstruction
        });
    }
    if (resolvedProvider === 'qwen') {
        return callQwen({
            model,
            apiKey,
            prompt,
            poiName,
            screenshotDataUrl,
            onChunk,
            onRequestPayload,
            onRawFrame,
            appendLanguageInstruction,
            systemInstruction
        });
    }
    return callOpenAI({
        model,
        apiKey,
        prompt,
        poiName,
        screenshotDataUrl,
        onChunk,
        onRequestPayload,
        onRawFrame,
        responseMimeType,
        appendLanguageInstruction,
        systemInstruction,
        providerName: 'openai',
        endpoint: 'https://api.openai.com/v1/chat/completions'
    });
};

const callOpenAIMultimodal = async ({
    model,
    apiKey,
    prompt,
    imageDataUrls = [],
    onChunk,
    onRequestPayload,
    onRawFrame,
    systemInstruction = 'You are a professional cinematic planning assistant.',
    providerName = 'openai',
    endpoint = 'https://api.openai.com/v1/chat/completions'
}) => {
    const content = [{ type: 'text', text: String(prompt || '') }];
    imageDataUrls.filter(Boolean).forEach((url) => {
        content.push({ type: 'image_url', image_url: { url } });
    });
    const messages = [];
    if (String(systemInstruction || '').trim()) messages.push({ role: 'system', content: String(systemInstruction) });
    messages.push({ role: 'user', content });
    const requestBody = {
        model,
        stream: true,
        temperature: 0.4,
        max_tokens: 3200,
        messages
    };
    const imageMetas = imageDataUrls.filter(Boolean).map((url) => imageDigest(url));
    if (typeof onRequestPayload === 'function') {
        onRequestPayload({
            provider: providerName,
            endpoint,
            requestBody: sanitizePromptRequestBody(requestBody, imageMetas),
            imageCount: imageMetas.length,
            imageMetas
        });
    }
    return callOpenAI({
        model,
        apiKey,
        prompt,
        poiName: 'cinematic_multimodal',
        screenshotDataUrl: '',
        onChunk,
        onRequestPayload: null,
        onRawFrame,
        appendLanguageInstruction: false,
        systemInstruction,
        providerName,
        endpoint,
        requestBodyOverride: requestBody,
        requestImageMetas: imageMetas
    });
};

const callGeminiMultimodal = async ({
    model,
    apiKey,
    prompt,
    imageDataUrls = [],
    onChunk,
    onRequestPayload,
    onRawFrame,
    responseMimeType,
    systemInstruction = ''
}) => {
    const parts = [];
    if (String(systemInstruction || '').trim()) parts.push({ text: String(systemInstruction) });
    parts.push({ text: String(prompt || '') });
    const imageMetas = [];
    imageDataUrls.filter(Boolean).forEach((url) => {
        const { mime, base64 } = parseDataUrl(url);
        if (!base64) return;
        imageMetas.push(imageDigest(url));
        parts.push({ inline_data: { mime_type: mime || 'image/png', data: base64 } });
    });
    const endpointBase = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`;
    const requestUrl = `${endpointBase}?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const thinkingConfig = geminiThinkingConfig(model);
    const generationConfig = {
        temperature: 0.4,
        maxOutputTokens: geminiMaxOutputTokens(model),
        ...(String(responseMimeType || '').trim() ? { responseMimeType: String(responseMimeType).trim() } : {}),
        ...(thinkingConfig ? { thinkingConfig } : {})
    };
    const requestBody = {
        contents: [{ role: 'user', parts }],
        generationConfig
    };
    if (typeof onRequestPayload === 'function') {
        onRequestPayload({
            provider: 'gemini',
            endpoint: endpointBase,
            requestBody: sanitizePromptRequestBody(requestBody, imageMetas),
            imageCount: imageMetas.length,
            imageMetas
        });
    }
    let response;
    try {
        response = await fetchWithLlmDispatcher(requestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify(requestBody)
        });
    } catch (fetchError) {
        const error = new Error(`Gemini fetch failed: ${String(fetchError?.message || fetchError)}`);
        error.provider = 'gemini';
        error.endpoint = endpointBase;
        error.status = null;
        error.requestId = null;
        error.errorCause = describeErrorCause(fetchError);
        throw error;
    }
    const requestId = response.headers.get('x-request-id') || response.headers.get('x-guploader-uploadid') || null;
    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        const error = new Error(`Gemini ${response.status}: ${errText.slice(0, 240)}`);
        error.provider = 'gemini';
        error.endpoint = endpointBase;
        error.status = response.status;
        error.requestId = requestId;
        error.rawResponse = errText;
        throw error;
    }
    let text = '';
    let chunkCount = 0;
    let finishReason = null;
    let usageMetadata = null;
    await readSseStream(response, (payload) => {
        if (typeof onRawFrame === 'function') onRawFrame(payload);
        try {
            const json = JSON.parse(payload);
            const frameFinish = json?.candidates?.[0]?.finishReason || null;
            if (frameFinish) finishReason = frameFinish;
            if (json?.usageMetadata) usageMetadata = json.usageMetadata;
            const frameText = String(extractGeminiText(json) || '');
            if (!frameText) return;
            const delta = frameText.startsWith(text) ? frameText.slice(text.length) : frameText;
            if (!delta) return;
            text += delta;
            chunkCount += 1;
            onChunk?.({ text: delta, chunkIndex: chunkCount, chunkChars: delta.length, contentCharsSoFar: text.length });
        } catch {}
    });
    return { text: text.trim(), provider: 'gemini', endpoint: endpointBase, status: response.status, requestId, chunkCount, finishReason, usageMetadata };
};

const callRealLlmMultimodal = async ({
    provider,
    model,
    apiKey,
    prompt,
    imageDataUrls = [],
    onChunk,
    onRequestPayload,
    onRawFrame,
    responseMimeType,
    systemInstruction
}) => {
    const resolvedProvider = resolveLlmProvider({ provider, model });
    if (resolvedProvider === 'gemini') {
        return callGeminiMultimodal({ model, apiKey, prompt, imageDataUrls, onChunk, onRequestPayload, onRawFrame, responseMimeType, systemInstruction });
    }
    if (resolvedProvider === 'qwen') {
        return callOpenAIMultimodal({ model, apiKey, prompt, imageDataUrls, onChunk, onRequestPayload, onRawFrame, systemInstruction, providerName: 'qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' });
    }
    return callOpenAIMultimodal({ model, apiKey, prompt, imageDataUrls, onChunk, onRequestPayload, onRawFrame, systemInstruction, providerName: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions' });
};

const csvExportJobStore = new Map();
const csvExportSseStore = new Map();
const csvExportEventHistoryStore = new Map();
const cinematicJobStore = new Map();
const cinematicSseStore = new Map();
const cinematicEventHistoryStore = new Map();

const pushCinematicEventHistory = (jobId, event, payload) => {
    if (!cinematicEventHistoryStore.has(jobId)) cinematicEventHistoryStore.set(jobId, []);
    const arr = cinematicEventHistoryStore.get(jobId);
    arr.push({ event, payload });
    if (arr.length > 400) arr.splice(0, arr.length - 400);
};

const sendCinematicSse = (jobId, event, payload, storeHistory = true) => {
    if (storeHistory) pushCinematicEventHistory(jobId, event, payload);
    const clients = cinematicSseStore.get(jobId);
    if (!clients) return;
    const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((res) => {
        if (!res.writableEnded) res.write(body);
    });
};

const DEFAULT_CINEMATIC_PROMPT_PROMPT = `你是电影级运镜提示词设计师。
请将用户给出的简单需求，改写为专业的复杂运镜提示词。

要求：
1. 输出中文。
2. 只输出最终复杂提示词，不要解释。
3. 提示词应覆盖：空间关系、镜头目标、镜头语言、节奏变化、情绪氛围、连续运镜约束、结尾收束方式。
4. 明确这是一个可编辑的连续 Cinematic Timeline 规划任务。
5. 要求模型输出时重点关注可落地的 shot 划分与 keyframe 设计。
6. 如果用户提到了 3D Media Object / 天幕 / 视频屏 / 空屏占位，需要在复杂提示词里明确：它位于哪里、在哪个关键帧附近出现、后续镜头如何围绕它推进、侧移、掠过或回望。
7. 如果用户没有提到 3D Media Object，则不要额外添加该需求。`;

const DEFAULT_CINEMATIC_TIMELINE_PROMPT = `你是电影级连续运镜设计师。
请根据用户提供的专业复杂提示词、总时长、POI 图像、POI 文本描述、POI 坐标与姿态、统一运镜范围，生成一个可编辑的 Cinematic Timeline JSON。

输出要求：
1. 只输出 JSON，不要解释，不要 Markdown。
2. 顶层结构必须包含：version, targetDurationSec, shots。
3. shots 是数组，每个 shot 必须包含：shotId, label, intent, durationSec, speechText, speechMode, keyframes。
4. 每个 keyframe 必须包含：keyframeId, t, x, y, z, yaw, pitch, fov, moveSpeedMps。
5. t 范围必须在 0 到 1 之间，且每个 shot 至少 2 个 keyframe，建议 3 到 5 个。
6. 所有 keyframe 必须落在统一 bounding box 范围内。
7. 运镜必须连续、可预览、可编辑，不要跳切。
8. 输出内容使用中文 label 和 speechText。
9. speechMode 仅允许 INTERRUPTIBLE 或 BLOCKING。
10. 如果复杂提示词明确要求 3D Media Object，则允许在 keyframe 中输出 mediaObject 字段，字段可包含：enabled, src, fileName, anchorWorld{x,y,z}, scale, yaw, pitch, roll, depthOffset, placeholder, placeholderLabel。
11. 如果提示词提到 3D Media Object 但没有视频，也可以输出空占位 placeholder，后续由前端补充视频。
12. 如果提示词要求镜头围绕 3D Media Object，请通过关键帧相机位置与姿态直接体现围绕它的飞行，不要省略关键帧位姿。
13. 可以额外输出 cameraBehavior 作为未来扩展，但当前关键帧位姿必须完整。
14. 如果复杂提示词没有提到 3D Media Object，则不要凭空生成 mediaObject。
15. 结果要适合直接填入时间轴与参数编辑器。`;

const buildCinematicBoundingBox = (pois, marginRatio = 0.1) => {
    const valid = Array.isArray(pois) ? pois.filter(Boolean) : [];
    if (valid.length < 1) {
        return {
            center: { x: 0, y: 0, z: 0 },
            marginRatio,
            xz: { xMin: -5, xMax: 5, zMin: -5, zMax: 5 },
            y: { yMin: -2, yMax: 2 }
        };
    }
    const center = valid.reduce((acc, poi) => ({
        x: acc.x + Number(toNum(poi.targetX ?? poi.x, 0)),
        y: acc.y + Number(toNum(poi.targetY ?? poi.y, 0)),
        z: acc.z + Number(toNum(poi.targetZ ?? poi.z, 0))
    }), { x: 0, y: 0, z: 0 });
    center.x /= valid.length;
    center.y /= valid.length;
    center.z /= valid.length;
    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;
    let zMin = Number.POSITIVE_INFINITY;
    let zMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY;
    let yMax = Number.NEGATIVE_INFINITY;
    valid.forEach((poi) => {
        const x = Number(toNum(poi.targetX ?? poi.x, 0));
        const y = Number(toNum(poi.targetY ?? poi.y, 0));
        const z = Number(toNum(poi.targetZ ?? poi.z, 0));
        xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
        zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    });
    const xSpan = Math.max(1, xMax - xMin);
    const zSpan = Math.max(1, zMax - zMin);
    const ySpan = Math.max(0.6, yMax - yMin);
    const xMargin = Math.max(0.5, xSpan * marginRatio);
    const zMargin = Math.max(0.5, zSpan * marginRatio);
    const yMargin = Math.max(0.2, ySpan * marginRatio);
    return {
        center: {
            x: Number(center.x.toFixed(3)),
            y: Number(center.y.toFixed(3)),
            z: Number(center.z.toFixed(3))
        },
        marginRatio,
        xz: {
            xMin: Number((xMin - xMargin).toFixed(3)),
            xMax: Number((xMax + xMargin).toFixed(3)),
            zMin: Number((zMin - zMargin).toFixed(3)),
            zMax: Number((zMax + zMargin).toFixed(3))
        },
        y: {
            yMin: Number((yMin - yMargin).toFixed(3)),
            yMax: Number((yMax + yMargin).toFixed(3))
        }
    };
};

const plannerPromptRequestsMediaObject = (text) => /3d\s*media|media object|media project|video screen|video wall|视频屏|视频幕|天幕|空屏|占位|3d媒体/i.test(String(text || ''));

const plannerPromptRequestsOrbitLikeCamera = (text) => /围绕|环绕|orbit|围着|掠过|回望|靠近.*3d\s*media|靠近.*天幕/i.test(String(text || ''));

const normalizeCameraBehavior = (input) => {
    if (!input || typeof input !== 'object') return null;
    const source = input;
    const type = String(source.type || '').trim().toLowerCase();
    if (!type) return null;
    return {
        type: ['orbit', 'approach', 'reveal', 'follow'].includes(type) ? type : 'orbit',
        target: 'mediaObject',
        radius: Number.isFinite(Number(source.radius)) ? Number(source.radius) : undefined,
        angleDeg: Number.isFinite(Number(source.angleDeg)) ? Number(source.angleDeg) : undefined,
        heightOffset: Number.isFinite(Number(source.heightOffset)) ? Number(source.heightOffset) : undefined
    };
};

const normalizeMediaObjectConfig = (input, fallbackAnchor) => {
    if (!input || typeof input !== 'object') return null;
    const source = input;
    const anchor = source.anchorWorld && Number.isFinite(Number(source.anchorWorld.x)) && Number.isFinite(Number(source.anchorWorld.y)) && Number.isFinite(Number(source.anchorWorld.z))
        ? {
            x: Number(source.anchorWorld.x),
            y: Number(source.anchorWorld.y),
            z: Number(source.anchorWorld.z)
        }
        : (fallbackAnchor || null);
    return {
        enabled: source.enabled !== false,
        src: String(source.src || '').trim(),
        fileName: String(source.fileName || '').trim(),
        anchorWorld: anchor,
        scale: clampRange(Number.isFinite(Number(source.scale)) ? Number(source.scale) : 1.8, 0.1, 120),
        yaw: Number.isFinite(Number(source.yaw)) ? Number(source.yaw) : 0,
        pitch: Number.isFinite(Number(source.pitch)) ? Number(source.pitch) : 0,
        roll: Number.isFinite(Number(source.roll)) ? Number(source.roll) : 0,
        depthOffset: clampRange(Number.isFinite(Number(source.depthOffset)) ? Number(source.depthOffset) : 0.06, -2, 2),
        placeholder: source.placeholder === true || !String(source.src || '').trim(),
        placeholderLabel: String(source.placeholderLabel || '3D Media Placeholder').trim() || '3D Media Placeholder'
    };
};

const enrichPlanWithPromptedMediaObject = (plan, plannerPrompt, pois = []) => {
    if (!plannerPromptRequestsMediaObject(plannerPrompt)) return plan;
    const hasExisting = plan.shots.some((shot) => shot.keyframes.some((kf) => kf.mediaObject && kf.mediaObject.enabled));
    if (hasExisting) return plan;
    const targetPoi = pois[Math.min(1, Math.max(0, pois.length - 1))] || pois[0] || null;
    const anchor = targetPoi
        ? {
            x: Number(toNum(targetPoi.targetX, 0)),
            y: Number(toNum(targetPoi.targetY, 0)) + 0.35,
            z: Number(toNum(targetPoi.targetZ, 0))
        }
        : null;
    const firstShot = plan.shots[0] || null;
    if (!firstShot || firstShot.keyframes.length < 2 || !anchor) return plan;
    const media = normalizeMediaObjectConfig({
        enabled: true,
        src: '',
        fileName: '',
        anchorWorld: anchor,
        scale: 2.2,
        yaw: Number(toNum(targetPoi?.targetYaw, 0)),
        pitch: 0,
        roll: 0,
        depthOffset: 0.06,
        placeholder: true,
        placeholderLabel: 'Generated 3D Media Placeholder'
    }, anchor);
    firstShot.keyframes[0].mediaObject = media;
    if (plannerPromptRequestsOrbitLikeCamera(plannerPrompt)) {
        const orbitSamples = [
            { x: anchor.x - 1.8, y: anchor.y + 0.2, z: anchor.z - 2.6, yaw: -18, pitch: -8, fov: 92 },
            { x: anchor.x, y: anchor.y + 0.35, z: anchor.z - 2.1, yaw: 0, pitch: -6, fov: 86 },
            { x: anchor.x + 1.7, y: anchor.y + 0.15, z: anchor.z - 2.45, yaw: 18, pitch: -8, fov: 92 }
        ];
        firstShot.keyframes.forEach((kf, index) => {
            const sample = orbitSamples[Math.min(index, orbitSamples.length - 1)];
            kf.x = clampRange(sample.x, plan.bounds.top.xMin, plan.bounds.top.xMax);
            kf.y = clampRange(sample.y, plan.bounds.front.yMin, plan.bounds.front.yMax);
            kf.z = clampRange(sample.z, plan.bounds.top.zMin, plan.bounds.top.zMax);
            kf.yaw = sample.yaw;
            kf.pitch = sample.pitch;
            kf.fov = sample.fov;
            kf.cameraBehavior = normalizeCameraBehavior({ type: 'orbit', target: 'mediaObject', radius: 2.4, angleDeg: sample.yaw, heightOffset: sample.y - anchor.y });
        });
        firstShot.intent = `${firstShot.intent || 'cinematic'} / 围绕3D Media Object`;
        firstShot.label = firstShot.label || '围绕3D媒体';
    }
    return plan;
};

const normalizeCinematicPlan = ({ payload, modelFilename, selectedPoiIds, sceneDescription = '', storyBackground = '', styleText = '', targetDurationSec, boundsFallback, poisById = new Map() }) => {
    const source = payload?.plan && Array.isArray(payload.plan?.shots) ? payload.plan : payload;
    const shotsInput = Array.isArray(source?.shots) ? source.shots : [];
    if (shotsInput.length < 1) throw new Error('timeline json has no shots');
    const bounds = source?.bounds && source.bounds.top && source.bounds.front ? source.bounds : {
        top: {
            xMin: boundsFallback.xz.xMin,
            xMax: boundsFallback.xz.xMax,
            zMin: boundsFallback.xz.zMin,
            zMax: boundsFallback.xz.zMax
        },
        front: {
            xMin: boundsFallback.xz.xMin,
            xMax: boundsFallback.xz.xMax,
            yMin: boundsFallback.y.yMin,
            yMax: boundsFallback.y.yMax
        }
    };
    const clampNum = (value, min, max, fallback) => clampRange(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max);
    const shots = shotsInput.map((shot, shotIndex) => {
        const shotId = String(shot?.shotId || `shot_${shotIndex + 1}`);
        const keyframesInput = Array.isArray(shot?.keyframes) ? shot.keyframes : [];
        if (keyframesInput.length < 2) throw new Error(`shot ${shotId} needs at least 2 keyframes`);
        const keyframes = keyframesInput.map((kf, keyframeIndex) => {
            const poiRef = poisById.get(String(kf?.poiId || '')) || null;
            const fallbackAnchor = poiRef ? {
                x: Number(toNum(poiRef?.targetX, boundsFallback.center.x)),
                y: Number(toNum(poiRef?.targetY, boundsFallback.center.y)),
                z: Number(toNum(poiRef?.targetZ, boundsFallback.center.z))
            } : null;
            return {
                keyframeId: String(kf?.keyframeId || `${shotId}_k${keyframeIndex + 1}`),
                shotId,
                t: clampNum(kf?.t, 0, 1, keyframesInput.length === 1 ? 0 : keyframeIndex / (keyframesInput.length - 1)),
                x: clampNum(kf?.x, bounds.top.xMin, bounds.top.xMax, Number(toNum(poiRef?.targetX, boundsFallback.center.x))),
                y: clampNum(kf?.y, bounds.front.yMin, bounds.front.yMax, Number(toNum(poiRef?.targetY, boundsFallback.center.y))),
                z: clampNum(kf?.z, bounds.top.zMin, bounds.top.zMax, Number(toNum(poiRef?.targetZ, boundsFallback.center.z))),
                yaw: Number(toNum(kf?.yaw, toNum(poiRef?.targetYaw, 0))),
                pitch: clampNum(kf?.pitch, -89, 89, Number(toNum(poiRef?.targetPitch, 0))),
                fov: clampNum(kf?.fov, 20, 120, Number(toNum(poiRef?.targetFov, DEFAULT_POI_FOV))),
                moveSpeedMps: clampNum(kf?.moveSpeedMps, 0.1, 6, Number(toNum(poiRef?.moveSpeedMps, 0.8))),
                mediaObject: normalizeMediaObjectConfig(kf?.mediaObject, fallbackAnchor),
                cameraBehavior: normalizeCameraBehavior(kf?.cameraBehavior)
            };
        }).sort((a, b) => a.t - b.t);
        if (keyframes.length > 0) {
            keyframes[0].t = 0;
            keyframes[keyframes.length - 1].t = 1;
        }
        return {
            shotId,
            label: String(shot?.label || `镜头 ${shotIndex + 1}`),
            intent: String(shot?.intent || 'cinematic'),
            durationSec: clampNum(shot?.durationSec, 0.5, Math.max(4, Number(toNum(targetDurationSec, 14))), Number(toNum(shot?.durationSec, Math.max(1, Number(toNum(targetDurationSec, 14)) / shotsInput.length)))),
            speechText: String(shot?.speechText || ''),
            speechMode: String(shot?.speechMode || '').toUpperCase() === 'BLOCKING' ? 'BLOCKING' : 'INTERRUPTIBLE',
            speechMatchEnabled: Boolean(shot?.speechMatchEnabled),
            speechAudioUrl: null,
            speechMetrics: shot?.speechMetrics && Number(shot?.speechMetrics?.durationSec || 0) > 0 && Number(shot?.speechMetrics?.charsPerSecond || 0) > 0
                ? {
                    durationSec: Number(toNum(shot.speechMetrics.durationSec, 0)),
                    charsPerSecond: Number(toNum(shot.speechMetrics.charsPerSecond, 0)),
                    measuredChars: Number(toNum(shot.speechMetrics.measuredChars, 0)),
                    updatedAt: String(shot.speechMetrics.updatedAt || ''),
                    ttsModel: shot.speechMetrics.ttsModel ? String(shot.speechMetrics.ttsModel) : undefined,
                    ttsVoice: shot.speechMetrics.ttsVoice ? String(shot.speechMetrics.ttsVoice) : undefined
                }
                : null,
            keyframes
        };
    });
    return {
        version: String(source?.version || 'cine_llm_v1'),
        modelFilename: String(modelFilename || ''),
        selectedPoiIds: Array.isArray(source?.selectedPoiIds) && source.selectedPoiIds.length > 0 ? source.selectedPoiIds.map((id) => String(id)) : selectedPoiIds,
        sceneDescription: String(source?.sceneDescription || sceneDescription || ''),
        storyBackground: String(source?.storyBackground || storyBackground || ''),
        styleText: String(source?.styleText || styleText || ''),
        targetDurationSec: Math.max(4, Number(toNum(source?.targetDurationSec, targetDurationSec || 14))),
        bounds,
        shots
    };
};

const createCsvExportJob = ({
    modelFilename,
    llmProvider,
    llmModel,
    llmApiKey,
    csvPromptTemplate,
    movePromptTemplate,
    voiceConfig,
    timingConfig
}) => {
    const jobId = `csvjob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    csvExportJobStore.set(jobId, {
        jobId,
        modelFilename,
        llmProvider,
        llmModel,
        llmApiKey,
        csvPromptTemplate,
        movePromptTemplate,
        voiceConfig: normalizeVoiceConfig(voiceConfig),
        timingConfig: normalizeTimingConfig(timingConfig),
        status: 'running',
        running: false,
        error: null,
        timingSummary: null,
        csvText: '',
        createdAt: new Date().toISOString(),
        finishedAt: null
    });
    return jobId;
};

const pushCsvExportEventHistory = (jobId, event, payload) => {
    if (!csvExportEventHistoryStore.has(jobId)) csvExportEventHistoryStore.set(jobId, []);
    const arr = csvExportEventHistoryStore.get(jobId);
    arr.push({ event, payload });
    if (arr.length > 500) arr.splice(0, arr.length - 500);
};

const sendCsvExportSse = (jobId, event, payload, storeHistory = true) => {
    if (storeHistory) pushCsvExportEventHistory(jobId, event, payload);
    const clients = csvExportSseStore.get(jobId);
    if (!clients) return;
    const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((res) => {
        if (!res.writableEnded) res.write(body);
    });
};

const extractJsonPayload = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        // continue to fallback extraction
    }
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence?.[1]) {
        try {
            return JSON.parse(fence[1]);
        } catch {
            // continue
        }
    }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
        const candidate = raw.slice(start, end + 1);
        try {
            return JSON.parse(candidate);
        } catch {
            // continue
        }
    }
    return null;
};

const recoverStepsFromJsonLikeText = (text) => {
    const raw = String(text || '');
    if (!raw) return [];
    const stepsKeyIdx = raw.search(/"steps"\s*:/i);
    const searchStart = stepsKeyIdx >= 0 ? stepsKeyIdx : 0;
    const arrStart = raw.indexOf('[', searchStart);
    if (arrStart < 0) return [];

    const parsedItems = [];
    let inString = false;
    let escaped = false;
    let arrayDepth = 0;
    let objectDepth = 0;
    let objectStart = -1;

    for (let i = arrStart; i < raw.length; i += 1) {
        const ch = raw[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '[') {
            arrayDepth += 1;
            continue;
        }
        if (ch === ']') {
            if (objectDepth === 0 && arrayDepth === 1) break;
            arrayDepth = Math.max(0, arrayDepth - 1);
            continue;
        }
        if (arrayDepth < 1) continue;
        if (ch === '{') {
            if (objectDepth === 0) objectStart = i;
            objectDepth += 1;
            continue;
        }
        if (ch === '}') {
            if (objectDepth > 0) objectDepth -= 1;
            if (objectDepth === 0 && objectStart >= 0) {
                const candidate = raw.slice(objectStart, i + 1);
                objectStart = -1;
                try {
                    const item = JSON.parse(candidate);
                    if (item && typeof item === 'object') parsedItems.push(item);
                } catch {
                    // ignore malformed object chunks
                }
            }
        }
    }
    return parsedItems;
};

const extractJsonPayloadWithRecovery = (text) => {
    const payload = extractJsonPayload(text);
    if (payload) return { payload, recovered: false, recoveredSteps: 0 };
    const recoveredSteps = recoverStepsFromJsonLikeText(text);
    if (recoveredSteps.length > 0) {
        return {
            payload: { steps: recoveredSteps },
            recovered: true,
            recoveredSteps: recoveredSteps.length
        };
    }
    return { payload: null, recovered: false, recoveredSteps: 0 };
};

const normalizePlanAudioMode = (audioMode, action) => {
    const mode = String(audioMode || '').trim().toUpperCase();
    if (CSV_AUDIO_MODES.has(mode)) return mode;
    return action === 'SPEAK' ? 'BLOCKING' : 'INTERRUPTIBLE';
};

const resolvePlanAction = (prevStep, poiId, actionRaw) => {
    const action = String(actionRaw || '').trim().toUpperCase();
    if (CSV_PLAN_ACTIONS.has(action)) return action;
    if (!prevStep) return 'MOVE';
    if (String(prevStep.poiId || '') !== String(poiId || '')) return 'MOVE';
    if (prevStep.action === 'MOVE') return 'LOOK';
    return 'SPEAK';
};

const normalizeCsvPlanSteps = (planJson, knownPoiIds) => {
    const rawSteps = Array.isArray(planJson?.steps) ? planJson.steps : [];
    const steps = [];
    for (let i = 0; i < rawSteps.length; i += 1) {
        const item = rawSteps[i] || {};
        const poiId = String(item.poi_id || item.poiId || '').trim();
        if (!poiId) {
            throw new Error(`CSV plan step ${i + 1} missing poi_id`);
        }
        if (!knownPoiIds.has(poiId)) {
            throw new Error(`CSV plan step ${i + 1} references unknown poi_id='${poiId}'`);
        }
        const prev = steps[steps.length - 1] || null;
        const action = resolvePlanAction(prev, poiId, item.action);
        const audioMode = normalizePlanAudioMode(item.audio_mode || item.audioMode, action);
        steps.push({
            seq: steps.length + 1,
            poiId,
            action,
            audioMode
        });
    }
    if (steps.length < 1) {
        throw new Error('CSV plan has no valid steps');
    }
    return steps;
};

const buildVisitOrderWithCoverage = (planSteps, orderedPoiIds) => {
    const known = new Set(orderedPoiIds);
    const seen = new Set();
    const visitOrder = [];
    for (let i = 0; i < planSteps.length; i += 1) {
        const poiId = String(planSteps[i]?.poiId || '').trim();
        if (!poiId || !known.has(poiId) || seen.has(poiId)) continue;
        seen.add(poiId);
        visitOrder.push(poiId);
    }
    for (let i = 0; i < orderedPoiIds.length; i += 1) {
        const poiId = orderedPoiIds[i];
        if (seen.has(poiId)) continue;
        seen.add(poiId);
        visitOrder.push(poiId);
    }
    return visitOrder;
};

const buildNarrationPlanFromVisitOrder = (visitOrder) => {
    const steps = [];
    for (let i = 0; i < visitOrder.length; i += 1) {
        const poiId = visitOrder[i];
        steps.push({
            seq: steps.length + 1,
            poiId,
            action: 'MOVE',
            audioMode: 'INTERRUPTIBLE'
        });
        steps.push({
            seq: steps.length + 1,
            poiId,
            action: 'LOOK',
            audioMode: 'BLOCKING'
        });
    }
    return steps;
};

const csvRowFromPoi = ({
    seq,
    action,
    audioMode,
    poiRow,
    profile,
    modelFilename,
    contentOverride,
    ttsVoice,
    moveSpeedMpsOverride,
    dwellMsOverride
}) => {
    const poiId = String(poiRow?.poi_id || '').trim();
    if (!poiId) throw new Error(`CSV row seq=${seq} missing poi_id`);
    const poiName = String(poiRow?.poi_name || poiId).trim() || poiId;
    const csvContent = String(contentOverride ?? (poiRow?.content || poiName));
    const ttsLang = inferTtsLang({
        ttsLang: poiRow?.tts_lang,
        poiName,
        content: csvContent
    });
    return [
        'v2',
        seq,
        action,
        audioMode,
        poiId,
        poiName,
        Number(toNum(poiRow?.target_x, 0)).toFixed(3),
        Number(toNum(poiRow?.target_y, 0)).toFixed(3),
        Number(toNum(poiRow?.target_z, 0)).toFixed(3),
        Number(toNum(poiRow?.target_yaw, 0)).toFixed(2),
        Number(toNum(poiRow?.target_pitch, 0)).toFixed(2),
        Number(toFov(poiRow?.target_fov, DEFAULT_POI_FOV)).toFixed(2),
        Number(toNum(moveSpeedMpsOverride, toNum(poiRow?.move_speed_mps, 0.8))).toFixed(2),
        String(Math.max(0, Math.floor(toNum(dwellMsOverride, toNum(poiRow?.dwell_ms, 900))))),
        csvContent,
        ttsLang,
        String(ttsVoice || ''),
        modelFilename,
        Number(toNum(profile?.eye_height_m, 1.65)).toFixed(2)
    ].map(escapeCsv).join(',');
};

const runCsvExportJob = async (jobId) => {
    const job = csvExportJobStore.get(jobId);
    if (!job || job.running) return;
    job.running = true;
    job.status = 'running';
    sendCsvExportSse(jobId, 'export.job.started', {
        jobId,
        modelFilename: job.modelFilename,
        llmModel: job.llmModel,
        apiEndpoint: endpointForModel(job.llmModel, job.llmProvider),
        ts: new Date().toISOString()
    });

    try {
        const { profile, rows: allRows } = await getTlPoiRows(job.modelFilename);
        if (allRows.length < 1) {
            throw new Error('no POI records found for current model');
        }
        const orderedPoiIds = allRows.map((row) => String(row.poi_id));
        const knownPoiIds = new Set(allRows.map((row) => String(row.poi_id)));
        sendCsvExportSse(jobId, 'export.db.loaded', {
            jobId,
            modelFilename: job.modelFilename,
            poiCount: allRows.length,
            poiIds: allRows.map((row) => String(row.poi_id)),
            ts: new Date().toISOString()
        });

        if (!job.llmApiKey) {
            throw new Error('LLM API key is empty');
        }

        const plannerInput = {
            model_filename: job.modelFilename,
            target_duration_sec: job.timingConfig?.enabled ? job.timingConfig.targetDurationSec : null,
            pois: allRows.map((row) => ({
                poi_id: String(row.poi_id),
                poi_name: String(row.poi_name || ''),
                content: String(row.content || '')
            }))
        };
        const timingPromptNote = job.timingConfig?.enabled
            ? `\n\nTiming requirement: the full tour should fit within ${job.timingConfig.targetDurationSec} seconds. Prefer an efficient route order and avoid unnecessary detours.`
            : '';
        const prompt = `${job.csvPromptTemplate || DEFAULT_CSV_PROMPT_TEMPLATE}${timingPromptNote}\n\nPOI_DATA_JSON:\n${JSON.stringify(plannerInput, null, 2)}`;
        sendCsvExportSse(jobId, 'export.prompt', {
            jobId,
            prompt,
            promptChars: prompt.length,
            ts: new Date().toISOString()
        });
        sendCsvExportSse(jobId, 'export.api.call', {
            jobId,
            llmModel: job.llmModel,
            apiEndpoint: endpointForModel(job.llmModel, job.llmProvider),
            hasApiKey: Boolean(job.llmApiKey),
            promptChars: prompt.length,
            ts: new Date().toISOString()
        });

        const llmResult = await callRealLlm({
            provider: job.llmProvider,
            model: job.llmModel,
            apiKey: job.llmApiKey,
            prompt,
            poiName: 'route_planner',
            screenshotDataUrl: '',
            responseMimeType: 'application/json',
            appendLanguageInstruction: false,
            systemInstruction: '',
            onChunk: (chunk) => {
                const text = typeof chunk === 'string' ? chunk : String(chunk?.text || '');
                sendCsvExportSse(jobId, 'export.plan.chunk', {
                    jobId,
                    chunk: text,
                    chunkIndex: Number(chunk?.chunkIndex || 0),
                    chunkChars: Number(chunk?.chunkChars || text.length),
                    contentCharsSoFar: Number(chunk?.contentCharsSoFar || 0),
                    ts: new Date().toISOString()
                });
            }
        });

        const llmText = String(llmResult?.text || '').trim();
        const planParse = extractJsonPayloadWithRecovery(llmText);
        if (!planParse.payload) {
            throw new Error(`LLM plan is not valid JSON: ${llmText.slice(0, 240)}`);
        }
        const planJson = planParse.payload;
        const rawPlanSteps = normalizeCsvPlanSteps(planJson, knownPoiIds);
        const visitOrder = buildVisitOrderWithCoverage(rawPlanSteps, orderedPoiIds);
        const planSteps = buildNarrationPlanFromVisitOrder(visitOrder);
        const plannedUniquePoiCount = new Set(rawPlanSteps.map((step) => String(step.poiId || ''))).size;
        const missingPoiCount = Math.max(0, orderedPoiIds.length - plannedUniquePoiCount);
        sendCsvExportSse(jobId, 'export.plan.done', {
            jobId,
            provider: llmResult?.provider || job.llmProvider,
            apiEndpoint: llmResult?.endpoint || endpointForModel(job.llmModel, job.llmProvider),
            status: llmResult?.status || 200,
            requestId: llmResult?.requestId || null,
            chunkCount: llmResult?.chunkCount || 0,
            finishReason: llmResult?.finishReason || null,
            usageMetadata: llmResult?.usageMetadata || null,
            recoveredFromMalformedJson: planParse.recovered,
            recoveredSteps: planParse.recoveredSteps,
            inputPoiCount: orderedPoiIds.length,
            plannedPoiUniqueCount: plannedUniquePoiCount,
            missingPoiCount,
            appendedByCoverage: missingPoiCount,
            totalVisitPois: visitOrder.length,
            totalSteps: planSteps.length,
            ts: new Date().toISOString()
        });

        const poiRowsById = new Map(allRows.map((row) => [String(row.poi_id), row]));
        const moveContexts = [];
        for (let i = 0; i < planSteps.length; i += 1) {
            const step = planSteps[i];
            if (step.action !== 'MOVE') continue;
            const toRow = poiRowsById.get(step.poiId);
            if (!toRow) continue;
            const prevStep = i > 0 ? planSteps[i - 1] : null;
            const fromRow = prevStep ? (poiRowsById.get(prevStep.poiId) || null) : null;
            const toName = String(toRow.poi_name || step.poiId).trim() || step.poiId;
            const fromName = fromRow ? String(fromRow.poi_name || prevStep?.poiId || '').trim() : '';
            const baseLanguage = inferTtsLang({
                ttsLang: toRow.tts_lang,
                poiName: toName,
                content: toRow.content
            });
            const language = String(baseLanguage).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
            const dx = fromRow ? toNum(toRow.target_x, 0) - toNum(fromRow.target_x, 0) : NaN;
            const dz = fromRow ? toNum(toRow.target_z, 0) - toNum(fromRow.target_z, 0) : NaN;
            const direction = moveDirectionLabel(dx, dz, language);
            const distanceM = moveDistanceMeters(fromRow, toRow);
            moveContexts.push({
                seq: i + 1,
                from_poi_id: prevStep?.poiId || null,
                from_poi_name: fromName || null,
                to_poi_id: step.poiId,
                to_poi_name: toName,
                direction,
                distance_m: distanceM === null ? null : Number(distanceM.toFixed(2)),
                language
            });
        }

        const moveContents = new Map();
        moveContexts.forEach((ctx) => {
            moveContents.set(ctx.seq, buildMoveFallbackContent({
                fromName: ctx.from_poi_name,
                toName: ctx.to_poi_name,
                distanceM: ctx.distance_m,
                direction: ctx.direction,
                language: ctx.language
            }));
        });

        if (moveContexts.length > 0) {
            const moveTimingNote = job.timingConfig?.enabled
                ? `\n\nTiming requirement: keep each MOVE sentence compact so the full tour can stay within ${job.timingConfig.targetDurationSec} seconds.`
                : '';
            const movePrompt = `${job.movePromptTemplate || DEFAULT_MOVE_PROMPT_TEMPLATE}${moveTimingNote}\n\nMOVE_CONTEXT_JSON:\n${JSON.stringify({
                model_filename: job.modelFilename,
                target_duration_sec: job.timingConfig?.enabled ? job.timingConfig.targetDurationSec : null,
                moves: moveContexts
            }, null, 2)}`;
            sendCsvExportSse(jobId, 'export.move.prompt', {
                jobId,
                moveCount: moveContexts.length,
                promptChars: movePrompt.length,
                ts: new Date().toISOString()
            });
            try {
                const moveLlmResult = await callRealLlm({
                    provider: job.llmProvider,
                    model: job.llmModel,
                    apiKey: job.llmApiKey,
                    prompt: movePrompt,
                    poiName: 'move_narration',
                    screenshotDataUrl: '',
                    responseMimeType: 'application/json',
                    appendLanguageInstruction: false,
                    systemInstruction: '',
                    onChunk: (chunk) => {
                        const text = typeof chunk === 'string' ? chunk : String(chunk?.text || '');
                        sendCsvExportSse(jobId, 'export.move.chunk', {
                            jobId,
                            chunk: text,
                            chunkIndex: Number(chunk?.chunkIndex || 0),
                            chunkChars: Number(chunk?.chunkChars || text.length),
                            contentCharsSoFar: Number(chunk?.contentCharsSoFar || 0),
                            ts: new Date().toISOString()
                        });
                    }
                });
                const parsed = extractJsonPayload(String(moveLlmResult?.text || ''));
                const moveMap = normalizeMoveNarratives(parsed);
                moveMap.forEach((content, seq) => moveContents.set(seq, content));
                sendCsvExportSse(jobId, 'export.move.done', {
                    jobId,
                    provider: moveLlmResult?.provider || job.llmProvider,
                    apiEndpoint: moveLlmResult?.endpoint || endpointForModel(job.llmModel, job.llmProvider),
                    status: moveLlmResult?.status || 200,
                    requestId: moveLlmResult?.requestId || null,
                    chunkCount: moveLlmResult?.chunkCount || 0,
                    finishReason: moveLlmResult?.finishReason || null,
                    usageMetadata: moveLlmResult?.usageMetadata || null,
                    generated: moveMap.size,
                    fallback: Math.max(0, moveContexts.length - moveMap.size),
                    ts: new Date().toISOString()
                });
            } catch (error) {
                sendCsvExportSse(jobId, 'export.move.error', {
                    jobId,
                    error: String(error?.message || error),
                    fallback: moveContexts.length,
                    ts: new Date().toISOString()
                });
            }
        }

        const header = [
            'version', 'seq', 'action', 'audio_mode', 'poi_id', 'poi_name',
            'target_x', 'target_y', 'target_z', 'target_yaw', 'target_pitch', 'target_fov',
            'move_speed_mps', 'dwell_ms', 'content', 'tts_lang', 'tts_voice', 'model_filename', 'eye_height_m'
        ];
        const lines = [header.join(',')];
        const voicePicker = createVoicePicker(job.voiceConfig);
        const timingPlan = buildTimingPlan({
            planSteps,
            poiRowsById,
            moveContents,
            timingConfig: job.timingConfig
        });
        job.timingSummary = timingPlan.enabled
            ? {
                enabled: true,
                targetDurationSec: timingPlan.targetDurationSec,
                minimumAchievableSec: timingPlan.minimumAchievableSec,
                estimatedDurationSec: Number((timingPlan.estimatedDurationSec || 0).toFixed(2))
            }
            : {
                enabled: false,
                targetDurationSec: job.timingConfig?.targetDurationSec || DEFAULT_CSV_TARGET_DURATION_SEC,
                minimumAchievableSec: null,
                estimatedDurationSec: null
            };
        if (timingPlan.enabled) {
            sendCsvExportSse(jobId, 'export.timing.plan', {
                jobId,
                targetDurationSec: timingPlan.targetDurationSec,
                minimumAchievableSec: timingPlan.minimumAchievableSec,
                estimatedDurationSec: Number((timingPlan.estimatedDurationSec || 0).toFixed(2)),
                ts: new Date().toISOString()
            });
        }
        for (let i = 0; i < planSteps.length; i += 1) {
            const step = planSteps[i];
            const stepTiming = timingPlan.stepTiming.get(i) || null;
            sendCsvExportSse(jobId, 'export.poi.fetch.one', {
                jobId,
                index: i + 1,
                total: planSteps.length,
                poiId: step.poiId,
                prevPoiId: i > 0 ? planSteps[i - 1].poiId : null,
                action: step.action,
                audioMode: step.audioMode,
                ts: new Date().toISOString()
            });
            const poiRow = getRepo('getPoiById', job.modelFilename, step.poiId);
            if (!poiRow) {
                throw new Error(`poi_id='${step.poiId}' not found while composing CSV`);
            }
            const csvLine = csvRowFromPoi({
                seq: i + 1,
                action: step.action,
                audioMode: step.audioMode,
                poiRow,
                profile,
                modelFilename: job.modelFilename,
                contentOverride: step.action === 'MOVE' ? moveContents.get(i + 1) : undefined,
                ttsVoice: voicePicker.next(),
                moveSpeedMpsOverride: stepTiming?.moveSpeedMps,
                dwellMsOverride: stepTiming?.dwellMs
            });
            lines.push(csvLine);
            sendCsvExportSse(jobId, 'export.csv.row.appended', {
                jobId,
                index: i + 1,
                total: planSteps.length,
                poiId: step.poiId,
                action: step.action,
                audioMode: step.audioMode,
                ttsVoice: parseCsvLine(csvLine)[16] || '',
                estimatedStepSec: stepTiming ? Number(stepTiming.estimatedStepSec.toFixed(2)) : null,
                ts: new Date().toISOString()
            });
        }

        job.csvText = lines.join('\n');
        job.status = 'done';
        job.running = false;
        job.finishedAt = new Date().toISOString();
        sendCsvExportSse(jobId, 'export.job.done', {
            jobId,
            totalRows: planSteps.length,
            finishedAt: job.finishedAt,
            ts: new Date().toISOString()
        });
    } catch (error) {
        job.status = 'error';
        job.running = false;
        job.error = String(error?.message || error);
        const timingSummary = timingSummaryFromError(error, job?.timingConfig?.targetDurationSec || DEFAULT_CSV_TARGET_DURATION_SEC);
        if (timingSummary) job.timingSummary = timingSummary;
        sendCsvExportSse(jobId, 'export.job.error', {
            jobId,
            error: job.error,
            timingSummary: job.timingSummary || null,
            ts: new Date().toISOString()
        });
    }
};

const computeCsvTimingSummary = async ({
    modelFilename,
    llmModel,
    llmApiKey,
    csvPromptTemplate,
    movePromptTemplate,
    timingConfig
}) => {
    const normalizedTiming = normalizeTimingConfig(timingConfig);
    const { profile, rows: allRows } = await getTlPoiRows(modelFilename);
    if (allRows.length < 1) throw new Error('no POI records found for current model');
    if (!llmApiKey) throw new Error('LLM API key is empty');

    const orderedPoiIds = allRows.map((row) => String(row.poi_id));
    const knownPoiIds = new Set(allRows.map((row) => String(row.poi_id)));
    const plannerInput = {
        model_filename: modelFilename,
        target_duration_sec: normalizedTiming.enabled ? normalizedTiming.targetDurationSec : null,
        pois: allRows.map((row) => ({
            poi_id: String(row.poi_id),
            poi_name: String(row.poi_name || ''),
            content: String(row.content || '')
        }))
    };
    const timingPromptNote = normalizedTiming.enabled
        ? `\n\nTiming requirement: the full tour should fit within ${normalizedTiming.targetDurationSec} seconds. Prefer an efficient route order and avoid unnecessary detours.`
        : '';
    const prompt = `${csvPromptTemplate || DEFAULT_CSV_PROMPT_TEMPLATE}${timingPromptNote}\n\nPOI_DATA_JSON:\n${JSON.stringify(plannerInput, null, 2)}`;
    const llmResult = await callRealLlm({
        provider: llmProvider,
        model: llmModel,
        apiKey: llmApiKey,
        prompt,
        poiName: 'route_planner',
        screenshotDataUrl: '',
        responseMimeType: 'application/json',
        appendLanguageInstruction: false,
        systemInstruction: ''
    });
    const llmText = String(llmResult?.text || '').trim();
    const planParse = extractJsonPayloadWithRecovery(llmText);
    if (!planParse.payload) throw new Error(`LLM plan is not valid JSON: ${llmText.slice(0, 240)}`);
    const rawPlanSteps = normalizeCsvPlanSteps(planParse.payload, knownPoiIds);
    const visitOrder = buildVisitOrderWithCoverage(rawPlanSteps, orderedPoiIds);
    const planSteps = buildNarrationPlanFromVisitOrder(visitOrder);

    const poiRowsById = new Map(allRows.map((row) => [String(row.poi_id), row]));
    const moveContexts = [];
    for (let i = 0; i < planSteps.length; i += 1) {
        const step = planSteps[i];
        if (step.action !== 'MOVE') continue;
        const toRow = poiRowsById.get(step.poiId);
        if (!toRow) continue;
        const prevStep = i > 0 ? planSteps[i - 1] : null;
        const fromRow = prevStep ? (poiRowsById.get(prevStep.poiId) || null) : null;
        const toName = String(toRow.poi_name || step.poiId).trim() || step.poiId;
        const fromName = fromRow ? String(fromRow.poi_name || prevStep?.poiId || '').trim() : '';
        const baseLanguage = inferTtsLang({ ttsLang: toRow.tts_lang, poiName: toName, content: toRow.content });
        const language = String(baseLanguage).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
        const dx = fromRow ? toNum(toRow.target_x, 0) - toNum(fromRow.target_x, 0) : NaN;
        const dz = fromRow ? toNum(toRow.target_z, 0) - toNum(fromRow.target_z, 0) : NaN;
        moveContexts.push({
            seq: i + 1,
            from_poi_name: fromName || null,
            to_poi_name: toName,
            direction: moveDirectionLabel(dx, dz, language),
            distance_m: (() => {
                const distanceM = moveDistanceMeters(fromRow, toRow);
                return distanceM === null ? null : Number(distanceM.toFixed(2));
            })(),
            language
        });
    }

    const moveContents = new Map();
    moveContexts.forEach((ctx) => {
        moveContents.set(ctx.seq, buildMoveFallbackContent({
            fromName: ctx.from_poi_name,
            toName: ctx.to_poi_name,
            distanceM: ctx.distance_m,
            direction: ctx.direction,
            language: ctx.language
        }));
    });
    if (moveContexts.length > 0) {
        const moveTimingNote = normalizedTiming.enabled
            ? `\n\nTiming requirement: keep each MOVE sentence compact so the full tour can stay within ${normalizedTiming.targetDurationSec} seconds.`
            : '';
        const movePrompt = `${movePromptTemplate || DEFAULT_MOVE_PROMPT_TEMPLATE}${moveTimingNote}\n\nMOVE_CONTEXT_JSON:\n${JSON.stringify({
            model_filename: modelFilename,
            target_duration_sec: normalizedTiming.enabled ? normalizedTiming.targetDurationSec : null,
            moves: moveContexts
        }, null, 2)}`;
        try {
            const moveLlmResult = await callRealLlm({
                provider: llmProvider,
                model: llmModel,
                apiKey: llmApiKey,
                prompt: movePrompt,
                poiName: 'move_narration',
                screenshotDataUrl: '',
                responseMimeType: 'application/json',
                appendLanguageInstruction: false,
                systemInstruction: ''
            });
            const parsed = extractJsonPayload(String(moveLlmResult?.text || ''));
            const moveMap = normalizeMoveNarratives(parsed);
            moveMap.forEach((content, seq) => moveContents.set(seq, content));
        } catch {}
    }

    try {
        const timingPlan = buildTimingPlan({ planSteps, poiRowsById, moveContents, timingConfig: normalizedTiming });
        return {
            enabled: Boolean(timingPlan.enabled),
            targetDurationSec: normalizedTiming.targetDurationSec,
            minimumAchievableSec: timingPlan.enabled ? timingPlan.minimumAchievableSec : null,
            estimatedDurationSec: timingPlan.enabled ? Number((timingPlan.estimatedDurationSec || 0).toFixed(2)) : null
        };
    } catch (error) {
        const fallback = timingSummaryFromError(error, normalizedTiming.targetDurationSec);
        if (fallback) return fallback;
        throw error;
    }
};

const runCinematicJob = async (jobId) => {
    const job = cinematicJobStore.get(jobId);
    if (!job || job.running) return;
    job.running = true;
    job.status = 'running';
    let heartbeatTimer = null;
    sendCinematicSse(jobId, 'job.started', {
        jobId,
        kind: job.kind,
        modelFilename: job.modelFilename,
        llmModel: job.llmModel,
        llmProvider: job.llmProvider,
        apiEndpoint: endpointForModel(job.llmModel, job.llmProvider),
        ts: new Date().toISOString()
    });
    try {
        if (!job.llmApiKey) throw new Error('LLM API key is empty');
        const apiEndpoint = endpointForModel(job.llmModel, job.llmProvider);
        const callStartedAt = Date.now();
        heartbeatTimer = setInterval(() => {
            sendCinematicSse(jobId, 'heartbeat', {
                jobId,
                kind: job.kind,
                waitingMs: Date.now() - callStartedAt,
                ts: new Date().toISOString()
            }, false);
        }, 2500);
        let rawFrameIndex = 0;
        const commonHooks = {
            onRequestPayload: (reqPayload) => {
                sendCinematicSse(jobId, 'api.request.raw', {
                    jobId,
                    kind: job.kind,
                    llmModel: job.llmModel,
                    provider: reqPayload?.provider || job.llmProvider,
                    apiEndpoint: reqPayload?.endpoint || apiEndpoint,
                    requestJson: reqPayload?.requestBody || null,
                    imageCount: Number(reqPayload?.imageCount || reqPayload?.imageMetas?.length || 0),
                    imageMetas: Array.isArray(reqPayload?.imageMetas) ? reqPayload.imageMetas : [],
                    ts: new Date().toISOString()
                });
            },
            onRawFrame: (rawFrame) => {
                rawFrameIndex += 1;
                sendCinematicSse(jobId, 'api.response.raw', {
                    jobId,
                    kind: job.kind,
                    frameIndex: rawFrameIndex,
                    llmModel: job.llmModel,
                    provider: job.llmProvider,
                    apiEndpoint,
                    rawJson: String(rawFrame || ''),
                    ts: new Date().toISOString()
                }, false);
            },
            onChunk: (chunk) => {
                const text = typeof chunk === 'string' ? chunk : String(chunk?.text || '');
                if (!text) return;
                sendCinematicSse(jobId, 'api.chunk', {
                    jobId,
                    kind: job.kind,
                    chunk,
                    chunkIndex: Number(chunk?.chunkIndex || 0),
                    chunkChars: Number(chunk?.chunkChars || text.length),
                    contentCharsSoFar: Number(chunk?.contentCharsSoFar || text.length),
                    ts: new Date().toISOString()
                }, false);
            }
        };

        let llmResult = null;
        if (job.kind === 'prompt') {
            const prompt = `用户提供的简单需求如下，请将其改写为专业复杂提示词：\n\n${String(job.simplePrompt || '').trim()}`;
            sendCinematicSse(jobId, 'prompt.input', {
                jobId,
                kind: 'prompt',
                simplePrompt: job.simplePrompt,
                promptChars: prompt.length,
                ts: new Date().toISOString()
            });
            sendCinematicSse(jobId, 'api.call', {
                jobId,
                kind: 'prompt',
                llmModel: job.llmModel,
                apiEndpoint,
                hasApiKey: true,
                promptChars: prompt.length,
                ts: new Date().toISOString()
            });
            llmResult = await callRealLlm({
                provider: job.llmProvider,
                model: job.llmModel,
                apiKey: job.llmApiKey,
                prompt,
                poiName: 'cinematic_prompt',
                screenshotDataUrl: '',
                appendLanguageInstruction: false,
                systemInstruction: DEFAULT_CINEMATIC_PROMPT_PROMPT,
                ...commonHooks
            });
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
            job.result = String(llmResult?.text || '').trim();
            sendCinematicSse(jobId, 'api.response', {
                jobId,
                kind: 'prompt',
                ok: true,
                llmModel: job.llmModel,
                provider: llmResult?.provider || job.llmProvider,
                apiEndpoint: llmResult?.endpoint || apiEndpoint,
                status: llmResult?.status || 200,
                requestId: llmResult?.requestId || null,
                chunkCount: llmResult?.chunkCount || 0,
                finishReason: llmResult?.finishReason || null,
                usageMetadata: llmResult?.usageMetadata || null,
                contentChars: job.result.length,
                preview: String(job.result || '').slice(0, 500),
                ts: new Date().toISOString()
            });
            job.status = 'done';
            job.running = false;
            sendCinematicSse(jobId, 'job.done', {
                jobId,
                kind: 'prompt',
                plannerPrompt: job.result,
                ts: new Date().toISOString()
            });
            return;
        }

        const pois = Array.isArray(job.pois) ? job.pois : [];
        if (pois.length < 2) throw new Error('Need at least 2 POIs for cinematic timeline generation');
        const bounds = buildCinematicBoundingBox(pois, 0.1);
        sendCinematicSse(jobId, 'timeline.payload.summary', {
            jobId,
            modelFilename: job.modelFilename,
            targetDurationSec: job.targetDurationSec,
            poiCount: pois.length,
            imageCount: pois.filter((poi) => String(poi.screenshotDataUrl || '').trim()).length,
            boundingBox: bounds,
            ts: new Date().toISOString()
        });
        pois.forEach((poi, index) => {
            const imageMeta = imageDigest(String(poi.screenshotDataUrl || ''));
            sendCinematicSse(jobId, 'timeline.payload.poi', {
                jobId,
                index: index + 1,
                total: pois.length,
                poiId: String(poi.poiId || ''),
                poiName: String(poi.poiName || ''),
                content: String(poi.content || ''),
                targetX: Number(toNum(poi.targetX, 0)),
                targetY: Number(toNum(poi.targetY, 0)),
                targetZ: Number(toNum(poi.targetZ, 0)),
                targetYaw: Number(toNum(poi.targetYaw, 0)),
                targetPitch: Number(toNum(poi.targetPitch, 0)),
                imageBytes: imageMeta.bytes,
                imageMime: imageMeta.mime,
                imageSha256: imageMeta.sha256,
                ts: new Date().toISOString()
            });
        });
        const promptPayload = {
            complexPrompt: job.plannerPrompt,
            targetDurationSec: job.targetDurationSec,
            boundingBox: bounds,
            pois: pois.map((poi) => ({
                poiId: String(poi.poiId || ''),
                poiName: String(poi.poiName || ''),
                content: String(poi.content || ''),
                targetX: Number(toNum(poi.targetX, 0)),
                targetY: Number(toNum(poi.targetY, 0)),
                targetZ: Number(toNum(poi.targetZ, 0)),
                targetYaw: Number(toNum(poi.targetYaw, 0)),
                targetPitch: Number(toNum(poi.targetPitch, 0)),
                targetFov: Number(toNum(poi.targetFov, DEFAULT_POI_FOV)),
                moveSpeedMps: Number(toNum(poi.moveSpeedMps, 0.8))
            }))
        };
        const prompt = `${DEFAULT_CINEMATIC_TIMELINE_PROMPT}\n\n专业复杂提示词:\n${String(job.plannerPrompt || '').trim()}\n\nTIMELINE_INPUT_JSON:\n${JSON.stringify(promptPayload, null, 2)}`;
        sendCinematicSse(jobId, 'timeline.prompt', {
            jobId,
            prompt,
            promptChars: prompt.length,
            ts: new Date().toISOString()
        });
        sendCinematicSse(jobId, 'api.call', {
            jobId,
            kind: 'timeline',
            llmModel: job.llmModel,
            apiEndpoint,
            hasApiKey: true,
            promptChars: prompt.length,
            imageCount: pois.filter((poi) => String(poi.screenshotDataUrl || '').trim()).length,
            ts: new Date().toISOString()
        });
        llmResult = await callRealLlmMultimodal({
            provider: job.llmProvider,
            model: job.llmModel,
            apiKey: job.llmApiKey,
            prompt,
            imageDataUrls: pois.map((poi) => String(poi.screenshotDataUrl || '')).filter(Boolean),
            responseMimeType: 'application/json',
            systemInstruction: '',
            ...commonHooks
        });
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        const rawText = String(llmResult?.text || '').trim();
        sendCinematicSse(jobId, 'api.response', {
            jobId,
            kind: 'timeline',
            ok: true,
            llmModel: job.llmModel,
            provider: llmResult?.provider || job.llmProvider,
            apiEndpoint: llmResult?.endpoint || apiEndpoint,
            status: llmResult?.status || 200,
            requestId: llmResult?.requestId || null,
            chunkCount: llmResult?.chunkCount || 0,
            finishReason: llmResult?.finishReason || null,
            usageMetadata: llmResult?.usageMetadata || null,
            contentChars: rawText.length,
            preview: rawText.slice(0, 500),
            ts: new Date().toISOString()
        });
        const parsed = extractJsonPayload(rawText);
        if (!parsed) throw new Error(`Timeline JSON parse failed: ${rawText.slice(0, 240)}`);
        const poisById = new Map(pois.map((poi) => [String(poi.poiId || ''), poi]));
        let normalizedPlan = normalizeCinematicPlan({
            payload: parsed,
            modelFilename: job.modelFilename,
            selectedPoiIds: pois.map((poi) => String(poi.poiId || '')),
            targetDurationSec: job.targetDurationSec,
            boundsFallback: bounds,
            poisById
        });
        const mediaPrompt = plannerPromptRequestsMediaObject(job.plannerPrompt);
        sendCinematicSse(jobId, 'timeline.media.detected', {
            jobId,
            requested: mediaPrompt,
            orbitLike: plannerPromptRequestsOrbitLikeCamera(job.plannerPrompt),
            promptPreview: String(job.plannerPrompt || '').slice(0, 240),
            ts: new Date().toISOString()
        });
        normalizedPlan = enrichPlanWithPromptedMediaObject(normalizedPlan, job.plannerPrompt, pois);
        const totalMediaKeyframes = normalizedPlan.shots.reduce((sum, shot) => sum + shot.keyframes.filter((kf) => kf.mediaObject?.enabled).length, 0);
        sendCinematicSse(jobId, 'timeline.media.enriched', {
            jobId,
            totalMediaKeyframes,
            placeholderKeyframes: normalizedPlan.shots.reduce((sum, shot) => sum + shot.keyframes.filter((kf) => kf.mediaObject?.enabled && kf.mediaObject?.placeholder).length, 0),
            ts: new Date().toISOString()
        });
        job.result = normalizedPlan;
        sendCinematicSse(jobId, 'timeline.plan.parsed', {
            jobId,
            shots: job.result.shots.length,
            totalKeyframes: job.result.shots.reduce((sum, shot) => sum + shot.keyframes.length, 0),
            ts: new Date().toISOString()
        });
        job.status = 'done';
        job.running = false;
        sendCinematicSse(jobId, 'job.done', {
            jobId,
            kind: 'timeline',
            plan: job.result,
            ts: new Date().toISOString()
        });
    } catch (error) {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        sendCinematicSse(jobId, 'api.error', {
            jobId,
            kind: job?.kind || 'unknown',
            provider: error?.provider || job?.llmProvider || resolveLlmProvider({ model: job?.llmModel }),
            apiEndpoint: error?.endpoint || endpointForModel(job?.llmModel, job?.llmProvider),
            status: error?.status || null,
            requestId: error?.requestId || null,
            finishReason: error?.finishReason || null,
            usageMetadata: error?.usageMetadata || null,
            errorRaw: error?.rawResponse || null,
            errorCause: error?.errorCause || null,
            error: String(error?.message || error),
            ts: new Date().toISOString()
        });
        const jobRef = cinematicJobStore.get(jobId);
        if (jobRef) {
            jobRef.status = 'error';
            jobRef.running = false;
            jobRef.error = String(error?.message || error);
        }
        sendCinematicSse(jobId, 'job.error', {
            jobId,
            kind: job?.kind || 'unknown',
            error: String(error?.message || error),
            ts: new Date().toISOString()
        });
    }
};

const runJob = async (jobId) => {
    const job = jobStore.get(jobId);
    if (!job || job.running) return;
    job.running = true;
    job.status = 'running';
    sendSse(jobId, 'job.started', {
        jobId,
        llmModel: job.llmModel,
        llmProvider: job.llmProvider,
        apiEndpoint: endpointForModel(job.llmModel, job.llmProvider),
        ts: new Date().toISOString()
    });
    while (job.index < job.poiIds.length) {
        if (job.stopRequested) {
            job.status = 'paused';
            job.running = false;
            sendSse(jobId, 'job.paused', { jobId, index: job.index, ts: new Date().toISOString() });
            return;
        }
        const poiId = job.poiIds[job.index];
        const row = getRepo('getPoiById', job.modelFilename, poiId);
        if (!row) {
            sendSse(jobId, 'poi.failed', { jobId, poiId, error: 'poi not found', index: job.index + 1, total: job.poiIds.length });
            job.index += 1;
            continue;
        }
        const prompt = `${job.promptTemplate}\nPOI: ${row.poi_name}\nPOI_ID: ${row.poi_id}`;
        const screenshotDataUrl = row.screenshot_data_url || encodeDataUrl(row.screenshot_blob, row.screenshot_blob_mime) || '';
        const imgInfo = imageDigest(screenshotDataUrl);
        const apiEndpoint = endpointForModel(job.llmModel, job.llmProvider);
        sendSse(jobId, 'job.prompt', { jobId, poiId, prompt, index: job.index + 1, total: job.poiIds.length, ts: new Date().toISOString() });
        sendSse(jobId, 'api.call', {
            jobId,
            poiId,
            llmModel: job.llmModel,
            apiEndpoint,
            hasApiKey: Boolean(job.llmApiKey),
            hasImage: Boolean(screenshotDataUrl),
            imageBytes: imgInfo.bytes,
            imageMime: imgInfo.mime,
            imageSha256: imgInfo.sha256,
            promptChars: prompt.length,
            index: job.index + 1,
            total: job.poiIds.length,
            ts: new Date().toISOString()
        });
        sendSse(jobId, 'poi.started', { jobId, poiId, index: job.index + 1, total: job.poiIds.length, ts: new Date().toISOString() });
        if (!job.llmApiKey) {
            sendSse(jobId, 'api.error', {
                jobId,
                poiId,
                llmModel: job.llmModel,
                apiEndpoint,
                error: 'LLM API key is empty',
                index: job.index + 1,
                total: job.poiIds.length,
                ts: new Date().toISOString()
            });
            sendSse(jobId, 'poi.failed', { jobId, poiId, error: 'LLM API key is empty', index: job.index + 1, total: job.poiIds.length });
            job.index += 1;
            continue;
        }
        let text = '';
        let meta = null;
        let rawFrameIndex = 0;
        const callStartedAt = Date.now();
        let heartbeatTimer = setInterval(() => {
            sendSse(jobId, 'heartbeat', {
                jobId,
                poiId,
                index: job.index + 1,
                total: job.poiIds.length,
                waitingMs: Date.now() - callStartedAt,
                ts: new Date().toISOString()
            }, false);
        }, 2500);
        try {
            const result = await callRealLlm({
                provider: job.llmProvider,
                model: job.llmModel,
                apiKey: job.llmApiKey,
                prompt,
                poiName: row.poi_name,
                screenshotDataUrl,
                onRequestPayload: (reqPayload) => {
                    sendSse(jobId, 'api.request.raw', {
                        jobId,
                        poiId,
                        llmModel: job.llmModel,
                        provider: reqPayload?.provider || job.llmProvider,
                        apiEndpoint: reqPayload?.endpoint || apiEndpoint,
                        hasApiKey: Boolean(job.llmApiKey),
                        hasImage: Boolean(reqPayload?.hasImage),
                        imageBytes: Number(reqPayload?.imageBytes || 0),
                        imageMime: reqPayload?.imageMime || null,
                        imageSha256: reqPayload?.imageSha256 || null,
                        requestJson: reqPayload?.requestBody || null,
                        promptChars: prompt.length,
                        index: job.index + 1,
                        total: job.poiIds.length,
                        ts: new Date().toISOString()
                    });
                },
                onRawFrame: (rawFrame) => {
                    rawFrameIndex += 1;
                    sendSse(jobId, 'api.response.raw', {
                        jobId,
                        poiId,
                        llmModel: job.llmModel,
                        provider: job.llmProvider,
                        apiEndpoint,
                        frameIndex: rawFrameIndex,
                        rawJson: String(rawFrame || ''),
                        index: job.index + 1,
                        total: job.poiIds.length,
                        ts: new Date().toISOString()
                    }, false);
                },
                onChunk: (chunkPayload) => {
                    const chunkText = typeof chunkPayload === 'string'
                        ? chunkPayload
                        : String(chunkPayload?.text || '');
                    if (!chunkText) return;
                    const chunkIndex = Number.isFinite(Number(chunkPayload?.chunkIndex))
                        ? Number(chunkPayload.chunkIndex)
                        : null;
                    const chunkChars = Number.isFinite(Number(chunkPayload?.chunkChars))
                        ? Number(chunkPayload.chunkChars)
                        : chunkText.length;
                    const contentCharsSoFar = Number.isFinite(Number(chunkPayload?.contentCharsSoFar))
                        ? Number(chunkPayload.contentCharsSoFar)
                        : null;
                    sendSse(jobId, 'poi.chunk', {
                        jobId,
                        poiId,
                        chunk: chunkText,
                        chunkIndex,
                        chunkChars,
                        contentCharsSoFar,
                        index: job.index + 1,
                        total: job.poiIds.length,
                        ts: new Date().toISOString()
                    });
                }
            });
            text = String(result?.text || '');
            meta = result;
        } catch (error) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
            const errObj = error || {};
            const errorCause = errObj.errorCause || describeErrorCause(errObj) || null;
            sendSse(jobId, 'api.error', {
                jobId,
                poiId,
                llmModel: job.llmModel,
                apiEndpoint: errObj.endpoint || apiEndpoint,
                provider: errObj.provider || job.llmProvider,
                status: errObj.status || null,
                requestId: errObj.requestId || null,
                finishReason: errObj.finishReason || null,
                usageMetadata: errObj.usageMetadata || null,
                errorRaw: errObj.rawResponse || null,
                errorCause,
                error: String(errObj.message || errObj),
                index: job.index + 1,
                total: job.poiIds.length,
                ts: new Date().toISOString()
            });
            if (errObj.rawResponse) {
                rawFrameIndex += 1;
                sendSse(jobId, 'api.response.raw', {
                    jobId,
                    poiId,
                    llmModel: job.llmModel,
                    provider: errObj.provider || job.llmProvider,
                    apiEndpoint: errObj.endpoint || apiEndpoint,
                    frameIndex: rawFrameIndex,
                    rawJson: String(errObj.rawResponse),
                    index: job.index + 1,
                    total: job.poiIds.length,
                    ts: new Date().toISOString()
                }, false);
            }
            sendSse(jobId, 'poi.failed', {
                jobId,
                poiId,
                error: String(error),
                index: job.index + 1,
                total: job.poiIds.length
            });
            sendSse(jobId, 'api.response', {
                jobId,
                poiId,
                ok: false,
                llmModel: job.llmModel,
                provider: errObj.provider || job.llmProvider,
                apiEndpoint: errObj.endpoint || apiEndpoint,
                status: errObj.status || null,
                requestId: errObj.requestId || null,
                finishReason: errObj.finishReason || null,
                usageMetadata: errObj.usageMetadata || null,
                language: hasCjk(row.poi_name) ? 'zh-CN' : 'en-US',
                contentChars: 0,
                errorCause,
                error: String(error),
                ts: new Date().toISOString()
            });
            job.index += 1;
            continue;
        }
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        if (!text) {
            sendSse(jobId, 'poi.failed', { jobId, poiId, error: 'empty llm response', index: job.index + 1, total: job.poiIds.length });
            sendSse(jobId, 'api.response', {
                jobId,
                poiId,
                ok: false,
                llmModel: job.llmModel,
                provider: meta?.provider || job.llmProvider,
                apiEndpoint: meta?.endpoint || apiEndpoint,
                status: meta?.status || 200,
                requestId: meta?.requestId || null,
                finishReason: meta?.finishReason || null,
                usageMetadata: meta?.usageMetadata || null,
                language: hasCjk(row.poi_name) ? 'zh-CN' : 'en-US',
                contentChars: 0,
                error: 'empty llm response',
                ts: new Date().toISOString()
            });
            job.index += 1;
            continue;
        }
        const now = new Date().toISOString();
        runRepo('upsertPoi', {
            model_filename: job.modelFilename,
            poi_id: row.poi_id,
            poi_name: row.poi_name,
            sort_order: row.sort_order,
            target_x: row.target_x,
            target_y: row.target_y,
            target_z: row.target_z,
            target_yaw: row.target_yaw,
            target_pitch: row.target_pitch,
            target_fov: toFov(row.target_fov, DEFAULT_POI_FOV),
            move_speed_mps: row.move_speed_mps,
            dwell_ms: row.dwell_ms,
            content: text,
            tts_lang: inferTtsLang({ ttsLang: row.tts_lang, poiName: row.poi_name, content: text }),
            prompt_template: row.prompt_template,
            screenshot_data_url: row.screenshot_data_url,
            screenshot_blob: row.screenshot_blob,
            screenshot_blob_mime: row.screenshot_blob_mime,
            screenshot_updated_at: row.screenshot_updated_at,
            content_updated_at: now,
            prompt_updated_at: row.prompt_updated_at,
            updated_at: now
        });
        sendSse(jobId, 'poi.done', {
            jobId,
            poiId,
            content: text,
            ttsLang: inferTtsLang({ ttsLang: row.tts_lang, poiName: row.poi_name, content: text }),
            index: job.index + 1,
            total: job.poiIds.length,
            ts: now
        });
        sendSse(jobId, 'api.response', {
            jobId,
            poiId,
            ok: true,
            llmModel: job.llmModel,
            provider: meta?.provider || job.llmProvider,
            apiEndpoint: meta?.endpoint || apiEndpoint,
            status: meta?.status || 200,
            requestId: meta?.requestId || null,
            chunkCount: meta?.chunkCount || 0,
            finishReason: meta?.finishReason || null,
            usageMetadata: meta?.usageMetadata || null,
            language: hasCjk(row.poi_name) ? 'zh-CN' : 'en-US',
            contentChars: text.length,
            contentPreview: text.slice(0, 320),
            ts: now
        });
        if (String(meta?.finishReason || '').toUpperCase() === 'MAX_TOKENS') {
            sendSse(jobId, 'api.warn', {
                jobId,
                poiId,
                llmModel: job.llmModel,
                provider: meta?.provider || job.llmProvider,
                message: 'Model output reached MAX_TOKENS; consider higher token limit or shorter prompt.',
                contentChars: text.length,
                ts: now
            });
        }
        job.index += 1;
    }
    job.running = false;
    job.status = 'done';
    sendSse(jobId, 'job.done', { jobId, ts: new Date().toISOString() });
};

const getPathMatch = (pathname, pattern) => {
    const p = pathname.split('/').filter(Boolean);
    const t = pattern.split('/').filter(Boolean);
    if (p.length !== t.length) return null;
    const params = {};
    for (let i = 0; i < t.length; i += 1) {
        if (t[i].startsWith(':')) params[t[i].slice(1)] = decodeURIComponent(p[i]);
        else if (t[i] !== p[i]) return null;
    }
    return params;
};

const server = createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') {
            json(res, 200, { ok: true });
            return;
        }
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;

        if (path === '/api/ot-cinematic-workspace/health' && req.method === 'GET') {
            json(res, 200, { ok: true, service: 'ot-cinematic-workspace', version: '1.0.0' });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/local-file' && req.method === 'GET') {
            return streamLocalFile(req, res, url.searchParams.get('path'));
        }

        if (path === '/api/ot-cinematic-workspace/cinematic/media' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const fileName = String(body.fileName || '').trim();
            const dataBase64 = String(body.dataBase64 || '').trim();
            if (!fileName || !dataBase64) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'fileName and dataBase64 required');
            const stored = storeCinematicMedia({ fileName, dataBase64 });
            json(res, 200, {
                ok: true,
                fileName: stored.fileName,
                mediaUrl: `/api/ot-cinematic-workspace/cinematic/media/${encodeURIComponent(stored.storedName)}`
            });
            return;
        }

        const cinematicMediaMatch = getPathMatch(path, '/api/ot-cinematic-workspace/cinematic/media/:storedName');
        if (cinematicMediaMatch && req.method === 'GET') {
            const storedName = sanitizeStoredMediaName(cinematicMediaMatch.storedName || '');
            return streamLocalFile(req, res, join(cinematicMediaDir, storedName));
        }

        if (path === '/api/ot-cinematic-workspace/state' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const { response, data } = await fetchTlJson(`/state?modelFilename=${encodeURIComponent(modelFilename)}`);
            json(res, response.status, data);
            return;
        }

        if (path === '/api/ot-cinematic-workspace/state' && req.method === 'PUT') {
            const bodyText = await readBody(req) || '{}';
            const { response, data } = await fetchTlJson('/state', { method: 'PUT', body: bodyText });
            json(res, response.status, data);
            return;
        }

        if (path === '/api/ot-cinematic-workspace/llm-config' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const { response, data } = await fetchTlJson(`/llm-config?modelFilename=${encodeURIComponent(modelFilename)}`);
            json(res, response.status, data);
            return;
        }

        if (path === '/api/ot-cinematic-workspace/llm-config' && req.method === 'PUT') {
            const bodyText = await readBody(req) || '{}';
            const { response, data } = await fetchTlJson('/llm-config', { method: 'PUT', body: bodyText });
            json(res, response.status, data);
            return;
        }

        if (path === '/api/ot-cinematic-workspace/llm/direct-call' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const model = String(body.model || DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL;
            const poiName = String(body.poiName || 'POI').trim() || 'POI';
            const prompt = String(body.prompt || `${DEFAULT_PROMPT_TEMPLATE}\nPOI: ${poiName}`).trim();
            let apiKey = String(body.apiKey || '').trim();
            if (!apiKey) {
                apiKey = getGlobalLlmConfig().activeApiKey;
            }
            if (!apiKey) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'apiKey required (or save global key in LLM config)');

            const imageDataUrlInput = String(body.imageDataUrl || '').trim();
            const imageMime = String(body.imageMime || 'image/png').trim() || 'image/png';
            const imageBase64 = String(body.imageBase64 || '').trim();
            const screenshotDataUrl = imageDataUrlInput || (imageBase64 ? `data:${imageMime};base64,${imageBase64}` : '');
            const imgInfo = imageDigest(screenshotDataUrl);
            const chunks = [];
            const start = Date.now();
            const resolvedProvider = resolveLlmProvider({ provider: body?.provider || body?.llm?.provider, model });
            try {
                const result = await callRealLlm({
                    provider: resolvedProvider,
                    model,
                    apiKey,
                    prompt,
                    poiName,
                    screenshotDataUrl,
                    onChunk: (chunkPayload) => {
                        const chunkText = typeof chunkPayload === 'string'
                            ? chunkPayload
                            : String(chunkPayload?.text || '');
                        if (chunkText) chunks.push(chunkText);
                    }
                });
                json(res, 200, {
                    ok: true,
                    provider: result?.provider || resolvedProvider,
                    llmModel: model,
                    apiEndpoint: result?.endpoint || endpointForModel(model, resolvedProvider),
                    status: result?.status || 200,
                    requestId: result?.requestId || null,
                    chunkCount: Number(result?.chunkCount || chunks.length || 0),
                    finishReason: result?.finishReason || null,
                    usageMetadata: result?.usageMetadata || null,
                    contentChars: String(result?.text || '').length,
                    contentPreview: String(result?.text || '').slice(0, 400),
                    promptChars: prompt.length,
                    hasImage: Boolean(screenshotDataUrl),
                    imageBytes: imgInfo.bytes,
                    imageMime: imgInfo.mime,
                    imageSha256: imgInfo.sha256,
                    durationMs: Date.now() - start,
                    ts: new Date().toISOString()
                });
            } catch (error) {
                const errObj = error || {};
                fail(res, 502, 'OT_TL_LLM_CALL_FAILED', String(errObj.message || errObj), {
                    provider: errObj.provider || resolvedProvider,
                    llmModel: model,
                    apiEndpoint: errObj.endpoint || endpointForModel(model, resolvedProvider),
                    status: errObj.status || null,
                    requestId: errObj.requestId || null,
                    finishReason: errObj.finishReason || null,
                    usageMetadata: errObj.usageMetadata || null,
                    promptChars: prompt.length,
                    hasImage: Boolean(screenshotDataUrl),
                    imageBytes: imgInfo.bytes,
                    imageMime: imgInfo.mime,
                    imageSha256: imgInfo.sha256,
                    durationMs: Date.now() - start
                });
            }
            return;
        }

        if (path === '/api/ot-cinematic-workspace/pois' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const p = body.poi || {};
            const poiId = String(p.poiId || `poi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
            const now = new Date().toISOString();
            const promptTemplate = p.promptTemplate === undefined || p.promptTemplate === null
                ? DEFAULT_PROMPT_TEMPLATE
                : String(p.promptTemplate || '');
            runRepo('upsertPoi', {
                model_filename: modelFilename,
                poi_id: poiId,
                poi_name: String(p.poiName || poiId),
                sort_order: Math.max(0, Math.floor(toNum(p.sortOrder, 0))),
                target_x: toNum(p.targetX, 0),
                target_y: toNum(p.targetY, 0),
                target_z: toNum(p.targetZ, 0),
                target_yaw: toNum(p.targetYaw, 0),
                target_pitch: toNum(p.targetPitch, 0),
                target_fov: toFov(p.targetFov, DEFAULT_POI_FOV),
                move_speed_mps: toNum(p.moveSpeedMps, 0.8),
                dwell_ms: Math.max(0, Math.floor(toNum(p.dwellMs, 1500))),
                content: String(p.content || ''),
                tts_lang: String(p.ttsLang || ''),
                prompt_template: promptTemplate,
                screenshot_data_url: null,
                screenshot_blob: null,
                screenshot_blob_mime: null,
                screenshot_updated_at: null,
                content_updated_at: null,
                prompt_updated_at: now,
                updated_at: now
            });
            json(res, 200, { ok: true, modelFilename, poiId, updatedAt: now });
            return;
        }

        const patchMatch = getPathMatch(path, '/api/ot-cinematic-workspace/pois/:poiId');
        if (patchMatch && req.method === 'PATCH') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const row = getRepo('getPoiById', modelFilename, patchMatch.poiId);
            if (!row) return fail(res, 404, 'OT_TL_NOT_FOUND', 'poi not found');
            const patch = body.patch || {};
            const now = new Date().toISOString();
            runRepo('upsertPoi', {
                model_filename: modelFilename,
                poi_id: row.poi_id,
                poi_name: patch.poiName !== undefined ? String(patch.poiName || row.poi_name) : row.poi_name,
                sort_order: row.sort_order,
                target_x: patch.targetX !== undefined ? toNum(patch.targetX, row.target_x) : row.target_x,
                target_y: patch.targetY !== undefined ? toNum(patch.targetY, row.target_y) : row.target_y,
                target_z: patch.targetZ !== undefined ? toNum(patch.targetZ, row.target_z) : row.target_z,
                target_yaw: patch.targetYaw !== undefined ? toNum(patch.targetYaw, row.target_yaw) : row.target_yaw,
                target_pitch: patch.targetPitch !== undefined ? toNum(patch.targetPitch, row.target_pitch) : row.target_pitch,
                target_fov: patch.targetFov !== undefined ? toFov(patch.targetFov, row.target_fov) : toFov(row.target_fov, DEFAULT_POI_FOV),
                move_speed_mps: patch.moveSpeedMps !== undefined ? toNum(patch.moveSpeedMps, row.move_speed_mps) : row.move_speed_mps,
                dwell_ms: patch.dwellMs !== undefined ? Math.max(0, Math.floor(toNum(patch.dwellMs, row.dwell_ms))) : row.dwell_ms,
                content: patch.content !== undefined ? String(patch.content || '') : row.content,
                tts_lang: patch.ttsLang !== undefined ? String(patch.ttsLang || '') : row.tts_lang,
                prompt_template: patch.promptTemplate !== undefined ? String(patch.promptTemplate || '') : row.prompt_template,
                screenshot_data_url: row.screenshot_data_url,
                screenshot_blob: row.screenshot_blob,
                screenshot_blob_mime: row.screenshot_blob_mime,
                screenshot_updated_at: row.screenshot_updated_at,
                content_updated_at: patch.content !== undefined ? now : row.content_updated_at,
                prompt_updated_at: patch.promptTemplate !== undefined ? now : row.prompt_updated_at,
                updated_at: now
            });
            json(res, 200, { ok: true, modelFilename, poiId: row.poi_id, updatedAt: now });
            return;
        }

        if (patchMatch && req.method === 'DELETE') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            runRepo('clearPoiHotspots', modelFilename, patchMatch.poiId);
            runRepo('deletePoi', modelFilename, patchMatch.poiId);
            json(res, 200, { ok: true, modelFilename, poiId: patchMatch.poiId });
            return;
        }

        const shotMatch = getPathMatch(path, '/api/ot-cinematic-workspace/pois/:poiId/screenshot');
        if (shotMatch && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const row = getRepo('getPoiById', modelFilename, shotMatch.poiId);
            if (!row) return fail(res, 404, 'OT_TL_NOT_FOUND', 'poi not found');
            const shot = String(body.screenshotDataUrl || '').trim();
            const mime = String(body.imageMime || 'image/png');
            const decoded = decodeDataUrl(shot);
            const now = new Date().toISOString();
            runRepo('upsertPoi', {
                model_filename: modelFilename,
                poi_id: row.poi_id,
                poi_name: row.poi_name,
                sort_order: row.sort_order,
                target_x: row.target_x,
                target_y: row.target_y,
                target_z: row.target_z,
                target_yaw: row.target_yaw,
                target_pitch: row.target_pitch,
                target_fov: toFov(row.target_fov, DEFAULT_POI_FOV),
                move_speed_mps: row.move_speed_mps,
                dwell_ms: row.dwell_ms,
                content: row.content,
                tts_lang: row.tts_lang,
                prompt_template: row.prompt_template,
                screenshot_data_url: shot || null,
                screenshot_blob: decoded.blob,
                screenshot_blob_mime: decoded.mime || mime,
                screenshot_updated_at: now,
                content_updated_at: row.content_updated_at,
                prompt_updated_at: row.prompt_updated_at,
                updated_at: now
            });
            json(res, 200, { ok: true, modelFilename, poiId: row.poi_id, screenshotUpdatedAt: now });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/csv/export/jobs' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const globalLlmCfg = getGlobalLlmConfig();
            const promptCfg = getRepo('getPromptConfig', modelFilename);
            const llmProvider = resolveLlmProvider({ provider: body?.llm?.provider || globalLlmCfg.selectedProvider, model: body?.llm?.model || globalLlmCfg.activeModel });
            const llmModel = String(body?.llm?.model || globalLlmCfg.activeModel || DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL;
            const llmApiKey = String(body?.llm?.apiKey || globalLlmCfg.activeApiKey || '').trim();
            const csvPromptTemplate = String(body?.llm?.csvPromptTemplate || promptCfg?.csv_prompt_template || DEFAULT_CSV_PROMPT_TEMPLATE).trim() || DEFAULT_CSV_PROMPT_TEMPLATE;
            const movePromptTemplate = String(body?.llm?.movePromptTemplate || promptCfg?.move_prompt_template || DEFAULT_MOVE_PROMPT_TEMPLATE).trim() || DEFAULT_MOVE_PROMPT_TEMPLATE;
            const voiceConfig = normalizeVoiceConfig(body?.voiceConfig || {});
            const timingConfig = normalizeTimingConfig(body?.timingConfig || {});
            const jobId = createCsvExportJob({
                modelFilename,
                llmProvider,
                llmModel,
                llmApiKey,
                csvPromptTemplate,
                movePromptTemplate,
                voiceConfig,
                timingConfig
            });
            void runCsvExportJob(jobId);
            json(res, 200, { ok: true, jobId, status: 'running' });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/csv/versions' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const rows = allRepo('getCsvVersionList', modelFilename).map((row) => mapCsvVersionRow(row));
            json(res, 200, { ok: true, modelFilename, versions: rows });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/csv/versions' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const csvText = String(body.csvText || '');
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            if (!csvText.trim()) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'csvText required');
            const version = createCsvVersion({ modelFilename, status: 'draft', source: String(body.source || 'manual'), csvText });
            json(res, 200, { ok: true, modelFilename, version });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/cinematic/versions' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const rows = allRepo('getCinematicVersionList', modelFilename).map((row) => mapCinematicVersionRow(row));
            json(res, 200, { ok: true, modelFilename, versions: rows });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/cinematic/versions' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const version = createCinematicVersion({
                modelFilename,
                status: String(body.status || 'draft') || 'draft',
                source: String(body.source || 'manual') || 'manual',
                simplePrompt: String(body.simplePrompt || ''),
                plannerPrompt: String(body.plannerPrompt || ''),
                sceneDescription: String(body.sceneDescription || ''),
                storyBackground: String(body.storyBackground || ''),
                styleText: String(body.styleText || ''),
                targetDurationSec: body.targetDurationSec === null || body.targetDurationSec === undefined ? null : Number(body.targetDurationSec),
                selectedPoiIds: Array.isArray(body.selectedPoiIds) ? body.selectedPoiIds : [],
                plan: body.plan || null,
                csvText: String(body.csvText || '')
            });
            json(res, 200, { ok: true, modelFilename, version });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/csv/versions/generate' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const globalLlmCfg = getGlobalLlmConfig();
            const promptCfg = getRepo('getPromptConfig', modelFilename);
            const llmProvider = resolveLlmProvider({ provider: body?.llm?.provider || globalLlmCfg.selectedProvider, model: body?.llm?.model || globalLlmCfg.activeModel });
            const llmModel = String(body?.llm?.model || globalLlmCfg.activeModel || DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL;
            const llmApiKey = String(body?.llm?.apiKey || globalLlmCfg.activeApiKey || '').trim();
            const csvPromptTemplate = String(body?.llm?.csvPromptTemplate || promptCfg?.csv_prompt_template || DEFAULT_CSV_PROMPT_TEMPLATE).trim() || DEFAULT_CSV_PROMPT_TEMPLATE;
            const movePromptTemplate = String(body?.llm?.movePromptTemplate || promptCfg?.move_prompt_template || DEFAULT_MOVE_PROMPT_TEMPLATE).trim() || DEFAULT_MOVE_PROMPT_TEMPLATE;
            const voiceConfig = normalizeVoiceConfig(body?.voiceConfig || {});
            const timingConfig = normalizeTimingConfig(body?.timingConfig || {});

            const jobId = createCsvExportJob({
                modelFilename,
                llmProvider,
                llmModel,
                llmApiKey,
                csvPromptTemplate,
                movePromptTemplate,
                voiceConfig,
                timingConfig
            });
            await runCsvExportJob(jobId);
            const job = csvExportJobStore.get(jobId);
            if (!job || job.status !== 'done' || !String(job.csvText || '').trim()) {
                return fail(res, 500, 'OT_TL_EXPORT_FAILED', String(job?.error || 'csv generation failed'), {
                    timingSummary: job?.timingSummary || null
                });
            }
            const version = createCsvVersion({
                modelFilename,
                status: 'draft',
                source: 'generated',
                csvText: String(job.csvText),
                llmModel,
                csvPromptTemplate,
                movePromptTemplate
            });
            json(res, 200, { ok: true, modelFilename, jobId, version, timingSummary: job.timingSummary || null });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/csv/timing/estimate' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body?.modelFilename || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_MODEL_REQUIRED', 'modelFilename is required');
            const globalLlmCfg = getGlobalLlmConfig();
            const promptCfg = getRepo('getPromptConfig', modelFilename);
            const llmModel = String(body?.llm?.model || globalLlmCfg.activeModel || DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL;
            const llmApiKey = String(body?.llm?.apiKey || globalLlmCfg.activeApiKey || '').trim();
            const csvPromptTemplate = String(body?.llm?.csvPromptTemplate || promptCfg?.csv_prompt_template || DEFAULT_CSV_PROMPT_TEMPLATE).trim() || DEFAULT_CSV_PROMPT_TEMPLATE;
            const movePromptTemplate = String(body?.llm?.movePromptTemplate || promptCfg?.move_prompt_template || DEFAULT_MOVE_PROMPT_TEMPLATE).trim() || DEFAULT_MOVE_PROMPT_TEMPLATE;
            const timingConfig = normalizeTimingConfig(body?.timingConfig || {});
            const timingSummary = await computeCsvTimingSummary({
                modelFilename,
                llmModel,
                llmApiKey,
                csvPromptTemplate,
                movePromptTemplate,
                timingConfig
            });
            json(res, 200, { ok: true, modelFilename, timingSummary });
            return;
        }

        const csvExportEventsMatch = getPathMatch(path, '/api/ot-cinematic-workspace/csv/export/jobs/:jobId/events');
        if (csvExportEventsMatch && req.method === 'GET') {
            const jobId = csvExportEventsMatch.jobId;
            if (!csvExportJobStore.has(jobId)) return fail(res, 404, 'OT_TL_NOT_FOUND', 'csv export job not found');
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });
            if (!csvExportSseStore.has(jobId)) csvExportSseStore.set(jobId, new Set());
            csvExportSseStore.get(jobId).add(res);
            res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, jobId })}\n\n`);
            const history = csvExportEventHistoryStore.get(jobId) || [];
            history.forEach(({ event, payload }) => {
                res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
            });
            req.on('close', () => {
                const set = csvExportSseStore.get(jobId);
                if (set) set.delete(res);
            });
            return;
        }

        const csvExportDownloadMatch = getPathMatch(path, '/api/ot-cinematic-workspace/csv/export/jobs/:jobId/download');
        if (csvExportDownloadMatch && req.method === 'GET') {
            const jobId = csvExportDownloadMatch.jobId;
            const job = csvExportJobStore.get(jobId);
            if (!job) return fail(res, 404, 'OT_TL_NOT_FOUND', 'csv export job not found');
            if (job.status !== 'done') {
                return fail(res, 409, 'OT_TL_EXPORT_NOT_READY', `csv export job status is '${job.status}'`);
            }
            if (!String(job.csvText || '').trim()) {
                return fail(res, 500, 'OT_TL_EXPORT_EMPTY', 'csv export job finished without csv content');
            }
            const filename = `ot-tour-loader-${Date.now()}.csv`;
            csvResponse(res, String(job.csvText), filename);
            return;
        }

        const csvVersionMatch = getPathMatch(path, '/api/ot-cinematic-workspace/csv/versions/:versionId');
        if (csvVersionMatch && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            const versionId = Math.floor(toNum(csvVersionMatch.versionId, 0));
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            const row = getRepo('getCsvVersionById', versionId, modelFilename);
            if (!row) return fail(res, 404, 'OT_TL_NOT_FOUND', 'csv version not found');
            json(res, 200, { ok: true, modelFilename, version: mapCsvVersionRow(row, true) });
            return;
        }

        const cinematicVersionMatch = getPathMatch(path, '/api/ot-cinematic-workspace/cinematic/versions/:versionId');
        if (cinematicVersionMatch && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            const versionId = Math.floor(toNum(cinematicVersionMatch.versionId, 0));
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            const row = getRepo('getCinematicVersionById', versionId, modelFilename);
            if (!row) return fail(res, 404, 'OT_TL_NOT_FOUND', 'cinematic version not found');
            json(res, 200, { ok: true, modelFilename, version: mapCinematicVersionRow(row, true) });
            return;
        }

        if (cinematicVersionMatch && req.method === 'PUT') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const versionId = Math.floor(toNum(cinematicVersionMatch.versionId, 0));
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            const now = new Date().toISOString();
            const result = runRepo('updateCinematicVersion', {
                id: versionId,
                model_filename: modelFilename,
                status: String(body.status || 'draft') || 'draft',
                source: String(body.source || 'manual') || 'manual',
                simple_prompt: String(body.simplePrompt || ''),
                planner_prompt: String(body.plannerPrompt || ''),
                scene_description: String(body.sceneDescription || ''),
                story_background: String(body.storyBackground || ''),
                style_text: String(body.styleText || ''),
                target_duration_sec: body.targetDurationSec === null || body.targetDurationSec === undefined ? null : Number(body.targetDurationSec),
                selected_poi_ids_json: JSON.stringify(Array.isArray(body.selectedPoiIds) ? body.selectedPoiIds : []),
                plan_json: body.plan ? JSON.stringify(body.plan) : '',
                csv_text: String(body.csvText || ''),
                updated_at: now,
                confirmed_at: body.status === 'confirmed' ? now : null
            });
            const row = result.changes ? getRepo('getCinematicVersionById', versionId, modelFilename) : null;
            if (!row) return fail(res, 404, 'OT_TL_NOT_FOUND', 'cinematic version not found');
            json(res, 200, { ok: true, modelFilename, version: mapCinematicVersionRow(row, true) });
            return;
        }

        if (cinematicVersionMatch && req.method === 'DELETE') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            const versionId = Math.floor(toNum(cinematicVersionMatch.versionId, 0));
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            runRepo('deleteCinematicVersion', versionId, modelFilename);
            json(res, 200, { ok: true, modelFilename, versionId });
            return;
        }

        if (csvVersionMatch && req.method === 'PUT') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const versionId = Math.floor(toNum(csvVersionMatch.versionId, 0));
            const csvText = String(body.csvText || '');
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            if (!csvText.trim()) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'csvText required');
            const now = new Date().toISOString();
            const result = runRepo('updateCsvVersion', {
                id: versionId,
                model_filename: modelFilename,
                csv_text: csvText,
                updated_at: now,
                llm_model: body.llmModel ? String(body.llmModel) : null,
                csv_prompt_template: body.csvPromptTemplate ? String(body.csvPromptTemplate) : null,
                move_prompt_template: body.movePromptTemplate ? String(body.movePromptTemplate) : null
            });
            if (!result.changes) return fail(res, 404, 'OT_TL_NOT_FOUND', 'csv version not found');
            const row = getRepo('getCsvVersionById', versionId, modelFilename);
            json(res, 200, { ok: true, modelFilename, version: row ? mapCsvVersionRow(row, true) : null });
            return;
        }

        if (csvVersionMatch && req.method === 'DELETE') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            const versionId = Math.floor(toNum(csvVersionMatch.versionId, 0));
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            const result = runRepo('deleteCsvVersion', versionId, modelFilename);
            if (!result.changes) return fail(res, 404, 'OT_TL_NOT_FOUND', 'csv version not found');
            json(res, 200, { ok: true, modelFilename, versionId });
            return;
        }

        const csvVersionSaveAsNewMatch = getPathMatch(path, '/api/ot-cinematic-workspace/csv/versions/:versionId/save-as-new');
        if (csvVersionSaveAsNewMatch && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const sourceVersionId = Math.floor(toNum(csvVersionSaveAsNewMatch.versionId, 0));
            if (!modelFilename || sourceVersionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            const sourceRow = getRepo('getCsvVersionById', sourceVersionId, modelFilename);
            if (!sourceRow) return fail(res, 404, 'OT_TL_NOT_FOUND', 'source csv version not found');
            const csvText = String(body.csvText || sourceRow.csv_text || '');
            if (!csvText.trim()) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'csvText required');
            const version = createCsvVersion({
                modelFilename,
                status: String(body.status || 'draft') === 'confirmed' ? 'confirmed' : 'draft',
                source: 'manual',
                csvText,
                llmModel: body.llmModel ? String(body.llmModel) : sourceRow.llm_model,
                csvPromptTemplate: body.csvPromptTemplate ? String(body.csvPromptTemplate) : sourceRow.csv_prompt_template,
                movePromptTemplate: body.movePromptTemplate ? String(body.movePromptTemplate) : sourceRow.move_prompt_template,
                confirmedAt: String(body.status || '') === 'confirmed' ? new Date().toISOString() : null
            });
            json(res, 200, { ok: true, modelFilename, version });
            return;
        }

        const csvVersionConfirmMatch = getPathMatch(path, '/api/ot-cinematic-workspace/csv/versions/:versionId/confirm');
        if (csvVersionConfirmMatch && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const versionId = Math.floor(toNum(csvVersionConfirmMatch.versionId, 0));
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            const row = getRepo('getCsvVersionById', versionId, modelFilename);
            if (!row) return fail(res, 404, 'OT_TL_NOT_FOUND', 'csv version not found');
            const csvText = String(body.csvText || row.csv_text || '');
            if (!csvText.trim()) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'csvText required');
            const now = new Date().toISOString();
            runRepo('confirmCsvVersion', {
                id: versionId,
                model_filename: modelFilename,
                csv_text: csvText,
                confirmed_at: now,
                updated_at: now
            });
            const next = getRepo('getCsvVersionById', versionId, modelFilename);
            json(res, 200, { ok: true, modelFilename, version: next ? mapCsvVersionRow(next, true) : null });
            return;
        }

        const csvVersionDownloadMatch = getPathMatch(path, '/api/ot-cinematic-workspace/csv/versions/:versionId/download');
        if (csvVersionDownloadMatch && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            const versionId = Math.floor(toNum(csvVersionDownloadMatch.versionId, 0));
            if (!modelFilename || versionId <= 0) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and valid versionId required');
            const row = getRepo('getCsvVersionById', versionId, modelFilename);
            if (!row) return fail(res, 404, 'OT_TL_NOT_FOUND', 'csv version not found');
            const filename = `ot-tour-loader-${modelFilename.replace(/[^a-zA-Z0-9_.-]/g, '_')}-v${Number(row.version_no || 0)}.csv`;
            csvResponse(res, String(row.csv_text || ''), filename);
            return;
        }

        if (path === '/api/ot-cinematic-workspace/csv/export' && req.method === 'GET') {
            const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
            if (!modelFilename) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename required');
            const { profile, rows } = await getTlPoiRows(modelFilename);
            const header = [
                'version','seq','action','audio_mode','poi_id','poi_name','target_x','target_y','target_z','target_yaw','target_pitch','target_fov','move_speed_mps','dwell_ms','content','tts_lang','tts_voice','model_filename','eye_height_m'
            ];
            const lines = [header.join(',')];
            let seq = 1;
            let prevRow = null;
            rows.forEach((row) => {
                const ttsLang = inferTtsLang({
                    ttsLang: row.tts_lang,
                    poiName: row.poi_name,
                    content: row.content
                });
                const language = String(ttsLang).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
                const moveDistance = moveDistanceMeters(prevRow, row);
                const moveDirection = moveDirectionLabel(
                    prevRow ? toNum(row.target_x, 0) - toNum(prevRow.target_x, 0) : NaN,
                    prevRow ? toNum(row.target_z, 0) - toNum(prevRow.target_z, 0) : NaN,
                    language
                );
                const moveContent = buildMoveFallbackContent({
                    fromName: prevRow ? String(prevRow.poi_name || '').trim() : '',
                    toName: String(row.poi_name || row.poi_id || '').trim() || String(row.poi_id || ''),
                    distanceM: moveDistance,
                    direction: moveDirection,
                    language
                });
                const base = {
                    poiId: row.poi_id,
                    poiName: row.poi_name,
                    x: row.target_x,
                    y: row.target_y,
                    z: row.target_z,
                    yaw: row.target_yaw,
                    pitch: row.target_pitch,
                    fov: toFov(row.target_fov, DEFAULT_POI_FOV),
                    speed: row.move_speed_mps,
                    dwell: row.dwell_ms,
                    content: row.content,
                    tts: ttsLang,
                    eye: profile?.eye_height_m ?? 1.65
                };
                const moveRow = [
                    'v2', seq++, 'MOVE', 'INTERRUPTIBLE',
                    base.poiId, base.poiName,
                    base.x.toFixed(3), base.y.toFixed(3), base.z.toFixed(3),
                    base.yaw.toFixed(2), base.pitch.toFixed(2),
                    base.fov.toFixed(2),
                    base.speed.toFixed(2), String(Math.max(200, Math.floor(base.dwell / 2))),
                    moveContent, base.tts || '', '', modelFilename, Number(base.eye).toFixed(2)
                ].map(escapeCsv);
                lines.push(moveRow.join(','));
                const lookRow = [
                    'v2', seq++, 'LOOK', 'BLOCKING',
                    base.poiId, base.poiName,
                    base.x.toFixed(3), base.y.toFixed(3), base.z.toFixed(3),
                    base.yaw.toFixed(2), base.pitch.toFixed(2),
                    base.fov.toFixed(2),
                    base.speed.toFixed(2), String(Math.max(500, Math.floor(base.dwell))),
                    base.content || '', base.tts || '', '', modelFilename, Number(base.eye).toFixed(2)
                ].map(escapeCsv);
                lines.push(lookRow.join(','));
                prevRow = row;
            });
            const filename = `ot-tour-loader-${Date.now()}.csv`;
            csvResponse(res, lines.join('\n'), filename);
            return;
        }

        if (path === '/api/ot-cinematic-workspace/csv/import' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const csvText = String(body.csvText || '').trim();
            if (!modelFilename || !csvText) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and csvText required');
            const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            if (lines.length < 2) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'csv has no rows');
            const headers = parseCsvLine(lines[0]).map((x) => x.toLowerCase());
            const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
            const get = (parts, key) => {
                const i = idx[key];
                return i === undefined ? '' : (parts[i] || '').trim();
            };
            const grouped = new Map();
            let generatedPoiIds = 0;
            lines.slice(1).forEach((line, rowIndex) => {
                const parts = parseCsvLine(line);
                let poiId = get(parts, 'poi_id');
                if (!poiId) {
                    generatedPoiIds += 1;
                    poiId = `poi_${Date.now().toString(36)}_${rowIndex}`;
                }
                const existing = grouped.get(poiId) || {
                    poiId,
                    poiName: get(parts, 'poi_name') || poiId,
                    sortOrder: grouped.size,
                    targetX: 0,
                    targetY: 0,
                    targetZ: 0,
                    targetYaw: 0,
                    targetPitch: 0,
                    targetFov: DEFAULT_POI_FOV,
                    moveSpeedMps: 0.8,
                    dwellMs: 1500,
                    content: '',
                    ttsLang: ''
                };
                existing.poiName = get(parts, 'poi_name') || existing.poiName;
                existing.targetX = toNum(get(parts, 'target_x'), existing.targetX);
                existing.targetY = toNum(get(parts, 'target_y'), existing.targetY);
                existing.targetZ = toNum(get(parts, 'target_z'), existing.targetZ);
                existing.targetYaw = toNum(get(parts, 'target_yaw'), existing.targetYaw);
                existing.targetPitch = toNum(get(parts, 'target_pitch'), existing.targetPitch);
                existing.targetFov = toFov(get(parts, 'target_fov'), existing.targetFov);
                existing.moveSpeedMps = toNum(get(parts, 'move_speed_mps'), existing.moveSpeedMps);
                existing.dwellMs = Math.max(0, Math.floor(toNum(get(parts, 'dwell_ms'), existing.dwellMs)));
                const content = get(parts, 'content');
                if (content) existing.content = content;
                const lang = get(parts, 'tts_lang');
                if (lang) existing.ttsLang = lang;
                grouped.set(poiId, existing);
            });
            const pois = Array.from(grouped.values()).map((poi, i) => ({ ...poi, sortOrder: i }));
            const updatedAt = saveState(modelFilename, { eyeHeightM: 1.65 }, pois);
            json(res, 200, { ok: true, modelFilename, totalRows: lines.length - 1, imported: pois.length, generatedPoiIds, updatedAt });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/content/jobs' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const poiIds = Array.isArray(body.poiIds) ? body.poiIds.map((x) => String(x)) : [];
            if (!modelFilename || poiIds.length < 1) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and poiIds required');
            const globalCfg = getGlobalLlmConfig();
            const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            const promptMode = String(body?.llm?.promptMode || 'global');
            const promptTemplate = typeof body?.llm?.promptTemplate === 'string'
                ? String(body.llm.promptTemplate)
                : '';
            if (!String(promptTemplate || '').trim()) {
                return fail(res, 400, 'OT_TL_VALIDATION_ERROR', `${promptMode === 'poi' ? 'poi' : 'global'} promptTemplate required`);
            }
            jobStore.set(jobId, {
                jobId,
                modelFilename,
                poiIds,
                index: 0,
                status: 'running',
                running: false,
                stopRequested: false,
                promptTemplate,
                llmModel: String(body?.llm?.model || globalCfg.activeModel || DEFAULT_LLM_MODEL),
                llmProvider: resolveLlmProvider({ provider: body?.llm?.provider || globalCfg.selectedProvider, model: body?.llm?.model || globalCfg.activeModel }),
                llmApiKey: String(body?.llm?.apiKey || globalCfg.activeApiKey || ''),
                promptMode,
                apiEndpoint: String(body?.llm?.apiEndpoint || '/mock/llm/content')
            });
            void runJob(jobId);
            json(res, 200, { ok: true, jobId, status: 'running' });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/cinematic/jobs/prompt' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const simplePrompt = String(body.simplePrompt || '').trim();
            if (!modelFilename || !simplePrompt) return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename and simplePrompt required');
            const globalCfg = getGlobalLlmConfig();
            const jobId = `cinejob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            cinematicJobStore.set(jobId, {
                jobId,
                kind: 'prompt',
                modelFilename,
                simplePrompt,
                llmProvider: resolveLlmProvider({ provider: body?.llm?.provider || globalCfg.selectedProvider, model: body?.llm?.model || globalCfg.activeModel }),
                llmModel: String(body?.llm?.model || globalCfg.activeModel || DEFAULT_LLM_MODEL),
                llmApiKey: String(body?.llm?.apiKey || globalCfg.activeApiKey || ''),
                status: 'running',
                running: false,
                result: null,
                error: null
            });
            void runCinematicJob(jobId);
            json(res, 200, { ok: true, jobId, status: 'running' });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/cinematic/speech-preview' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const shotId = String(body.shotId || '').trim();
            const text = String(body.text || '').trim();
            if (!modelFilename || !shotId || !text) {
                return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename, shotId, and text required');
            }
            const globalTts = getTtsConfig();
            if (!globalTts.apiKey) {
                return fail(res, 400, 'OT_TL_TTS_CONFIG_ERROR', 'Global TTS API key is empty');
            }
            const requestedVoiceConfig = normalizeVoiceConfig({
                enabled: false,
                mode: 'fixed',
                model: body?.ttsConfig?.model || body?.ttsModel || globalTts.model,
                fixedVoice: body?.ttsConfig?.voice || body?.ttsVoice || globalTts.voice,
                voicePool: []
            });
            const ttsLang = inferTtsLang({ ttsLang: body.ttsLang || '', poiName: body.poiName || '', content: text });
            const result = await synthesizeDashscopeSpeechWithFallback({
                apiKey: globalTts.apiKey,
                model: requestedVoiceConfig.model,
                voice: requestedVoiceConfig.fixedVoice,
                format: globalTts.format,
                text
            });
            json(res, 200, {
                ok: true,
                shotId,
                modelFilename,
                text,
                chars: (text.match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length,
                estimatedDurationSec: Number(estimateSpeechDurationSec(text, ttsLang).toFixed(3)),
                ttsLang,
                ttsConfig: {
                    provider: globalTts.provider,
                    model: requestedVoiceConfig.model,
                    voice: requestedVoiceConfig.fixedVoice,
                    format: globalTts.format,
                    updatedAt: globalTts.updatedAt
                },
                audioUrl: result.audioUrl,
                debug: result.debug || null
            });
            return;
        }

        if (path === '/api/ot-cinematic-workspace/cinematic/jobs/timeline' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}');
            const modelFilename = String(body.modelFilename || '').trim();
            const plannerPrompt = String(body.plannerPrompt || '').trim();
            const targetDurationSec = Math.max(4, Number(toNum(body.targetDurationSec, 14)));
            const pois = Array.isArray(body.pois) ? body.pois.map((poi) => ({
                poiId: String(poi?.poiId || ''),
                poiName: String(poi?.poiName || ''),
                content: String(poi?.content || ''),
                screenshotDataUrl: String(poi?.screenshotDataUrl || ''),
                targetX: Number(toNum(poi?.targetX, 0)),
                targetY: Number(toNum(poi?.targetY, 0)),
                targetZ: Number(toNum(poi?.targetZ, 0)),
                targetYaw: Number(toNum(poi?.targetYaw, 0)),
                targetPitch: Number(toNum(poi?.targetPitch, 0)),
                targetFov: Number(toNum(poi?.targetFov, DEFAULT_POI_FOV)),
                moveSpeedMps: Number(toNum(poi?.moveSpeedMps, 0.8))
            })).filter((poi) => poi.poiId) : [];
            if (!modelFilename || !plannerPrompt || pois.length < 2) {
                return fail(res, 400, 'OT_TL_VALIDATION_ERROR', 'modelFilename, plannerPrompt, and at least 2 pois required');
            }
            const globalCfg = getGlobalLlmConfig();
            const jobId = `cinejob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            cinematicJobStore.set(jobId, {
                jobId,
                kind: 'timeline',
                modelFilename,
                plannerPrompt,
                targetDurationSec,
                pois,
                llmProvider: resolveLlmProvider({ provider: body?.llm?.provider || globalCfg.selectedProvider, model: body?.llm?.model || globalCfg.activeModel }),
                llmModel: String(body?.llm?.model || globalCfg.activeModel || DEFAULT_LLM_MODEL),
                llmApiKey: String(body?.llm?.apiKey || globalCfg.activeApiKey || ''),
                status: 'running',
                running: false,
                result: null,
                error: null
            });
            void runCinematicJob(jobId);
            json(res, 200, { ok: true, jobId, status: 'running' });
            return;
        }

        const cinematicJobStreamMatch = getPathMatch(path, '/api/ot-cinematic-workspace/cinematic/jobs/:jobId/events');
        if (cinematicJobStreamMatch && req.method === 'GET') {
            const jobId = cinematicJobStreamMatch.jobId;
            if (!cinematicJobStore.has(jobId)) return fail(res, 404, 'OT_TL_NOT_FOUND', 'cinematic job not found');
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });
            if (!cinematicSseStore.has(jobId)) cinematicSseStore.set(jobId, new Set());
            cinematicSseStore.get(jobId).add(res);
            res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, jobId })}\n\n`);
            const history = cinematicEventHistoryStore.get(jobId) || [];
            history.forEach(({ event, payload }) => {
                res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
            });
            req.on('close', () => {
                const set = cinematicSseStore.get(jobId);
                if (set) set.delete(res);
            });
            return;
        }

        const streamMatch = getPathMatch(path, '/api/ot-cinematic-workspace/content/jobs/:jobId/events');
        if (streamMatch && req.method === 'GET') {
            const jobId = streamMatch.jobId;
            if (!jobStore.has(jobId)) return fail(res, 404, 'OT_TL_NOT_FOUND', 'job not found');
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });
            if (!sseStore.has(jobId)) sseStore.set(jobId, new Set());
            sseStore.get(jobId).add(res);
            res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, jobId })}\n\n`);
            const history = eventHistoryStore.get(jobId) || [];
            history.forEach(({ event, payload }) => {
                res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
            });
            req.on('close', () => {
                const set = sseStore.get(jobId);
                if (set) set.delete(res);
            });
            return;
        }

        const stopMatch = getPathMatch(path, '/api/ot-cinematic-workspace/content/jobs/:jobId/stop');
        if (stopMatch && req.method === 'POST') {
            const job = jobStore.get(stopMatch.jobId);
            if (!job) return fail(res, 404, 'OT_TL_NOT_FOUND', 'job not found');
            job.stopRequested = true;
            job.status = 'paused';
            json(res, 200, { ok: true, jobId: job.jobId, status: 'paused' });
            return;
        }

        const resumeMatch = getPathMatch(path, '/api/ot-cinematic-workspace/content/jobs/:jobId/resume');
        if (resumeMatch && req.method === 'POST') {
            const job = jobStore.get(resumeMatch.jobId);
            if (!job) return fail(res, 404, 'OT_TL_NOT_FOUND', 'job not found');
            job.stopRequested = false;
            job.status = 'running';
            sendSse(job.jobId, 'job.resumed', { jobId: job.jobId, index: job.index, ts: new Date().toISOString() });
            void runJob(job.jobId);
            json(res, 200, { ok: true, jobId: job.jobId, status: 'running', resumeFromIndex: job.index });
            return;
        }

        fail(res, 404, 'OT_TL_NOT_FOUND', 'route not found');
    } catch (error) {
        fail(res, 500, 'OT_TL_SERVER_ERROR', String(error));
    }
});

const port = Number(process.env.OT_CINEMATIC_WORKSPACE_PORT || 3032);
server.listen(port, () => {
    console.log(`[ot-cinematic-workspace] listening on http://localhost:${port}`);
    console.log(`[ot-cinematic-workspace] llm dispatcher: ${LLM_PROXY_URL ? `proxy ${LLM_PROXY_URL}` : 'direct'}`);
    if (cleanedOrphanBgmCount > 0) console.log(`[ot-cinematic-workspace] cleaned orphan bgm refs: ${cleanedOrphanBgmCount}`);
});

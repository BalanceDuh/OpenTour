import { createServer } from 'node:http';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';
import WebSocket from 'ws';

const VALID_ACTIONS = new Set(['MOVE', 'LOOK', 'SPEAK', 'PAUSE', 'EMPHASIZE', 'END']);
const VALID_BEHAVIORS = new Set(['BLOCKING', 'INTERRUPTIBLE']);
const VALID_STATUSES = new Set(['COMPLETED', 'SKIPPED', 'FAILED']);
const DEFAULT_LLM_MODEL = 'gemini-2.5-pro';
const DEFAULT_TTS_MODEL = 'cosyvoice-v3-plus';
const DEFAULT_TTS_VOICE = 'longyuan_v3';
const DEFAULT_TTS_FORMAT = 'mp3';
const DASHSCOPE_WS_URL = process.env.DASHSCOPE_TTS_WS_URL || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const TTS_CONNECT_TIMEOUT_MS = 30000;
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '../../../../..'));
const defaultTourLoaderDb = join(repoRoot, 'data', 'ot-tour-loader.db');
const legacyTourLoaderDb = join(repoRoot, 'supersplat', 'data', 'ot-tour-loader.db');

const pickReadableDbPath = () => {
    if (existsSync(defaultTourLoaderDb)) {
        try {
            if (statSync(defaultTourLoaderDb).size > 0) return defaultTourLoaderDb;
        } catch {
            // continue fallback
        }
    }
    return legacyTourLoaderDb;
};

const tourLoaderDbPath = process.env.OT_TOUR_LOADER_DB_PATH || pickReadableDbPath();
let tourLoaderDb = null;
let getLlmConfigByModelFilenameStmt = null;
let getGlobalTtsConfigStmt = null;
let upsertGlobalTtsConfigStmt = null;
try {
    mkdirSync(dirname(tourLoaderDbPath), { recursive: true });
    tourLoaderDb = new Database(tourLoaderDbPath);
    tourLoaderDb.exec(`
        CREATE TABLE IF NOT EXISTS global_tts_configs (
            config_key TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            tts_model TEXT NOT NULL,
            tts_voice TEXT NOT NULL,
            api_key TEXT NOT NULL,
            audio_format TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `);
    getGlobalTtsConfigStmt = tourLoaderDb.prepare(`
        SELECT config_key, provider, tts_model, tts_voice, api_key, audio_format, updated_at
        FROM global_tts_configs
        WHERE config_key = 'aliyun'
    `);
    upsertGlobalTtsConfigStmt = tourLoaderDb.prepare(`
        INSERT INTO global_tts_configs (
            config_key,
            provider,
            tts_model,
            tts_voice,
            api_key,
            audio_format,
            updated_at
        ) VALUES (
            'aliyun',
            'aliyun',
            @tts_model,
            @tts_voice,
            @api_key,
            @audio_format,
            @updated_at
        )
        ON CONFLICT(config_key) DO UPDATE SET
            provider = excluded.provider,
            tts_model = excluded.tts_model,
            tts_voice = excluded.tts_voice,
            api_key = excluded.api_key,
            audio_format = excluded.audio_format,
            updated_at = excluded.updated_at
    `);
    const seededTtsRow = getGlobalTtsConfigStmt.get();
    if (!seededTtsRow) {
        upsertGlobalTtsConfigStmt.run({
            tts_model: DEFAULT_TTS_MODEL,
            tts_voice: DEFAULT_TTS_VOICE,
            api_key: '',
            audio_format: DEFAULT_TTS_FORMAT,
            updated_at: new Date().toISOString()
        });
    }
    try {
        getLlmConfigByModelFilenameStmt = tourLoaderDb.prepare(`
            SELECT model_filename, llm_model_name, llm_api_key, updated_at
            FROM model_llm_configs
            WHERE model_filename = ?
        `);
    } catch {
        getLlmConfigByModelFilenameStmt = null;
    }
} catch (error) {
    console.warn(`[ot-tour-player] failed to open tourloader db: ${String(error)}`);
}

const sessions = new Map();
const sseClients = new Set();

const hasCjk = (text) => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(text || ''));

const inferCsvTtsLang = (requested, text) => {
    const normalized = String(requested || '').trim();
    const lower = normalized.toLowerCase();
    const sample = String(text || '');
    if (hasCjk(sample)) {
        if (!normalized || lower.startsWith('en')) return 'zh-CN';
        return normalized;
    }
    if (lower.startsWith('zh')) return 'en-US';
    return normalized || 'en-US';
};

const getGlobalTtsConfig = () => {
    const row = getGlobalTtsConfigStmt?.get?.() || null;
    return {
        provider: 'aliyun',
        model: String(row?.tts_model || DEFAULT_TTS_MODEL).trim() || DEFAULT_TTS_MODEL,
        voice: String(row?.tts_voice || DEFAULT_TTS_VOICE).trim() || DEFAULT_TTS_VOICE,
        apiKey: String(row?.api_key || '').trim(),
        format: String(row?.audio_format || DEFAULT_TTS_FORMAT).trim() || DEFAULT_TTS_FORMAT,
        updatedAt: row?.updated_at ? String(row.updated_at) : null
    };
};

const getTtsStorageMeta = () => ({
    dbPath: tourLoaderDbPath,
    writable: Boolean(upsertGlobalTtsConfigStmt && getGlobalTtsConfigStmt)
});

const normalizeTaskVoice = (model, voice) => {
    const options = TTS_VOICE_OPTIONS_BY_MODEL[String(model || '').trim()] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
    const normalized = String(voice || '').trim();
    return options.includes(normalized) ? normalized : '';
};

const saveGlobalTtsConfig = ({ model, voice, apiKey, format }) => {
    if (!upsertGlobalTtsConfigStmt) throw new Error('TTS config storage unavailable');
    const now = new Date().toISOString();
    upsertGlobalTtsConfigStmt.run({
        tts_model: String(model || DEFAULT_TTS_MODEL).trim() || DEFAULT_TTS_MODEL,
        tts_voice: String(voice || DEFAULT_TTS_VOICE).trim() || DEFAULT_TTS_VOICE,
        api_key: String(apiKey || '').trim(),
        audio_format: String(format || DEFAULT_TTS_FORMAT).trim() || DEFAULT_TTS_FORMAT,
        updated_at: now
    });
    return getGlobalTtsConfig();
};

const maskSecret = (value) => {
    const text = String(value || '').trim();
    if (!text) return '(empty)';
    if (text.length <= 6) return `${text.slice(0, 1)}***`;
    return `${text.slice(0, 3)}***${text.slice(-3)}`;
};

const wsDataToBuffer = async (data) => {
    if (!data) return null;
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
        return Buffer.from(await data.arrayBuffer());
    }
    if (typeof data === 'string') return null;
    return null;
};

const synthesizeDashscopeSpeech = async ({ apiKey, model, voice, format, text }) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        return { audioUrl: null, debug: { status: 'skipped', reason: 'empty-text' } };
    }
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
            } catch {
                // ignore close failure
            }
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
                    endpoint: DASHSCOPE_WS_URL,
                    model,
                    voice,
                    format,
                    taskId,
                    bytes: audioBuffer.length,
                    textLength: trimmed.length
                }
            });
        };

        const ws = new WebSocket(DASHSCOPE_WS_URL, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            }
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
                        format
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

                const eventName = String(
                    payload?.header?.event
                    || payload?.header?.name
                    || payload?.header?.status
                    || payload?.event
                    || payload?.type
                    || ''
                ).toLowerCase();
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
                            input: {
                                text: trimmed
                            }
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

        ws.on('error', (error) => {
            fail(new Error(`Alibaba TTS websocket error: ${String(error?.message || 'unknown')}`));
        });

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
    const candidates = [model, ...(TTS_MODEL_FALLBACKS[model] || [])].filter(Boolean);
    let lastError = null;
    for (let i = 0; i < candidates.length; i += 1) {
        const candidateModel = candidates[i];
        try {
            const result = await synthesizeDashscopeSpeech({
                apiKey,
                model: candidateModel,
                voice,
                format,
                text
            });
            return {
                audioUrl: result.audioUrl,
                debug: {
                    ...result.debug,
                    requestedModel: model,
                    effectiveModel: candidateModel,
                    fallbackUsed: candidateModel !== model,
                    fallbackCandidates: candidates.slice(1)
                }
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const message = String(lastError.message || '');
            const canFallback = i < candidates.length - 1 && /418|InvalidParameter/i.test(message);
            if (!canFallback) throw lastError;
        }
    }
    throw lastError || new Error('Alibaba TTS failed');
};

const ensureTaskAudioUrl = async (task) => {
    if (!task?.content?.text) {
        return { audioUrl: null, debug: { status: 'skipped', reason: 'no-text', provider: 'aliyun' } };
    }
    if (task.content.audioUrl) {
        const tts = getGlobalTtsConfig();
        const effectiveVoice = normalizeTaskVoice(tts.model, task.ttsVoice) || tts.voice;
        return {
            audioUrl: task.content.audioUrl,
            debug: {
                status: 'cached',
                reason: 'existing-audio-url',
                provider: 'aliyun',
                model: tts.model,
                voice: effectiveVoice,
                requestedVoice: task.ttsVoice || null,
                format: tts.format
            }
        };
    }
    const tts = getGlobalTtsConfig();
    const effectiveVoice = normalizeTaskVoice(tts.model, task.ttsVoice) || tts.voice;
    if (!tts.apiKey) {
        return {
            audioUrl: null,
            debug: {
                status: 'skipped',
                reason: 'missing-api-key',
                provider: 'aliyun',
                model: tts.model,
                voice: effectiveVoice,
                requestedVoice: task.ttsVoice || null,
                format: tts.format,
                apiKeyMasked: maskSecret(tts.apiKey)
            }
        };
    }
    const result = await synthesizeDashscopeSpeechWithFallback({
        apiKey: tts.apiKey,
        model: tts.model,
        voice: effectiveVoice,
        format: tts.format,
        text: task.content.text
    });
    task.content.audioUrl = result.audioUrl;
    return result;
};

const serializeTask = async (task) => {
    if (!task) return null;
    let ttsDebug = { status: 'skipped', reason: 'unknown' };
    await ensureTaskAudioUrl(task).catch((error) => {
        ttsDebug = {
            status: 'error',
            reason: error instanceof Error ? error.message : String(error)
        };
        console.warn(`[ot-tour-player] TTS synthesis failed: ${String(error)}`);
    }).then((result) => {
        if (result?.debug) ttsDebug = result.debug;
    });
    return {
        task_id: task.id,
        type: task.action,
        poi_id: task.poiId,
        poi_name: task.poiName || null,
        coordinates: task.target,
        look: task.look,
        content: { text: task.content.text, audio_url: task.content.audioUrl },
        execution_mode: task.behavior,
        move_speed_mps: task.moveSpeedMps,
        dwell_ms: task.dwellMs,
        tts_lang: task.ttsLang,
        tts_voice: task.ttsVoice || null,
        interrupt_flag: task.interruptFlag,
        tts_debug: ttsDebug
    };
};

const guessProvider = (model) => {
    const m = String(model || '').toLowerCase();
    if (m.startsWith('gemini')) return 'gemini';
    if (m.startsWith('gpt')) return 'openai';
    return 'openai';
};

const endpointForModel = (model) => {
    const provider = guessProvider(model);
    if (provider === 'gemini') {
        return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    }
    return 'https://api.openai.com/v1/chat/completions';
};

const parseOpenAiText = (json) => {
    const raw = json?.choices?.[0]?.message?.content;
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) {
        return raw.map((part) => String(part?.text || '')).join('').trim();
    }
    return '';
};

const parseGeminiText = (json) => {
    const parts = json?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((part) => String(part?.text || '')).join('').trim();
};

const callOpenAi = async ({ model, apiKey, prompt }) => {
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 220,
            messages: [
                {
                    role: 'system',
                    content: 'You map user navigation intent to one candidate POI. Return JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`openai ${response.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return {
        text: parseOpenAiText(json),
        provider: 'openai',
        endpoint,
        status: response.status,
        requestId: response.headers.get('x-request-id') || null
    };
};

const callGemini = async ({ model, apiKey, prompt }) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 220
            }
        })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`gemini ${response.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return {
        text: parseGeminiText(json),
        provider: 'gemini',
        endpoint: endpoint.replace(/\?.*$/, ''),
        status: response.status,
        requestId: response.headers.get('x-request-id') || response.headers.get('x-guploader-uploadid') || null
    };
};

const callIntentLlm = async ({ model, apiKey, prompt }) => {
    const provider = guessProvider(model);
    if (provider === 'gemini') return callGemini({ model, apiKey, prompt });
    return callOpenAi({ model, apiKey, prompt });
};

const extractJsonPayload = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parse(raw.slice(start, end + 1));
        } catch {
            return null;
        }
    }
};

const normalizeText = (text) => String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？,.!?:：；;、“”"'`~()（）\[\]{}<>|\\/\-_]+/g, '');

const semanticHint = (text) => {
    const normalized = normalizeText(text);
    if (normalized.includes('厨房') || normalized.includes('kitchen')) return 'kitchen';
    if (normalized.includes('卧室') || normalized.includes('bedroom')) return 'bedroom';
    if (normalized.includes('阳台') || normalized.includes('balcony')) return 'balcony';
    if (normalized.includes('大厅') || normalized.includes('hall') || normalized.includes('lobby')) return 'hall';
    return '';
};

const getLlmConfigByModelFilename = (modelFilename) => {
    const normalized = String(modelFilename || '').trim();
    if (!normalized || !getLlmConfigByModelFilenameStmt) {
        return { modelName: DEFAULT_LLM_MODEL, apiKey: '', source: 'default' };
    }
    const row = getLlmConfigByModelFilenameStmt.get(normalized);
    return {
        modelName: String(row?.llm_model_name || DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL,
        apiKey: String(row?.llm_api_key || '').trim(),
        source: row ? 'db' : 'default'
    };
};

const buildPoiCandidates = (state) => {
    const seen = new Set();
    const out = [];
    state.scriptCatalog.forEach((task) => {
        const id = String(task.poiId || '').trim();
        const name = String(task.poiName || '').trim();
        if (!id) return;
        const key = `${id}::${name}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ poiId: id, poiName: name || id });
    });
    return out;
};

const findPoiBySimpleMatch = (candidates, userCommand) => {
    const input = normalizeText(userCommand);
    if (!input) return null;

    const withNormalized = candidates.map((poi) => ({
        ...poi,
        nId: normalizeText(poi.poiId),
        nName: normalizeText(poi.poiName)
    }));

    let matched = withNormalized.find((poi) => input === poi.nName || input === poi.nId)
        || withNormalized.find((poi) => input.includes(poi.nName) || poi.nName.includes(input))
        || withNormalized.find((poi) => input.includes(poi.nId) || poi.nId.includes(input));

    if (matched) return matched;

    const hint = semanticHint(userCommand);
    if (!hint) return null;
    matched = withNormalized.find((poi) => normalizeText(poi.poiName).includes(hint) || normalizeText(poi.poiId).includes(hint)) || null;
    return matched;
};

const resolvePoiIntent = async ({ state, userCommand, poiIdHint }) => {
    const candidates = buildPoiCandidates(state);
    const debug = {
        modelFilename: state.modelFilename || null,
        model: null,
        provider: null,
        endpoint: null,
        source: null,
        llmUsed: false,
        llmRaw: null,
        llmParsed: null,
        llmError: null,
        matchedBy: null,
        candidates
    };

    const hint = String(poiIdHint || '').trim();
    if (hint) {
        const hinted = candidates.find((poi) => String(poi.poiId).toLowerCase() === hint.toLowerCase()) || null;
        if (hinted) {
            debug.matchedBy = 'poi_id_hint';
            return { matched: true, poi: hinted, debug };
        }
    }

    const llmCfg = getLlmConfigByModelFilename(state.modelFilename || '');
    debug.model = llmCfg.modelName;
    debug.provider = guessProvider(llmCfg.modelName);
    debug.endpoint = endpointForModel(llmCfg.modelName);
    debug.source = llmCfg.source;

    if (llmCfg.apiKey) {
        const candidateLines = candidates.map((poi) => `- poi_id=${poi.poiId}, poi_name=${poi.poiName}`).join('\n');
        const prompt = [
            'Task: Resolve user navigation intent to exactly one POI candidate or no match.',
            'Return strict JSON only:',
            '{"matched":true,"poi_id":"...","poi_name":"...","confidence":0.0,"reason":"..."}',
            'or',
            '{"matched":false,"confidence":0.0,"reason":"..."}',
            'Never invent poi_id. Only use the candidates listed below.',
            `User command: ${String(userCommand || '')}`,
            'Candidates:',
            candidateLines || '(empty)'
        ].join('\n');

        try {
            debug.llmUsed = true;
            const llm = await callIntentLlm({ model: llmCfg.modelName, apiKey: llmCfg.apiKey, prompt });
            debug.provider = llm.provider;
            debug.endpoint = llm.endpoint;
            debug.llmRaw = llm.text;
            const parsed = extractJsonPayload(llm.text);
            debug.llmParsed = parsed;
            if (parsed && parsed.matched === true) {
                const targetId = String(parsed.poi_id || '').trim().toLowerCase();
                const targetName = String(parsed.poi_name || '').trim().toLowerCase();
                const picked = candidates.find((poi) => String(poi.poiId).toLowerCase() === targetId)
                    || candidates.find((poi) => String(poi.poiName).toLowerCase() === targetName)
                    || null;
                if (picked) {
                    debug.matchedBy = 'llm';
                    return { matched: true, poi: picked, debug };
                }
            }
        } catch (error) {
            debug.llmError = String(error);
        }
    }

    const fallback = findPoiBySimpleMatch(candidates, userCommand);
    if (fallback) {
        debug.matchedBy = 'lexical_fallback';
        return { matched: true, poi: fallback, debug };
    }

    debug.matchedBy = 'none';
    return { matched: false, poi: null, debug };
};

const json = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-OT-TP-Meta'
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
const transcodeJobs = new Map();
const MP4_COMPRESSION_PRESETS = {
    original: { mode: 'crf', preset: 'veryfast', crf: 20, audioBitrate: '256k' },
    fast_export: { mode: 'crf', preset: 'ultrafast', crf: 26, audioBitrate: '160k' },
    balanced: { mode: 'crf', preset: 'medium', crf: 28, audioBitrate: '128k' },
    archive_smallest: { mode: 'crf', preset: 'slower', crf: 32, audioBitrate: '96k' },
    target_10mb: {
        mode: 'target_size',
        preset: 'slower',
        audioBitrate: '96k',
        targetSizeBytes: 10 * 1024 * 1024,
        maxWidth: 1280,
        frameRate: 24,
        minVideoBitrate: 250000
    }
};

const parseTranscodeMeta = (req) => {
    const raw = String(req.headers['x-ot-tp-meta'] || '').trim();
    if (!raw) return {};
    const jsonText = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(jsonText || '{}');
};

const parseFfmpegClockToUs = (value) => {
    const text = String(value || '').trim();
    if (!text) return 0;
    const parts = text.split(':');
    if (parts.length !== 3) return 0;
    const hours = Number(parts[0]) || 0;
    const minutes = Number(parts[1]) || 0;
    const seconds = Number(parts[2]) || 0;
    return Math.max(0, Math.round((((hours * 60) + minutes) * 60 + seconds) * 1000000));
};

const probeRecordingDurationSec = (inputPath) => new Promise((resolve, reject) => {
    const args = [
        '-i', inputPath,
        '-progress', 'pipe:1',
        '-nostats',
        '-map', '0:v:0',
        '-c', 'copy',
        '-f', 'null',
        '-'
    ];
    const child = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let durationUs = 0;
    const applyLine = (line) => {
        const [rawKey, rawValue] = String(line || '').split('=');
        const key = String(rawKey || '').trim();
        const value = String(rawValue || '').trim();
        if (!key) return;
        if (key === 'out_time_us') durationUs = Math.max(durationUs, Number(value) || 0);
        if (key === 'out_time_ms') durationUs = Math.max(durationUs, Number(value) || 0);
        if (key === 'out_time') durationUs = Math.max(durationUs, parseFfmpegClockToUs(value));
    };
    child.stdout.on('data', (chunk) => String(chunk).split(/\r?\n/).forEach(applyLine));
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => reject(new Error(`ffmpeg unavailable: ${String(error.message || error)}`)));
    child.on('close', (code) => {
        if (code === 0 && durationUs > 0) {
            resolve(durationUs / 1000000);
            return;
        }
        if (durationUs > 0) {
            resolve(durationUs / 1000000);
            return;
        }
        reject(new Error(`duration probe failed: ${stderr || 'unknown error'}`));
    });
});

const runFfmpegTranscode = async ({ inputPath, outputPath, onProgress, durationSec, compressionPreset }) => {
    const compression = MP4_COMPRESSION_PRESETS[compressionPreset] || MP4_COMPRESSION_PRESETS.balanced;
    const filters = [];
    if (compression.maxWidth) filters.push(`scale='min(${compression.maxWidth}\\,iw)':-2:flags=lanczos`);
    if (compression.frameRate) filters.push(`fps=${compression.frameRate}`);
    filters.push('pad=width=ceil(iw/2)*2:height=ceil(ih/2)*2:x=0:y=0:color=black');
    const videoFilter = filters.join(',');
    const totalDurationUs = Number.isFinite(Number(durationSec)) && Number(durationSec) > 0 ? Number(durationSec) * 1000000 : 0;
    const progressState = {
        outTimeUs: 0,
        speed: 0,
        targetSize: 0,
        percent: 0,
        etaSec: null,
        heartbeatAt: new Date().toISOString(),
        phase: 'starting'
    };
    const emitProgress = () => {
        const payload = {
            outTimeUs: progressState.outTimeUs,
            speed: progressState.speed,
            targetSize: progressState.targetSize,
            percent: progressState.percent,
            etaSec: progressState.etaSec,
            heartbeatAt: progressState.heartbeatAt,
            phase: progressState.phase
        };
        if (typeof onProgress === 'function') onProgress(payload);
    };
    const updatePercent = (rangeStart, rangeWeight) => {
        if (totalDurationUs > 0) {
            const raw = Math.max(0, Math.min(1, progressState.outTimeUs / totalDurationUs));
            progressState.percent = Math.max(0, Math.min(100, (rangeStart + (raw * rangeWeight)) * 100));
            if (progressState.speed > 0.01) {
                const remainingUs = Math.max(0, totalDurationUs - progressState.outTimeUs);
                progressState.etaSec = remainingUs / 1000000 / progressState.speed;
            }
        }
    };
    const runPass = (args, phase, rangeStart, rangeWeight) => new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const applyProgressLine = (line) => {
            const [rawKey, rawValue] = String(line || '').split('=');
            const key = String(rawKey || '').trim();
            const value = String(rawValue || '').trim();
            if (!key) return;
            if (key === 'out_time_us') progressState.outTimeUs = Math.max(0, Number(value) || 0);
            if (key === 'out_time_ms') progressState.outTimeUs = Math.max(0, Number(value) || 0);
            if (key === 'out_time') progressState.outTimeUs = Math.max(progressState.outTimeUs, parseFfmpegClockToUs(value));
            if (key === 'total_size') progressState.targetSize = Math.max(0, Number(value) || 0);
            if (key === 'speed') {
                const parsed = Number.parseFloat(value.replace(/x$/, ''));
                progressState.speed = Number.isFinite(parsed) ? parsed : 0;
            }
            progressState.heartbeatAt = new Date().toISOString();
            progressState.phase = phase;
            if (key === 'progress') {
                updatePercent(rangeStart, rangeWeight);
                if (value === 'end') progressState.phase = phase === 'analysis' ? 'analysis_done' : 'finalizing';
                emitProgress();
            }
        };
        child.stdout.on('data', (chunk) => {
            const text = String(chunk);
            stdout += text;
            text.split(/\r?\n/).forEach(applyProgressLine);
        });
        child.stderr.on('data', (chunk) => { stderr += String(chunk); });
        child.on('error', (error) => reject(new Error(`ffmpeg unavailable: ${String(error.message || error)}`)));
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }
            reject(new Error(`ffmpeg exited with code ${code}: ${stderr || stdout || 'unknown error'}`));
        });
    });

    if (compression.mode === 'target_size') {
        const probedDurationSec = Number(durationSec) > 0 ? Number(durationSec) : await probeRecordingDurationSec(inputPath).catch(() => 0);
        const duration = Math.max(probedDurationSec, 1);
        const audioBitrateValue = Number.parseInt(String(compression.audioBitrate || '96k').replace(/k$/i, ''), 10) * 1000;
        const totalBitrate = Math.max(400000, Math.floor((compression.targetSizeBytes * 8 * 0.985) / duration));
        const videoBitrate = Math.max(compression.minVideoBitrate || 250000, totalBitrate - audioBitrateValue);
        const passlogfile = `${outputPath}.passlog`;
        const pass1Args = [
            '-y',
            '-i', inputPath,
            '-progress', 'pipe:1',
            '-nostats',
            '-map', '0:v:0',
            '-vf', videoFilter,
            '-r', String(compression.frameRate || 24),
            '-c:v', 'libx264',
            '-preset', compression.preset,
            '-b:v', String(videoBitrate),
            '-maxrate', String(videoBitrate),
            '-bufsize', String(videoBitrate * 2),
            '-pass', '1',
            '-passlogfile', passlogfile,
            '-an',
            '-f', 'mp4',
            '/dev/null'
        ];
        const pass2Args = [
            '-y',
            '-i', inputPath,
            '-progress', 'pipe:1',
            '-nostats',
            '-map', '0:v:0',
            '-map', '0:a?',
            '-vf', videoFilter,
            '-r', String(compression.frameRate || 24),
            '-c:v', 'libx264',
            '-preset', compression.preset,
            '-b:v', String(videoBitrate),
            '-maxrate', String(videoBitrate),
            '-bufsize', String(videoBitrate * 2),
            '-pass', '2',
            '-passlogfile', passlogfile,
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            '-b:a', compression.audioBitrate,
            outputPath
        ];
        return Promise.resolve()
            .then(() => runPass(pass1Args, 'analysis', 0, 0.5))
            .then(({ stdout: stdout1, stderr: stderr1 }) => runPass(pass2Args, 'transcoding', 0.5, 0.5).then(({ stdout: stdout2, stderr: stderr2 }) => ({ stdout: `${stdout1}${stdout2}`, stderr: `${stderr1}${stderr2}` })))
            .then(({ stdout, stderr }) => {
                progressState.percent = 100;
                progressState.etaSec = 0;
                progressState.phase = 'done';
                progressState.heartbeatAt = new Date().toISOString();
                emitProgress();
                return {
                    stdout,
                    stderr,
                    args: pass2Args,
                    ffmpegPath: ffmpegPath(),
                    videoFilter,
                    compressionPreset,
                    compression: {
                        ...compression,
                        videoBitrate,
                        totalBitrate
                    }
                };
            });
    }

    const args = [
        '-y',
        '-i', inputPath,
        '-progress', 'pipe:1',
        '-nostats',
        '-map', '0:v:0',
        '-map', '0:a?',
        '-vf', videoFilter,
        '-c:v', 'libx264',
        '-preset', compression.preset,
        '-crf', String(compression.crf),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', compression.audioBitrate,
        outputPath
    ];
    return runPass(args, 'transcoding', 0, 1).then(({ stdout, stderr }) => {
        progressState.percent = 100;
        progressState.etaSec = 0;
        progressState.phase = 'done';
        progressState.heartbeatAt = new Date().toISOString();
        emitProgress();
        return { stdout, stderr, args, ffmpegPath: ffmpegPath(), videoFilter, compressionPreset, compression };
    });
};

const serializeJob = (job) => ({
    jobId: job.jobId,
    status: job.status,
    progress: {
        percent: job.progress?.percent ?? 0,
        etaSec: job.progress?.etaSec ?? null,
        speed: job.progress?.speed ?? 0,
        targetSize: job.progress?.targetSize ?? 0,
        outTimeUs: job.progress?.outTimeUs ?? 0,
        phase: job.progress?.phase || 'pending',
        heartbeatAt: job.progress?.heartbeatAt || job.updatedAt,
        elapsedSec: Math.max(0, (Date.now() - job.startedAt) / 1000)
    },
    error: job.error,
    sourceBytes: job.sourceBytes,
    targetBytes: job.targetBytes,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    mimeType: job.mimeType || 'video/mp4',
    hasResult: Boolean(job.resultBuffer)
});

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

const toNum = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const toNullableNum = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};

const parseCsvTasks = (csvText) => {
    const lines = String(csvText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const index = Object.fromEntries(headers.map((h, i) => [h, i]));
    const get = (parts, key) => {
        const i = index[key];
        return i === undefined ? '' : (parts[i] || '').trim();
    };

    const out = lines.slice(1).map((line, row) => {
        const parts = parseCsvLine(line);
        const actionRaw = (get(parts, 'action') || 'SPEAK').toUpperCase();
        const action = VALID_ACTIONS.has(actionRaw) ? actionRaw : 'SPEAK';
        const behaviorRaw = (get(parts, 'audio_mode') || 'BLOCKING').toUpperCase();
        const behavior = VALID_BEHAVIORS.has(behaviorRaw) ? behaviorRaw : 'BLOCKING';
        const poiId = get(parts, 'poi_id') || null;
        const poiName = get(parts, 'poi_name') || poiId || '-';
        const targetX = toNum(get(parts, 'target_x'), 0);
        const targetY = toNum(get(parts, 'target_y'), 0);
        const targetZ = toNum(get(parts, 'target_z'), 0);
        const yaw = toNullableNum(get(parts, 'target_yaw'));
        const pitch = toNullableNum(get(parts, 'target_pitch'));
        const speed = toNum(get(parts, 'move_speed_mps'), 0.8);
        const dwell = Math.max(0, Math.floor(toNum(get(parts, 'dwell_ms'), 900)));
        const text = get(parts, 'content') || '';
        const audioUrl = get(parts, 'audio_url') || null;
        const tts = inferCsvTtsLang(get(parts, 'tts_lang'), text);
        const ttsVoice = normalizeTaskVoice(getGlobalTtsConfig().model, get(parts, 'tts_voice')) || null;
        const seq = toNum(get(parts, 'seq'), row + 1);

        return {
            seq,
            row,
            task: {
                id: `script_${row + 1}`,
                source: 'SCRIPT',
                action,
                behavior,
                poiId,
                poiName,
                target: { x: targetX, y: targetY, z: targetZ },
                look: { yaw, pitch },
                content: { text, audioUrl },
                moveSpeedMps: speed,
                dwellMs: dwell,
                ttsLang: tts,
                ttsVoice,
                interruptFlag: false,
                status: 'PENDING'
            }
        };
    });

    out.sort((a, b) => (a.seq - b.seq) || (a.row - b.row));
    return out.map((v, i) => ({ ...v.task, id: `script_${i + 1}` }));
};

const createSessionIfNeeded = (sessionId) => {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            sessionId,
            modelFilename: null,
            scriptQueue: [],
            priorityQueue: [],
            runningTask: null,
            version: 1,
            updatedAt: new Date().toISOString(),
            scriptCatalog: []
        });
    }
    return sessions.get(sessionId);
};

const queueSnapshot = (state) => ({
    sessionId: state.sessionId,
    runningTask: state.runningTask
        ? {
            id: state.runningTask.id,
            action: state.runningTask.action,
            behavior: state.runningTask.behavior,
            poiId: state.runningTask.poiId,
            poiName: state.runningTask.poiName || null
        }
        : null,
    scriptQueue: state.scriptQueue.map((t) => ({
        id: t.id,
        action: t.action,
        behavior: t.behavior,
        poiId: t.poiId,
        poiName: t.poiName || null,
        source: t.source
    })),
    priorityQueue: state.priorityQueue.map((t) => ({
        id: t.id,
        action: t.action,
        behavior: t.behavior,
        poiId: t.poiId,
        poiName: t.poiName || null,
        source: t.source
    })),
    version: state.version
});

const sendSse = (client, event, data) => {
    if (!client || client.res.writableEnded) return;
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const broadcast = (sessionId, event, data) => {
    sseClients.forEach((client) => {
        if (client.sessionId && client.sessionId !== sessionId) return;
        sendSse(client, event, data);
    });
};

const touch = (state) => {
    state.version += 1;
    state.updatedAt = new Date().toISOString();
    broadcast(state.sessionId, 'queue.updated', {
        sessionId: state.sessionId,
        runningTaskId: state.runningTask?.id || null,
        runningTask: state.runningTask
            ? {
                id: state.runningTask.id,
                action: state.runningTask.action,
                behavior: state.runningTask.behavior,
                poiId: state.runningTask.poiId,
                poiName: state.runningTask.poiName || null
            }
            : null,
        scriptQueue: queueSnapshot(state).scriptQueue,
        priorityQueue: queueSnapshot(state).priorityQueue,
        version: state.version,
        updatedAt: state.updatedAt
    });
};

const pickCatalogTasksByPoi = (state, poiId) => {
    if (!poiId) return null;
    const picked = state.scriptCatalog.filter((task) => String(task.poiId || '').toLowerCase() === String(poiId).toLowerCase());
    if (!picked.length) return null;
    const move = picked.find((t) => t.action === 'MOVE' || t.action === 'LOOK');
    const speak = picked.find((t) => t.action === 'SPEAK');
    const out = [];
    const cloneTask = (task, prefix) => ({
        ...task,
        id: `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        source: 'INTERRUPT',
        interruptFlag: true,
        ttsVoice: null,
        status: 'PENDING'
    });
    if (move) out.push(cloneTask(move, 'interrupt_move'));
    if (speak) out.push(cloneTask(speak, 'interrupt_speak'));
    return out.length ? out : null;
};

const resolvePoiByCommand = (text) => {
    const low = String(text || '').toLowerCase();
    if (low.includes('厨房') || low.includes('kitchen')) return { poiId: 'kitchen', name: 'Kitchen', x: 1.5, y: 0, z: 1.2 };
    if (low.includes('卧室') || low.includes('bedroom')) return { poiId: 'bedroom', name: 'Bedroom', x: -1.1, y: 0, z: 1.0 };
    if (low.includes('阳台') || low.includes('balcony')) return { poiId: 'balcony', name: 'Balcony', x: 0.8, y: 0, z: -1.4 };
    return { poiId: 'current', name: 'Current Spot', x: 0, y: 0, z: 0 };
};

const server = createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') {
            json(res, 200, { ok: true });
            return;
        }

        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/api/ot-tour-player/health' && req.method === 'GET') {
            json(res, 200, { ok: true, service: 'ot-tour-player', version: '1.0.0', ttsStorage: getTtsStorageMeta() });
            return;
        }

        if (url.pathname === '/api/ot-tour-player/transcode/jobs' && req.method === 'POST') {
            const meta = parseTranscodeMeta(req);
            const inputBuffer = await readBodyBuffer(req);
            if (inputBuffer.length < 1) {
                json(res, 400, { ok: false, error: { code: 'OT_TP_VALIDATION_ERROR', message: 'empty recording body' } });
                return;
            }

            const jobId = randomUUID();
            const workdir = await mkdtemp(join(tmpdir(), 'ot-tour-player-'));
            const inputPath = join(workdir, 'recording.webm');
            const outputPath = join(workdir, 'recording.mp4');
            const job = {
                jobId,
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: Date.now(),
                progress: {
                    percent: 0,
                    etaSec: null,
                    speed: 0,
                    targetSize: 0,
                    outTimeUs: 0,
                    phase: 'queued',
                    heartbeatAt: new Date().toISOString()
                },
                error: null,
                sourceBytes: inputBuffer.length,
                targetBytes: 0,
                mimeType: 'video/mp4',
                resultBuffer: null,
                workdir,
                inputPath,
                outputPath,
                meta
            };
            transcodeJobs.set(jobId, job);
            void (async () => {
                try {
                    job.status = 'running';
                    job.updatedAt = new Date().toISOString();
                    await writeFile(inputPath, inputBuffer);
                    await runFfmpegTranscode({
                        inputPath,
                        outputPath,
                        durationSec: Number(meta?.durationSec) || 0,
                        compressionPreset: String(meta?.compressionPreset || 'balanced'),
                        onProgress: (progress) => {
                            job.progress = {
                                ...job.progress,
                                ...progress
                            };
                            job.updatedAt = new Date().toISOString();
                        }
                    });
                    const mp4Buffer = await readFile(outputPath);
                    job.resultBuffer = mp4Buffer;
                    job.targetBytes = mp4Buffer.length;
                    job.status = 'done';
                    job.progress = {
                        ...job.progress,
                        percent: 100,
                        etaSec: 0,
                        phase: 'done',
                        heartbeatAt: new Date().toISOString()
                    };
                    job.updatedAt = new Date().toISOString();
                } catch (error) {
                    job.status = 'error';
                    job.error = {
                        code: 'OT_TP_TRANSCODE_ERROR',
                        message: error instanceof Error ? error.message : String(error),
                        ffmpegPath: ffmpegPath()
                    };
                    job.progress = {
                        ...job.progress,
                        phase: 'error',
                        heartbeatAt: new Date().toISOString()
                    };
                    job.updatedAt = new Date().toISOString();
                }
            })();
            json(res, 202, { ok: true, job: serializeJob(job) });
            return;
        }

        const transcodeJobMatch = url.pathname.match(/^\/api\/ot-tour-player\/transcode\/jobs\/([^/]+)$/);
        if (transcodeJobMatch && req.method === 'GET') {
            const job = transcodeJobs.get(transcodeJobMatch[1]);
            if (!job) {
                json(res, 404, { ok: false, error: { code: 'OT_TP_JOB_NOT_FOUND', message: 'transcode job not found' } });
                return;
            }
            json(res, 200, { ok: true, job: serializeJob(job) });
            return;
        }

        const transcodeJobResultMatch = url.pathname.match(/^\/api\/ot-tour-player\/transcode\/jobs\/([^/]+)\/result$/);
        if (transcodeJobResultMatch && req.method === 'GET') {
            const job = transcodeJobs.get(transcodeJobResultMatch[1]);
            if (!job) {
                json(res, 404, { ok: false, error: { code: 'OT_TP_JOB_NOT_FOUND', message: 'transcode job not found' } });
                return;
            }
            if (job.status === 'error') {
                json(res, 500, { ok: false, error: job.error || { code: 'OT_TP_TRANSCODE_ERROR', message: 'transcode failed' } });
                return;
            }
            if (job.status !== 'done' || !job.resultBuffer) {
                json(res, 409, { ok: false, error: { code: 'OT_TP_JOB_NOT_READY', message: 'transcode job not ready' }, job: serializeJob(job) });
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': job.resultBuffer.length,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,X-OT-TP-Meta',
                'Access-Control-Expose-Headers': 'X-OT-TP-Transcode-Meta',
                'X-OT-TP-Transcode-Meta': Buffer.from(JSON.stringify({
                    ok: true,
                    jobId: job.jobId,
                    ffmpegPath: ffmpegPath(),
                    width: job.meta?.width || null,
                    height: job.meta?.height || null,
                    frameRate: job.meta?.frameRate || null,
                    compressionPreset: job.meta?.compressionPreset || 'balanced',
                    sourceBytes: job.sourceBytes,
                    targetBytes: job.resultBuffer.length,
                    progress: job.progress
                }), 'utf8').toString('base64')
            });
            res.end(job.resultBuffer);
            return;
        }

        if (url.pathname === '/api/ot-tour-player/transcode' && req.method === 'POST') {
            const meta = parseTranscodeMeta(req);
            const inputBuffer = await readBodyBuffer(req);
            if (inputBuffer.length < 1) {
                json(res, 400, { ok: false, error: { code: 'OT_TP_VALIDATION_ERROR', message: 'empty recording body' } });
                return;
            }

            const workdir = await mkdtemp(join(tmpdir(), 'ot-tour-player-'));
            const inputPath = join(workdir, 'recording.webm');
            const outputPath = join(workdir, 'recording.mp4');
            try {
                await writeFile(inputPath, inputBuffer);
                const transcode = await runFfmpegTranscode({ inputPath, outputPath, durationSec: Number(meta?.durationSec) || 0, compressionPreset: String(meta?.compressionPreset || 'balanced') });
                const mp4Buffer = await readFile(outputPath);
                res.writeHead(200, {
                    'Content-Type': 'video/mp4',
                    'Content-Length': mp4Buffer.length,
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,X-OT-TP-Meta',
                    'Access-Control-Expose-Headers': 'X-OT-TP-Transcode-Meta',
                    'X-OT-TP-Transcode-Meta': Buffer.from(JSON.stringify({
                        ok: true,
                        ffmpegPath: transcode.ffmpegPath,
                        videoFilter: transcode.videoFilter,
                        compressionPreset: transcode.compressionPreset || meta?.compressionPreset || 'balanced',
                        compression: transcode.compression || null,
                        width: meta?.width || null,
                        height: meta?.height || null,
                        frameRate: meta?.frameRate || null,
                        sourceBytes: inputBuffer.length,
                        targetBytes: mp4Buffer.length
                    }), 'utf8').toString('base64')
                });
                res.end(mp4Buffer);
            } catch (error) {
                json(res, 500, {
                    ok: false,
                    error: {
                        code: 'OT_TP_TRANSCODE_ERROR',
                        message: error instanceof Error ? error.message : String(error),
                        ffmpegPath: ffmpegPath()
                    }
                });
            } finally {
                await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
            }
            return;
        }

        if (url.pathname === '/api/ot-tour-player/tts-config' && req.method === 'GET') {
            const tts = getGlobalTtsConfig();
            json(res, 200, {
                ok: true,
                tts,
                storage: getTtsStorageMeta()
            });
            return;
        }

        if (url.pathname === '/api/ot-tour-player/tts-config' && req.method === 'PUT') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const saved = saveGlobalTtsConfig({
                model: body?.tts?.model,
                voice: body?.tts?.voice,
                apiKey: body?.tts?.apiKey,
                format: body?.tts?.format || DEFAULT_TTS_FORMAT
            });
            json(res, 200, { ok: true, tts: saved, storage: getTtsStorageMeta() });
            return;
        }

        if (url.pathname === '/api/ot-tour-player/events' && req.method === 'GET') {
            const sessionId = String(url.searchParams.get('session_id') || '').trim();
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });
            const client = { res, sessionId: sessionId || null };
            sseClients.add(client);
            sendSse(client, 'connected', { ok: true, sessionId: client.sessionId });
            req.on('close', () => sseClients.delete(client));
            return;
        }

        if (url.pathname === '/api/ot-tour-player/script' && req.method === 'POST') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const sessionId = String(body.session_id || `sess_${Date.now().toString(36)}`).trim();
            const modelFilename = String(body.model_filename || '').trim();
            const csvText = String(body.csv_text || '').trim();
            if (!csvText) {
                json(res, 400, { ok: false, error: { code: 'OT_TP_VALIDATION_ERROR', message: 'csv_text required' } });
                return;
            }
            const tasks = parseCsvTasks(csvText);
            const state = createSessionIfNeeded(sessionId);
            state.modelFilename = modelFilename || state.modelFilename || null;
            state.scriptQueue = tasks.map((task) => ({ ...task }));
            state.scriptCatalog = tasks.map((task) => ({ ...task }));
            state.priorityQueue = [];
            state.runningTask = null;
            touch(state);
            json(res, 200, {
                ok: true,
                session_id: sessionId,
                total_tasks: state.scriptQueue.length,
                snapshot: queueSnapshot(state)
            });
            return;
        }

        if (url.pathname === '/api/ot-tour-player/interrupt' && req.method === 'POST') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const sessionId = String(body.session_id || '').trim();
            const userCommand = String(body.user_command || '').trim();
            const userName = String(body.user_name || '').trim();
            const poiIdHint = String(body.poi_id || '').trim();
            if (!sessionId || !userCommand) {
                json(res, 400, { ok: false, error: { code: 'OT_TP_VALIDATION_ERROR', message: 'session_id and user_command required' } });
                return;
            }

            const state = createSessionIfNeeded(sessionId);
            const intent = await resolvePoiIntent({ state, userCommand, poiIdHint });
            let tasks = [];
            let message = '';

            if (intent.matched && intent.poi) {
                tasks = pickCatalogTasksByPoi(state, intent.poi.poiId) || [];
                if (tasks.length > 0) {
                    message = `找到了「${intent.poi.poiName}」，现在去「${intent.poi.poiName}」。`;
                }
            }

            if (tasks.length < 1) {
                const commandText = String(userCommand || '').trim();
                const apology = commandText ? `抱歉找不到「${commandText}」。` : '抱歉找不到目标地点。';
                tasks = [
                    {
                        id: `interrupt_speak_${Date.now().toString(36)}`,
                        source: 'INTERRUPT',
                        action: 'SPEAK',
                        behavior: 'BLOCKING',
                        poiId: null,
                        poiName: 'Not Found',
                        target: { x: 0, y: 0, z: 0 },
                        look: { yaw: null, pitch: null },
                        content: { text: apology, audioUrl: null },
                        moveSpeedMps: 0.8,
                        dwellMs: 400,
                        ttsLang: hasCjk(apology) ? 'zh-CN' : 'en-US',
                        ttsVoice: null,
                        interruptFlag: true,
                        status: 'PENDING'
                    }
                ];
                message = apology;
            }

            state.priorityQueue.push(...tasks);
            touch(state);
            const debugPayload = {
                userCommand,
                matched: Boolean(intent.matched && intent.poi),
                matchedPoi: intent.poi ? { poiId: intent.poi.poiId, poiName: intent.poi.poiName } : null,
                detail: intent.debug
            };
            broadcast(sessionId, 'interrupt.debug', debugPayload);
            json(res, 200, {
                ok: true,
                session_id: sessionId,
                message,
                debug: debugPayload,
                snapshot: queueSnapshot(state)
            });
            return;
        }

        if (url.pathname === '/api/ot-tour-player/clear' && req.method === 'POST') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const scope = String(body.scope || 'all').trim().toLowerCase();
            const sessionId = String(body.session_id || '').trim();

            if (scope === 'session') {
                if (!sessionId) {
                    json(res, 400, { ok: false, error: { code: 'OT_TP_VALIDATION_ERROR', message: 'session_id required for scope=session' } });
                    return;
                }
                const existed = sessions.has(sessionId);
                sessions.delete(sessionId);
                sseClients.forEach((client) => {
                    if (!client.sessionId || client.sessionId === sessionId) {
                        sendSse(client, 'session.cleared', { sessionId, scope: 'session' });
                    }
                });
                json(res, 200, { ok: true, scope: 'session', session_id: sessionId, cleared: existed ? 1 : 0 });
                return;
            }

            const cleared = sessions.size;
            const affectedSessionIds = Array.from(sessions.keys());
            sessions.clear();
            sseClients.forEach((client) => {
                sendSse(client, 'session.cleared', {
                    scope: 'all',
                    affectedSessionIds,
                    cleared
                });
            });
            json(res, 200, { ok: true, scope: 'all', cleared, affectedSessionIds });
            return;
        }

        if (url.pathname === '/api/ot-tour-player/next' && req.method === 'POST') {
            const raw = await readBody(req);
            const body = JSON.parse(raw || '{}');
            const sessionId = String(body.session_id || '').trim();
            const status = String(body.status || '').toUpperCase();
            if (!sessionId) {
                json(res, 400, { ok: false, error: { code: 'OT_TP_VALIDATION_ERROR', message: 'session_id required' } });
                return;
            }

            const state = createSessionIfNeeded(sessionId);
            if (status && VALID_STATUSES.has(status) && state.runningTask) {
                state.runningTask.status = status;
                state.runningTask = null;
                touch(state);
            }

            if (state.runningTask) {
                const serializedTask = await serializeTask(state.runningTask);
                json(res, 200, {
                    ok: true,
                    session_id: sessionId,
                    task: serializedTask,
                    snapshot: queueSnapshot(state)
                });
                return;
            }

            const task = state.priorityQueue.length > 0 ? state.priorityQueue.shift() : state.scriptQueue.shift();
            if (!task) {
                json(res, 200, {
                    ok: true,
                    session_id: sessionId,
                    task: null,
                    snapshot: queueSnapshot(state)
                });
                return;
            }

            state.runningTask = task;
            touch(state);
            broadcast(sessionId, 'task.dispatched', { sessionId, taskId: task.id, action: task.action, poiId: task.poiId, ts: new Date().toISOString() });
            const serializedTask = await serializeTask(task);
            json(res, 200, {
                ok: true,
                session_id: sessionId,
                task: serializedTask,
                snapshot: queueSnapshot(state)
            });
            return;
        }

        if (url.pathname === '/api/ot-tour-player/queue' && req.method === 'GET') {
            const sessionId = String(url.searchParams.get('session_id') || '').trim();
            if (!sessionId) {
                json(res, 400, { ok: false, error: { code: 'OT_TP_VALIDATION_ERROR', message: 'session_id required' } });
                return;
            }
            const state = createSessionIfNeeded(sessionId);
            json(res, 200, { ok: true, session_id: sessionId, snapshot: queueSnapshot(state) });
            return;
        }

        json(res, 404, { ok: false, error: { code: 'OT_TP_NOT_FOUND', message: 'route not found' } });
    } catch (error) {
        json(res, 500, { ok: false, error: { code: 'OT_TP_SERVER_ERROR', message: String(error) } });
    }
});

const port = Number(process.env.OT_TOUR_PLAYER_PORT || 3032);
server.listen(port, () => {
    console.log(`[ot-tour-player] listening on http://localhost:${port}`);
});

import {
    DEFAULT_CSV_TARGET_DURATION_SEC,
    DEFAULT_POI_FOV,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_VOICE,
    MAX_POI_FOV,
    MIN_POI_FOV,
    TTS_VOICE_OPTIONS_BY_MODEL
} from './constants';
import {
    type CinematicBgmConfig,
    type CinematicMediaObjectConfig,
    type CsvTimingConfigState,
    type CsvTimingSummary,
    type CsvVoiceConfigState
} from './types';

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const degToRad = (v: number) => v * Math.PI / 180;
export const radToDeg = (v: number) => v * 180 / Math.PI;
export const clampFov = (v: number, fallback = DEFAULT_POI_FOV) => {
    const n = Number.isFinite(v) ? v : fallback;
    return clamp(n, MIN_POI_FOV, MAX_POI_FOV);
};
export const normalizeCwMediaObjectConfig = (input: unknown): CinematicMediaObjectConfig => {
    const source = input && typeof input === 'object' ? input as Partial<CinematicMediaObjectConfig> : {};
    const anchor = source.anchorWorld;
    const safeAnchor = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z)
        ? { x: Number(anchor.x), y: Number(anchor.y), z: Number(anchor.z) }
        : null;
    const src = String(source.src || '').trim();
    const fileName = String(source.fileName || (src ? src.split('/').pop() || src : '')).trim();
    return {
        enabled: source.enabled !== false,
        src,
        fileName,
        anchorWorld: safeAnchor,
        scale: clamp(Number(source.scale) || 1.6, 0.1, 120),
        yaw: Number(source.yaw) || 0,
        pitch: Number(source.pitch) || 0,
        roll: Number(source.roll) || 0,
        depthOffset: clamp(Number(source.depthOffset) || 0.06, -2, 2),
        placeholder: source.placeholder === true,
        placeholderLabel: String(source.placeholderLabel || '').trim()
    };
};

export const plannerPromptRequestsMediaObject = (text: string) => /3d\s*media|media object|media project|video screen|天幕|视频屏|空屏|占位|3d媒体/i.test(String(text || ''));
export const plannerPromptRequestsOrbitLikeCamera = (text: string) => /围绕|环绕|orbit|围着|掠过|回望|围绕.*3d\s*media|围绕.*天幕/i.test(String(text || ''));

export const escapeCsv = (value: string | number) => {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
};

export const escapeHtmlAttr = (value: string | number) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const countSpeechChars = (value: string) => (String(value || '').match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length;

export const normalizeCsvVoiceConfig = (config?: Partial<CsvVoiceConfigState> | null): CsvVoiceConfigState => {
    const model = TTS_VOICE_OPTIONS_BY_MODEL[String(config?.model || '').trim()]
        ? String(config?.model || '').trim()
        : DEFAULT_TTS_MODEL;
    const options = TTS_VOICE_OPTIONS_BY_MODEL[model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
    const fixedVoice = options.some((item) => item.value === String(config?.fixedVoice || '').trim())
        ? String(config?.fixedVoice || '').trim()
        : (options.find((item) => item.value === DEFAULT_TTS_VOICE)?.value || options[0]?.value || DEFAULT_TTS_VOICE);
    const voicePool = Array.isArray(config?.voicePool)
        ? Array.from(new Set(config.voicePool.map((item) => String(item || '').trim()).filter((item) => options.some((opt) => opt.value === item))))
        : [];
    const enabled = Boolean(config?.enabled);
    return {
        enabled,
        mode: enabled && voicePool.length > 0 ? 'shuffle_round_robin' : 'fixed',
        model,
        fixedVoice,
        voicePool
    };
};

export const summarizeCsvVoiceConfig = (config: CsvVoiceConfigState) => {
    if (!config.enabled || config.voicePool.length < 1) return `固定声音: ${config.fixedVoice}`;
    return `洗牌轮询: ${config.voicePool.length} voices`;
};

export const normalizeCsvTimingConfig = (config?: Partial<CsvTimingConfigState> | null): CsvTimingConfigState => {
    const targetDurationSec = Math.max(5, Math.min(900, Number(config?.targetDurationSec) || DEFAULT_CSV_TARGET_DURATION_SEC));
    return {
        enabled: Boolean(config?.enabled),
        targetDurationSec
    };
};

export const formatCsvTimingSummary = (summary?: CsvTimingSummary | null) => {
    if (!summary?.enabled) return '';
    const target = Number(summary.targetDurationSec).toFixed(summary.targetDurationSec % 1 === 0 ? 0 : 1);
    const estimated = typeof summary.estimatedDurationSec === 'number' && Number.isFinite(summary.estimatedDurationSec)
        ? `预计 ${summary.estimatedDurationSec.toFixed(1)}s`
        : '';
    const minimum = typeof summary.minimumAchievableSec === 'number' && Number.isFinite(summary.minimumAchievableSec)
        ? `最短 ${summary.minimumAchievableSec.toFixed(1)}s`
        : '';
    return [
        `目标 ${target}s`,
        estimated,
        minimum
    ].filter(Boolean).join(' | ');
};

export const isAudioFileName = (value: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(String(value || '').trim());

export const clampMusicRate = (value: number) => clamp(Number.isFinite(value) ? value : 1, 0.5, 2);

export const normalizeMusicDuration = (value: number | null | undefined) => {
    if (!Number.isFinite(Number(value))) return null;
    const n = Number(value);
    if (n <= 0) return null;
    return clamp(n, 0.2, 600);
};

export const formatSecondsLabel = (value: number) => {
    const sec = Math.max(0, Number(value) || 0);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export const cinematicBgmEffectiveRate = (bgm: Pick<CinematicBgmConfig, 'audioStartSeconds' | 'audioEndSeconds' | 'audioPlaybackRate' | 'targetMusicDurationSeconds'>) => {
    const clipDuration = Math.max(0.001, Number(bgm.audioEndSeconds || 0) - Number(bgm.audioStartSeconds || 0));
    const target = normalizeMusicDuration(bgm.targetMusicDurationSeconds);
    if (target) return clampMusicRate(clipDuration / Math.max(0.001, target));
    return clampMusicRate(Number(bgm.audioPlaybackRate) || 1);
};

export const describeTimingValue = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '尚未计算';
    return `${value.toFixed(1)}s`;
};


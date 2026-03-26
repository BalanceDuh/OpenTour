import { type TtsVoiceOption } from './types';

export const iconSvg = (paths: string, viewBox = '0 0 24 24') => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${paths}
    </svg>
`;

export const CSV_ICON_TIMING = iconSvg('<path d="M12 2v4"/><path d="M10 2h4"/><path d="M15.5 5.5l1.5-1.5"/><circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2"/>');
export const CSV_ICON_VOICE = iconSvg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>');
export const CSV_ICON_GENERATE = iconSvg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>');
export const CSV_ICON_SAVE = iconSvg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');
export const CSV_ICON_SAVE_AS = iconSvg('<path d="M15 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/><polyline points="13 21 13 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><line x1="20" y1="16" x2="20" y2="22"/><line x1="17" y1="19" x2="23" y2="19"/>');
export const CSV_ICON_DELETE = iconSvg('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>');
export const CSV_ICON_DOWNLOAD = iconSvg('<path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>');
export const CSV_ICON_FULLSCREEN = iconSvg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>');
export const CSV_ICON_CLOSE = iconSvg('<line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>');
export const CINE_ICON_PLAY = iconSvg('<path d="M7 5.5l12 6.5-12 6.5v-13z"/>');
export const CINE_ICON_SAVE = CSV_ICON_SAVE;
export const CINE_ICON_SAVE_AS = iconSvg('<path d="M15 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v3"/><polyline points="7 3 7 8 15 8"/><path d="M7 21v-8h6"/><circle cx="18" cy="18" r="5" opacity="0.18"/><path d="M18 15v6"/><path d="M15 18h6"/>');
export const CINE_ICON_COMPILE = iconSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M12 11v8"/><path d="M20 2v6"/><path d="M17 5h6"/>');
export const CINE_ICON_PROMPT = iconSvg('<path d="M7 7.5h10"/><path d="M7 11.5h10"/><path d="M7 15.5h6"/><path d="M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"/>');
export const CINE_ICON_MAGIC = iconSvg('<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/><path d="M5 3v4"/><path d="M7 5H3"/><path d="M19 17v4"/><path d="M21 19h-4"/>');
export const CINE_ICON_GEAR = iconSvg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>');
export const CINE_ICON_LIST = iconSvg('<path d="M8 7h10"/><path d="M8 12h10"/><path d="M8 17h10"/><path d="M5.5 7h.01"/><path d="M5.5 12h.01"/><path d="M5.5 17h.01"/>');
export const CINE_ICON_SLIDERS = iconSvg('<path d="M5 7h14"/><path d="M9 7a2 2 0 1 1 0 .01"/><path d="M5 12h14"/><path d="M15 12a2 2 0 1 1 0 .01"/><path d="M5 17h14"/><path d="M11 17a2 2 0 1 1 0 .01"/>');
export const CINE_ICON_MAP = iconSvg('<path d="M12 5 19 12 12 19 5 12Z"/>');
export const CINE_ICON_TTS = iconSvg('<path d="M4 6h10"/><path d="M4 10h10"/><path d="M4 14h5"/><path d="M16 14a4 4 0 0 1 0 8"/><path d="M19 12a7 7 0 0 1 0 12"/>');
export const CINE_ICON_REFRESH = iconSvg('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>');
export const CINE_ICON_CHEVRON = iconSvg('<path d="m8 10 4 4 4-4"/>');
export const CINE_ICON_LOCK = iconSvg('<path d="M8 10V8a4 4 0 1 1 8 0v2"/><rect x="6" y="10" width="12" height="9" rx="2"/>');
export const CINE_ICON_EYE = iconSvg('<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>');
export const CINE_ICON_VOLUME = iconSvg('<path d="M5 14h3l4 4V6L8 10H5Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M17.8 6.8a7 7 0 0 1 0 10.4"/>');
export const CINE_ICON_MUSIC = iconSvg('<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>');
export const CINE_ICON_TARGET = iconSvg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>');
export const CINE_ICON_WAND = iconSvg('<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>');
export const CINE_ICON_FOCUS = iconSvg('<circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>');
export const CINE_ICON_MINUS = iconSvg('<line x1="5" x2="19" y1="12" y2="12"/>');
export const CINE_ICON_PLUS = iconSvg('<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>');
export const CINE_ICON_MINI = iconSvg('<path d="M4.5 8.5h15"/><path d="M4.5 15.5h9"/>');
export const CINE_ICON_PAUSE = iconSvg('<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>');
export const CINE_ICON_STOP = iconSvg('<rect x="6" y="6" width="12" height="12" rx="2"/>');
export const CINE_ICON_FOLDER = iconSvg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/>');
export const CINE_ICON_FILE_PLUS = iconSvg('<path d="M14 3v5h5"/><path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M10 14v6"/><path d="M7 17h6"/>');

export const STYLE_ID = 'ot-cinematic-workspace-style';
export const PANEL_ID = 'ot-cinematic-workspace-panel';
export const DEFAULT_PROMPT_TEMPLATE = '你是世界级的，正在描述你的视角给观众讲解，不要旁白和画外音。content 只允许使用：中文、英文、数字、空格，以及中文标点 `，。；：！？（）`禁止使用任何英文 CSV 控制字符，尤其是 `,` 和 `"`，绝对不要让 content 出现真实换行，不包含：\\r \\n \\t ，整体文字少于100字。';
export const DEFAULT_CSV_PROMPT_TEMPLATE = `You are a CSV tour route planner.
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
export const DEFAULT_MOVE_PROMPT_TEMPLATE = `You are a tour navigation copywriter for MOVE steps.
Given ordered MOVE contexts, produce concise transition narration for each step.

Rules:
1) Output JSON only, no extra text.
2) Keep each content to one short sentence.
3) Mention from -> to clearly.
4) Do not repeat scenic description from POI content.
5) Follow language field strictly: zh-CN => Chinese, en-US => English.

Output format:
{"moves":[{"seq":1,"content":"我们从起点前往大厅，向前移动约6米。"}]}`;
export const DEFAULT_CINEMATIC_SIMPLE_PROMPT = [
    '1. 随手需求：请用一句话描述你想拍什么，例如“做一个一镜到底的山路探索镜头”“从入口走到观景点再回望收束”。',
    '2. 空间是什么：请描述空间类型与关键路径，例如“山径 / 洞穴 / 展厅 / 街巷 / 室内长廊 / 高台边缘”。',
    '3. 故事背景：请说明观众为什么要这样看、情绪是什么，例如“独自探索”“发现线索”“被景观吸引”“完成一次抵达与回望”。',
    '4. 风格（可选其一或组合）：电影感、纪录片感、神秘、史诗、宁静、治愈、悬疑、梦幻、克制、展览导览、游戏过场。',
    '5. 节奏要求（可选其一或组合）：慢推进、匀速巡游、先抑后扬、先扬后稳、渐进揭示、快速切入后放缓、平稳克制、结尾停驻、全程不停顿。',
    '6. 如果需要 3D Media Object，请明确说明：它位于哪里、在哪个镜头阶段或关键帧附近出现、镜头是否需要围绕它飞行；如果暂时没有视频内容，也可以先只要求生成一个空的 3D Media 占位位置。'
].join('\n');
export const DEFAULT_CINEMATIC_PLANNER_PROMPT = `你是电影级运镜设计师。
请基于选中 POI 的空间范围 图像参考 场景描述 故事背景和目标时长，生成连续不间断的一镜到底运镜方案。

硬性规则：
1. 输出 JSON only。
2. POI 只是空间锚点，可以生成中间 keyframe。
3. 运镜必须连续，shots 至少 4 段，每段至少 2 个 keyframes。
4. keyframe 必须停留在输入 bounds 内。
5. 优先使用推进 抬升 reveal 侧移 回望 俯仰变化形成节奏。
6. 每个 shot 需要 label intent durationSec speechText speechMode keyframes。
7. speechMode 仅可为 INTERRUPTIBLE 或 BLOCKING。
8. keyframe 需要 t x y z yaw pitch fov moveSpeedMps。
9. total duration 接近 targetDurationSec。
10. 如果复杂提示词明确要求 3D Media Object，则必须在相关 keyframe 上生成 mediaObject 字段，至少说明 enabled anchorWorld scale yaw pitch roll depthOffset，并通过后续 keyframe 的相机位置表现围绕它、靠近它、掠过它或回望它。
11. 如果提示词提到 3D Media Object 但没有视频内容，也允许生成 placeholder 形式的 mediaObject，占位后续再绑定视频。
12. 可以为未来镜头语义预留 cameraBehavior 字段，但当前仍然要输出可直接播放的关键帧相机位置。
13. 除 JSON 外不要输出任何说明。`;
export const GEMINI_MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview'
];
export const QWEN_MODELS = [
    'qwen3-max',
    'qwen3.5-plus',
    'qwen3.5-flash'
];
export const DEFAULT_LLM_MODEL = 'gemini-2.5-pro';
export const DEFAULT_QWEN_MODEL = 'qwen3.5-plus';
export const DEFAULT_TTS_MODEL = 'cosyvoice-v3-plus';
export const DEFAULT_TTS_VOICE = 'longyuan_v3';
export const DEFAULT_CSV_TARGET_DURATION_SEC = 30;
export const TTS_VOICE_OPTIONS_BY_MODEL: Record<string, TtsVoiceOption[]> = {
    'cosyvoice-v3-plus': [
        { value: 'longyuan_v3', label: '龙媛', subtitle: '温暖治愈女', group: '旁白 / 有声书' },
        { value: 'longyue_v3', label: '龙悦', subtitle: '温暖磁性女', group: '旁白 / 有声书' },
        { value: 'longsanshu_v3', label: '龙三叔', subtitle: '沉稳质感男', group: '旁白 / 有声书' },
        { value: 'longshuo_v3', label: '龙硕', subtitle: '博才干练男', group: '新闻播报' },
        { value: 'loongbella_v3', label: 'Bella3.0', subtitle: '精准干练女', group: '新闻播报' },
        { value: 'longxiaochun_v3', label: '龙小淳', subtitle: '知性积极女', group: '语音助手' },
        { value: 'longxiaoxia_v3', label: '龙小夏', subtitle: '沉稳权威女', group: '语音助手' },
        { value: 'longanwen_v3', label: '龙安温', subtitle: '优雅知性女', group: '语音助手' },
        { value: 'longanli_v3', label: '龙安莉', subtitle: '利落从容女', group: '语音助手' },
        { value: 'longanlang_v3', label: '龙安朗', subtitle: '清爽利落男', group: '语音助手' },
        { value: 'longyingling_v3', label: '龙应聆', subtitle: '温和共情女', group: '客服' },
        { value: 'longanzhi_v3', label: '龙安智', subtitle: '睿智轻熟男', group: '社交陪伴' }
    ],
    'cosyvoice-v3-flash': [
        { value: 'longyuan_v3', label: '龙媛', subtitle: '温暖治愈女', group: '旁白 / 有声书' },
        { value: 'longyue_v3', label: '龙悦', subtitle: '温暖磁性女', group: '旁白 / 有声书' },
        { value: 'longsanshu_v3', label: '龙三叔', subtitle: '沉稳质感男', group: '旁白 / 有声书' },
        { value: 'longshuo_v3', label: '龙硕', subtitle: '博才干练男', group: '新闻播报' },
        { value: 'loongbella_v3', label: 'Bella3.0', subtitle: '精准干练女', group: '新闻播报' },
        { value: 'longxiaochun_v3', label: '龙小淳', subtitle: '知性积极女', group: '语音助手' },
        { value: 'longxiaoxia_v3', label: '龙小夏', subtitle: '沉稳权威女', group: '语音助手' },
        { value: 'longanwen_v3', label: '龙安温', subtitle: '优雅知性女', group: '语音助手' },
        { value: 'longanli_v3', label: '龙安莉', subtitle: '利落从容女', group: '语音助手' },
        { value: 'longanlang_v3', label: '龙安朗', subtitle: '清爽利落男', group: '语音助手' },
        { value: 'longyingling_v3', label: '龙应聆', subtitle: '温和共情女', group: '客服' },
        { value: 'longanzhi_v3', label: '龙安智', subtitle: '睿智轻熟男', group: '社交陪伴' }
    ]
};
export const DEFAULT_POI_FOV = 60;
export const MIN_POI_FOV = 20;
export const MAX_POI_FOV = 120;


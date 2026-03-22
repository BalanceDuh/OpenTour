const VIEW_IDS = ['front', 'right', 'back', 'left', 'top', 'bottom'];
const VIEW_ID_SET = new Set(VIEW_IDS);

const finiteOr = (value, fallback) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

export const degToRad = value => finiteOr(value, 0) * Math.PI / 180;
export const radToDeg = value => finiteOr(value, 0) * 180 / Math.PI;

export const normalizeAngleRad = (value) => {
    let result = finiteOr(value, 0) % (Math.PI * 2);
    if (result > Math.PI) result -= Math.PI * 2;
    if (result < -Math.PI) result += Math.PI * 2;
    return result;
};

export const normalizeAngleDeg = (value) => {
    let result = finiteOr(value, 0) % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return result;
};

export const clampPitchDeg = value => Math.max(-89, Math.min(89, finiteOr(value, 0)));

const clamp = (value, min, max, fallback) => {
    const next = Number(value);
    if (!Number.isFinite(next)) return fallback;
    return Math.max(min, Math.min(max, next));
};

export const deriveCameraState = (mview) => {
    const radius = Math.max(0.001, finiteOr(mview?.radius, 1));
    const pitch = finiteOr(mview?.rotation?.[0], 0);
    const yaw = finiteOr(mview?.rotation?.[1], 0);
    const pivot = Array.isArray(mview?.pivot) ? mview.pivot : [0, 0, 0];
    const cosPitch = Math.cos(pitch);
    const cameraX = finiteOr(pivot[0], 0) + radius * Math.sin(yaw) * cosPitch;
    const cameraY = finiteOr(pivot[1], 0) - radius * Math.sin(pitch);
    const cameraZ = finiteOr(pivot[2], 0) + radius * Math.cos(yaw) * cosPitch;
    return {
        mview: {
            pivot: [finiteOr(pivot[0], 0), finiteOr(pivot[1], 0), finiteOr(pivot[2], 0)],
            rotation: [pitch, yaw],
            radius,
            fov: finiteOr(mview?.fov, 40)
        },
        cameraX,
        cameraY,
        cameraZ,
        lookAtX: finiteOr(pivot[0], 0),
        lookAtY: finiteOr(pivot[1], 0),
        lookAtZ: finiteOr(pivot[2], 0),
        yawDeg: normalizeAngleDeg(radToDeg(yaw)),
        pitchDeg: clampPitchDeg(normalizeAngleDeg(radToDeg(pitch))),
        fovDeg: finiteOr(mview?.fov, 40),
        radius
    };
};

export const deriveMviewCameraState = (input, fallback) => {
    const basePivot = fallback?.pivot || [0, 0, 0];
    const baseRotation = fallback?.rotation || [0, 0];
    const pivotX = finiteOr(input?.lookAtX, basePivot[0]);
    const pivotY = finiteOr(input?.lookAtY, basePivot[1]);
    const pivotZ = finiteOr(input?.lookAtZ, basePivot[2]);
    const hasCameraPosition = [input?.cameraX, input?.cameraY, input?.cameraZ, input?.lookAtX, input?.lookAtY, input?.lookAtZ]
    .every(value => Number.isFinite(Number(value)));
    const fallbackRadius = finiteOr(fallback?.radius, 1);
    const fallbackPitchDeg = radToDeg(finiteOr(baseRotation[0], 0));
    const fallbackYawDeg = radToDeg(finiteOr(baseRotation[1], 0));
    const seededRadius = Math.max(0.001, finiteOr(input?.radius, fallbackRadius));
    const seededPitchDeg = clampPitchDeg(finiteOr(input?.pitchDeg, fallbackPitchDeg));
    const seededYawDeg = normalizeAngleDeg(finiteOr(input?.yawDeg, fallbackYawDeg));
    const seededCosPitch = Math.cos(degToRad(seededPitchDeg));
    const seededCameraX = pivotX + seededRadius * Math.sin(degToRad(seededYawDeg)) * seededCosPitch;
    const seededCameraY = pivotY - seededRadius * Math.sin(degToRad(seededPitchDeg));
    const seededCameraZ = pivotZ + seededRadius * Math.cos(degToRad(seededYawDeg)) * seededCosPitch;
    const dx = (hasCameraPosition ? finiteOr(input?.cameraX, seededCameraX) : seededCameraX) - pivotX;
    const dy = (hasCameraPosition ? finiteOr(input?.cameraY, seededCameraY) : seededCameraY) - pivotY;
    const dz = (hasCameraPosition ? finiteOr(input?.cameraZ, seededCameraZ) : seededCameraZ) - pivotZ;
    const derivedRadius = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    const radius = Math.max(0.001, Number.isFinite(derivedRadius) && derivedRadius > 0 ? derivedRadius : seededRadius);
    const derivedYawDeg = normalizeAngleDeg(radToDeg(Math.atan2(dx, dz)));
    const derivedPitchDeg = clampPitchDeg(radToDeg(Math.atan2(-dy, Math.sqrt((dx * dx) + (dz * dz)) || 0.0001)));
    const pitchDeg = Number.isFinite(derivedPitchDeg) ? derivedPitchDeg : seededPitchDeg;
    const yawDeg = Number.isFinite(derivedYawDeg) ? derivedYawDeg : seededYawDeg;
    return {
        pivot: [pivotX, pivotY, pivotZ],
        rotation: [degToRad(pitchDeg), degToRad(yawDeg)],
        radius,
        fov: finiteOr(input?.fovDeg, finiteOr(fallback?.fov, 40))
    };
};

export const normalizeCameraStateForRtc = (input, fallback) => {
    const rawMview = input?.mview;
    if (rawMview && Array.isArray(rawMview.pivot) && Array.isArray(rawMview.rotation)) {
        return deriveCameraState({
            pivot: [finiteOr(rawMview.pivot[0], 0), finiteOr(rawMview.pivot[1], 0), finiteOr(rawMview.pivot[2], 0)],
            rotation: [finiteOr(rawMview.rotation[0], 0), finiteOr(rawMview.rotation[1], 0)],
            radius: Math.max(0.001, finiteOr(rawMview.radius, finiteOr(fallback?.radius, 1))),
            fov: finiteOr(rawMview.fov, finiteOr(fallback?.fov, 40))
        });
    }
    return deriveCameraState(deriveMviewCameraState(input || {}, fallback));
};

const VIEW_SEMANTICS = {
    front: '正面整体，优先观察马头、车辕、正向关系。',
    right: '右侧整体，优先观察车身右侧、比例、右轮。',
    back: '后方视角，优先观察车厢、尾部、后部结构。',
    left: '左侧整体，优先观察马匹姿态、左轮与车身侧面。',
    top: '俯视视角，优先观察棚顶、顶面和整体布局。',
    bottom: '低机位或仰视，优先观察轮、轮轴、底厢和底部结构。'
};

export const buildViewAtlasFromCaptures = (captures, modelContext) => {
    const atlas = {};
    for (const capture of (captures || [])) {
        const view = VIEW_ID_SET.has(capture?.view) ? capture.view : null;
        if (!view) continue;
        const normalized = normalizeCameraStateForRtc(capture?.camera, {
            pivot: modelContext?.center || [0, 0, 0],
            rotation: [0, 0],
            radius: finiteOr(modelContext?.recommendedRadius, 1),
            fov: 40
        });
        atlas[view] = {
            view,
            note: String(capture?.note || '').trim(),
            imageDataUrl: String(capture?.imageDataUrl || ''),
            camera: normalized,
            semantic: VIEW_SEMANTICS[view] || '整体参考视角。'
        };
    }
    return atlas;
};

const contains = (text, ...parts) => parts.some(part => text.includes(part));

export const getQuestionHeuristics = (question) => {
    const text = String(question || '').trim().toLowerCase();
    return {
        wantsTop: contains(text, '车顶', '棚顶', '顶部', '顶面', '上面', '俯视'),
        wantsBottom: contains(text, '车底', '底部', '底厢', '轮轴', '底盘', '底下', '下方', '仰视'),
        wantsFront: contains(text, '正面', '前面', '前方', '马头', '头部', '车辕'),
        wantsBack: contains(text, '后面', '背面', '后方', '尾部', '后部'),
        wantsRight: contains(text, '右侧', '右边', '右面', '右轮', '右前', '右后'),
        wantsLeft: contains(text, '左侧', '左边', '左面', '左轮', '左前', '左后'),
        wantsClose: contains(text, '细节', '近一点', '近景', '靠近', '放大', '特写'),
        wantsWide: contains(text, '整体', '全貌', '全景', '环绕', '全身'),
        wantsUpBias: contains(text, '俯视', '从上往下', '上方', '顶上'),
        wantsDownBias: contains(text, '仰视', '低机位', '从下往上', '底部'),
        wantsLeftBias: contains(text, '偏左', '左前', '左后'),
        wantsRightBias: contains(text, '偏右', '右前', '右后')
    };
};

export const inferHeuristicDecision = ({ question, currentSegment }) => {
    const flags = getQuestionHeuristics(question);
    let focusView = currentSegment?.focusView || 'front';
    if (flags.wantsTop) focusView = 'top';
    else if (flags.wantsFront) focusView = 'front';
    else if (flags.wantsBack) focusView = 'back';
    else if (flags.wantsRight) focusView = 'right';
    else if (flags.wantsLeft) focusView = 'left';
    else if (flags.wantsBottom) focusView = 'bottom';
    return {
        answer: '',
        focusView,
        focusPart: currentSegment?.focusPart || '整体',
        framing: flags.wantsClose ? 'close' : (flags.wantsWide ? 'wide' : 'medium'),
        verticalBias: flags.wantsUpBias ? 'up' : (flags.wantsDownBias ? 'down' : 'level'),
        orbitBias: flags.wantsLeftBias ? 'slight_left' : (flags.wantsRightBias ? 'slight_right' : 'center'),
        speechMode: 'BLOCKING',
        reasonShort: 'heuristic'
    };
};

export const correctFocusViewBySemantics = ({ decision, question, currentSegment }) => {
    const next = { ...decision };
    const flags = getQuestionHeuristics(`${decision?.focusPart || ''} ${question || ''}`);
    if (flags.wantsTop) next.focusView = 'top';
    else if (flags.wantsFront) next.focusView = 'front';
    else if (flags.wantsBack) next.focusView = 'back';
    else if (flags.wantsRight) next.focusView = 'right';
    else if (flags.wantsLeft) next.focusView = 'left';
    else if (flags.wantsBottom) next.focusView = 'bottom';
    if (!VIEW_ID_SET.has(String(next.focusView || ''))) next.focusView = currentSegment?.focusView || 'front';
    if (!['wide', 'medium', 'close'].includes(next.framing)) next.framing = 'medium';
    if (!['up', 'level', 'down'].includes(next.verticalBias)) next.verticalBias = 'level';
    if (!['slight_left', 'center', 'slight_right'].includes(next.orbitBias)) next.orbitBias = 'center';
    next.speechMode = next.speechMode === 'INTERRUPTIBLE' ? 'INTERRUPTIBLE' : 'BLOCKING';
    next.focusPart = String(next.focusPart || currentSegment?.focusPart || '整体').trim() || '整体';
    return next;
};

const applyDecisionBiases = ({ baseCamera, decision }) => {
    const baseMview = baseCamera?.mview || {
        pivot: [0, 0, 0],
        rotation: [0, 0],
        radius: 1,
        fov: 40
    };
    const next = {
        pivot: [...baseMview.pivot],
        rotation: [finiteOr(baseMview.rotation[0], 0), finiteOr(baseMview.rotation[1], 0)],
        radius: finiteOr(baseMview.radius, 1),
        fov: finiteOr(baseMview.fov, 40)
    };
    const framingAdjust = {
        wide: { radius: 1.18, fov: 1.08 },
        medium: { radius: 1, fov: 1 },
        close: { radius: 0.82, fov: 0.92 }
    }[decision?.framing || 'medium'] || { radius: 1, fov: 1 };
    next.radius = clamp(next.radius * framingAdjust.radius, 0.3, 60, next.radius);
    next.fov = clamp(next.fov * framingAdjust.fov, 24, 70, next.fov);
    const pitchDeltaDeg = decision?.verticalBias === 'up' ? -12 : (decision?.verticalBias === 'down' ? 10 : 0);
    const yawDeltaDeg = decision?.orbitBias === 'slight_left' ? -14 : (decision?.orbitBias === 'slight_right' ? 14 : 0);
    next.rotation[0] = clampPitchDeg(next.rotation[0] + pitchDeltaDeg);
    next.rotation[1] = normalizeAngleDeg(next.rotation[1] + yawDeltaDeg);
    return deriveCameraState(next);
};

export const synthesizeCameraFromDecision = ({ decision, viewAtlas, modelContext, currentSegment }) => {
    const fallbackView = currentSegment?.focusView || 'front';
    const focusView = VIEW_ID_SET.has(decision?.focusView) ? decision.focusView : fallbackView;
    const baseCamera = viewAtlas?.[focusView]?.camera ||
        viewAtlas?.[fallbackView]?.camera ||
        viewAtlas?.front?.camera ||
        normalizeCameraStateForRtc({
            mview: {
                pivot: modelContext?.center || [0, 0, 0],
                rotation: [0, 0],
                radius: finiteOr(modelContext?.recommendedRadius, 2.5),
                fov: 40
            }
        });
    const camera = applyDecisionBiases({ baseCamera, decision });
    return {
        ...camera,
        sweepYawDeg: decision?.framing === 'wide' ? 6 : (decision?.framing === 'close' ? 1.5 : 3),
        sweepPitchDeg: decision?.verticalBias === 'level' ? 0 : 1.5
    };
};

export const buildStaticViewContextText = ({ viewAtlas, modelContext }) => {
    const lines = [
        '你是 Cinematic Lite 的实时导览助手。',
        '系统已经为同一件三维文物准备了六个固定参考视角。',
        'focusView 只能从 front、right、back、left、top、bottom 中选择。',
        'front/right/back/left/top/bottom 的含义由以下视图定义决定，不要自创新视角。',
        `model_context_json=${JSON.stringify(modelContext || {})}`
    ];
    VIEW_IDS.forEach((viewId) => {
        const item = viewAtlas?.[viewId];
        if (!item) return;
        lines.push(`view_${viewId}_json=${JSON.stringify({
            view: item.view,
            note: item.note,
            semantic: item.semantic,
            camera: {
                mview: item.camera.mview,
                yawDeg: item.camera.yawDeg,
                pitchDeg: item.camera.pitchDeg,
                radius: item.camera.radius,
                fovDeg: item.camera.fovDeg
            }
        })}`);
    });
    return lines.join('\n');
};

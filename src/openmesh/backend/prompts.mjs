const splitNarration = (text) => String(text || '')
    .split(/(?<=[。！？])/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => ({ segmentId: `seg-${index + 1}`, text: item }));

export const buildPlanPrompt = ({ simplePrompt, complexPrompt, narrationText, captures, modelContext }) => {
    if (!String(complexPrompt || '').trim()) throw new Error('complexPrompt required');
    const segments = splitNarration(narrationText);
    const captureSummary = captures.map((capture, index) => ({
        imageIndex: index + 1,
        captureId: capture.captureId,
        view: capture.view,
        note: capture.note,
        source: capture.source,
        camera: {
            mview: {
                pivot: capture.camera?.mview?.pivot || [capture.camera?.lookAtX || 0, capture.camera?.lookAtY || 0, capture.camera?.lookAtZ || 0],
                rotation: capture.camera?.mview?.rotation || [0, 0],
                radius: capture.camera?.mview?.radius ?? capture.camera?.radius ?? 1,
                fov: capture.camera?.mview?.fov ?? capture.camera?.fovDeg ?? 40
            }
        }
    }));
    const prompt = [
        String(complexPrompt || '').trim(),
        '',
        '以下是必须严格遵循的输入材料。不要省略、不要重排、不要改写 segments_json 中的句子。',
        'capture_views_json 中的 imageIndex 与随后提供给模型的图片顺序一一对应，必须结合图片内容与对应的 mview 参数一起理解。',
        `simple_prompt=${JSON.stringify(String(simplePrompt || '').trim())}`,
        `segments_json=${JSON.stringify(segments, null, 2)}`,
        `capture_views_json=${JSON.stringify(captureSummary, null, 2)}`,
        `model_context_json=${JSON.stringify(modelContext || {}, null, 2)}`
    ].join('\n').trim();

    return {
        segments,
        prompt,
        materials: {
            simplePrompt: String(simplePrompt || '').trim(),
            complexPrompt: String(complexPrompt || '').trim(),
            narrationText: String(narrationText || '').trim(),
            modelContext,
            captures: captureSummary,
            segments
        }
    };
};

export const buildCsv = (plan) => {
    const lines = [
        'seq,segment_id,focus_view,focus_part,action,audio_mode,move_before_sec,pivot_x,pivot_y,pivot_z,rotation_pitch,rotation_yaw,radius,fov,target_x,target_y,target_z,look_at_x,look_at_y,look_at_z,target_yaw,target_pitch,target_fov,target_radius,move_speed_mps,sweep_yaw_deg,sweep_pitch_deg,content'
    ];
    (plan?.segments || []).forEach((segment, index) => {
        const camera = segment.camera || {};
        const row = [
            index + 1,
            segment.segmentId,
            segment.focusView,
            `"${String(segment.focusPart || '').replace(/"/g, '""')}"`,
            'MOVE_AND_SPEAK',
            segment.speechMode || 'BLOCKING',
            Number(segment.moveBeforeSec || 1.4).toFixed(2),
            Number(camera.mview?.pivot?.[0] || camera.lookAtX || 0).toFixed(4),
            Number(camera.mview?.pivot?.[1] || camera.lookAtY || 0).toFixed(4),
            Number(camera.mview?.pivot?.[2] || camera.lookAtZ || 0).toFixed(4),
            Number(camera.mview?.rotation?.[0] || camera.pitchDeg || 0).toFixed(4),
            Number(camera.mview?.rotation?.[1] || camera.yawDeg || 0).toFixed(4),
            Number(camera.mview?.radius || camera.radius || 1).toFixed(4),
            Number(camera.mview?.fov || camera.fovDeg || 44).toFixed(2),
            Number(camera.cameraX || 0).toFixed(4),
            Number(camera.cameraY || 0).toFixed(4),
            Number(camera.cameraZ || 0).toFixed(4),
            Number(camera.lookAtX || 0).toFixed(4),
            Number(camera.lookAtY || 0).toFixed(4),
            Number(camera.lookAtZ || 0).toFixed(4),
            Number(camera.yawDeg || 0).toFixed(2),
            Number(camera.pitchDeg || 0).toFixed(2),
            Number(camera.fovDeg || 44).toFixed(2),
            Number(camera.radius || 1).toFixed(4),
            Number(segment.moveSpeedMps || 0.8).toFixed(2),
            Number(camera.sweepYawDeg || 0).toFixed(2),
            Number(camera.sweepPitchDeg || 0).toFixed(2),
            `"${String(segment.text || '').replace(/"/g, '""')}"`
        ];
        lines.push(row.join(','));
    });
    return lines.join('\n');
};

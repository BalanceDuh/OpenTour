import { Quat, Vec3 } from 'playcanvas';

type AxisDirection = 'xp' | 'xn' | 'yp' | 'yn' | 'zp' | 'zn';

type RightHandedAxisPresetId =
    | 'r-yup-xfwd'
    | 'r-yup-xback'
    | 'r-yup-zfwd'
    | 'r-yup-zback'
    | 'r-ydown-xfwd'
    | 'r-ydown-xback'
    | 'r-ydown-zfwd'
    | 'r-ydown-zback'
    | 'r-zup-xfwd'
    | 'r-zup-xback'
    | 'r-zup-yfwd'
    | 'r-zup-yback'
    | 'r-zdown-xfwd'
    | 'r-zdown-xback'
    | 'r-zdown-yfwd'
    | 'r-zdown-yback';

type RightHandedAxisPreset = {
    id: RightHandedAxisPresetId;
    label: string;
    up: AxisDirection;
    front: AxisDirection;
    note?: string;
};

const RIGHT_HANDED_AXIS_PRESETS: RightHandedAxisPreset[] = [
    { id: 'r-yup-xfwd', label: 'R-Yup-Xfwd', up: 'yp', front: 'xp' },
    { id: 'r-yup-xback', label: 'R-Yup-Xback', up: 'yp', front: 'xn' },
    { id: 'r-yup-zfwd', label: 'R-Yup-Zfwd', up: 'yp', front: 'zp' },
    { id: 'r-yup-zback', label: 'R-Yup-Zback', up: 'yp', front: 'zn', note: 'OpenGL / glTF' },
    { id: 'r-ydown-xfwd', label: 'R-Ydown-Xfwd', up: 'yn', front: 'xp' },
    { id: 'r-ydown-xback', label: 'R-Ydown-Xback', up: 'yn', front: 'xn' },
    { id: 'r-ydown-zfwd', label: 'R-Ydown-Zfwd', up: 'yn', front: 'zp', note: 'OpenCV camera space' },
    { id: 'r-ydown-zback', label: 'R-Ydown-Zback', up: 'yn', front: 'zn' },
    { id: 'r-zup-xfwd', label: 'R-Zup-Xfwd', up: 'zp', front: 'xp', note: 'ROS / ENU' },
    { id: 'r-zup-xback', label: 'R-Zup-Xback', up: 'zp', front: 'xn' },
    { id: 'r-zup-yfwd', label: 'R-Zup-Yfwd', up: 'zp', front: 'yp', note: 'Blender / Unreal style' },
    { id: 'r-zup-yback', label: 'R-Zup-Yback', up: 'zp', front: 'yn' },
    { id: 'r-zdown-xfwd', label: 'R-Zdown-Xfwd', up: 'zn', front: 'xp' },
    { id: 'r-zdown-xback', label: 'R-Zdown-Xback', up: 'zn', front: 'xn' },
    { id: 'r-zdown-yfwd', label: 'R-Zdown-Yfwd', up: 'zn', front: 'yp' },
    { id: 'r-zdown-yback', label: 'R-Zdown-Yback', up: 'zn', front: 'yn' }
];

const DEFAULT_RIGHT_HANDED_PRESET_ID: RightHandedAxisPresetId = 'r-zup-yfwd';

const vectorFromAxisDirection = (axis: AxisDirection) => {
    if (axis === 'xp') return new Vec3(1, 0, 0);
    if (axis === 'xn') return new Vec3(-1, 0, 0);
    if (axis === 'yp') return new Vec3(0, 1, 0);
    if (axis === 'yn') return new Vec3(0, -1, 0);
    if (axis === 'zp') return new Vec3(0, 0, 1);
    return new Vec3(0, 0, -1);
};

const getRightHandedPreset = (id: string): RightHandedAxisPreset | undefined => {
    return RIGHT_HANDED_AXIS_PRESETS.find((preset) => preset.id === id);
};

const quatFromBasis = (xAxis: Vec3, yAxis: Vec3, zAxis: Vec3) => {
    const m00 = xAxis.x;
    const m01 = yAxis.x;
    const m02 = zAxis.x;
    const m10 = xAxis.y;
    const m11 = yAxis.y;
    const m12 = zAxis.y;
    const m20 = xAxis.z;
    const m21 = yAxis.z;
    const m22 = zAxis.z;

    const q = new Quat();
    const trace = m00 + m11 + m22;

    if (trace > 0) {
        const s = Math.sqrt(trace + 1.0) * 2;
        q.w = 0.25 * s;
        q.x = (m21 - m12) / s;
        q.y = (m02 - m20) / s;
        q.z = (m10 - m01) / s;
        return q;
    }

    if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
        q.w = (m21 - m12) / s;
        q.x = 0.25 * s;
        q.y = (m01 + m10) / s;
        q.z = (m02 + m20) / s;
        return q;
    }

    if (m11 > m22) {
        const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
        q.w = (m02 - m20) / s;
        q.x = (m01 + m10) / s;
        q.y = 0.25 * s;
        q.z = (m12 + m21) / s;
        return q;
    }

    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    q.w = (m10 - m01) / s;
    q.x = (m02 + m20) / s;
    q.y = (m12 + m21) / s;
    q.z = 0.25 * s;
    return q;
};

const applyRightHandedAxisPreset = (root: any, presetId: string) => {
    const preset = getRightHandedPreset(presetId) ?? getRightHandedPreset(DEFAULT_RIGHT_HANDED_PRESET_ID);
    if (!preset || !root?.setLocalRotation || !root?.setLocalScale) return null;

    const yAxis = vectorFromAxisDirection(preset.up);
    const zAxis = vectorFromAxisDirection(preset.front);
    const xAxis = new Vec3();
    xAxis.cross(yAxis, zAxis).normalize();

    const rotation = quatFromBasis(xAxis, yAxis, zAxis);
    root.setLocalRotation(rotation);
    root.setLocalScale(1, 1, 1);
    return preset;
};

export {
    RIGHT_HANDED_AXIS_PRESETS,
    DEFAULT_RIGHT_HANDED_PRESET_ID,
    getRightHandedPreset,
    applyRightHandedAxisPreset
};

export type {
    RightHandedAxisPreset,
    RightHandedAxisPresetId
};

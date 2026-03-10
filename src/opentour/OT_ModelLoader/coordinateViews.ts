type AxisDir = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

type CoordinateId =
    | 'R-Yup-Xfwd'
    | 'R-Yup-Xback'
    | 'R-Yup-Zfwd'
    | 'R-Yup-Zback'
    | 'L-Yup-Zfwd'
    | 'R-Ydown-Xfwd'
    | 'R-Ydown-Xback'
    | 'R-Ydown-Zfwd'
    | 'R-Ydown-Zback'
    | 'L-Ydown-Zfwd'
    | 'R-Zup-Xfwd'
    | 'R-Zup-Xback'
    | 'R-Zup-Yfwd'
    | 'R-Zup-Yback'
    | 'R-Zdown-Xfwd'
    | 'R-Zdown-Xback'
    | 'R-Zdown-Yfwd'
    | 'R-Zdown-Yback';

type AxisDefinition = {
    up: AxisDir;
    forward: AxisDir;
    right: AxisDir;
};

type ViewProjection = {
    screenUp: AxisDir;
    screenRight: AxisDir;
};

type SemanticDirections = {
    front: AxisDir;
    back: AxisDir;
    left: AxisDir;
    right: AxisDir;
    up: AxisDir;
    down: AxisDir;
    turnLeft: AxisDir;
    turnRight: AxisDir;
};

type MoveOperationName =
    | 'MoveForward'
    | 'MoveBackward'
    | 'StrafeLeft'
    | 'StrafeRight'
    | 'ElevateUp'
    | 'ElevateDown';

type LookOperationName =
    | 'YawLeft'
    | 'YawRight'
    | 'PitchUp'
    | 'PitchDown';

type OperationName = MoveOperationName | LookOperationName;

type ControlKeyCode =
    | 'KeyW'
    | 'KeyS'
    | 'KeyA'
    | 'KeyD'
    | 'KeyQ'
    | 'KeyE'
    | 'ArrowLeft'
    | 'ArrowRight'
    | 'ArrowUp'
    | 'ArrowDown';

type MoveOperationMapping = {
    MoveForward: AxisDir;
    MoveBackward: AxisDir;
    StrafeLeft: AxisDir;
    StrafeRight: AxisDir;
    ElevateUp: AxisDir;
    ElevateDown: AxisDir;
};

type LookOperationMapping = {
    YawLeft: {
        turnToward: AxisDir;
        around: 'up';
    };
    YawRight: {
        turnToward: AxisDir;
        around: 'up';
    };
    PitchUp: {
        cameraPositionDelta: 'none';
        around: 'right';
    };
    PitchDown: {
        cameraPositionDelta: 'none';
        around: 'right';
    };
};

type CoordinateViewProfile = {
    id: CoordinateId;
    axes: AxisDefinition;
    semantic: SemanticDirections;
    move: MoveOperationMapping;
    look: LookOperationMapping;
    topView: ViewProjection;
    frontView: ViewProjection;
};

type CoordinateControlBinding = {
    move: {
        KeyW: AxisDir;
        KeyS: AxisDir;
        KeyA: AxisDir;
        KeyD: AxisDir;
        KeyQ: AxisDir;
        KeyE: AxisDir;
    };
    look: {
        ArrowLeft: LookOperationMapping['YawLeft'];
        ArrowRight: LookOperationMapping['YawRight'];
        ArrowUp: LookOperationMapping['PitchUp'];
        ArrowDown: LookOperationMapping['PitchDown'];
    };
};

const COORDINATE_IDS: CoordinateId[] = [
    'R-Yup-Xfwd',
    'R-Yup-Xback',
    'R-Yup-Zfwd',
    'R-Yup-Zback',
    'L-Yup-Zfwd',
    'R-Ydown-Xfwd',
    'R-Ydown-Xback',
    'R-Ydown-Zfwd',
    'R-Ydown-Zback',
    'L-Ydown-Zfwd',
    'R-Zup-Xfwd',
    'R-Zup-Xback',
    'R-Zup-Yfwd',
    'R-Zup-Yback',
    'R-Zdown-Xfwd',
    'R-Zdown-Xback',
    'R-Zdown-Yfwd',
    'R-Zdown-Yback'
];

const COORDINATE_NAMING_RULES = {
    idFormat: '<HandednessToken>-<UpToken>-<ForwardToken>',
    handednessToken: {
        R: 'RightHanded',
        L: 'LeftHanded'
    },
    upTokenToAxis: {
        Yup: '+Y',
        Ydown: '-Y',
        Zup: '+Z',
        Zdown: '-Z'
    },
    forwardTokenToAxis: {
        Xfwd: '+X',
        Xback: '-X',
        Yfwd: '+Y',
        Yback: '-Y',
        Zfwd: '+Z',
        Zback: '-Z'
    },
    examples: COORDINATE_IDS
} as const;

const KEY_BINDING_STANDARD = {
    KeyW: 'MoveForward',
    KeyS: 'MoveBackward',
    KeyA: 'StrafeLeft',
    KeyD: 'StrafeRight',
    KeyQ: 'ElevateUp',
    KeyE: 'ElevateDown',
    ArrowLeft: 'YawLeft',
    ArrowRight: 'YawRight',
    ArrowUp: 'PitchUp',
    ArrowDown: 'PitchDown'
} as const satisfies Record<ControlKeyCode, OperationName>;

const OPERATION_NAMING_STANDARD = {
    MoveForward: {
        kind: 'move',
        meaning: 'camera position moves forward'
    },
    MoveBackward: {
        kind: 'move',
        meaning: 'camera position moves backward'
    },
    StrafeLeft: {
        kind: 'move',
        meaning: 'camera position strafes left'
    },
    StrafeRight: {
        kind: 'move',
        meaning: 'camera position strafes right'
    },
    ElevateUp: {
        kind: 'move',
        meaning: 'camera position moves up'
    },
    ElevateDown: {
        kind: 'move',
        meaning: 'camera position moves down'
    },
    YawLeft: {
        kind: 'look',
        meaning: 'camera rotates left around up axis'
    },
    YawRight: {
        kind: 'look',
        meaning: 'camera rotates right around up axis'
    },
    PitchUp: {
        kind: 'look',
        meaning: 'camera rotates upward around right axis; position unchanged'
    },
    PitchDown: {
        kind: 'look',
        meaning: 'camera rotates downward around right axis; position unchanged'
    }
} as const;

const OPPOSITE_AXIS: Record<AxisDir, AxisDir> = {
    '+X': '-X',
    '-X': '+X',
    '+Y': '-Y',
    '-Y': '+Y',
    '+Z': '-Z',
    '-Z': '+Z'
};

const BASE_AXES_BY_ID: Record<CoordinateId, AxisDefinition> = {
    'R-Yup-Xfwd': { up: '+Y', forward: '+X', right: '+Z' },
    'R-Yup-Xback': { up: '+Y', forward: '-X', right: '-Z' },
    'R-Yup-Zfwd': { up: '+Y', forward: '+Z', right: '-X' },
    'R-Yup-Zback': { up: '+Y', forward: '-Z', right: '+X' },
    'L-Yup-Zfwd': { up: '+Y', forward: '+Z', right: '+X' },
    'R-Ydown-Xfwd': { up: '-Y', forward: '+X', right: '-Z' },
    'R-Ydown-Xback': { up: '-Y', forward: '-X', right: '+Z' },
    'R-Ydown-Zfwd': { up: '-Y', forward: '+Z', right: '+X' },
    'R-Ydown-Zback': { up: '-Y', forward: '-Z', right: '-X' },
    'L-Ydown-Zfwd': { up: '-Y', forward: '+Z', right: '-X' },
    'R-Zup-Xfwd': { up: '+Z', forward: '+X', right: '-Y' },
    'R-Zup-Xback': { up: '+Z', forward: '-X', right: '+Y' },
    'R-Zup-Yfwd': { up: '+Z', forward: '+Y', right: '+X' },
    'R-Zup-Yback': { up: '+Z', forward: '-Y', right: '-X' },
    'R-Zdown-Xfwd': { up: '-Z', forward: '+X', right: '+Y' },
    'R-Zdown-Xback': { up: '-Z', forward: '-X', right: '-Y' },
    'R-Zdown-Yfwd': { up: '-Z', forward: '+Y', right: '-X' },
    'R-Zdown-Yback': { up: '-Z', forward: '-Y', right: '+X' }
};

const buildProfile = (id: CoordinateId, axes: AxisDefinition): CoordinateViewProfile => {
    const semantic: SemanticDirections = {
        front: axes.forward,
        back: OPPOSITE_AXIS[axes.forward],
        left: OPPOSITE_AXIS[axes.right],
        right: axes.right,
        up: axes.up,
        down: OPPOSITE_AXIS[axes.up],
        turnLeft: OPPOSITE_AXIS[axes.right],
        turnRight: axes.right
    };

    return {
        id,
        axes,
        semantic,
        move: {
            MoveForward: axes.forward,
            MoveBackward: OPPOSITE_AXIS[axes.forward],
            StrafeLeft: OPPOSITE_AXIS[axes.right],
            StrafeRight: axes.right,
            ElevateUp: axes.up,
            ElevateDown: OPPOSITE_AXIS[axes.up]
        },
        look: {
            YawLeft: {
                turnToward: OPPOSITE_AXIS[axes.right],
                around: 'up'
            },
            YawRight: {
                turnToward: axes.right,
                around: 'up'
            },
            PitchUp: {
                cameraPositionDelta: 'none',
                around: 'right'
            },
            PitchDown: {
                cameraPositionDelta: 'none',
                around: 'right'
            }
        },
        topView: {
            screenUp: axes.forward,
            screenRight: axes.right
        },
        frontView: {
            screenUp: axes.up,
            screenRight: axes.right
        }
    };
};

const COORDINATE_VIEW_PROFILES: Record<CoordinateId, CoordinateViewProfile> = {
    'R-Yup-Xfwd': buildProfile('R-Yup-Xfwd', BASE_AXES_BY_ID['R-Yup-Xfwd']),
    'R-Yup-Xback': buildProfile('R-Yup-Xback', BASE_AXES_BY_ID['R-Yup-Xback']),
    'R-Yup-Zfwd': buildProfile('R-Yup-Zfwd', BASE_AXES_BY_ID['R-Yup-Zfwd']),
    'R-Yup-Zback': buildProfile('R-Yup-Zback', BASE_AXES_BY_ID['R-Yup-Zback']),
    'L-Yup-Zfwd': buildProfile('L-Yup-Zfwd', BASE_AXES_BY_ID['L-Yup-Zfwd']),
    'R-Ydown-Xfwd': buildProfile('R-Ydown-Xfwd', BASE_AXES_BY_ID['R-Ydown-Xfwd']),
    'R-Ydown-Xback': buildProfile('R-Ydown-Xback', BASE_AXES_BY_ID['R-Ydown-Xback']),
    'R-Ydown-Zfwd': buildProfile('R-Ydown-Zfwd', BASE_AXES_BY_ID['R-Ydown-Zfwd']),
    'R-Ydown-Zback': buildProfile('R-Ydown-Zback', BASE_AXES_BY_ID['R-Ydown-Zback']),
    'L-Ydown-Zfwd': buildProfile('L-Ydown-Zfwd', BASE_AXES_BY_ID['L-Ydown-Zfwd']),
    'R-Zup-Xfwd': buildProfile('R-Zup-Xfwd', BASE_AXES_BY_ID['R-Zup-Xfwd']),
    'R-Zup-Xback': buildProfile('R-Zup-Xback', BASE_AXES_BY_ID['R-Zup-Xback']),
    'R-Zup-Yfwd': buildProfile('R-Zup-Yfwd', BASE_AXES_BY_ID['R-Zup-Yfwd']),
    'R-Zup-Yback': buildProfile('R-Zup-Yback', BASE_AXES_BY_ID['R-Zup-Yback']),
    'R-Zdown-Xfwd': buildProfile('R-Zdown-Xfwd', BASE_AXES_BY_ID['R-Zdown-Xfwd']),
    'R-Zdown-Xback': buildProfile('R-Zdown-Xback', BASE_AXES_BY_ID['R-Zdown-Xback']),
    'R-Zdown-Yfwd': buildProfile('R-Zdown-Yfwd', BASE_AXES_BY_ID['R-Zdown-Yfwd']),
    'R-Zdown-Yback': buildProfile('R-Zdown-Yback', BASE_AXES_BY_ID['R-Zdown-Yback'])
};

const COORDINATE_VIEW_PROFILE_LIST = COORDINATE_IDS.map(id => COORDINATE_VIEW_PROFILES[id]);

const getCoordinateViewProfile = (id: CoordinateId) => COORDINATE_VIEW_PROFILES[id];

const getOperationNameByKey = (keyCode: ControlKeyCode) => KEY_BINDING_STANDARD[keyCode];

const getCoordinateControlBinding = (id: CoordinateId): CoordinateControlBinding => {
    const profile = COORDINATE_VIEW_PROFILES[id];
    return {
        move: {
            KeyW: profile.move.MoveForward,
            KeyS: profile.move.MoveBackward,
            KeyA: profile.move.StrafeLeft,
            KeyD: profile.move.StrafeRight,
            KeyQ: profile.move.ElevateUp,
            KeyE: profile.move.ElevateDown
        },
        look: {
            ArrowLeft: profile.look.YawLeft,
            ArrowRight: profile.look.YawRight,
            ArrowUp: profile.look.PitchUp,
            ArrowDown: profile.look.PitchDown
        }
    };
};

const validateCoordinateProfile = (profile: CoordinateViewProfile) => {
    return {
        topViewForwardMatchesW: profile.topView.screenUp === profile.move.MoveForward,
        topViewRightMatchesD: profile.topView.screenRight === profile.move.StrafeRight,
        qEqualsElevateUp: profile.move.ElevateUp === profile.semantic.up,
        eEqualsElevateDown: profile.move.ElevateDown === profile.semantic.down,
        arrowLeftIsYawLeft: profile.look.YawLeft.turnToward === profile.semantic.turnLeft && profile.look.YawLeft.around === 'up',
        arrowRightIsYawRight: profile.look.YawRight.turnToward === profile.semantic.turnRight && profile.look.YawRight.around === 'up',
        arrowUpIsPitchUp: profile.look.PitchUp.cameraPositionDelta === 'none' && profile.look.PitchUp.around === 'right',
        arrowDownIsPitchDown: profile.look.PitchDown.cameraPositionDelta === 'none' && profile.look.PitchDown.around === 'right',
        isRightHanded: (() => {
            const cross = (a: AxisDir, b: AxisDir): AxisDir => {
                const axes = {
                    '+X': [1, 0, 0], '-X': [-1, 0, 0],
                    '+Y': [0, 1, 0], '-Y': [0, -1, 0],
                    '+Z': [0, 0, 1], '-Z': [0, 0, -1]
                } as const;
                const v1 = axes[a];
                const v2 = axes[b];
                const cx = v1[1] * v2[2] - v1[2] * v2[1];
                const cy = v1[2] * v2[0] - v1[0] * v2[2];
                const cz = v1[0] * v2[1] - v1[1] * v2[0];
                if (cx > 0) return '+X'; if (cx < 0) return '-X';
                if (cy > 0) return '+Y'; if (cy < 0) return '-Y';
                if (cz > 0) return '+Z'; if (cz < 0) return '-Z';
                return '+X'; // should not happen for orthogonal basis
            };
            return cross(profile.move.MoveForward, profile.semantic.up) === profile.move.StrafeRight;
        })()
    };
};

const COORDINATE_PROFILE_VALIDATION = COORDINATE_IDS.reduce(
    (acc, id) => {
        acc[id] = validateCoordinateProfile(COORDINATE_VIEW_PROFILES[id]);
        return acc;
    },
    {} as Record<CoordinateId, ReturnType<typeof validateCoordinateProfile>>
);

export {
    COORDINATE_IDS,
    COORDINATE_NAMING_RULES,
    KEY_BINDING_STANDARD,
    OPERATION_NAMING_STANDARD,
    COORDINATE_VIEW_PROFILES,
    COORDINATE_VIEW_PROFILE_LIST,
    COORDINATE_PROFILE_VALIDATION,
    getCoordinateViewProfile,
    getOperationNameByKey,
    getCoordinateControlBinding,
    type AxisDir,
    type CoordinateId,
    type AxisDefinition,
    type ViewProjection,
    type SemanticDirections,
    type MoveOperationName,
    type LookOperationName,
    type OperationName,
    type ControlKeyCode,
    type MoveOperationMapping,
    type LookOperationMapping,
    type CoordinateControlBinding,
    type CoordinateViewProfile
};

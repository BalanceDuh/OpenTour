import type { AxisDirection } from './best-view-generator';
import type { RightHandedAxisPresetId } from './axis-presets';
import type { Step3OverlayViewMapping } from './step3-live-overlay-algorithm';

type Step3OverlayReference = {
    axisPresetId: RightHandedAxisPresetId;
    transformBasis: {
        right: AxisDirection;
        up: AxisDirection;
        front: AxisDirection;
    };
    viewMapping: Step3OverlayViewMapping;
    note: string;
};

const STEP3_REFERENCE_R_ZUP_YFWD: Step3OverlayReference = {
    axisPresetId: 'r-zup-yfwd',
    transformBasis: {
        right: 'xn',
        up: 'zp',
        front: 'yp'
    },
    viewMapping: {
        map: {
            xComponent: 'x',
            yComponent: 'z',
            xSign: 1,
            ySign: 1,
            invertVertical: true
        },
        front: {
            xComponent: 'x',
            yComponent: 'y',
            xSign: 1,
            ySign: 1,
            invertVertical: true
        }
    },
    note: 'Known-good Step3 overlay baseline. Keep synchronized with Step2 raster semantics.'
};

const DEFAULT_STEP3_VIEW_MAPPING: Step3OverlayViewMapping = {
    map: {
        xComponent: 'x',
        yComponent: 'z',
        xSign: 1,
        ySign: 1,
        invertVertical: true
    },
    front: {
        xComponent: 'x',
        yComponent: 'y',
        xSign: 1,
        ySign: 1,
        invertVertical: true
    }
};

export {
    STEP3_REFERENCE_R_ZUP_YFWD,
    DEFAULT_STEP3_VIEW_MAPPING
};

export type {
    Step3OverlayReference
};

import type { Step3OverlayViewMapping } from './step3-live-overlay-algorithm';

const R_ZUP_YFWD_BACKUP = {
    axisPresetId: 'r-zup-yfwd' as const,
    transformBasis: {
        right: 'xn' as const,
        up: 'zp' as const,
        front: 'yp' as const
    },
    viewMapping: {
        map: {
            xComponent: 'x' as const,
            yComponent: 'z' as const,
            xSign: 1 as const,
            ySign: 1 as const,
            invertVertical: true
        },
        front: {
            xComponent: 'x' as const,
            yComponent: 'y' as const,
            xSign: 1 as const,
            ySign: 1 as const,
            invertVertical: true
        }
    } satisfies Step3OverlayViewMapping,
    note: 'Frozen backup copy for R-Zup-Yfwd Step3 mapping baseline.'
};

export {
    R_ZUP_YFWD_BACKUP
};

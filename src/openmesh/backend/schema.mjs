const mviewSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['pivot', 'rotation', 'radius', 'fov'],
    properties: {
        pivot: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'number' }
        },
        rotation: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: { type: 'number' }
        },
        radius: { type: 'number' },
        fov: { type: 'number' }
    }
};

const cameraSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['mview', 'sweepYawDeg', 'sweepPitchDeg'],
    properties: {
        mview: mviewSchema,
        sweepYawDeg: { type: 'number' },
        sweepPitchDeg: { type: 'number' }
    }
};

export const planResponseSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['segments'],
    properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        segments: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['segmentId', 'text', 'focusView', 'focusPart', 'moveBeforeSec', 'moveSpeedMps', 'speechMode', 'camera'],
                properties: {
                    segmentId: { type: 'string' },
                    text: { type: 'string' },
                    focusView: { type: 'string', enum: ['front', 'back', 'left', 'right', 'top', 'bottom'] },
                    focusPart: { type: 'string' },
                    moveBeforeSec: { type: 'number' },
                    moveSpeedMps: { type: 'number' },
                    speechMode: { type: 'string', enum: ['INTERRUPTIBLE', 'BLOCKING'] },
                    camera: cameraSchema,
                    rationale: { type: 'string' }
                }
            }
        }
    }
};

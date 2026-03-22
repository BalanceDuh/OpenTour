import type { CameraState } from '../cinematic-lite-types';

export function normalizeCameraStateForRtc(input: Partial<CameraState>, fallback?: unknown): CameraState;

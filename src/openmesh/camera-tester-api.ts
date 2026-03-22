import type { CameraState } from './cinematic-lite-types';

export interface CameraTesterSnapshot {
    snapshotId?: string;
    modelFilename?: string;
    name: string;
    note: string;
    source?: string;
    camera: CameraState;
    createdAt?: string;
    updatedAt?: string;
}

const parseJson = async (response: Response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(String(data?.error?.message || `HTTP ${response.status}`));
    return data;
};

export const listCameraTesterSnapshots = async (modelFilename: string) => {
    const response = await fetch(`/api/camera-tester/snapshots?modelFilename=${encodeURIComponent(modelFilename)}`, { cache: 'no-store' });
    return parseJson(response) as Promise<{ snapshots: CameraTesterSnapshot[]; }>;
};

export const saveCameraTesterSnapshot = async (payload: { modelFilename: string; snapshot: CameraTesterSnapshot; }) => {
    const response = await fetch('/api/camera-tester/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response) as Promise<{ snapshot: CameraTesterSnapshot; snapshots: CameraTesterSnapshot[]; }>;
};

export const deleteCameraTesterSnapshot = async (snapshotId: string, modelFilename: string) => {
    const response = await fetch(`/api/camera-tester/snapshots/${encodeURIComponent(snapshotId)}?modelFilename=${encodeURIComponent(modelFilename)}`, {
        method: 'DELETE',
        cache: 'no-store'
    });
    return parseJson(response) as Promise<{ deleted: boolean; snapshots: CameraTesterSnapshot[]; }>;
};

export const resetCameraTesterSnapshots = async (modelFilename: string) => {
    const response = await fetch(`/api/camera-tester/reset?modelFilename=${encodeURIComponent(modelFilename)}`, {
        method: 'DELETE',
        cache: 'no-store'
    });
    return parseJson(response) as Promise<{ deleted: number; snapshots: CameraTesterSnapshot[]; }>;
};

import { getFeatureFlags } from '../config/feature-flags.mjs';
import { createMemoryJobStore } from './memory-store.mjs';
import { createSharedJobStore } from './shared-store.mjs';

export const createJobStore = () => {
    const flags = getFeatureFlags();
    return flags.jobStateMode === 'shared' ? createSharedJobStore() : createMemoryJobStore();
};

import { createJobStore } from '../jobs/index.mjs';
import { getFeatureFlags } from '../config/feature-flags.mjs';
import { createLiveStreamRepository } from './repositories/live-stream-repository.mjs';
import { createWorkflowRepository } from './repositories/workflow-repository.mjs';

export const createBackendContext = () => ({
    flags: getFeatureFlags(),
    jobs: createJobStore(),
    repositories: {
        workflow: createWorkflowRepository('workflow'),
        liveStream: createLiveStreamRepository('ot-live-stream')
    }
});

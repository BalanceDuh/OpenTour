import { randomUUID } from 'node:crypto';

const toIso = () => new Date().toISOString();

export class JobStore {
    constructor() {
        this.jobs = new Map();
    }

    create(kind, payload, executor) {
        const jobId = `cine_${randomUUID()}`;
        const now = toIso();
        const job = {
            jobId,
            kind,
            payload,
            status: 'queued',
            stage: 'queued',
            progress: 0,
            createdAt: now,
            updatedAt: now,
            heartbeatAt: now,
            partialText: '',
            geminiRequestPrompt: '',
            geminiRequestMaterials: null,
            geminiRawResponse: '',
            result: null,
            error: null,
            cancelRequested: false,
            events: []
        };
        this.jobs.set(jobId, job);

        const ctx = {
            jobId,
            isCancelled: () => job.cancelRequested,
            pushEvent: (type, detail) => {
                job.events.push({ at: toIso(), type, detail });
                if (job.events.length > 60) job.events.splice(0, job.events.length - 60);
                job.updatedAt = toIso();
                job.heartbeatAt = job.updatedAt;
            },
            update: (patch) => {
                Object.assign(job, patch);
                job.updatedAt = toIso();
                job.heartbeatAt = job.updatedAt;
            }
        };

        void Promise.resolve().then(async () => {
            ctx.update({ status: 'running', stage: 'starting', progress: 0.02 });
            try {
                const result = await executor(ctx);
                if (job.cancelRequested) {
                    ctx.update({ status: 'cancelled', stage: 'cancelled', progress: 1, result: null, error: null });
                    return;
                }
                ctx.update({ status: 'completed', stage: 'completed', progress: 1, result, error: null, partialText: '' });
            } catch (error) {
                ctx.update({
                    status: job.cancelRequested ? 'cancelled' : 'failed',
                    stage: job.cancelRequested ? 'cancelled' : 'failed',
                    progress: 1,
                    error: {
                        message: error instanceof Error ? error.message : String(error)
                    }
                });
            }
        });

        return job;
    }

    get(jobId) {
        return this.jobs.get(jobId) || null;
    }

    cancel(jobId) {
        const job = this.jobs.get(jobId) || null;
        if (!job) return null;
        job.cancelRequested = true;
        job.updatedAt = toIso();
        job.heartbeatAt = job.updatedAt;
        return job;
    }
}

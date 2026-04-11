import { performance } from 'node:perf_hooks';

import { getFeatureFlags } from '../../config/feature-flags.mjs';

const logCall = ({ service, method, success, startedAt, extra = {} }) => {
    const flags = getFeatureFlags();
    const durationMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
    const payload = {
        type: 'repository-call',
        service,
        method,
        dbMode: flags.dbMode,
        dbReadSource: flags.dbReadSource,
        dbWriteTarget: flags.dbWriteTarget,
        success,
        durationMs,
        ...extra
    };
    const line = `[repo] ${JSON.stringify(payload)}`;
    if (success) {
        console.info(line);
        return;
    }
    console.warn(line);
};

export const createSqliteStatementRepository = ({ service, db, statements }) => {
    const prepared = {};
    for (const [name, factory] of Object.entries(statements)) {
        prepared[name] = typeof factory === 'function' ? factory(db) : db.prepare(factory);
    }

    const invoke = (statementName, op, args) => {
        const startedAt = performance.now();
        try {
            const result = prepared[statementName][op](...args);
            logCall({ service, method: statementName, success: true, startedAt, extra: { op } });
            return result;
        } catch (error) {
            logCall({
                service,
                method: statementName,
                success: false,
                startedAt,
                extra: {
                    op,
                    error: error instanceof Error ? error.message : String(error)
                }
            });
            throw error;
        }
    };

    return {
        db,
        run: (statementName, ...args) => invoke(statementName, 'run', args),
        get: (statementName, ...args) => invoke(statementName, 'get', args),
        all: (statementName, ...args) => invoke(statementName, 'all', args),
        statement: (statementName) => prepared[statementName],
        transaction: (name, fn) => db.transaction((...args) => {
            const startedAt = performance.now();
            try {
                const result = fn(...args);
                logCall({ service, method: name, success: true, startedAt, extra: { op: 'transaction' } });
                return result;
            } catch (error) {
                logCall({
                    service,
                    method: name,
                    success: false,
                    startedAt,
                    extra: {
                        op: 'transaction',
                        error: error instanceof Error ? error.message : String(error)
                    }
                });
                throw error;
            }
        })
    };
};

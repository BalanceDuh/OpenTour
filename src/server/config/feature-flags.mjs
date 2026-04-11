const BOOL_TRUE = new Set(['1', 'true', 'yes', 'on']);

const readBool = (value, fallback = false) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return fallback;
    return BOOL_TRUE.has(normalized);
};

export const getFeatureFlags = () => ({
    dbMode: String(process.env.DB_MODE || 'sqlite').trim() || 'sqlite',
    dbReadSource: String(process.env.DB_READ_SOURCE || 'sqlite').trim() || 'sqlite',
    dbWriteTarget: String(process.env.DB_WRITE_TARGET || 'sqlite').trim() || 'sqlite',
    dbCompareRead: readBool(process.env.DB_COMPARE_READ, false),
    mediaStoreMode: String(process.env.MEDIA_STORE_MODE || 'sqlite').trim() || 'sqlite',
    jobStateMode: String(process.env.JOB_STATE_MODE || 'memory').trim() || 'memory',
    enableSqliteFallback: readBool(process.env.ENABLE_SQLITE_FALLBACK, true)
});

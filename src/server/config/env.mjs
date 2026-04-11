import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '../../..'));
const dataDir = normalize(join(repoRoot, 'data'));

export const getEnv = () => ({
    repoRoot,
    dataDir,
    databaseUrl: String(process.env.DATABASE_URL || '').trim(),
    databasePoolMax: Number.parseInt(String(process.env.DATABASE_POOL_MAX || '10'), 10) || 10,
    nodeEnv: String(process.env.NODE_ENV || 'development').trim() || 'development'
});

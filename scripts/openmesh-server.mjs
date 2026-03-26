import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProxyAgent, setGlobalDispatcher } from 'undici';

import { handleCinematicLiteApi } from '../src/openmesh/backend/router.mjs';
import { attachRealtimeLiveSessionServer } from '../src/openmesh/backend/realtime-live-session.mjs';
import { attachRealtimeVoiceSessionServer } from '../src/openmesh/backend/realtime-voice-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '..'));
const workspaceRoot = normalize(join(repoRoot, '..'));
const distDir = join(repoRoot, 'dist-openmesh');
const resourceDir = join(workspaceRoot, 'Resource');
const port = Number(process.env.OPENMESH_PORT || 3037);
const proxyUrl = String(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
const remoteScriptCache = new Map();

if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const bronzeFolderName = 'B.1.13119 东汉铜车马 2';
const bronzeBase = `/workspace-resource/${encodeURIComponent(bronzeFolderName)}`;

const preset = {
    id: 'bronze-chariot',
    label: '东汉铜车马',
    folderName: bronzeFolderName,
    objUrl: `${bronzeBase}/Low/B.1.13119.obj`,
    mtlUrl: `${bronzeBase}/Low/B.1.13119.mtl`,
    tbsceneUrl: `${bronzeBase}/B.1.13119.tbscene`,
    referenceImageUrl: `${bronzeBase}/${encodeURIComponent('渲染图.png')}`,
    displayMode: 'maximum'
};

const mimeType = (filePath) => {
    switch (extname(filePath).toLowerCase()) {
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'application/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.map': return 'application/json; charset=utf-8';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.glb': return 'model/gltf-binary';
        case '.svg': return 'image/svg+xml';
        case '.wasm': return 'application/wasm';
        case '.obj':
        case '.mtl': return 'text/plain; charset=latin1';
        default: return 'application/octet-stream';
    }
};

const sendJson = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*'
    });
    res.end(payload);
};

const sendBuffer = (res, status, body, contentType) => {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
};

const fetchRemoteScript = async (url) => {
    const cached = remoteScriptCache.get(url);
    if (cached) return cached;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`Remote script fetch failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const payload = {
        buffer,
        contentType: response.headers.get('content-type') || 'application/javascript; charset=utf-8'
    };
    remoteScriptCache.set(url, payload);
    return payload;
};

const sendFile = (res, filePath) => {
    if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
    }
    res.writeHead(200, { 'Content-Type': mimeType(filePath) });
    createReadStream(filePath).pipe(res);
};

const server = createServer((req, res) => {
    const rawPath = decodeURIComponent(String(req.url || '/').split('?')[0] || '/');

    const handleRequest = async () => {
        if (await handleCinematicLiteApi(req, res, rawPath)) return;

        if (rawPath === '/api/health') {
            sendJson(res, 200, { ok: true, port });
            return;
        }

        if (rawPath === '/api/presets/bronze-chariot') {
            sendJson(res, 200, preset);
            return;
        }

        if (rawPath === '/vendor/marmoset.js') {
            const asset = await fetchRemoteScript('https://viewer.marmoset.co/main/marmoset.js');
            sendBuffer(res, 200, asset.buffer, asset.contentType);
            return;
        }

        if (rawPath.startsWith('/workspace-resource/')) {
            const resourcePath = normalize(rawPath.replace('/workspace-resource/', '')).replace(/^\/+/, '');
            const fullPath = join(resourceDir, resourcePath);
            if (!fullPath.startsWith(resourceDir)) {
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
                return;
            }
            sendFile(res, fullPath);
            return;
        }

        const staticPath = rawPath === '/' ? '/index.html' : rawPath;
        const safePath = normalize(staticPath).replace(/^\/+/, '');
        const fullPath = join(distDir, safePath);
        if (!fullPath.startsWith(distDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
        }
        sendFile(res, fullPath);
    };

    handleRequest().catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } }));
    });
});

attachRealtimeVoiceSessionServer(server);
attachRealtimeLiveSessionServer(server);

server.listen(port, () => {
    console.log(`[openmesh] http://localhost:${port}`);
});

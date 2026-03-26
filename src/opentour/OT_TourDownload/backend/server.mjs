import { createServer } from 'node:http';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = normalize(join(__dirname, '../../../../..'));
const defaultOutputDir = join(repoRoot, 'downloads', 'marble');
const browserProfileDir = process.env.OT_TOUR_DOWNLOAD_PROFILE_DIR
    ? resolve(repoRoot, process.env.OT_TOUR_DOWNLOAD_PROFILE_DIR)
    : join(repoRoot, 'data', 'ot-tour-download-marble-profile');
const helperWorldUrl = 'https://marble.worldlabs.ai/world/7658900c-3d36-462c-8c56-f3871f40fc53';
const chromeUserDataDir = resolve(process.env.HOME || '', 'Library/Application Support/Google/Chrome');
const importIgnoreNames = new Set([
    'SingletonCookie',
    'SingletonLock',
    'SingletonSocket',
    'RunningChromeVersion',
    'Crashpad',
    'GrShaderCache',
    'GraphiteDawnCache',
    'ShaderCache',
    'Code Cache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'component_crx_cache'
]);

const DEFAULT_TAGS = ['curated'];
const API_BASE = 'https://api.worldlabs.ai/api/v1';
const MAX_COUNT = 50;
const MAX_PAGES_PER_TAG = 12;

const jobs = new Map();
let browserContextPromise = null;
let importedChromeProfileName = 'Default';
const execFileAsync = promisify(execFile);

const log = (action, detail) => {
    const suffix = detail === undefined ? '' : ` ${JSON.stringify(detail)}`;
    console.log(`[ot-tour-download] ${action}${suffix}`);
};

const json = (res, status, payload) => {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(payload));
};

const parseJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return {};
    return JSON.parse(text);
};

const safeProfileLabel = (name) => String(name || '').replace(/[^a-z0-9 _-]/gi, '').trim();

const isChromeRunning = async () => {
    try {
        const { stdout } = await execFileAsync('/usr/bin/pgrep', ['-x', 'Google Chrome']);
        return Boolean(stdout.trim());
    } catch {
        return false;
    }
};

const listChromeProfiles = async () => {
    let entries = [];
    try {
        entries = await readdir(chromeUserDataDir, { withFileTypes: true });
    } catch {
        return [];
    }
    const candidates = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!(entry.name === 'Default' || /^Profile \d+$/.test(entry.name))) continue;
        const profilePath = join(chromeUserDataDir, entry.name);
        try {
            const profileStat = await stat(profilePath);
            candidates.push({
                name: entry.name,
                path: profilePath,
                updatedAt: profileStat.mtimeMs
            });
        } catch {}
    }
    return candidates.sort((a, b) => b.updatedAt - a.updatedAt);
};

const getPreferredChromeProfile = async () => {
    const profiles = await listChromeProfiles();
    return profiles[0] || null;
};

const copyChromeProfileToHelper = async (sourceDir) => {
    const source = resolve(sourceDir);
    const profileName = basename(source);
    const sourceStat = await stat(source).catch(() => null);
    if (!sourceStat?.isDirectory()) {
        throw new Error(`Chrome profile not found: ${source}`);
    }
    if (browserContextPromise) {
        const context = await browserContextPromise.catch(() => null);
        await context?.close().catch(() => {});
        browserContextPromise = null;
    }
    await rm(browserProfileDir, { recursive: true, force: true });
    await mkdir(browserProfileDir, { recursive: true });

    const rootEntries = ['Local State', 'First Run', 'Last Version', 'Variations', 'NativeMessagingHosts'];
    for (const entry of rootEntries) {
        const src = join(chromeUserDataDir, entry);
        const target = join(browserProfileDir, entry);
        const srcStat = await stat(src).catch(() => null);
        if (!srcStat) continue;
        if (srcStat.isDirectory()) {
            await cp(src, target, { recursive: true, filter: (item) => !importIgnoreNames.has(basename(item)) });
        } else {
            await cp(src, target, { recursive: false });
        }
    }

    await cp(source, join(browserProfileDir, profileName), {
        recursive: true,
        filter: (src) => !importIgnoreNames.has(basename(src))
    });
    importedChromeProfileName = profileName;
    return {
        importedFrom: source,
        importedProfileName: safeProfileLabel(profileName),
        profileDir: browserProfileDir
    };
};

const slugify = (value) => String(value || 'world')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'world';

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));

const sanitizePayload = (body) => {
    const rawTags = Array.isArray(body?.tags) ? body.tags : DEFAULT_TAGS;
    const tags = Array.from(new Set(rawTags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean)));
    const count = clampInt(body?.count, 1, MAX_COUNT);
    return {
        tags: tags.length ? tags : DEFAULT_TAGS,
        count,
        matchMode: body?.matchMode === 'any' ? 'any' : 'all',
        fileFormat: body?.fileFormat === 'ply' ? 'ply' : 'spz',
        quality: ['100k', '500k', 'full_res'].includes(body?.quality) ? body.quality : '500k',
        coordinateSystem: body?.coordinateSystem === 'opencv' ? 'opencv' : 'opengl',
        planeLevel: body?.planeLevel === 'eye' ? 'eye' : 'ground',
        outputDir: String(body?.outputDir || 'downloads/marble').trim() || 'downloads/marble',
        skipExisting: body?.skipExisting !== false
    };
};

const resolveOutputDir = (value) => {
    if (!value) return defaultOutputDir;
    return isAbsolute(value) ? value : resolve(repoRoot, value);
};

const fetchJson = async (url, init) => {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Marble API ${response.status}: ${JSON.stringify(data).slice(0, 180)}`);
    }
    return data;
};

const closeWelcomeModal = async (page) => {
    const closeButton = page.getByRole('button', { name: 'Close' });
    if (await closeButton.count()) {
        await closeButton.first().click().catch(() => {});
    }
};

const launchPersistentBrowser = async () => {
    await mkdir(browserProfileDir, { recursive: true });
    const headless = process.env.OT_TOUR_DOWNLOAD_HEADLESS === '1';
    const commonOptions = {
        headless,
        viewport: { width: 1440, height: 960 },
        acceptDownloads: true,
        args: importedChromeProfileName ? [`--profile-directory=${importedChromeProfileName}`] : []
    };
    try {
        return await chromium.launchPersistentContext(browserProfileDir, {
            ...commonOptions,
            channel: 'chrome'
        });
    } catch (error) {
        log('browser.launch.chrome-failed', { error: String(error) });
        return chromium.launchPersistentContext(browserProfileDir, commonOptions);
    }
};

const getBrowserContext = async () => {
    if (!browserContextPromise) {
        browserContextPromise = launchPersistentBrowser().then((context) => {
            context.on('close', () => {
                browserContextPromise = null;
            });
            return context;
        }).catch((error) => {
            browserContextPromise = null;
            throw error;
        });
    }
    return browserContextPromise;
};

const getHelperPage = async () => {
    const context = await getBrowserContext();
    let page = context.pages()[0] || null;
    if (!page) {
        page = await context.newPage();
    }
    return page;
};

const openAccountEntry = async (page) => {
    await page.waitForFunction(() => document.querySelectorAll('button').length >= 8, { timeout: 15000 });
    const buttons = page.locator('button');
    const count = await buttons.count();
    if (count >= 9) {
        await buttons.nth(8).click();
        await page.waitForTimeout(500);
        return;
    }
    const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const byClass = buttons.filter((button) => typeof button.className === 'string' && button.className.includes('flex w-full items-center gap-3 overflow-hidden p-2 text-left'));
        const candidate = byClass[byClass.length - 1] || null;
        if (candidate instanceof HTMLElement) {
            candidate.click();
            return true;
        }
        return false;
    });
    if (!clicked) {
        const debug = await page.evaluate(() => ({
            buttonCount: document.querySelectorAll('button').length,
            bodyPreview: document.body.innerText.slice(0, 240)
        }));
        throw new Error(`Unable to find Marble account entry: ${JSON.stringify(debug)}`);
    }
    await page.waitForTimeout(500);
};

const detectLoginState = async (page) => {
    await page.goto(helperWorldUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await closeWelcomeModal(page);
    await openAccountEntry(page);
    const signInDialog = page.getByRole('dialog', { name: 'Sign in' });
    if (await signInDialog.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape').catch(() => {});
        return false;
    }
    return true;
};

const startInteractiveLogin = async () => {
    const page = await getHelperPage();
    await page.goto(helperWorldUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await closeWelcomeModal(page);
    const loggedIn = await detectLoginState(page);
    if (!loggedIn) {
        await openAccountEntry(page);
    }
    log('auth.login.opened', { profileDir: browserProfileDir });
    return {
        browserOpen: true,
        loggedIn,
        profileDir: browserProfileDir,
        message: loggedIn
            ? 'Marble helper browser is already logged in. Click Confirm, then Start.'
            : 'Marble helper browser opened with the sign-in entry. Please complete login there, then click Confirm in OpenTour.'
    };
};

const getAuthStatus = async () => {
    const browserOpen = Boolean(browserContextPromise);
    let loggedIn = false;
    if (browserOpen) {
        try {
            loggedIn = await detectLoginState(await getHelperPage());
        } catch (error) {
            log('auth.status.detect-failed', { error: String(error) });
        }
    }
    return {
        browserOpen,
        loggedIn,
        profileDir: browserProfileDir,
        message: browserOpen
            ? (loggedIn
                ? 'Marble helper browser is ready and login is confirmed.'
                : 'Marble helper browser is open, but login is not confirmed yet.')
            : 'Marble helper browser is not open yet.'
    };
};

const confirmInteractiveLogin = async () => {
    const page = await getHelperPage();
    const loggedIn = await detectLoginState(page);
    if (!loggedIn) {
        return {
            browserOpen: true,
            loggedIn: false,
            profileDir: browserProfileDir,
            message: 'Login not detected yet. Please finish Marble sign-in in the helper browser, then click Confirm again.'
        };
    }
    return {
        browserOpen: true,
        loggedIn: true,
        profileDir: browserProfileDir,
        message: 'Login confirmed. You can now click Start to let Playwright download PLY files.'
    };
};

const importChromeSession = async (requestedProfilePath) => {
    const profiles = await listChromeProfiles();
    const selected = requestedProfilePath
        ? profiles.find((profile) => profile.path === resolve(requestedProfilePath))
        : await getPreferredChromeProfile();
    if (!selected) {
        throw new Error(`No Chrome profile found under ${chromeUserDataDir}`);
    }
    const imported = await copyChromeProfileToHelper(selected.path);
    const chromeRunning = await isChromeRunning();
    log('auth.import.chrome-session', imported);
    return {
        ok: true,
        ...imported,
        availableProfiles: profiles.map((profile) => ({ name: profile.name, path: profile.path })),
        message: chromeRunning
            ? `Imported Chrome session from ${selected.name}, but Google Chrome is still running. Close all Google Chrome windows, then click Import again before Confirm.`
            : `Imported Chrome session from ${selected.name}. Now click Confirm.`
    };
};

const fetchWorldsByTag = async (tag, pageToken = '', pageSize = 24) => {
    log('marble.fetchByTag', { tag, pageToken, pageSize });
    return fetchJson(`${API_BASE}/worlds:by-tag`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: 'https://marble.worldlabs.ai',
            Referer: 'https://marble.worldlabs.ai/'
        },
        body: JSON.stringify({
            page_size: pageSize,
            page_token: pageToken,
            tag
        })
    });
};

const isVisibleWorld = (world) => world?.status === 'SUCCEEDED' && world?.permission?.public !== false;

const toSearchItem = (world) => ({
    id: world.id,
    displayName: String(world.display_name || world.id),
    ownerUsername: String(world?.application_data?.owner_username || 'unknown'),
    tags: Array.isArray(world.tags) ? world.tags : [],
    previewUrl: world?.generation_output?.cond_image_url || null,
    worldUrl: `https://marble.worldlabs.ai/world/${world.id}`,
    availableFormats: ['spz', 'ply'],
    availableQualities: Object.keys(world?.generation_output?.spz_urls || {})
});

const searchAllMode = async ({ tags, count }) => {
    const seedTag = tags[0] || 'curated';
    const requiredTags = new Set(tags.filter((tag) => tag !== 'curated'));
    const worlds = [];
    let nextPageToken = '';
    let pages = 0;
    while (worlds.length < count && pages < MAX_PAGES_PER_TAG) {
        pages += 1;
        const response = await fetchWorldsByTag(seedTag, nextPageToken, Math.min(24, count * 2));
        const batch = Array.isArray(response.worlds) ? response.worlds : [];
        batch.forEach((world) => {
            if (worlds.length >= count || !isVisibleWorld(world)) return;
            const worldTags = new Set(Array.isArray(world.tags) ? world.tags : []);
            const matched = Array.from(requiredTags).every((tag) => worldTags.has(tag));
            if (matched) worlds.push(world);
        });
        nextPageToken = String(response.next_page_token || '');
        if (!nextPageToken) break;
    }
    return worlds;
};

const searchAnyMode = async ({ tags, count }) => {
    const states = tags.map((tag) => ({ tag, nextPageToken: '', done: false }));
    const dedup = new Map();
    let guard = 0;
    while (dedup.size < count && states.some((state) => !state.done) && guard < MAX_PAGES_PER_TAG * Math.max(1, states.length)) {
        guard += 1;
        for (let i = 0; i < states.length && dedup.size < count; i += 1) {
            const state = states[i];
            if (state.done) continue;
            const response = await fetchWorldsByTag(state.tag, state.nextPageToken, Math.min(24, count * 2));
            const batch = Array.isArray(response.worlds) ? response.worlds : [];
            batch.forEach((world) => {
                if (!isVisibleWorld(world) || dedup.has(world.id)) return;
                dedup.set(world.id, world);
            });
            state.nextPageToken = String(response.next_page_token || '');
            if (!state.nextPageToken) state.done = true;
        }
    }
    return Array.from(dedup.values()).slice(0, count);
};

const searchWorlds = async (payload) => {
    log('search.start', payload);
    const tags = payload.tags.includes('curated') && payload.tags.length > 1
        ? payload.tags.filter((tag) => tag !== 'curated')
        : payload.tags;
    const normalized = tags.length ? tags : DEFAULT_TAGS;
    const worlds = payload.matchMode === 'any'
        ? await searchAnyMode({ tags: normalized, count: payload.count })
        : await searchAllMode({ tags: normalized, count: payload.count });
    const result = {
        worlds,
        message: `Requested ${payload.count}, matched ${worlds.length}, mode=${payload.matchMode}.`
    };
    log('search.done', { matched: worlds.length, mode: payload.matchMode, tags: normalized });
    return result;
};

const resolveQualityUrl = (world, quality) => {
    const urls = world?.generation_output?.spz_urls || {};
    if (quality === '100k') {
        if (urls['100k']) return { url: urls['100k'], quality: '100k', requestedQuality: quality };
        if (urls['500k']) return { url: urls['500k'], quality: '500k', requestedQuality: quality };
        if (urls.full_res) return { url: urls.full_res, quality: 'full_res', requestedQuality: quality };
        return null;
    }
    if (quality === '500k') {
        if (urls['500k']) return { url: urls['500k'], quality: '500k', requestedQuality: quality };
        if (urls.full_res) return { url: urls.full_res, quality: 'full_res', requestedQuality: quality };
        if (urls['100k']) return { url: urls['100k'], quality: '100k', requestedQuality: quality };
        return null;
    }
    if (urls.full_res) return { url: urls.full_res, quality: 'full_res', requestedQuality: quality };
    if (urls['3m']) return { url: urls['3m'], quality: 'full_res', requestedQuality: quality };
    if (urls['500k']) return { url: urls['500k'], quality: '500k', requestedQuality: quality };
    if (urls['100k']) return { url: urls['100k'], quality: '100k', requestedQuality: quality };
    return null;
};

const resolveDownloadInfo = (world, payload) => {
    if (payload.fileFormat === 'ply') {
        return { url: null, ext: '.ply', resolvedQuality: 'ply', requestedQuality: payload.quality };
    }
    const spzInfo = resolveQualityUrl(world, payload.quality);
    if (!spzInfo) throw new Error('No SPZ download URL available for this world');
    return { url: spzInfo.url, ext: '.spz', resolvedQuality: spzInfo.quality, requestedQuality: spzInfo.requestedQuality };
};

const getPlyMenuLabel = (quality) => (quality === '100k' ? 'Splats (low-res)' : 'Splats');

const writeDownloadSettings = async (page, payload) => {
    await page.evaluate((settings) => {
        localStorage.setItem('wl-download-settings', JSON.stringify({
            state: {
                fileFormat: 'ply',
                coordinateSystem: settings.coordinateSystem,
                planeLevel: settings.planeLevel,
                hqMeshType: 'texture'
            },
            version: 0
        }));
    }, {
        coordinateSystem: payload.coordinateSystem,
        planeLevel: payload.planeLevel
    });
};

const clickDownloadButton = async (page) => {
    const button = page.locator('main button').filter({ has: page.locator('svg path[d="M12 15V3"]') }).first();
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await button.click();
};

const ensurePlyMenuEnabled = async (page, quality) => {
    const label = getPlyMenuLabel(quality);
    const item = page.getByRole('menuitem', { name: label }).first();
    await item.waitFor({ state: 'visible', timeout: 10000 });
    const ariaDisabled = await item.getAttribute('aria-disabled');
    if (ariaDisabled === 'true') {
        throw new Error(`PLY export is currently unavailable in Marble for this world/session. Finish login in the helper browser and make sure the world export menu enables ${label}.`);
    }
    return item;
};

const downloadPlyViaBrowser = async ({ world, payload, filePath }) => {
    const context = await getBrowserContext();
    const page = await context.newPage();
    try {
        const worldUrl = `https://marble.worldlabs.ai/world/${world.id}`;
        await page.goto(worldUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await closeWelcomeModal(page);
        await writeDownloadSettings(page, payload);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await closeWelcomeModal(page);
        await clickDownloadButton(page);
        const item = await ensurePlyMenuEnabled(page, payload.quality);
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
        await item.click();
        const download = await downloadPromise;
        await download.saveAs(filePath);
        return {
            sourceUrl: download.url(),
            resolvedQuality: payload.quality === '100k' ? '100k' : 'full_res'
        };
    } finally {
        await page.close().catch(() => {});
    }
};

const setJobItem = (job, index, patch) => {
    job.items[index] = {
        ...job.items[index],
        ...patch
    };
    job.completed = job.items.filter((item) => ['downloaded', 'skipped', 'failed'].includes(item.status)).length;
    job.downloaded = job.items.filter((item) => item.status === 'downloaded').length;
    job.skipped = job.items.filter((item) => item.status === 'skipped').length;
    job.failed = job.items.filter((item) => item.status === 'failed').length;
};

const downloadFile = async (url, filePath) => {
    log('download.start', { url, filePath });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, buffer);
    log('download.done', { filePath, bytes: buffer.length });
};

const fileExists = async (filePath) => Boolean(await stat(filePath).catch(() => null));

const buildDownloadKey = ({ worldId, payload }) => [
    worldId,
    payload.fileFormat,
    payload.quality,
    payload.coordinateSystem,
    payload.planeLevel
].join('|');

const loadExistingManifest = async (outputDir) => {
    const manifestPath = join(outputDir, 'manifest.json');
    const raw = await readFile(manifestPath, 'utf8').catch(() => '');
    if (!raw) {
        return { manifestPath, existingItems: [], existingKeys: new Set() };
    }
    try {
        const parsed = JSON.parse(raw);
        const existingItems = Array.isArray(parsed?.items) ? parsed.items : [];
        const existingKeys = new Set();
        for (const item of existingItems) {
            const key = item?.downloadKey;
            const filePath = item?.filePath;
            if (typeof key !== 'string' || typeof filePath !== 'string') continue;
            if (await fileExists(filePath)) {
                existingKeys.add(key);
            }
        }
        return { manifestPath, existingItems, existingKeys };
    } catch (error) {
        log('manifest.parse.error', { manifestPath, error: String(error) });
        return { manifestPath, existingItems: [], existingKeys: new Set() };
    }
};

const runJob = async (job) => {
    job.status = 'running';
    job.message = 'Searching Marble worlds...';
    log('job.start', { jobId: job.jobId, payload: job.payload });
    try {
        const search = await searchWorlds(job.payload);
        const outputDir = resolveOutputDir(job.payload.outputDir);
        job.outputDir = outputDir;
        await mkdir(outputDir, { recursive: true });
        const { manifestPath, existingItems, existingKeys } = await loadExistingManifest(outputDir);

        job.items = search.worlds.map((world) => ({
            worldId: world.id,
            displayName: String(world.display_name || world.id),
            status: 'pending',
            message: `https://marble.worldlabs.ai/world/${world.id}`
        }));
        job.total = job.items.length;
        job.message = `Matched ${job.total} world(s). Downloading...`;

        const manifest = {
            generatedAt: new Date().toISOString(),
            outputDir,
            request: job.payload,
            note: job.payload.fileFormat === 'ply'
                ? 'PLY exports are downloaded through a Marble browser session. Complete login in the helper browser if required.'
                : 'Coordinate system and plane level are recorded for traceability. Marble public API direct downloads do not expose transformed export binaries.',
            items: [...existingItems]
        };

        if (job.payload.fileFormat === 'ply') {
            job.message = 'Waiting for Marble browser session and exporting PLY...';
            await getBrowserContext();
        }

        for (let i = 0; i < search.worlds.length; i += 1) {
            if (job.cancelled) {
                job.status = 'cancelled';
                job.message = 'Job cancelled.';
                break;
            }

            const world = search.worlds[i];
            const downloadKey = buildDownloadKey({ worldId: world.id, payload: job.payload });
            if (job.payload.skipExisting && existingKeys.has(downloadKey)) {
                setJobItem(job, i, { status: 'skipped', message: 'Already downloaded in this output folder' });
                log('job.item.skip-existing', { jobId: job.jobId, index: i, worldId: world.id, downloadKey });
                job.message = `Processed ${job.completed}/${job.total}.`;
                continue;
            }

            setJobItem(job, i, { status: 'downloading', message: 'Downloading...' });
            log('job.item.start', { jobId: job.jobId, index: i, worldId: world.id, displayName: world.display_name });
            try {
                const info = resolveDownloadInfo(world, job.payload);
                const baseName = `${String(i + 1).padStart(2, '0')}-${slugify(world.display_name || world.id)}-${info.resolvedQuality}`;
                const filePath = join(outputDir, `${baseName}${info.ext}`);
                let sourceUrl = info.url;
                let resolvedQuality = info.resolvedQuality;
                if (job.payload.fileFormat === 'ply') {
                    const browserResult = await downloadPlyViaBrowser({ world, payload: job.payload, filePath });
                    sourceUrl = browserResult.sourceUrl;
                    resolvedQuality = browserResult.resolvedQuality;
                } else {
                    await downloadFile(info.url, filePath);
                }
                const metaPath = join(outputDir, `${baseName}.json`);
                const metadata = {
                    worldId: world.id,
                    displayName: world.display_name,
                    ownerUsername: world?.application_data?.owner_username || null,
                    tags: world.tags || [],
                    worldUrl: `https://marble.worldlabs.ai/world/${world.id}`,
                    requestedSettings: job.payload,
                    downloadKey,
                    resolvedQuality,
                    requestedQuality: info.requestedQuality,
                    sourceUrl,
                    note: job.payload.fileFormat === 'ply'
                        ? 'This file was exported through Marble browser automation using the helper session.'
                        : 'Coordinate system and plane level were not transformed by the downloader; they are preserved as requested settings.'
                };
                await writeFile(metaPath, JSON.stringify(metadata, null, 2));
                manifest.items.push({ ...metadata, filePath, metaPath });
                existingKeys.add(downloadKey);
                const qualityNote = resolvedQuality !== info.requestedQuality ? `Downloaded with fallback quality ${resolvedQuality}` : 'Downloaded';
                setJobItem(job, i, { status: 'downloaded', message: qualityNote, filePath });
                log('job.item.done', { jobId: job.jobId, index: i, worldId: world.id, filePath, requestedQuality: info.requestedQuality, resolvedQuality });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                setJobItem(job, i, { status: message.includes('not exposed') ? 'skipped' : 'failed', message });
                job.warnings.push(`${world.id}: ${message}`);
                log('job.item.error', { jobId: job.jobId, index: i, worldId: world.id, error: message });
            }
            job.message = `Processed ${job.completed}/${job.total}.`;
        }

        await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        if (job.status !== 'cancelled') {
            job.status = job.failed > 0 && job.downloaded === 0 ? 'failed' : 'completed';
            job.message = `Done. downloaded=${job.downloaded}, skipped=${job.skipped}, failed=${job.failed}`;
        }
        log('job.done', { jobId: job.jobId, status: job.status, downloaded: job.downloaded, skipped: job.skipped, failed: job.failed });
    } catch (error) {
        job.status = 'failed';
        job.message = error instanceof Error ? error.message : String(error);
        job.warnings.push(job.message);
        log('job.fatal', { jobId: job.jobId, error: job.message });
    }
};

const toClientJob = (job) => ({
    jobId: job.jobId,
    status: job.status,
    outputDir: job.outputDir,
    total: job.total,
    completed: job.completed,
    downloaded: job.downloaded,
    skipped: job.skipped,
    failed: job.failed,
    message: job.message,
    warnings: job.warnings.slice(-6),
    items: job.items
});

const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    try {
        if (path === '/api/ot-tour-download/health' && req.method === 'GET') {
            json(res, 200, { ok: true, service: 'ot-tour-download', outputDir: defaultOutputDir });
            return;
        }

        if (path === '/api/ot-tour-download/auth/status' && req.method === 'GET') {
            json(res, 200, await getAuthStatus());
            return;
        }

        if (path === '/api/ot-tour-download/auth/login' && req.method === 'POST') {
            json(res, 200, await startInteractiveLogin());
            return;
        }

        if (path === '/api/ot-tour-download/auth/confirm' && req.method === 'POST') {
            json(res, 200, await confirmInteractiveLogin());
            return;
        }

        if (path === '/api/ot-tour-download/auth/import-chrome-session' && req.method === 'POST') {
            const body = await parseJson(req);
            json(res, 200, await importChromeSession(body?.profilePath));
            return;
        }

        if (path === '/api/ot-tour-download/search' && req.method === 'POST') {
            const payload = sanitizePayload(await parseJson(req));
            log('http.search', payload);
            const result = await searchWorlds(payload);
            json(res, 200, {
                worlds: result.worlds.map(toSearchItem),
                message: result.message
            });
            return;
        }

        if (path === '/api/ot-tour-download/jobs' && req.method === 'POST') {
            const payload = sanitizePayload(await parseJson(req));
            const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const job = {
                jobId,
                payload,
                status: 'queued',
                cancelled: false,
                outputDir: resolveOutputDir(payload.outputDir),
                total: 0,
                completed: 0,
                downloaded: 0,
                skipped: 0,
                failed: 0,
                message: 'Queued.',
                warnings: [],
                items: []
            };
            jobs.set(jobId, job);
            log('http.job.create', { jobId, payload });
            void runJob(job);
            json(res, 200, toClientJob(job));
            return;
        }

        const jobMatch = path.match(/^\/api\/ot-tour-download\/jobs\/([^/]+)$/);
        if (jobMatch && req.method === 'GET') {
            const job = jobs.get(jobMatch[1]);
            if (!job) {
                json(res, 404, { error: 'Job not found' });
                return;
            }
            log('http.job.get', { jobId: jobMatch[1], status: job.status, completed: job.completed, total: job.total });
            json(res, 200, toClientJob(job));
            return;
        }

        const cancelMatch = path.match(/^\/api\/ot-tour-download\/jobs\/([^/]+)\/cancel$/);
        if (cancelMatch && req.method === 'POST') {
            const job = jobs.get(cancelMatch[1]);
            if (!job) {
                json(res, 404, { error: 'Job not found' });
                return;
            }
            job.cancelled = true;
            job.message = 'Cancellation requested...';
            log('http.job.cancel', { jobId: cancelMatch[1] });
            json(res, 200, toClientJob(job));
            return;
        }

        json(res, 404, { error: 'Not found' });
    } catch (error) {
        json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
});

const port = Number(process.env.PORT || 3034);
server.listen(port, () => {
    console.log(`[ot-tour-download] listening on http://localhost:${port}`);
    console.log(`[ot-tour-download] default output dir ${defaultOutputDir}`);
});

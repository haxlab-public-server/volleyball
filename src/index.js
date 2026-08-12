const path = require('node:path');
const puppeteer = require('puppeteer');
const esbuild = require('esbuild');

const { createDb } = require('../db/sqlite');
const { roomPassword, token, replayWebhookUrl, vipWebhookUrl, logWebhookUrl, reportWebhookUrl } = require('./core/config');

const projectRoot = path.resolve(__dirname, '..');
const db = createDb(path.join(projectRoot, 'db', 'volleyball.sqlite'));

async function handleDbCall(method, args) {
    const fn = db[method];
    if (typeof fn !== 'function') {
        throw new Error(`Unsupported db call: ${method}`);
    }
    return fn.apply(db, args);
}

async function buildEntryBundle() {
    const result = await esbuild.build({
        entryPoints: [path.join(__dirname, 'browser', 'entry.js')],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        target: 'chrome120',
    });
    return result.outputFiles[0].text;
}

async function launchRoom() {
    const browser = await puppeteer.launch({
        args: [
            '--remote-debugging-port=9222',
            '--disable-features=WebRtcHideLocalIpsWithMdns,AsyncDns',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    });

    browser.on('disconnected', () => {
        console.error('[FATAL] Browser disconnected/crashed.');
        setTimeout(() => process.exit(1), 2000);
    });

    const newPage = await browser.newPage();

    await newPage.exposeFunction('__dbCall', handleDbCall);

    newPage.on('console', (msg) => {
        console.log(`[PAGE ${msg.type()}]`, msg.text());
    });
    newPage.on('pageerror', (err) => {
        console.error('[PAGE ERROR]', err);
    });

    await newPage.goto('https://www.haxball.com/headless', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await newPage.waitForFunction(() => typeof window.HBInit === 'function', { timeout: 60000 });
    await newPage.evaluate((secrets) => {
        window.__secrets = secrets;
    }, { token, roomPassword, replayWebhookUrl, vipWebhookUrl, logWebhookUrl, reportWebhookUrl });

    await newPage.evaluate(() => {
        const methods = [
            'getBans', 'addBan', 'removeBanByIndex', 'removeBanByAuth', 'findBan', 'updateBan',
            'getExpiredBans', 'removeExpiredBans',
            'hasAuth', 'addAuth', 'removeAuth', 'clearAuths',
            'getAccount', 'hasAccount', 'getAccountsByRole', 'ensureAccount',
            'setRole', 'setChatColor', 'expireRoles', 'addMaster',
            'getStat', 'setStatName', 'findStatsByName', 'getTopStats', 'ensureStat', 'incrementStat', 'clearStats',
            'getNicknames', 'hasNicknames', 'addNickname',
            'getMutes', 'addMute', 'removeMuteById', 'removeMuteByAuth',
            'getMuteById', 'getMuteByPlayerId', 'getMuteByAuth'
        ];

        window.__db = {};
        for (const method of methods) {
            window.__db[method] = (...args) => window.__dbCall(method, args);
        }
    });

    const bundle = await buildEntryBundle();
    await newPage.addScriptTag({ content: bundle });

    return { browser, page: newPage };
}

launchRoom().catch((err) => {
    console.error('[FATAL] Failed to launch room:', err);
    process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    setTimeout(() => process.exit(1), 2000);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
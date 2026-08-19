const path = require('node:path');
const puppeteer = require('puppeteer');
const esbuild = require('esbuild');

const { createDb } = require('../db/sqlite');
const { createDiscordBot } = require('./core/discordBot');
const {
    publicToken,
    privateToken,
    publicPassword,
    privatePassword,
    discordBotToken,
    discordGuildId,
    discordRoleIds,
    discordChannelIds,
    discordOnlineMessages
} = require('./core/config');

const { publicConfig, privateConfig } = require('./core/roomConstants');

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

async function launchRoom(type, config, secrets, discordBot) {
    const browser = await puppeteer.launch({
        args: [
            '--remote-debugging-port=0',
            '--disable-features=WebRtcHideLocalIpsWithMdns,AsyncDns',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    });

    browser.on('disconnected', () => {
        console.error(`[FATAL] Browser (${type}) disconnected/crashed.`);
        setTimeout(() => process.exit(1), 2000);
    });

    const page = await browser.newPage();

    await page.exposeFunction('__dbCall', handleDbCall);

    const onlineTarget = discordOnlineMessages[type];

    async function handleDiscordCall(method, args) {
        switch (method) {
            case 'consumeLinkCode':
                return discordBot.consumeLinkCode(...args);
            case 'unlinkByAuth':
                return discordBot.unlinkByAuth(...args);
            case 'syncRoleForAuth':
                return discordBot.syncRoleForAuth(...args);
            case 'sendLog':
                return discordBot.sendLog(...args);
            case 'sendReport':
                return discordBot.sendReport(...args);
            case 'sendRecording':
                return discordBot.sendRecording(...args);
            case 'sendVipPassword':
                return discordBot.sendVipPassword(...args);
            case 'sendStatsBackup':
                return discordBot.sendStatsBackup(...args);
            case 'updateOnlineMessage':
                return discordBot.editOnlineMessage(onlineTarget?.channelId, onlineTarget?.messageId, args[0]);
            default:
                throw new Error(`Unsupported discord call: ${method}`);
        }
    }

    await page.exposeFunction('__discordCall', handleDiscordCall);

    page.on('console', (msg) => {
        console.log(`[${type.toUpperCase()} ${msg.type()}]`, msg.text());
    });
    page.on('pageerror', (err) => {
        console.error(`[${type.toUpperCase()} ERROR]`, err);
    });

    await page.goto('https://www.haxball.com/headless', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    await page.waitForFunction(() => typeof window.HBInit === 'function', {
        timeout: 60000
    });

    await page.evaluate((payload) => {
        window.__secrets = payload.secrets;
        window.__roomConfig = payload.config;
        window.__roomType = payload.type;
    }, {
        secrets,
        config,
        type
    });

    await page.evaluate(() => {
        const dbMethods = [
            'getBans', 'addBan', 'removeBanByIndex', 'removeBanByAuth', 'findBan', 'updateBan',
            'getExpiredBans', 'removeExpiredBans',
            'hasAuth', 'addAuth', 'removeAuth', 'clearAuths',
            'getAccount', 'hasAccount', 'getAccountsByRole', 'ensureAccount',
            'setRole', 'setChatColor', 'expireRoles', 'addMaster',
            'getStat', 'getAllStats', 'setStatName', 'findStatsByName', 'getTopStats', 'ensureStat', 'incrementStat', 'clearStats', 'backupStats',
            'getNicknames', 'hasNicknames', 'addNickname',
            'getMutes', 'addMute', 'removeMuteById', 'removeMuteByAuth',
            'getMuteById', 'getMuteByPlayerId', 'getMuteByAuth',
            'setDiscordId', 'getAccountByDiscordId'
        ];

        window.__db = {};
        for (const method of dbMethods) {
            window.__db[method] = (...args) => window.__dbCall(method, args);
        }

        const discordMethods = [
            'consumeLinkCode', 'unlinkByAuth', 'syncRoleForAuth',
            'sendLog', 'sendReport', 'sendRecording', 'sendVipPassword',
            'sendStatsBackup', 'updateOnlineMessage'
        ];

        window.__discord = {};
        for (const method of discordMethods) {
            window.__discord[method] = (...args) => window.__discordCall(method, args);
        }
    });

    const bundle = await buildEntryBundle();
    await page.addScriptTag({ content: bundle });

    return { browser, page, type };
}

async function main() {
    const discordBot = createDiscordBot({
        token: discordBotToken,
        guildId: discordGuildId,
        roleIds: discordRoleIds,
        channelIds: discordChannelIds,
        db
    });

    if (discordBotToken) {
        await discordBot.login();
    } else {
        console.warn('[Discord] DISCORD_BOT_TOKEN не задан, Discord-интеграция отключена.');
    }

    const [publicRoom, privateRoom] = await Promise.all([
        launchRoom('public', publicConfig, {
            token: publicToken,
            roomPassword: publicPassword
        }, discordBot),
        launchRoom('private', privateConfig, {
            token: privateToken,
            roomPassword: privatePassword
        }, discordBot)
    ]);

    console.log('[OK] Public and Private rooms launched');
}

main().catch((err) => {
    console.error('[FATAL] Failed to launch rooms:', err);
    process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    setTimeout(() => process.exit(1), 2000);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
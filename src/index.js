const path = require('node:path');
const puppeteer = require('puppeteer');
const esbuild = require('esbuild');

const { createDb } = require('../db/sqlite');
const { createDiscordBot } = require('./core/discordBot');
const { createLocale } = require('./core/locale');
const { createTimeFormat } = require('./core/utils/timeFormat');
const {
    publicToken,
    privateToken,
    publicPassword,
    privatePassword,
    discordBotToken,
    discordGuildId,
    discordRoleIds,
    discordChannelIds,
    discordOnlineMessages,
    locale: localeCode,
    timeZone
} = require('./core/config');

const { publicConfig, privateConfig } = require('./core/roomConstants');

const projectRoot = path.resolve(__dirname, '..');
const db = createDb(path.join(projectRoot, 'db', 'volleyball.sqlite'));
const activeBrowsers = new Set();
let isShuttingDown = false;
let isDbClosed = false;
let discordBotForShutdown = null;

const timeFormat = createTimeFormat(timeZone);
const ROOM_CATEGORIES = ['public', 'private'];

function startAnalyticsDailyReporting({ db, discordBot, timeFormat }) {
    const { getDayKey, getHour } = timeFormat;
    let isRunning = false;

    const runOnce = async () => {
        if (isRunning) return;
        isRunning = true;

        try {
            const now = Date.now();
            const localHour = getHour(now);

            if (localHour < 1) return;

            const yesterdayDay = getDayKey(now - 24 * 60 * 60 * 1000);

            for (const roomCategory of ROOM_CATEGORIES) {
                if (db.analyticsIsDailyReportSent(yesterdayDay, roomCategory)) {
                    continue;
                }

                db.analyticsAggregateDaily(yesterdayDay, roomCategory);
                const report = db.analyticsGetDaily(yesterdayDay, roomCategory);
                if (!report) continue;

                const sent = await discordBot.sendAnalyticsDailyReport(yesterdayDay, roomCategory, report);
                if (sent) {
                    db.analyticsMarkDailyReportSent(yesterdayDay, roomCategory, Date.now());
                }
            }
        } catch (err) {
            console.error('[Analytics] Failed to send daily report:', err);
        } finally {
            isRunning = false;
        }
    };

    setTimeout(runOnce, 15 * 1000);
    setInterval(runOnce, 10 * 60 * 1000);
}

/*
 * Node-side locale instance. Used directly by discordBot.js /
 * discordCommands.js (Node-only, never bundled into the browser). The
 * browser context builds its own instance from the same locale code —
 * see the `locale` field added to the page.evaluate payload below and
 * src/browser/entry.js — rather than sharing this object across the
 * Puppeteer boundary, since only serializable data crosses page.evaluate.
 */
const { t } = createLocale(localeCode);

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
    activeBrowsers.add(browser);

    browser.on('disconnected', () => {
        activeBrowsers.delete(browser);
        if (isShuttingDown) return;
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
            case 'getDiscordUsername':
                return discordBot.getDiscordUsername(...args);
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
        window.__locale = payload.locale;
    }, {
        secrets,
        config: { ...config, timeZone },
        type,
        locale: localeCode
    });

    await page.evaluate(() => {
        const dbMethods = [
            'getBans', 'addBan', 'removeBanByIndex', 'removeBanByAuth', 'findBan', 'updateBan',
            'getExpiredBans', 'removeExpiredBans',
            'hasAuth', 'addAuth', 'removeAuth', 'clearAuths',
            'getAccount', 'hasAccount', 'getAccountsByRole', 'ensureAccount',
            'setRole', 'setChatColor', 'expireRoles', 'addMaster',
            'getStat', 'getAllStats', 'setStatName', 'findStatsByName', 'getTopStats', 'ensureStat', 'incrementStat', 'clearStats', 'backupStats', 'backupAndClearStats',
            'getNicknames', 'hasNicknames', 'addNickname',
            'getMutes', 'addMute', 'removeMuteById', 'removeMuteByAuth',
            'getMuteById', 'getMuteByPlayerId', 'getMuteByAuth',
            'setDiscordId', 'getAccountByDiscordId',
            'analyticsTouchPlayer', 'analyticsStartSession', 'analyticsEndSession',
            'analyticsCloseDanglingSessions',
            'analyticsStartMatch', 'analyticsEndMatch', 'analyticsAddEvent',
            'analyticsUpsertOnlineMinute', 'analyticsAggregateDaily'
        ];

        window.__db = {};
        for (const method of dbMethods) {
            window.__db[method] = (...args) => window.__dbCall(method, args);
        }

        const discordMethods = [
            'consumeLinkCode', 'unlinkByAuth', 'syncRoleForAuth', 'getDiscordUsername',
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
        db,
        timeFormat,
        t
    });
    discordBotForShutdown = discordBot;

    if (discordBotToken) {
        await discordBot.login();
        startAnalyticsDailyReporting({ db, discordBot, timeFormat });
    } else {
        console.warn(t('common.discordTokenMissing'));
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

    /*
     * Reverse Node->browser bridges used by Discord slash-command mirrors
     * to apply an instant in-room effect after the DB/state write,
     * without waiting for the player to rejoin or for someone to run the
     * equivalent !command in the room itself. Both pages expose
     * window.__applyModeration from src/browser/entry.js — no
     * page.exposeFunction registration is needed for this direction,
     * since page.evaluate can always reach into the page's global scope
     * from the Node side.
     *
     * - applyModeration (broadcast): used by ban/mute/unban/unmute, since
     *   the target player could be in either room. page.evaluate() is a
     *   no-op (returns false) in whichever room the target isn't
     *   currently in; the overall result is true if either room reports
     *   a live effect.
     * - applyToRoom (targeted): used by /password, which always names a
     *   specific room (public/private) rather than broadcasting.
     */
    const roomPages = {
        public: publicRoom.page,
        private: privateRoom.page
    };

    discordBot.setModerationBridge(async (action) => {
        const results = await Promise.allSettled(
            Object.values(roomPages).map(page =>
                page.evaluate((a) => window.__applyModeration(a), action)
            )
        );

        return results.some(r => r.status === 'fulfilled' && r.value === true);
    });

    discordBot.setRoomActionBridge(async (roomType, action) => {
        const page = roomPages[roomType];
        if (!page) return false;

        try {
            return await page.evaluate((a) => window.__applyModeration(a), action);
        } catch (err) {
            console.error(`[Discord] applyToRoom(${roomType}) failed:`, err);
            return false;
        }
    });

    console.log('[OK] Public and Private rooms launched');
}

main().catch((err) => {
    console.error('[FATAL] Failed to launch rooms:', err);
    process.exitCode = 1;
});

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[INFO] Shutting down (${signal})...`);

    await Promise.allSettled(
        [...activeBrowsers].map(browser => browser.close())
    );
    discordBotForShutdown?.destroy();

    if (!isDbClosed) {
        db.close();
        isDbClosed = true;
    }
}

process.on('SIGINT', () => shutdown('SIGINT').finally(() => process.exit(0)));
process.on('SIGTERM', () => shutdown('SIGTERM').finally(() => process.exit(0)));

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    setTimeout(() => process.exit(1), 2000);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
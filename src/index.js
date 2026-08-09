const path = require('node:path');
const puppeteer = require('puppeteer');
const esbuild = require('esbuild');

const { createDb } = require('../db/sqlite');
const { roomPassword, token, replayWebhookUrl, vipWebhookUrl, logWebhookUrl, reportWebhookUrl } = require('./core/config');

const projectRoot = path.resolve(__dirname, '..');
const db = createDb(path.join(projectRoot, 'db', 'volleyball.sqlite'));

/*
NOTE:
The data is persisted in a sqlite database (db/volleyball.sqlite).

accounts.json — object based on the player's auth ID:
{
  "<auth>": {
    "nickname": "<player_name>",
    "role": "player|vip|admin|preadmin|master",
    "date": null | timestamp,                    ** the date before which the player's role is valid
    "discord": null | string,                    ** for linking the player's Discord account in the future
    "chat_color": null | "HEX-color"
  }
}

bans.json — array of bans:
[
  {
    "id": null | number,
    "auth": "<auth>",
    "conn": null | number,
    "name": null | string,
    "date": timestamp
  }
]

mutes.json — array of mutes:
[
  {
    "id": number,
    "name": string,
    "playerId": number,
    "auth": "<auth>",
    "unmuteDate": null | timestamp
  }
]

nicknames.json — object with alternative names by auth:
{
  "<auth>": ["Name 1", "Name 2", "Name 3"]
}

auths.json — an array of authorized IDs that can be entered into the room if the value of state.joinAuths is true:
["<auth>", "<auth>"]

stats.json — object with statistics by auth:
{
  "<auth>": [
    "Player Name",   - string
    games,           - number
    wins,            - number
    goals,           - number
    blocks,          - number
    assists,         - number
    blockedAttacks,  - number
    errors,          - number
    aces,            - number
    serves,          - number
    playTime         - number
  ]
}
*/

function normalizeFsPath(filePath) {
    if (!filePath) return '';
    return String(filePath).replace(/\\/g, '/').split('/').pop();
}

async function handleFsCall(method, args) {
    const bridge = {
        readFileSync(filePath) {
            const filename = normalizeFsPath(filePath);
            return db.readFile(filename) ?? '{}';
        },
        writeFileSync(filePath, data) {
            const filename = normalizeFsPath(filePath);
            db.writeFile(filename, data);
        },
        existsSync(filePath) {
            return db.exists(normalizeFsPath(filePath));
        },
    };

    const fn = bridge[method];
    if (typeof fn !== 'function') {
        throw new Error(`Unsupported fs bridge call: ${method}`);
    }

    return fn(...args);
}

/* BUNDLE */
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

/* BROWSER LAUNCH */
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

    const jsonSnapshot = db.snapshot();
    await newPage.exposeFunction('__fsCall', handleFsCall);

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

    await newPage.evaluate((snapshot) => {
        const normalizeFsPath = (filePath) => {
            if (!filePath) return '';
            return String(filePath).replace(/\\/g, '/').split('/').pop();
        };

        window.__fsState = snapshot || {};
        window.__fs = {
            readFileSync(filePath) {
                const filename = normalizeFsPath(filePath);
                return window.__fsState[filename] ?? '{}';
            },
            writeFileSync(filePath, data, encoding) {
                const filename = normalizeFsPath(filePath);
                window.__fsState[filename] = data;
                window.__fsCall('writeFileSync', [filePath, data, encoding]);
            },
            existsSync(filePath) {
                return normalizeFsPath(filePath) in window.__fsState;
            },
        };
    }, jsonSnapshot);

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
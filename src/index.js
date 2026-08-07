const path = require('node:path');
const fs = require('node:fs'); // TODO: migrate from fs to sqlite in the future
const puppeteer = require('puppeteer');
const esbuild = require('esbuild');

const { roomPassword, token, replayWebhookUrl, vipWebhookUrl, logWebhookUrl, reportWebhookUrl } = require('./core/config');

// TODO: migrate from fs to sqlite in the future
const projectRoot = path.resolve(__dirname, '..');
const jsonsDir = path.join(projectRoot, 'jsons');
const defaultJsonObjectFiles = new Set(['accounts.json', 'stats.json', 'nicknames.json']);
const defaultJsonArrayFiles = new Set(['mutes.json', 'bans.json', 'auths.json']);

/*
NOTE:
In the project, the data is saved in JSON files next to the repository.
These files are read/written through the fs wrapper and then get into the browser snapshot.

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

// TODO: migrate from fs to sqlite in the future
function collectJsonFilesFromDisk(rootDir) {
    const snapshot = {};
    const sourceRoot = fs.existsSync(path.join(rootDir, 'jsons')) ? path.join(rootDir, 'jsons') : rootDir;
    const queue = [sourceRoot];

    while (queue.length > 0) {
        const currentDir = queue.pop();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git') continue;
                queue.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                const relPath = path.relative(sourceRoot, fullPath).split(path.sep).join('/');
                snapshot[relPath || entry.name] = fs.readFileSync(fullPath, 'utf8');
            }
        }
    }

    return snapshot;
}

// TODO: migrate from fs to sqlite in the future
function resolveJsonFilePath(filePath) {
    const normalizedPath = normalizeFsPath(filePath);
    const relativePath = normalizedPath.replace(/^\/+/, '');
    return path.join(jsonsDir, relativePath);
}

// TODO: migrate from fs to sqlite in the future
function normalizeFsPath(filePath) {
    if (!filePath) return '';
    return String(filePath).replace(/\\/g, '/');
}

// TODO: migrate from fs to sqlite in the future
function getDefaultJsonContent(filePath) {
    const normalizedPath = normalizeFsPath(filePath);
    const fileName = normalizedPath.split('/').pop() || '';
    const lowerFileName = fileName.toLowerCase();

    if ([...defaultJsonObjectFiles].some((name) => name.toLowerCase() === lowerFileName)) return '{}';
    if ([...defaultJsonArrayFiles].some((name) => name.toLowerCase() === lowerFileName)) return '[]';

    const arrayLikeTerms = ['mute', 'bans', 'ban', 'auth', 'list', 'items', 'entries', 'queue', 'history'];
    if (arrayLikeTerms.some((term) => lowerFileName.includes(term))) return '[]';

    return '{}';
}

// TODO: migrate from fs to sqlite in the future
function ensureDefaultJsonFile(filePath) {
    const resolvedPath = resolveJsonFilePath(filePath);
    if (fs.existsSync(resolvedPath)) return false;

    const defaultContent = getDefaultJsonContent(filePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, defaultContent, 'utf8');
    return true;
}

// TODO: migrate from fs to sqlite in the future
function initializeDefaultJsonFiles() {
    const filesToEnsure = [
        'accounts.json',
        'bans.json',
        'mutes.json',
        'nicknames.json',
        'auths.json',
        'stats.json',
    ];

    fs.mkdirSync(jsonsDir, { recursive: true });
    for (const fileName of filesToEnsure) {
        ensureDefaultJsonFile(fileName);
    }
}

// TODO: migrate from fs to sqlite in the future
async function handleFsCall(method, args) {
    const bridge = {
        readFileSync(filePath, encoding) {
            const resolvedPath = resolveJsonFilePath(filePath);
            if (fs.existsSync(resolvedPath)) {
                return fs.readFileSync(resolvedPath, encoding);
            }
            if (String(filePath).endsWith('.json')) {
                ensureDefaultJsonFile(filePath);
                return fs.readFileSync(resolveJsonFilePath(filePath), encoding);
            }
            return '';
        },
        writeFileSync(filePath, data, encoding) {
            const resolvedPath = resolveJsonFilePath(filePath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            return fs.writeFileSync(resolvedPath, data, encoding);
        },
        existsSync(filePath) {
            const resolvedPath = resolveJsonFilePath(filePath);
            if (fs.existsSync(resolvedPath)) return true;
            if (String(filePath).endsWith('.json')) {
                ensureDefaultJsonFile(filePath);
                return fs.existsSync(resolvedPath);
            }
            return false;
        },
        mkdirSync(filePath, options) {
            const resolvedPath = resolveJsonFilePath(filePath);
            return fs.mkdirSync(resolvedPath, options);
        },
        statSync(filePath) {
            const resolvedPath = resolveJsonFilePath(filePath);
            return fs.statSync(resolvedPath);
        },
        readdirSync(filePath, options) {
            const resolvedPath = resolveJsonFilePath(filePath);
            return fs.readdirSync(resolvedPath, options);
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

    // TODO: migrate from fs to sqlite in the future
    initializeDefaultJsonFiles();
    const jsonSnapshot = collectJsonFilesFromDisk(projectRoot); 
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

    // TODO: migrate from fs to sqlite in the future
    await newPage.evaluate(({ snapshot, objectDefaults, arrayDefaults }) => {
        const normalizeFsPath = (filePath) => {
            if (!filePath) return '';
            return String(filePath).replace(/\\/g, '/');
        };

        const getDefaultJsonContent = (filePath) => {
            const normalizedPath = normalizeFsPath(filePath);
            const fileName = normalizedPath.split('/').pop() || '';

            if (objectDefaults.includes(fileName)) return '{}';
            if (arrayDefaults.includes(fileName)) return '[]';

            return '{}';
        };

        const createDefaultJsonFile = (filePath) => {
            const normalizedPath = normalizeFsPath(filePath);
            const defaultContent = getDefaultJsonContent(filePath);
            if (window.__fsState) {
                window.__fsState[normalizedPath] = defaultContent;
            }
            if (typeof window.__fsCall === 'function') {
                window.__fsCall('writeFileSync', [filePath, defaultContent, 'utf8']);
            }
            return defaultContent;
        };

        window.__fsState = snapshot || {};
        window.__fs = {
            readFileSync(filePath, encoding) {
                const normalizedPath = normalizeFsPath(filePath);
                if (window.__fsState && Object.prototype.hasOwnProperty.call(window.__fsState, normalizedPath)) {
                    return window.__fsState[normalizedPath];
                }
                if (String(filePath).endsWith('.json')) {
                    return createDefaultJsonFile(filePath);
                }
                return '';
            },
            writeFileSync(filePath, data, encoding) {
                const normalizedPath = normalizeFsPath(filePath);
                if (window.__fsState) {
                    window.__fsState[normalizedPath] = data;
                }
                if (typeof window.__fsCall === 'function') {
                    window.__fsCall('writeFileSync', [filePath, data, encoding]);
                }
            },
            existsSync(filePath) {
                const normalizedPath = normalizeFsPath(filePath);
                if (window.__fsState && Object.prototype.hasOwnProperty.call(window.__fsState, normalizedPath)) {
                    return true;
                }
                if (String(filePath).endsWith('.json')) {
                    createDefaultJsonFile(filePath);
                    return true;
                }
                return false;
            },
            mkdirSync(filePath) {
                if (typeof window.__fsCall === 'function') {
                    window.__fsCall('mkdirSync', [filePath]);
                }
            },
            statSync(filePath) {
                if (typeof window.__fsCall === 'function') {
                    return window.__fsCall('statSync', [filePath]);
                }
                return null;
            },
            readdirSync(filePath, options) {
                if (typeof window.__fsCall === 'function') {
                    return window.__fsCall('readdirSync', [filePath, options]);
                }
                return [];
            },
        };
    }, {
        snapshot: jsonSnapshot,
        objectDefaults: Array.from(defaultJsonObjectFiles),
        arrayDefaults: Array.from(defaultJsonArrayFiles),
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
const fs = require('node:fs');
const path = require('node:path');

const {
    Role,
    Mods,
    TeamPickMode
} = require('./models/enums');

/*
 * Defaults applied to every config file before its own values are laid on
 * top. Any field a config JSON doesn't set falls back to these.
 */
const DEFAULTS = {
    roomName: "🏐 Volleyball [chds] 🏐",
    roomLabel: "Room",
    roomCategory: "public",
    maxPlayers: 14,
    roomPublic: true,
    geo: { code: 'RU', lat: 55.7558, lon: 37.6173 },
    mode: 'public',
    defaultMatchPoint: 6,
    defaultTeamPickMode: 'random',
    defaultWinstay: false,
    defaultTeamSize: 2,
    queueMatches: 2,
    upTeamSizePlayers: 8,
    vipSlots: 2,
    vipQueueRoles: ['vip', 'preadmin', 'master'],
    vipUpCooldownMs: 10 * 60 * 1000,
    GhostKick: true,
    gamesTimeout: 5,
    maxInactivity: 20,
    joinAuths: false,
    Discord: "https://discord.gg/rY63ysFmFy",
    Telegram: "https://t.me/chesdesq",
    count: 1,
    numbering: false
};

const MODE_MAP = { public: Mods.PUBLIC, private: Mods.PRIVATE };
const PICK_MODE_MAP = { random: TeamPickMode.RANDOM, captains: TeamPickMode.CAPTAINS };
const VIP_ROLE_MAP = { player: Role.PLAYER, vip: Role.VIP, preadmin: Role.PREADMIN, admin: Role.ADMIN, master: Role.MASTER };

/*
 * The literal placeholder a numbered config's roomName must contain.
 * Replaced with the room's 1-based index within its own config file.
 */
const NUMBER_PLACEHOLDER = '{num}';

const HAXBALL_TOKEN_LENGTH = 39;

/*
 * Reads every *.json file directly under configDir (no recursion, no
 * registration step needed elsewhere — dropping a new file in is enough)
 * and returns them sorted by filename for deterministic token
 * assignment order.
 */
function readConfigFiles(configDir) {
    if (!fs.existsSync(configDir)) {
        throw new Error(`Room config directory not found: ${configDir}`);
    }

    const files = fs.readdirSync(configDir)
        .filter(name => name.toLowerCase().endsWith('.json'))
        .sort();

    if (files.length === 0) {
        throw new Error(
            `No room config files (*.json) found in ${configDir}. ` +
            `This directory is gitignored on purpose (each server keeps its own room ` +
            `configs locally) — copy a starting template from config/rooms.example/ ` +
            `(dropping the ".example" suffix) and edit it for this server. ` +
            `See config/rooms.example/README.md for details.`
        );
    }

    return files.map(filename => {
        const filePath = path.join(configDir, filename);
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            throw new Error(`Failed to parse room config "${filename}": ${err.message}`);
        }
        return { filename, filePath, raw };
    });
}

function resolveMode(value) {
    if (typeof value === 'number') return value;
    const resolved = MODE_MAP[value];
    if (resolved === undefined) {
        throw new Error(`Invalid "mode" value: ${JSON.stringify(value)} (expected "public" or "private")`);
    }
    return resolved;
}

function resolveTeamPickMode(value) {
    if (typeof value === 'number') return value;
    const resolved = PICK_MODE_MAP[value];
    if (resolved === undefined) {
        throw new Error(`Invalid "defaultTeamPickMode" value: ${JSON.stringify(value)} (expected "random" or "captains")`);
    }
    return resolved;
}

function resolveVipQueueRoles(list) {
    return list.map(name => {
        if (typeof name === 'number') return name;
        const resolved = VIP_ROLE_MAP[name];
        if (resolved === undefined) {
            throw new Error(`Invalid role name in "vipQueueRoles": ${JSON.stringify(name)}`);
        }
        return resolved;
    });
}

/*
 * Validates + expands a single config file's raw JSON into `count` room
 * instance descriptors. Each descriptor is a fully resolved config object
 * (same shape buildGameConfig/entry.js already expect) plus roomIndex
 * metadata used for room-key/label/token assignment.
 *
 * Throws with the offending filename included, so a bad config is easy
 * to trace back.
 */
function expandConfigFile({ filename, raw }) {
    const merged = { ...DEFAULTS, ...raw };

    const count = Number(merged.count);
    if (!Number.isInteger(count) || count < 1) {
        throw new Error(`Config "${filename}": "count" must be a positive integer, got ${JSON.stringify(raw.count)}`);
    }

    const numbering = Boolean(merged.numbering);

    if (numbering && !String(merged.roomName).includes(NUMBER_PLACEHOLDER)) {
        throw new Error(
            `Config "${filename}": "numbering" is enabled but "roomName" does not contain the ` +
            `"${NUMBER_PLACEHOLDER}" placeholder. Add "${NUMBER_PLACEHOLDER}" to roomName where the ` +
            `room number should appear, e.g. "My Room #${NUMBER_PLACEHOLDER}".`
        );
    }

    if (!numbering && count > 1 && String(merged.roomName).includes(NUMBER_PLACEHOLDER)) {
        throw new Error(
            `Config "${filename}": roomName contains "${NUMBER_PLACEHOLDER}" but "numbering" is not ` +
            `enabled. Set "numbering": true, or remove the placeholder from roomName.`
        );
    }

    const mode = resolveMode(merged.mode);
    const defaultTeamPickMode = resolveTeamPickMode(merged.defaultTeamPickMode);
    const vipQueueRoles = resolveVipQueueRoles(merged.vipQueueRoles);

    const instances = [];
    for (let i = 1; i <= count; i++) {
        const roomName = numbering
            ? merged.roomName.split(NUMBER_PLACEHOLDER).join(String(i))
            : merged.roomName;

        const roomLabel = numbering ? `${merged.roomLabel} #${i}` : merged.roomLabel;

        // Stable unique key used for the page/browser map, logs, room-key
        // scoped lookups (e.g. Discord online-message config), etc.
        const roomKey = numbering ? `${filename.replace(/\.json$/i, '')}-${i}` : filename.replace(/\.json$/i, '');

        instances.push({
            configFile: filename,
            roomKey,
            roomIndex: i,
            roomName,
            roomLabel,
            roomCategory: merged.roomCategory,
            maxPlayers: merged.maxPlayers,
            roomPublic: merged.roomPublic,
            geo: merged.geo,
            mode,
            defaultMatchPoint: merged.defaultMatchPoint,
            defaultTeamPickMode,
            defaultWinstay: merged.defaultWinstay,
            defaultTeamSize: merged.defaultTeamSize,
            queueMatches: merged.queueMatches,
            upTeamSizePlayers: merged.upTeamSizePlayers,
            vipSlots: merged.vipSlots,
            vipQueueRoles,
            vipUpCooldownMs: merged.vipUpCooldownMs,
            GhostKick: merged.GhostKick,
            gamesTimeout: merged.gamesTimeout,
            maxInactivity: merged.maxInactivity,
            joinAuths: merged.joinAuths,
            Discord: merged.Discord,
            Telegram: merged.Telegram,
            roomPassword: merged.roomPassword ?? ''
        });
    }

    return instances;
}

/*
 * Loads config/rooms/*.json, expands every file into its room instances,
 * and validates the total instance count against the number of tokens
 * available. Returns { instances, totalRooms }. Throws a single
 * descriptive error (rather than per-file) if tokens are insufficient,
 * since that's a cross-file check.
 */
function loadRoomInstances(configDir, tokens) {
    const files = readConfigFiles(configDir);
    const instances = files.flatMap(expandConfigFile);

    if (!Array.isArray(tokens) || tokens.length < instances.length) {
        const have = Array.isArray(tokens) ? tokens.length : 0;
        throw new Error(
            `Not enough HaxBall tokens: ${instances.length} room(s) configured across ` +
            `${files.length} config file(s), but only ${have} token(s) provided via HAXBALL_TOKENS. ` +
            `Add ${instances.length - have} more token(s).`
        );
    }

    instances.forEach((instance, index) => {
        const token = tokens[index];
        if (typeof token === 'string' && token.length === HAXBALL_TOKEN_LENGTH) {
            instance.token = token;
        } else {
            instance.token = token ?? '';
        }
    });

    return { instances, totalRooms: instances.length };
}

/*
 * Parses the HAXBALL_TOKENS env var: a comma-separated list of tokens,
 * trimmed, empty entries dropped. Token-to-room assignment order is the
 * same order loadRoomInstances() produces instances in (config files
 * sorted by filename, then room #1, #2, ... within each file).
 */
function parseTokensEnv(value) {
    if (!value) return [];
    return value.split(',').map(s => s.trim()).filter(Boolean);
}

/*
 * Same derivation used by config.js:resolveOnlineMessageConfig, exposed
 * here too so scripts (e.g. send-online-messages.js) that only need
 * roomConfigs.js don't have to import config.js just for this helper.
 */
function envKeyFromRoomKey(roomKey) {
    return roomKey.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

module.exports = {
    DEFAULTS,
    NUMBER_PLACEHOLDER,
    HAXBALL_TOKEN_LENGTH,
    readConfigFiles,
    expandConfigFile,
    loadRoomInstances,
    parseTokensEnv,
    envKeyFromRoomKey
};
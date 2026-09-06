const path = require('node:path');
const { parseTokensEnv, parseProxiesEnv } = require('./roomConfigs');

/*
 * Tokens are no longer one-per-room-type (PUBLIC_TOKEN/PRIVATE_TOKEN).
 * Since the number and kind of rooms is now driven entirely by JSON
 * files under config/rooms/ (see roomConfigs.js), tokens are instead a
 * flat pool: HAXBALL_TOKENS="token1,token2,token3". Assignment order
 * matches the order room instances are produced in (config files sorted
 * by filename, then room #1, #2, ... within each file) — see
 * roomConfigs.js:loadRoomInstances.
 */
const haxballTokens = parseTokensEnv(process.env.HAXBALL_TOKENS);

const haxballProxies = parseProxiesEnv(process.env.HAXBALL_PROXIES);

const discordBotToken = process.env.DISCORD_BOT_TOKEN ?? '';
const discordGuildId = process.env.DISCORD_GUILD_ID ?? '';

const discordRoleIds = {
    vip: process.env.DISCORD_VIP_ROLE_ID ?? null,
    preadmin: process.env.DISCORD_PREADMIN_ROLE_ID ?? null,
    admin: process.env.DISCORD_ADMIN_ROLE_ID ?? null,
    master: process.env.DISCORD_MASTER_ROLE_ID ?? null
};

const discordChannelIds = {
    log: process.env.DISCORD_LOG_CHANNEL_ID ?? null,
    report: process.env.DISCORD_REPORT_CHANNEL_ID ?? null,
    replay: process.env.DISCORD_REPLAY_CHANNEL_ID ?? null,
    vip: process.env.DISCORD_VIP_CHANNEL_ID ?? null,
    analytics: process.env.DISCORD_ANALYTICS_CHANNEL_ID ?? null,
    online: process.env.DISCORD_ONLINE_CHANNEL_ID ?? null
};

const locale = process.env.LOCALE ?? 'ru';
const timeZone = process.env.TIME_ZONE;

const roomConfigsDir = process.env.ROOM_CONFIGS_DIR
    ? path.resolve(process.env.ROOM_CONFIGS_DIR)
    : path.resolve(__dirname, '..', '..', 'config', 'rooms');

module.exports = {
    haxballTokens,
    haxballProxies,
    discordBotToken,
    discordGuildId,
    discordRoleIds,
    discordChannelIds,
    locale,
    timeZone,
    roomConfigsDir
};
const {
    Role,
    Mods,
    TeamPickMode,
} = require('../core/models/enums');

/* 
 * default settings: if a specific parameter is not found
 * in the config, the value from here will be used.
 */
const base = {
    roomName: "🏐 Volleyball [chds] 🏐",
    roomLabel: "Room",
    roomCategory: "public",
    maxPlayers: 14,
    roomPublic: true,
    geo: { code: 'RU', lat: 55.7558, lon: 37.6173 },
    mode: Mods.PUBLIC,
    defaultMatchPoint: 6,
    defaultTeamPickMode: TeamPickMode.RANDOM,
    defaultWinstay: false,
    defaultTeamSize: 2,
    queueMatches: 2,
    upTeamSizePlayers: 8,
    vipSlots: 2,
    vipQueueRoles: [Role.VIP, Role.PREADMIN, Role.MASTER],
    vipUpCooldownMs: 10*60*1000,
    GhostKick: true,
    gamesTimeout: 5,
    maxInactivity: 20,
    joinAuths: false,
    Discord: "https://dsc.gg/chds",
    Telegram: "https://t.me/chesdesq",
};

const publicConfig = {
    ...base,
    roomName: "🏐 Volleyball [chds] | CAPTAINS 🏐",
    roomLabel: "Public",
    roomCategory: "public",
    defaultTeamPickMode: TeamPickMode.CAPTAINS,
    defaultWinstay: true
};

const privateConfig = {
    ...base,
    roomName: "🏐 Volleyball [chds] | PRIVATE 🏐",
    roomLabel: "Private",
    roomCategory: "private",
    maxPlayers: 20,
    mode: Mods.PRIVATE,
    defaultMatchPoint: 25,
};

const HAXBALL_TOKEN_LENGTH = 39;

function buildGameConfig(token, config = base) {
    const gameConfig = {
        roomName: config.roomName,
        maxPlayers: config.maxPlayers,
        public: config.roomPublic,
        noPlayer: true,
        geo: config.geo,
    };

    if (typeof token === 'string' && token.length === HAXBALL_TOKEN_LENGTH) {
        gameConfig.token = token;
    }

    return gameConfig;
}

module.exports = {
    base,
    publicConfig,
    privateConfig,
    buildGameConfig,
};
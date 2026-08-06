const { Role } = require('../core/models/enums');

const roomName = "🏐 chesdes x HaxLab | VOLLEYBALL 🏐"
const maxPlayers = 14
const roomPublic = true
const geo = { code: 'RU', lat: 55.7558, lon: 37.6173 };

const Discord = "https://discord.gg/..."
const Telegram = "https://t.me/chesdesq"
const gamesTimeout = 10
const defaultTeamSize = 2
const maxInactivity = 20
const queueMatches = 2
const upTeamSizePlayers = 10
const vipSlots = 2
const GhostKick = true
const vipQueueRoles = [
    Role.VIP, Role.PREADMIN, 
    Role.VIPADMIN, Role.MASTER
]

const HAXBALL_TOKEN_LENGTH = 39;

function buildGameConfig(token) {
    const gameConfig = {
        roomName,
        maxPlayers,
        public: roomPublic,
        noPlayer: true,
        geo
    };

    if (typeof token === 'string' && token.length === HAXBALL_TOKEN_LENGTH) {
        gameConfig.token = token;
    }

    return gameConfig;
}

module.exports = {
    roomName,
    maxPlayers,
    roomPublic,
    geo,
    Discord,
    Telegram,
    gamesTimeout,
    defaultTeamSize,
    maxInactivity,
    queueMatches,
    upTeamSizePlayers,
    vipSlots,
    GhostKick,
    vipQueueRoles,
    buildGameConfig
}

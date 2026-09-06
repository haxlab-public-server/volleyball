const HAXBALL_TOKEN_LENGTH = 39;

function buildGameConfig(token, config) {
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
    buildGameConfig,
};
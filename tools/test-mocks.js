function createMockRoom({ players = [], scores = null } = {}) {
    const calls = [];
    const playerList = [...players];
    const discProperties = { 0: { cGroup: 1, x: 0, y: 0 } };
    let currentScores = scores;

    const record = (method, ...args) => calls.push({ method, args });

    return {
        calls,
        players: playerList,
        setScores(value) {
            currentScores = value;
        },
        getPlayerList() {
            return [...playerList];
        },
        getPlayer(id) {
            return playerList.find(player => player.id === id) ?? null;
        },
        getScores() {
            return currentScores;
        },
        getBallPosition() {
            return { x: 0, y: 0 };
        },
        getDiscProperties(id) {
            return discProperties[id] ?? null;
        },
        sendAnnouncement(...args) {
            record('sendAnnouncement', ...args);
        },
        setPlayerTeam(id, team) {
            const player = playerList.find(item => item.id === id);
            if (player) player.team = team;
            record('setPlayerTeam', id, team);
        },
        setPlayerAdmin(...args) {
            record('setPlayerAdmin', ...args);
        },
        kickPlayer(...args) {
            record('kickPlayer', ...args);
        },
        clearBan(...args) {
            record('clearBan', ...args);
        },
        setDiscProperties(id, properties) {
            discProperties[id] = { ...discProperties[id], ...properties };
            record('setDiscProperties', id, properties);
        },
        setCustomStadium(...args) {
            record('setCustomStadium', ...args);
        },
        startGame(...args) {
            record('startGame', ...args);
            currentScores = currentScores ?? { time: 0 };
        },
        stopGame(...args) {
            record('stopGame', ...args);
            currentScores = null;
        },
        pauseGame(...args) {
            record('pauseGame', ...args);
        },
        startRecording() {
            record('startRecording');
            return new Uint8Array([1, 2, 3]);
        },
        stopRecording() {
            record('stopRecording');
            return new Uint8Array([4, 5, 6]);
        }
    };
}

function createMockDiscordBridge(overrides = {}) {
    const calls = [];
    const bridge = {};
    const methods = [
        'consumeLinkCode', 'unlinkByAuth', 'syncRoleForAuth',
        'getDiscordUsername', 'sendLog', 'sendReport', 'sendRecording',
        'sendVipPassword', 'sendStatsBackup', 'updateOnlineMessage'
    ];

    for (const method of methods) {
        bridge[method] = async (...args) => {
            calls.push({ method, args });
            return overrides[method];
        };
    }

    bridge.calls = calls;
    return bridge;
}

module.exports = {
    createMockRoom,
    createMockDiscordBridge
};

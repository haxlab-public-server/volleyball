module.exports = function createRoomUtils({
    room,
    state,
    lastIds,
    Team
}) {

function findLastId(id) {
    return Object.values(lastIds).find(value => value && value[0] == id) ?? null;
}

function getAuth(id) {
    const found = findLastId(id);
    return found ? found[2] : null;
}

function getConn(id) {
    const found = findLastId(id);
    return found ? found[1] : null;
}

function getID(auth) { // "auth": [id, conn, auth]
    if (lastIds && lastIds[auth]) {
        return lastIds[auth][0];
    }
    return null;
}

function getTeamArray(team) {
    const players = room.getPlayerList();
    if (team == Team.RED) return players.filter((p) => p.team == Team.RED)
    else if (team == Team.BLUE) return players.filter((p) => p.team == Team.BLUE)
    else return players.filter((p) => p.team == Team.SPECTATORS &&
        !state.afkList.some((i) => i[0] == p.id));
}

return {
    getAuth,
    getConn,
    getID,
    getTeamArray
}

};
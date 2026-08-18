module.exports = function createRoomUtils({
    room,
    state,
    lastIds,
    Team
}) {

function getAuth(id) { // "auth": [id, conn, auth]
    const values = Object.values(lastIds);
    const found = values.find(i => i && i[0] == id);
    return found ? found[2] : null;
}

function getConn(id) { // "auth": [id, conn, auth]
    const values = Object.values(lastIds);
    const found = values.find(i => i && i[0] == id);
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
    else return players.filter((p) => p.team == 0).filter((p) => state.afkList.findIndex((i) => i[0] == p.id) == -1)
}

return {
    getAuth,
    getConn,
    getID,
    getTeamArray
}

};
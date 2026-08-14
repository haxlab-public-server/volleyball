module.exports = function createRoomUtils({
    room,
    state,
    lastIds,
    cf,
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

function ballSpawner(training_mode_spawn) {
    state.ball_color = 0xffffff
    state.touches = 0
    if (training_mode_spawn[5] != undefined && (training_mode_spawn[5] == "serve_red" || training_mode_spawn[5] == "serve_blue") && room.getDiscProperties(0) != undefined) {
        disc = room.getDiscProperties(0)
        room.setDiscProperties(0, {
            cGroup: disc.cGroup | cf.kick,
        })
        state.serve = training_mode_spawn[5] == "serve_red" ? Team.RED : Team.BLUE
        state.serveBall = true
    }
    room.setDiscProperties(0, {
        x: training_mode_spawn[0],
        y: training_mode_spawn[1],
        xspeed: training_mode_spawn[2],
        yspeed: training_mode_spawn[3],
        color: state.ball_color
    })
}

return {
    getAuth,
    getConn,
    getID,
    getTeamArray,
    ballSpawner
}

};
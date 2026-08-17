const { resolveSpawnValue } = require('./spawnRange');

module.exports = function createRoomUtils({
    room,
    state,
    lastIds,
    cf,
    Team,
    getRandomFloat
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
/*
 * training_mode_spawn layout: [xDescriptor, yDescriptor, xspeedDescriptor,
 * yspeedDescriptor, interval, serveTag?]. Each *Descriptor is either a plain
 * number (fixed value) or a { isRange, min, max } object produced by
 * parseSpawnValue — in which case a fresh random value is drawn every spawn.
 */
function ballSpawner(training_mode_spawn) {
    state.ball_color = 0xffffff
    state.touches = 0

    const x = resolveSpawnValue(training_mode_spawn[0], getRandomFloat)
    const y = resolveSpawnValue(training_mode_spawn[1], getRandomFloat)
    const xspeed = resolveSpawnValue(training_mode_spawn[2], getRandomFloat)
    const yspeed = resolveSpawnValue(training_mode_spawn[3], getRandomFloat)

    if (training_mode_spawn[5] != undefined && (training_mode_spawn[5] == "serve_red" || training_mode_spawn[5] == "serve_blue") && room.getDiscProperties(0) != undefined) {
        let disc = room.getDiscProperties(0)
        room.setDiscProperties(0, {
            cGroup: disc.cGroup | cf.kick,
        })
        state.serve = training_mode_spawn[5] == "serve_red" ? Team.RED : Team.BLUE
        state.serveBall = true
    }
    room.setDiscProperties(0, {
        x: x,
        y: y,
        xspeed: xspeed,
        yspeed: yspeed,
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
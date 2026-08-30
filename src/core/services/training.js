const { resolveSpawnValue } = require('../utils/spawnRange');

function parseServePresetLabel(label, Serve, Team) {
    if (typeof label !== 'string') return null;

    const parts = label.split('_');
    if (parts.length !== 2) return null;

    const [typeKey, colorKey] = parts;

    const serveType = typeKey === 'power' ? Serve.POWER
        : typeKey === 'float' ? Serve.FLOAT
        : null;
    const team = colorKey === 'red' ? Team.RED
        : colorKey === 'blue' ? Team.BLUE
        : null;

    if (serveType == null || team == null) return null;

    return { serveType, team };
}

module.exports = function createTrainingService({
    room,
    state,
    volleyball_map,
    noGoal_map,
    cf,
    Team,
    Serve,
    getRandomFloat
}) {
    /*
     * training_mode_spawn layout: [xDescriptor, yDescriptor, xspeedDescriptor,
     * yspeedDescriptor, interval, presetLabel?]. Each *Descriptor is either a
     * plain number (fixed value) or a { isRange, min, max } object produced
     * by parseSpawnValue — in which case a fresh random value is drawn every
     * spawn. presetLabel, if present, is a "<serveType>_<team>" string (see
     * parseServePresetLabel above) that additionally arms the serve-ball
     * override for the next kick.
     */
    function ballSpawner(training_mode_spawn) {
        state.ball_color = 0xffffff;
        state.touches = 0;

        const x = resolveSpawnValue(training_mode_spawn[0], getRandomFloat);
        const y = resolveSpawnValue(training_mode_spawn[1], getRandomFloat);
        const xspeed = resolveSpawnValue(training_mode_spawn[2], getRandomFloat);
        const yspeed = resolveSpawnValue(training_mode_spawn[3], getRandomFloat);

        const preset = parseServePresetLabel(training_mode_spawn[5], Serve, Team);

        if (preset != null && room.getDiscProperties(0) != undefined) {
            let disc = room.getDiscProperties(0);
            room.setDiscProperties(0, {
                cGroup: disc.cGroup | cf.kick,
            });
            state.serve = preset.team;
            state.serveType = preset.serveType;
            state.floatSlowed = false;
            state.serveBall = true;
        }

        room.setDiscProperties(0, {
            x: x,
            y: y,
            xspeed: xspeed,
            yspeed: yspeed,
            color: state.ball_color
        });
    }

    function resetServeBallOverride() {
        if (!state.serveBall) return;
        state.serveBall = false;
        const disc = room.getDiscProperties(0);
        if (disc != null) {
            room.setDiscProperties(0, { cGroup: disc.cGroup | cf.kick });
        }
    }

    function startBallSpawn(settings) {
        const isServePreset = settings.length > 5 &&
            parseServePresetLabel(settings[5], Serve, Team) != null;

        if (!isServePreset) {
            resetServeBallOverride();
        }

        state.training_mode_spawn = settings;
        clearInterval(state.training_interval);
        state.training_interval = setInterval(
            () => ballSpawner(state.training_mode_spawn),
            state.training_mode_spawn[4]
        );
    }

    function stopBallSpawn() {
        resetServeBallOverride();
        state.training_mode_spawn = [];
        clearInterval(state.training_interval);
    }

    function startTrainingMode() {
        state.training_mode = true;
        state.training_mode_spawn = [];

        room.stopGame();
        room.setCustomStadium(noGoal_map);
        room.startGame();
    }

    function stopTrainingMode() {
        state.training_mode = false;
        stopBallSpawn();
        room.stopGame();
        room.setCustomStadium(volleyball_map);
    }

    return {
        ballSpawner,
        startBallSpawn,
        stopBallSpawn,
        startTrainingMode,
        stopTrainingMode
    };
};
const { resolveSpawnValue } = require('../utils/spawnRange');

module.exports = function createTrainingService({
    room,
    state,
    volleyball_map,
    noGoal_map,
    cf,
    Team,
    getRandomFloat
}) {
    /*
     * training_mode_spawn layout: [xDescriptor, yDescriptor, xspeedDescriptor,
     * yspeedDescriptor, interval, serveTag?]. Each *Descriptor is either a plain
     * number (fixed value) or a { isRange, min, max } object produced by
     * parseSpawnValue — in which case a fresh random value is drawn every spawn.
     */
    function ballSpawner(training_mode_spawn) {
        state.ball_color = 0xffffff;
        state.touches = 0;

        const x = resolveSpawnValue(training_mode_spawn[0], getRandomFloat);
        const y = resolveSpawnValue(training_mode_spawn[1], getRandomFloat);
        const xspeed = resolveSpawnValue(training_mode_spawn[2], getRandomFloat);
        const yspeed = resolveSpawnValue(training_mode_spawn[3], getRandomFloat);

        if (
            training_mode_spawn[5] != undefined &&
            (training_mode_spawn[5] == "serve_red" || training_mode_spawn[5] == "serve_blue") &&
            room.getDiscProperties(0) != undefined
        ) {
            let disc = room.getDiscProperties(0);
            room.setDiscProperties(0, {
                cGroup: disc.cGroup | cf.kick,
            });
            state.serve = training_mode_spawn[5] == "serve_red" ? Team.RED : Team.BLUE;
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
            (settings[5] === 'serve_red' || settings[5] === 'serve_blue');

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
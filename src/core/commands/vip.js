const { parseSpawnValue, parseSpawnSettings, formatSpawnValue } = require('../utils/spawnRange');

const DEFAULT_INTERVAL = 3000;

const SERVE_PRESETS = {
    power_red: {
        x: -410,
        y: 200,
        xspeed: 0.7,
        yspeed: -11.9,
    },
    power_blue: {
        x: 410,
        y: 200,
        xspeed: -0.7,
        yspeed: -11.9,
    },
    float_red: {
        x: -410,
        y: 200,
        xspeed: 0.7,
        yspeed: -11.9,
    },
    float_blue: {
        x: 410,
        y: 200,
        xspeed: -0.7,
        yspeed: -11.9,
    },
};

const SERVE_PRESET_ALIASES = {
    serve_red: 'power_red',
    serve_blue: 'power_blue',
};

module.exports = function createVipCommands({
    room,
    state,
    db,
    getAuth,
    startBallSpawn,
    stopBallSpawn,
    startTrainingMode,
    stopTrainingMode,
    Mods,
    Color,
    HaxNotification,
    vipUpCooldownMs,
    t
}) {
    function announce(message, targetId = null, color = Color.WH_GREEN, style = 'small') {
        room.sendAnnouncement(message, targetId, color, style, HaxNotification.CHAT);
    }

    function announceError(player, message) {
        announce(message, player.id, Color.GR_RED);
    }

    function announceInfo(player, message) {
        announce(message, player.id, Color.WH_BLUE);
    }

    /* Renders descriptors back into a readable "x y xspeed yspeed" string */
    function formatSpawnDescriptors(descriptors) {
        return descriptors.map(formatSpawnValue).join(' ');
    }

    function buildSpawnSettings(x, y, xspeed, yspeed, interval, label = null) {
        const settings = [
            parseSpawnValue(x),
            parseSpawnValue(y),
            parseSpawnValue(xspeed),
            parseSpawnValue(yspeed),
            interval,
        ];
        if (label) settings.push(label);
        return settings;
    }

    function applySpawnAndAnnounce(player, settings, interval) {
        startBallSpawn(settings);
        const desc = formatSpawnDescriptors(settings.slice(0, 4));
        announce(
            t('ballSpawner.applied', { descriptors: desc, interval, admin: player.name })
        );
    }

    async function chatColorCommand(player, message) {
        const args = message.toLowerCase().split(/ +/).slice(1);

        if (args.length === 0) {
            announceError(player, t('chatColor.usage'));
            return;
        }

        const auth = getAuth(player.id);

        if (args[0] === 'clear') {
            await db.setChatColor(auth, null);
            announce(t('chatColor.cleared'), player.id);
            return;
        }

        await db.setChatColor(auth, args[0]);
        announce(
            t('chatColor.set'),
            player.id,
            `0x${args[0]}`
        );
    }

    function trainingSettingCommands(player, message) {
        if (!state.training_mode) {
            announceError(player, t('ballSpawner.disabledNotice'));
            return;
        }

        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'info') {
            const spawn = state.training_mode_spawn;
            const status =
                spawn.length === 0
                    ? t('ballSpawner.infoOff')
                    : t('ballSpawner.infoOn', { descriptors: formatSpawnDescriptors(spawn.slice(0, 4)), interval: spawn[4] });

            announceInfo(
                player,
                t('ballSpawner.info', { status })
            );
            return;
        }

        if (args[0] === 'off') {
            stopBallSpawn();
            announce(t('ballSpawner.turnedOff', { admin: player.name }));
            return;
        }

        const presetKey = SERVE_PRESET_ALIASES[args[0]] ?? args[0];

        if (presetKey in SERVE_PRESETS) {
            const preset = SERVE_PRESETS[presetKey];
            const interval = !isNaN(+args[1]) ? +args[1] : DEFAULT_INTERVAL;
            const settings = buildSpawnSettings(
                preset.x,
                preset.y,
                preset.xspeed,
                preset.yspeed,
                interval,
                presetKey
            );
            applySpawnAndAnnounce(player, settings, interval);
            return;
        }

        if (args.length === 5) {
            const descriptors = parseSpawnSettings(args);

            if (descriptors === null) {
                announceError(
                    player,
                    t('ballSpawner.invalidArgs')
                );
                return;
            }

            const interval = Number(args[4]);
            if (isNaN(interval)) {
                announceError(player, t('ballSpawner.invalidInterval'));
                return;
            }

            const settings = [...descriptors, interval];
            applySpawnAndAnnounce(player, settings, interval);
            return;
        }

        announceError(
            player,
            t('ballSpawner.notEnoughArgs')
        );
    }

    function trainingCommand(player, message) {
        if (state.mode !== Mods.PRIVATE) {
            announceError(player, t('training.onlyInPrivate'));
            return;
        }

        const args = message.toLowerCase().split(/ +/).slice(1);
        const action = args[0];

        if (!action || action === 'mode') {
            announceInfo(
                player,
                t('training.status', { status: state.training_mode ? t('training.statusOn') : t('training.statusOff') })
            );
            return;
        }

        if (action === 'on' || action === 'true') {
            startTrainingMode();
            announce(t('training.enabled', { admin: player.name }));
            return;
        }

        if (action === 'off' || action === 'false') {
            stopTrainingMode();
            announce(t('training.disabled', { admin: player.name }));
            return;
        }

        announceError(player, t('training.invalidOption'));
    }

    async function upCommand(player) {
        const now = Date.now();

        if (state.vipUpCooldownUntil > now) {
            const minsLeft = Math.ceil((state.vipUpCooldownUntil - now) / 1000 / 60);
            announceError(player, t('up.roomCooldown', { mins: minsLeft }));
            return;
        }

        if (state.vipUpBooking != null) {
            announceError(
                player,
                t('up.alreadyBooked', { name: state.vipUpBooking.name })
            );
            return;
        }

        const auth = getAuth(player.id);
        state.vipUpBooking = { auth, name: player.name };
        state.vipUpCooldownUntil = now + vipUpCooldownMs;

        announce(
            t('up.booked', { name: player.name }),
            null,
            Color.PINK,
            'bold'
        );
    }

    return {
        chatColorCommand,
        trainingSettingCommands,
        trainingCommand,
        upCommand
    };
};
const { parseSpawnValue, parseSpawnSettings, formatSpawnValue } = require('../utils/spawnRange');

const DEFAULT_INTERVAL = 3000;

const SERVE_PRESETS = {
    serve_red: {
        x: -410,
        y: 200,
        xspeed: 0.7,
        yspeed: -11.9,
    },
    serve_blue: {
        x: 410,
        y: 200,
        xspeed: -0.7,
        yspeed: -11.9,
    },
};

module.exports = function createVipCommands({
    room,
    state,
    db,
    getAuth,
    ballSpawner,
    noGoal_map,
    Mods,
    Color,
    HaxNotification,
    vipUpCooldownMs
}) {
    function announce(message, targetId = null, color = Color.WH_GREEN) {
        room.sendAnnouncement(message, targetId, color, 'small', HaxNotification.CHAT);
    }

    function announceError(player, message) {
        announce(message, player.id, Color.GR_RED);
    }

    function announceInfo(player, message) {
        announce(message, player.id, Color.WH_BLUE);
    }

    function startBallSpawn(settings) {
        state.training_mode_spawn = settings;
        clearInterval(state.training_interval);
        state.training_interval = setInterval(
            () => ballSpawner(state.training_mode_spawn),
            state.training_mode_spawn[4]
        );
    }

    function stopBallSpawn() {
        state.training_mode_spawn = [];
        clearInterval(state.training_interval);
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
            `Настройки спавна мяча: ${desc} ${interval} (x, y, xspeed, yspeed, interval) - ${player.name}`
        );
    }

    async function chatColorCommand(player, message) {
        const args = message.toLowerCase().split(/ +/).slice(1);

        if (args.length === 0) {
            announceError(player, 'Нужно написать цвет в HEX формате: FFFFFF (это белый)');
            return;
        }

        const auth = getAuth(player.id);

        if (args[0] === 'clear') {
            await db.setChatColor(auth, null);
            announce('Цвет чата был выключен!', player.id);
            return;
        }

        await db.setChatColor(auth, args[0]);
        announce(
            `Теперь у вас вот такой цвет чата! \nВыключить цветной чат: !color clear`,
            player.id,
            `0x${args[0]}`
        );
    }

    function trainingSettingCommands(player, message) {
        if (!state.training_mode) {
            announceError(player, 'Режим тренировки выключен, сейчас нельзя использовать эту команду');
            return;
        }

        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'info') {
            const spawn = state.training_mode_spawn;
            const status =
                spawn.length === 0
                    ? 'выключен'
                    : `${formatSpawnDescriptors(spawn.slice(0, 4))} ${spawn[4]} (x, y, xspeed, yspeed, interval)`;

            announceInfo(
                player,
                `Настройки спавна мяча: ${status}\nМожно указывать диапазон вместо числа: min..max (пример: !bs -450..-350 200 0.5..0.9 -11.9 3000)`
            );
            return;
        }

        if (args[0] === 'off') {
            stopBallSpawn();
            announce(`Спавн мяча выключен - ${player.name}`);
            return;
        }

        if (args[0] in SERVE_PRESETS) {
            const preset = SERVE_PRESETS[args[0]];
            const interval = !isNaN(+args[1]) ? +args[1] : DEFAULT_INTERVAL;
            const settings = buildSpawnSettings(
                preset.x,
                preset.y,
                preset.xspeed,
                preset.yspeed,
                interval,
                args[0]
            );
            applySpawnAndAnnounce(player, settings, interval);
            return;
        }

        if (args.length === 5) {
            const descriptors = parseSpawnSettings(args);

            if (descriptors === null) {
                announceError(
                    player,
                    'Некорректный вид аргументов: x, y, xspeed, yspeed, interval(мс)\nЧисло или диапазон min..max (пример: -450..-350)'
                );
                return;
            }

            const interval = Number(args[4]);
            if (isNaN(interval)) {
                announceError(player, 'Некорректный интервал, укажите время в милисекундах 1с=1000мс');
                return;
            }

            const settings = [...descriptors, interval];
            applySpawnAndAnnounce(player, settings, interval);
            return;
        }

        announceError(
            player,
            'Недостаточно аргументов: !bs x, y, xspeed, yspeed, interval(мс)\nМожно указывать диапазон вместо числа: min..max'
        );
    }

    function trainingCommand(player, message) {
        if (state.mode !== Mods.PRIVATE) {
            announceError(player, 'При public моде нельзя включать режим тренировки вручную');
            return;
        }

        const args = message.toLowerCase().split(/ +/).slice(1);
        const action = args[0];

        if (!action || action === 'mode') {
            announceInfo(
                player,
                `Сейчас режим тренировки: ${state.training_mode ? 'включён' : 'выключен'}`
            );
            return;
        }

        if (action === 'on' || action === 'true') {
            state.training_mode = true;
            state.training_mode_spawn = [];

            announce(`Режим тренировки включён - ${player.name}`);

            room.stopGame();
            room.setCustomStadium(noGoal_map);
            room.startGame();
            return;
        }

        if (action === 'off' || action === 'false') {
            state.training_mode = false;
            stopBallSpawn();

            announce(`Режим тренировки выключен - ${player.name}`);
            room.stopGame();
            return;
        }

        announceError(player, 'Ошибка. Такого варианта нет: mode / on / off');
    }

    async function upCommand(player) {
        const now = Date.now();

        if (state.vipUpCooldownUntil > now) {
            const minsLeft = Math.ceil((state.vipUpCooldownUntil - now) / 1000 / 60);
            announceError(player, `Команда !up сейчас на КД для всей комнаты: ещё ${minsLeft}мин`);
            return;
        }

        if (state.vipUpBooking != null) {
            announceError(
                player,
                `Место капитана на следующем пике уже забронировано игроком ${state.vipUpBooking.name}`
            );
            return;
        }

        const auth = getAuth(player.id);
        state.vipUpBooking = { auth, name: player.name };
        state.vipUpCooldownUntil = now + vipUpCooldownMs;

        announce(
            `🌟 ${player.name} забронировал место капитана на следующем формировании команд!`,
            null,
            Color.PINK
        );
    }

    return {
        chatColorCommand,
        trainingSettingCommands,
        trainingCommand,
        upCommand
    };
};
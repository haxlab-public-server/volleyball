module.exports = function createVipCommands({
    room,
    state,
    db,
    getAuth,
    ballSpawner,
    noGoal_map,
    Mods,
    Color,
    HaxNotification
}) {
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

    async function chatColorCommand(player, message) {
        const args = message.toLowerCase().split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                `Нужно написать цвет в HEX формате: FFFFFF (это белый)`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const auth = getAuth(player.id);

        if (args[0] === 'clear') {
            await db.setChatColor(auth, null);

            room.sendAnnouncement(
                `Цвет чата был выключен!`,
                player.id,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        await db.setChatColor(auth, args[0]);

        room.sendAnnouncement(
            `Теперь у вас вот такой цвет чата! \nВыключить цветной чат: !color clear`,
            player.id,
            `0x${args[0]}`,
            'small',
            HaxNotification.CHAT
        );
    }

    function trainingSettingCommands(player, message) {
        if (!state.training_mode) {
            room.sendAnnouncement(
                `Режим тренировки выключен, сейчас нельзя использовать эту команду`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'info') {
            const status = state.training_mode_spawn.length === 0
                ? 'выключен'
                : `${state.training_mode_spawn.join(' ')} (x, y, xspeed, yspeed, interval)`;

            room.sendAnnouncement(
                `Настройки спавна мяча: ${status}`,
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0] === 'off') {
            stopBallSpawn();
            room.sendAnnouncement(
                `Спавн мяча выключен - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0] === 'serve_red') {
            const interval = !isNaN(+args[1]) ? +args[1] : 3000;
            const settings = [-410, 200, 0.7, -11.9, interval, 'serve_red'];

            startBallSpawn(settings);
            room.sendAnnouncement(
                `Настройки спавна мяча: ${settings.join(' ')} (x, y, xspeed, yspeed, interval) - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0] === 'serve_blue') {
            const interval = !isNaN(+args[1]) ? +args[1] : 3000;
            const settings = [410, 200, -0.7, -11.9, interval, 'serve_blue'];

            startBallSpawn(settings);
            room.sendAnnouncement(
                `Настройки спавна мяча: ${settings.join(' ')} (x, y, xspeed, yspeed, interval) - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args.length === 5) {
            const settings = [];
            for (const arg of args) {
                if (isNaN(+arg)) {
                    room.sendAnnouncement(
                        `Некорректный вид аргуметов: x, y, xspeed, yspeed, interval`,
                        player.id,
                        Color.GR_RED,
                        'small',
                        HaxNotification.CHAT
                    );
                    return;
                }
                settings.push(arg);
            }

            startBallSpawn(settings);
            room.sendAnnouncement(
                `Настройки спавна мяча: ${settings.join(' ')} (x, y, xspeed, yspeed, interval) - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            `Недостаточно аргументов: !bs x, y, xspeed, yspeed, interval`,
            player.id,
            Color.GR_RED,
            'small',
            HaxNotification.CHAT
        );
    }

    function trainingCommand(player, message) {
        if (state.mode !== Mods.PRIVATE) {
            room.sendAnnouncement(
                `При public моде нельзя включать режим тренировки вручную`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const args = message.toLowerCase().split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'mode') {
            room.sendAnnouncement(
                `Сейчас режим тренировки: ${state.training_mode ? 'включён' : 'выключен'}`,
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0] === 'on' || args[0] === 'true') {
            state.training_mode = true;
            state.training_mode_spawn = [];

            room.sendAnnouncement(
                `Режим тренировки включён - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );

            room.stopGame();
            room.setCustomStadium(noGoal_map);
            room.startGame();
            return;
        }

        if (args[0] === 'off' || args[0] === 'false') {
            state.training_mode = false;
            stopBallSpawn();

            room.sendAnnouncement(
                `Режим тренировки выключен - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );

            room.stopGame();
            return;
        }

        room.sendAnnouncement(
            `Ошибка. Такого варианта нет: mode / on / off`,
            player.id,
            Color.GR_RED,
            'small',
            HaxNotification.CHAT
        );
    }

    return {
        chatColorCommand,
        trainingSettingCommands,
        trainingCommand
    };
};
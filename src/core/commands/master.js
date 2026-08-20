module.exports = function createMasterCommands({
    room,
    state,
    db,
    getAuth,
    getRole,
    setRole,
    stringToTime,
    getStringTime,
    getDate,
    stopTrainingMode,
    Role,
    RoleString,
    Mods,
    Color,
    HaxNotification,
    defaultTeamSize,
    TeamPickModeString,
    discordBot,
    formatAccountView
}) {
    function parsePlayerId(arg) {
        const idStr = arg.startsWith('#') ? arg.slice(1) : arg;
        const id = Number(idStr);
        return Number.isInteger(id) && id >= 0 ? id : null;
    }

    const ROLE_NAMES = {
        [Role.MASTER]: 'Создатель',
        [Role.ADMIN]: 'Администратор',
        [Role.PREADMIN]: 'Мл. Администратор',
        [Role.VIP]: 'VIP',
        [Role.PLAYER]: 'игрок'
    };

    function passwordCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'clear') {
            state.roomPassword = null;
            room.setPassword(null);
            room.sendAnnouncement(
                `Пароль был сброшен - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.roomPassword = args[0];
        room.setPassword(args[0]);
        room.sendAnnouncement(
            `Теперь пароль от комнаты: ${args[0]} - ${player.name}`,
            null,
            Color.WH_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    async function addAuthCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0].length !== 43) {
            room.sendAnnouncement(
                `Ошибка. Нужно написать паблик айди`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const auth = args[0];

        if (!(await db.addAuth(auth))) {
            room.sendAnnouncement(
                `Этот паблик уже в списке`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            `${auth} был добавлен в список авторизированных игроков`,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    async function deleteAuthCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0].length !== 43) {
            room.sendAnnouncement(
                `Ошибка. Нужно написать паблик айди`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const auth = args[0];

        if (!(await db.removeAuth(auth))) {
            room.sendAnnouncement(
                `Этого паблика нет в списке`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            `${auth} был удалён из списка авторизированных игроков`,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    async function clearAuthsCommand(player) {
        await db.clearAuths();
        room.sendAnnouncement(
            `Список авторизированных игроков был очищен`,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    function joinAuthsCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'mode') {
            room.sendAnnouncement(
                `Сейчас вход только авторизированных игроков: ${state.joinAuths ? 'включён' : 'выключен'}`,
                player.id,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const value = args[0].toLowerCase();

        if (value === 'on' || value === 'true') {
            state.joinAuths = true;
            room.sendAnnouncement(
                `Вход только авторизированых игроков включён - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (value === 'off' || value === 'false') {
            state.joinAuths = false;
            room.sendAnnouncement(
                `Вход только авторизированых игроков выключен - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            `Ошибка. Такого варианта не существует: mode / on / off`,
            player.id,
            Color.GR_RED,
            'small',
            HaxNotification.CHAT
        );
    }

    function modeCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0].toLowerCase() === 'list') {
            const list = Object.keys(Mods)
                .map(k => k.toLowerCase())
                .join(', ');

            room.sendAnnouncement(
                `Список модов работы комнаты: ${list}.`,
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const modeKey = args[0].toUpperCase();

        if (!(modeKey in Mods)) {
            room.sendAnnouncement(
                `Некорректное название мода, "!mode list" - чтобы узнать список доступных модов комнаты`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (Mods[modeKey] === state.mode) {
            room.sendAnnouncement(
                `Этот мод уже стоит`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.mode = Mods[modeKey];

        if (state.mode === Mods.PUBLIC && state.training_mode) {
            stopTrainingMode();
        }

        room.sendAnnouncement(
            `Теперь мод комнаты: ${args[0].toLowerCase()}`,
            player.id,
            Color.WH_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    async function statsResetCommand(player) {
        const backup = await db.backupStats();

        await db.clearStats();

        if (backup.count > 0) {
            discordBot.sendStatsBackup(backup.filePath, backup.filename);
        }

        room.sendAnnouncement(
            `Статистика была сброшена (бекап: ${backup.filename}, записей: ${backup.count})`,
            null,
            Color.WH_GREEN,
            'small',
            HaxNotification.MENTION
        );
    }

    function matchPointCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                `Напишите число или "info"`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0].toLowerCase() === 'info') {
            room.sendAnnouncement(
                `Текущая игра (если идёт) до ${state.newMatchPoint} мячей.`,
                player.id,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const num = Number(args[0]);
        if (isNaN(num)) {
            room.sendAnnouncement(
                `Некорректное число`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.matchPoint = num;
        room.sendAnnouncement(
            `Теперь игра идёт до ${num} мячей! Изменения войдут в силу со следующей игры (если текущая идёт).`,
            player.id,
            Color.WH_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function teamSizeCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                `Напишите число`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const num = Number(args[0]);
        if (isNaN(num)) {
            room.sendAnnouncement(
                `Некорректное число`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.teamSize = num;
        room.sendAnnouncement(
            `Теперь режим игры ${num}x${num}! Изменения войдут в силу со следующей игры (если текущая идёт).`,
            player.id,
            Color.WH_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    async function setRoleCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length < 2) {
            const availableRoles = Object.keys(RoleString)
                .filter(role => role !== 'master')
                .join(' | ');

            room.sendAnnouncement(
                `Недостаточно аргументов: !setrole <#ID | AUTH> <${availableRoles}> [время]`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        let target = {};
        const targetArg = args[0];

        if (targetArg.length === 43) {
            target.auth = targetArg;
        }
        else {
            const id = parsePlayerId(targetArg);
            if (id === null) {
                room.sendAnnouncement(
                    `Игрока нет на сервере`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            const onlinePlayer = room.getPlayer(id);
            if (!onlinePlayer) {
                room.sendAnnouncement(
                    `Игрока нет на сервере`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            target = onlinePlayer;
            target.auth = getAuth(id);
        }

        if (target.id === player.id || target.auth === getAuth(player.id)) {
            room.sendAnnouncement(
                `Вы не можете менять роль себе!`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (!(await db.hasAccount(target.auth))) {
            room.sendAnnouncement(
                `Аккаунт игрока не найден`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const roleName = args[1];
        if (RoleString[roleName] === undefined) {
            room.sendAnnouncement(
                `Некоректная роль: ${Object.keys(RoleString)}`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (RoleString[roleName] === Role.MASTER) {
            room.sendAnnouncement(
                `Нельзя выдать мастера командой`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (await getRole(target, target.auth) === RoleString[roleName]) {
            room.sendAnnouncement(
                `У игрока и так эта роль`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const date = args.length >= 3 ? Date.now() + stringToTime(args[2]) : null;
        await setRole(target, roleName, date, target.auth);

        const timeStr = date == null ? '' : ` на ${getStringTime(args[2])}`;
        const displayName = target.name ?? target.auth;

        room.sendAnnouncement(
            `${displayName} теперь ${ROLE_NAMES[RoleString[roleName]]}${timeStr}!`,
            null,
            Color.RED,
            'bold',
            HaxNotification.CHAT
        );
    }

    async function getRoleListCommand(player, message) {
        const args = message.toLowerCase().split(/ +/).slice(1);

        if (args.length === 0) {
            const rolesHint = Object.keys(RoleString).join(' | ');
            room.sendAnnouncement(
                `Недостаточно аргументов: !list <${rolesHint}> [ID в списке] - чтобы посмотреть профиль игрока, необязательный аргумент`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const roleName = args[0];

        if (RoleString[roleName] === undefined) {
            room.sendAnnouncement(
                `Некоректная роль: ${Object.keys(RoleString)}`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const filtered = await db.getAccountsByRole(roleName);

        if (args.length === 1) {
            const list = filtered.map((acc, i) => `[${i}] ${acc.nickname}`);

            if (list.length === 0) {
                room.sendAnnouncement(
                    `${roleName.toUpperCase()} LIST: пусто.`,
                    player.id,
                    Color.GR_GREEN,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            let chunk = `${roleName.toUpperCase()} LIST:`;
            let count = 0;

            for (const item of list) {
                chunk += ` ${item},`;
                count++;

                if (count === 50) {
                    room.sendAnnouncement(
                        chunk.slice(0, -1) + '.',
                        player.id,
                        Color.GR_GREEN,
                        'small',
                        HaxNotification.NONE
                    );
                    chunk = '';
                    count = 0;
                }
            }

            if (chunk) {
                room.sendAnnouncement(
                    chunk.slice(0, -1) + '.',
                    player.id,
                    Color.GR_GREEN,
                    'small',
                    HaxNotification.CHAT
                );
            }
            return;
        }

        const index = Number(args[1]);

        if (isNaN(index) || index < 0 || index >= filtered.length) {
            room.sendAnnouncement(
                `Такого айди нет в списке`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const obj = filtered[index];

        room.sendAnnouncement(
            await formatAccountView(obj),
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    function winstayCommand(player, message) {
        const args = message.toLowerCase().split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'mode') {
            room.sendAnnouncement(
                `Сейчас режим winstay: ${state.winstay_mode ? 'включён' : 'выключен'}`,
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0] === 'on' || args[0] === 'true') {
            state.winstay_mode = true;
            state.winstay = {
                streak: 0,
                team: [],
            }
            state.teamSize = defaultTeamSize;

            room.sendAnnouncement(
                `Режим winstay включён - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            
            return;
        }

        if (args[0] === 'off' || args[0] === 'false') {
            state.winstay_mode = false;

            room.sendAnnouncement(
                `Режим winstay выключен - ${player.name}`,
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );

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

    function teamPickCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0].toLowerCase() === 'mode') {
            const current = Object.keys(TeamPickModeString).find(
                (k) => TeamPickModeString[k] === state.teamPickMode
            ) ?? 'random';

            room.sendAnnouncement(
                `Сейчас распределение команд: ${current}`,
                player.id,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0].toLowerCase() === 'list') {
            const list = Object.keys(TeamPickModeString).join(', ');
            room.sendAnnouncement(
                `Список режимов распределения команд: ${list}.`,
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const key = args[0].toLowerCase();

        if (!(key in TeamPickModeString)) {
            room.sendAnnouncement(
                `Некорректный режим. "!teampick list" — список доступных режимов`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (TeamPickModeString[key] === state.teamPickMode) {
            room.sendAnnouncement(
                `Этот режим уже стоит`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.teamPickMode = TeamPickModeString[key];

        room.sendAnnouncement(
            `Теперь распределение команд: ${key} — ${player.name}`,
            null,
            Color.WH_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    return {
        passwordCommand,
        addAuthCommand,
        deleteAuthCommand,
        clearAuthsCommand,
        joinAuthsCommand,
        modeCommand,
        statsResetCommand,
        matchPointCommand,
        teamSizeCommand,
        setRoleCommand,
        getRoleListCommand,
        winstayCommand,
        teamPickCommand
    };
};
module.exports = function createMasterCommands({
    room,
    state,
    fs,
    getAuth,
    getRole,
    setRole,
    stringToTime,
    getStringTime,
    getDate,
    Role,
    RoleString,
    Mods,
    Color,
    HaxNotification
}) {
    function loadJson(filename) {
        // TODO: migrate from fs to sqlite in the future
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    }

    function saveJson(filename, data) {
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync(filename, JSON.stringify(data));
    }

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

    function addAuthCommand(player, message) {
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
        const auths = loadJson('auths.json');

        if (auths.includes(auth)) {
            room.sendAnnouncement(
                `Этот паблик уже в списке`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        auths.push(auth);
        saveJson('auths.json', auths);

        room.sendAnnouncement(
            `${auth} был добавлен в список авторизированных игроков`,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    function deleteAuthCommand(player, message) {
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
        const auths = loadJson('auths.json');
        const index = auths.indexOf(auth);

        if (index === -1) {
            room.sendAnnouncement(
                `Этого паблика нет в списке`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        auths.splice(index, 1);
        saveJson('auths.json', auths);

        room.sendAnnouncement(
            `${auth} был удалён из списка авторизированных игроков`,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    function clearAuthsCommand(player) {
        saveJson('auths.json', []);
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
        room.sendAnnouncement(
            `Теперь мод комнаты: ${args[0].toLowerCase()}`,
            player.id,
            Color.WH_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function statsResetCommand() {
        saveJson('stats.json', {});
        room.sendAnnouncement(
            `Статистика была сброшена`,
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

    function setRoleCommand(player, message) {
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

        const accounts = loadJson('accounts.json');

        if (!(target.auth in accounts)) {
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

        if (getRole(target, target.auth) === RoleString[roleName]) {
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
        setRole(target, roleName, date, target.auth);

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

    function getRoleListCommand(player, message) {
        const args = message.toLowerCase().split(/ +/).slice(1);
        const accounts = loadJson('accounts.json');

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

        if (args.length === 1) {
            const list = Object.values(accounts)
                .filter(acc => acc.role === roleName)
                .map((acc, i) => `[${i}] ${acc.nickname}`);

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
        const filtered = Object.entries(accounts)
            .filter(([, acc]) => acc.role === roleName);

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

        const [publicId, obj] = filtered[index];
        const toDate = obj.date != null ? getDate(obj.date) : 'бессрочно';

        room.sendAnnouncement(
            `📋${obj.nickname}:\npublic_id: ${publicId}\nrole: ${obj.role}\nto_date: ${toDate}\ndiscord: ${obj.discord}`,
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
        winstayCommand
    };
};
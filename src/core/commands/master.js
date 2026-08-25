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
    formatAccountView,
    t
}) {
    function parsePlayerId(arg) {
        const idStr = arg.startsWith('#') ? arg.slice(1) : arg;
        const id = Number(idStr);
        return Number.isInteger(id) && id >= 0 ? id : null;
    }

    function roleDisplayName(roleValue) {
        const roleKey = Object.keys(RoleString).find(k => RoleString[k] === roleValue);
        return t(`role.names.${roleKey}`);
    }

    function passwordCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0 || args[0] === 'clear') {
            state.roomPassword = null;
            room.setPassword(null);
            room.sendAnnouncement(
                t('password.cleared', { admin: player.name }),
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
            t('password.set', { password: args[0], admin: player.name }),
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
                t('auth.needPublicId'),
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
                t('auth.alreadyInList'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            t('auth.added', { auth }),
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
                t('auth.needPublicId'),
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
                t('auth.notInList'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            t('auth.removed', { auth }),
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    async function clearAuthsCommand(player) {
        await db.clearAuths();
        room.sendAnnouncement(
            t('auth.cleared'),
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
                t('auth.joinModeStatus', { status: state.joinAuths ? t('auth.statusOn') : t('auth.statusOff') }),
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
                t('auth.joinModeOn', { admin: player.name }),
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
                t('auth.joinModeOff', { admin: player.name }),
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            t('auth.invalidOption'),
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
                t('mode.list', { list }),
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
                t('mode.invalidMode'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (Mods[modeKey] === state.mode) {
            room.sendAnnouncement(
                t('mode.alreadySet'),
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
            t('mode.changed', { mode: args[0].toLowerCase() }),
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
            t('statsReset.done', { filename: backup.filename, count: backup.count }),
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
                t('matchPoint.usage'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (args[0].toLowerCase() === 'info') {
            room.sendAnnouncement(
                t('matchPoint.info', { value: state.newMatchPoint }),
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
                t('matchPoint.invalidNumber'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.matchPoint = num;
        room.sendAnnouncement(
            t('matchPoint.changed', { value: num }),
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
                t('teamSize.usage'),
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
                t('teamSize.invalidNumber'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.teamSize = num;
        room.sendAnnouncement(
            t('teamSize.changed', { size: num }),
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
                t('common.notEnoughArgs', { usage: t('role.setRoleUsage', { roles: availableRoles }) }),
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
                    t('common.playerNotOnServer'),
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
                    t('common.playerNotOnServer'),
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
                t('role.cannotSetSelf'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (!(await db.hasAccount(target.auth))) {
            room.sendAnnouncement(
                t('role.accountNotFound'),
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
                t('role.noSuchRole', { roles: Object.keys(RoleString) }),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (RoleString[roleName] === Role.MASTER) {
            room.sendAnnouncement(
                t('role.cannotGrantMaster'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (await getRole(target, target.auth) === RoleString[roleName]) {
            room.sendAnnouncement(
                t('role.alreadyHasRole'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const date = args.length >= 3 ? Date.now() + stringToTime(args[2]) : null;
        await setRole(target, roleName, date, target.auth);

        const timeStr = date == null ? '' : t('role.updatedTimed', { timeStr: getStringTime(args[2]) });
        const displayName = target.name ?? target.auth;

        room.sendAnnouncement(
            t('role.updated', { displayName, roleName: roleDisplayName(RoleString[roleName]), timeStr }),
            null,
            Color.RED,
            'bold',
            HaxNotification.CHAT
        );

        if (target.id !== undefined) {
            const issuedRoleValue = RoleString[roleName];
            
            if (issuedRoleValue >= Role.PREADMIN) {
                room.setPlayerAdmin(target.id, true);
            } else {
                room.setPlayerAdmin(target.id, false);
            }
        }
    }

    async function getRoleListCommand(player, message) {
        const args = message.toLowerCase().split(/ +/).slice(1);

        if (args.length === 0) {
            const rolesHint = Object.keys(RoleString).join(' | ');
            room.sendAnnouncement(
                t('common.notEnoughArgs', { usage: t('role.list.usage', { roles: rolesHint }) }),
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
                t('role.noSuchRole', { roles: Object.keys(RoleString) }),
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
                    t('role.list.empty', { role: roleName.toUpperCase() }),
                    player.id,
                    Color.GR_GREEN,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            let chunk = t('role.list.header', { role: roleName.toUpperCase() });
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
                t('role.list.noSuchIndex'),
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
                t('winstay.status', { status: state.winstay_mode ? t('winstay.statusOn') : t('winstay.statusOff') }),
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
                t('winstay.enabled', { admin: player.name }),
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
                t('winstay.disabled', { admin: player.name }),
                null,
                Color.WH_GREEN,
                'small',
                HaxNotification.CHAT
            );

            return;
        }

        room.sendAnnouncement(
            t('winstay.invalidOption'),
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
                t('teamPick.status', { mode: current }),
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
                t('teamPick.list', { list }),
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
                t('teamPick.invalidMode'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (TeamPickModeString[key] === state.teamPickMode) {
            room.sendAnnouncement(
                t('teamPick.alreadySet'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        state.teamPickMode = TeamPickModeString[key];

        room.sendAnnouncement(
            t('teamPick.changed', { mode: key, admin: player.name }),
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
module.exports = function createAdminCommands({
    room,
    lastIds,
    muteArray,
    getAuth,
    getConn,
    getRole,
    getOnlyInt,
    stringToTime,
    getStringTime,
    MutePlayer,
    Role,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    db,
    discordBot
}) {
    function parsePlayerId(arg) {
        const idStr = arg.startsWith('#') ? arg.slice(1) : arg;
        const id = Number(idStr);
        return Number.isInteger(id) && id >= 0 ? id : null;
    }

    async function unBanCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length !== 1) {
            room.sendAnnouncement(
                `Неверное количество аргументов: !unban <ID | AUTH>`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const input = args[0];
        let ban = null;

        if (input.length === 43) {
            ban = await db.removeBanByAuth(input);
        } else {
            const id = parsePlayerId(input);
            if (id !== null) {
                ban = await db.removeBanByIndex(id);
            }
        }

        if (!ban) {
            room.sendAnnouncement(
                `Введенный вами идентификатор не связан с баном`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const target = ban.name ?? ban.auth;

        if (ban.id != null) {
            room.clearBan(ban.id);
        }

        room.sendAnnouncement(
            `${player.name} разбанил ${target}`,
            null,
            Color.RED,
            'bold',
            HaxNotification.NONE
        );
        discordBot.sendReport(player.name, target, 'unban', null, null);
    }

    async function banCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length < 2) {
            room.sendAnnouncement(
                `Неверное количество аргументов: !ban <#ID | AUTH> <time> [причина]`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const targetArg = args[0];
        const timeArg = args[1];
        const reason = args.slice(2).join(' ');

        let banId = null;
        let banAuth = null;
        let banConn = null;
        let banName = null;

        if (targetArg.length === 43) {
            banAuth = targetArg;

            if (lastIds[banAuth] != null) {
                banId = lastIds[banAuth][0];
                banConn = lastIds[banAuth][1];
            } else {
                const online = room.getPlayerList().find(p => getAuth(p.id) === banAuth);
                if (online) {
                    banId = online.id;
                    banConn = getConn(banId);
                    banName = online.name;
                }
            }

            if (
                banAuth === getAuth(player.id) ||
                (await getRole({}, banAuth) >= Role.PREADMIN && await getRole(player) !== Role.MASTER)
            ) {
                room.sendAnnouncement(
                    `Вы не можете забанить себя или у этого игрока защита от бана`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }
        }
        else {
            const id = parsePlayerId(targetArg);
            if (id === null) {
                room.sendAnnouncement(
                    `Введен неверный ID`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            banId = id;
            const banPlayer = room.getPlayer(banId);

            if (!banPlayer) {
                room.sendAnnouncement(
                    `Введен неверный ID`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            if (
                banId === player.id ||
                (await getRole(banPlayer) >= Role.PREADMIN && await getRole(player) !== Role.MASTER)
            ) {
                room.sendAnnouncement(
                    `Вы не можете забанить себя или у этого игрока защита от бана`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            banAuth = getAuth(banId);
            banConn = getConn(banId);
            banName = banPlayer.name ?? null;
        }

        const time = stringToTime(timeArg);
        if (time == null) {
            room.sendAnnouncement(
                `Нужно написать время в правильном формате (пример: 10min)`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (await getRole(player) === Role.PREADMIN && time > 30 * 60 * 1000) {
            room.sendAnnouncement(
                `У вашей роли ограничение на время бана: максимум 30min`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const banDate = Date.now() + time;
        await db.addBan({
            id: banId,
            auth: banAuth,
            conn: banConn,
            name: banName,
            date: banDate
        });

        const targetDisplay = banName ?? banAuth;
        const timeStr = getStringTime(timeArg);
        const reasonStr = reason ? ` по причине: ${reason}` : '';

        room.sendAnnouncement(
            `${player.name} забанил ${targetDisplay} на ${timeStr}${reasonStr}.`,
            null,
            Color.RED,
            'bold',
            HaxNotification.MENTION
        );

        discordBot.sendReport(
            player.name,
            targetDisplay,
            'ban',
            reason || null,
            timeStr
        );

        const onlinePlayer = banId != null ? room.getPlayer(banId) : null;
        if (onlinePlayer) {
            room.kickPlayer(
                onlinePlayer.id,
                `${player.name} забанил вас на ${timeStr}${reasonStr}\n discord: ${Discord}`,
                true
            );
        }
    }

    async function banListCommand(player) {
        const banList = await db.getBans();

        if (banList.length === 0) {
            room.sendAnnouncement(
                'Никого нет в бан-листе.',
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.NONE
            );
            return;
        }

        const lines = banList.map((ban, i) => {
            const name = ban.name ?? ban.auth;
            const mins = Math.round((ban.date - Date.now()) / 1000 / 60);
            return `${name} (${mins}мин) [${i}]`;
        });

        room.sendAnnouncement(
            `Бан-лист: ${lines.join(', ')}.`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );
    }

    async function muteCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length < 2) {
            room.sendAnnouncement(
                `Неверное количество аргументов: !mute <#ID> <время> [причина]`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const targetId = parsePlayerId(args[0]);
        if (targetId === null) {
            room.sendAnnouncement(
                `Неверный формат`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const target = room.getPlayer(targetId);
        if (!target) {
            room.sendAnnouncement(
                `Игрока с таким ID в руме нет`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const time = stringToTime(args[1]);
        if (time == null || time <= 0) {
            room.sendAnnouncement(
                `Нужно написать время в правильном формате (пример: 10min)`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (await getRole(player) === Role.PREADMIN && time > 60 * 60 * 1000) {
            room.sendAnnouncement(
                `У вашей роли ограничение на время мута: максимум 1h (1 час)`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (
            await getRole(target) >= Role.PREADMIN &&
            await getRole(player) !== Role.MASTER
        ) {
            room.sendAnnouncement(
                `У игрока защита от мута.`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const muteObj = new MutePlayer(
            target.name,
            target.id,
            getAuth(target.id)
        );
        muteObj.setDuration(time);

        const reason = args.slice(2).join(' ');
        const timeStr = getStringTime(args[1]);
        const reasonStr = reason ? ` по причине: ${reason}` : '';

        room.sendAnnouncement(
            `${player.name} замутил ${target.name} на ${timeStr}${reasonStr}.`,
            null,
            Color.RED,
            'bold',
            HaxNotification.MENTION
        );

        discordBot.sendReport(
            player.name,
            target.name,
            'mute',
            reason || null,
            timeStr
        );
    }

    async function unMuteCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                `Неверное количество аргументов: !unmute <#ID| ID(из мут списка)>`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const input = args[0];
        const possiblePlayerId = parsePlayerId(input);

        if (possiblePlayerId !== null) {
            const target = room.getPlayer(possiblePlayerId);

            if (target) {
                const muteObj = muteArray.getByPlayerId(target.id);
                if (muteObj) {
                    await muteArray.removeById(muteObj.id);
                    room.sendAnnouncement(
                        `${player.name} размутил ${target.name}!`,
                        null,
                        Color.RED,
                        'bold',
                        HaxNotification.CHAT
                    );
                    discordBot.sendReport(player.name, target.name, 'unmute', null, null);
                    return;
                }

                room.sendAnnouncement(
                    `Этот игрок не в муте!`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }
        }

        const muteId = getOnlyInt(input);
        if (muteId > 0) {
            const muteObj = muteArray.getById(muteId);
            if (muteObj) {
                await muteArray.removeById(muteId);
                room.sendAnnouncement(
                    `${player.name} размутил ${muteObj.name}!`,
                    null,
                    Color.RED,
                    'bold',
                    HaxNotification.CHAT
                );
                discordBot.sendReport(player.name, muteObj.name, 'unmute', null, null);
                return;
            }
        }

        room.sendAnnouncement(
            `Неверный формат`,
            player.id,
            Color.GR_RED,
            'small',
            HaxNotification.CHAT
        );
    }

    function muteListCommand(player) {
        if (muteArray.list.length === 0) {
            room.sendAnnouncement(
                'В мут-листе пусто.',
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.NONE
            );
            return;
        }

        const lines = muteArray.list.map(mute => {
            const mins = Math.round((mute.unmuteDate - Date.now()) / 1000 / 60);
            return `${mute.name} (${mins}мин)[${mute.id}]`;
        });

        room.sendAnnouncement(
            `Мут-лист: ${lines.join(', ')}.`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );
    }

    return {
        unBanCommand,
        banCommand,
        banListCommand,
        muteCommand,
        unMuteCommand,
        muteListCommand
    };
};
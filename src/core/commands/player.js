module.exports = function createPlayerCommands({
    room,
    state,
    db,
    getAuth,
    getRole,
    getTeamArray,
    sendAnnouncementTeam,
    getStatTime,
    updateTeams,
    updateTeamSize,
    getCommands,
    Role,
    Mods,
    Team,
    Color,
    ServeString,
    HaxNotification,
    Discord,
    Telegram,
    vipQueueRoles,
    Sits,
    getPickTeam,
    getCaptain,
    sendPickList,
    defaultTeamSize,
    discordBot,
    formatAccountView,
    resolveTargetAuth,
    t
}) {
    function parsePlayerId(arg) {
        const idStr = arg.startsWith('#') ? arg.slice(1) : arg;
        const id = Number(idStr);
        return Number.isInteger(id) && id >= 0 ? id : null;
    }

    function formatStats(stat) {
        const games = stat[1];
        const wins = stat[2];
        const goals = stat[3];
        const blocks = stat[4];
        const assists = stat[5];
        const blocked = stat[6];
        const errors = stat[7];
        const aces = stat[8];
        const serves = stat[9];
        const time = stat[10];

        const winRate = games > 0 ? +(wins / games * 100).toFixed(1) : 0;
        const pob = (goals + blocked) > 0 ? +(goals / (goals + blocked) * 100).toFixed(1) : 0;
        const errPerGame = games > 0 ? +(errors / games).toFixed(1) : 0;
        const aceRate = serves > 0 ? +(aces / serves * 100).toFixed(1) : 0;

        return t('stats.line', {
            name: stat[0],
            games,
            wins,
            winRate,
            goals,
            pob,
            goalsPlusBlocked: goals + blocked,
            blocks,
            assists,
            errors,
            errPerGame,
            serves,
            aces,
            aceRate,
            time: getStatTime(time)
        });
    }

    function teamChatCommand(player, message) {
        const text = message.split(/ +/).slice(1).join(' ');
        const emoji = player.team === 1 ? '🔴' : player.team === 2 ? '🔵' : '⚪';
        const color = player.team === 1
            ? Color.TEAM_RED
            : player.team === 2
            ? Color.TEAM_BLUE
            : null;

        sendAnnouncementTeam(
            t('chat.teamMessage', { emoji, name: player.name, message: text }),
            getTeamArray(player.team),
            color,
            'bold',
            HaxNotification.CHAT
        );
    }

    async function helpCommand(player) {
        const commands = getCommands();
        const role = await getRole(player);
        const available = Object.entries(commands)
            .filter(([, cmd]) => cmd.roles <= role)
            .map(([key]) => `!${key}`);

        room.sendAnnouncement(
            t('help.list', { list: available.join(', ') }),
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    async function admCommand(player) {
        player.auth = getAuth(player.id);
        const role = await getRole(player);
        const hasAdmin = room.getPlayerList().some(p => p.admin);

        if (state.mode === Mods.PRIVATE) {
            if (role >= Role.VIP || (role < Role.VIP && !hasAdmin)) {
                room.setPlayerAdmin(player.id, true);
            }
        } else if (role >= Role.PREADMIN) {
            room.setPlayerAdmin(player.id, true);
        }
    }

    function trySilentServe(player, serveType) {
        if (state.training_mode) {
            return { ok: false, reason: 'training_mode' };
        }

        if (player.team === Team.SPECTATORS) {
            return { ok: false, reason: 'not_on_field' };
        }

        if (
            getTeamArray(Team.BLUE).length < defaultTeamSize ||
            getTeamArray(Team.RED).length < defaultTeamSize
        ) {
            return { ok: false, reason: 'not_enough_players' };
        }

        if (state.lastTouches[0] !== undefined) {
            return { ok: false, reason: 'cannot_serve_now' };
        }

        if (state.serveBall) {
            return { ok: false, reason: 'someone_serving' };
        }

        if (player.team !== state.serve) {
            return { ok: false, reason: 'not_your_serve' };
        }

        const isBlue = player.team === Team.BLUE;
        state.serveType = serveType;

        setTimeout(() => {
            state.serveBall = true;
            room.setDiscProperties(0, {
                x: isBlue ? 410 : -410,
                y: 200,
                xspeed: isBlue ? -0.7 : 0.7,
                yspeed: -11.9
            });
        }, 300);

        return { ok: true };
    }

    function serveCommand(player, message) {
        const args = message.split(/ +/).slice(1);
        const typeArg = args[0]?.toLowerCase();
        const serveType = typeArg ? (ServeString[typeArg] ?? ServeString.POWER) : ServeString.POWER;

        const result = trySilentServe(player, serveType);

        if (result.ok) return;

        const messages = {
            training_mode: t('serve.useTrainingCommand'),
            not_on_field: t('serve.mustBeOnField'),
            not_enough_players: t('serve.notEnoughPlayers'),
            cannot_serve_now: t('serve.cannotServeNow'),
            someone_serving: t('serve.someoneServing'),
            not_your_serve: t('serve.notYourServe')
        };

        room.sendAnnouncement(
            messages[result.reason],
            player.id,
            Color.GR_RED,
            'small',
            HaxNotification.MENTION
        );
    }

    function bbCommand(player) {
        room.kickPlayer(player.id, t('bb.farewell'), false);
    }

    async function statsCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            const stat = await db.getStat(getAuth(player.id));
            if (!stat) {
                room.sendAnnouncement(
                    t('stats.selfEmpty'),
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }
            room.sendAnnouncement(
                formatStats(stat),
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const arg = args[0];

        if (!arg.startsWith('@')) {
            const id = parsePlayerId(arg);
            if (id === null) {
                room.sendAnnouncement(
                    t('stats.invalidArg'),
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            const target = room.getPlayer(id);
            if (!target) {
                room.sendAnnouncement(
                    t('stats.targetOffline'),
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            const stat = await db.getStat(getAuth(id));
            if (!stat) {
                room.sendAnnouncement(
                    t('stats.selfEmpty'),
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            room.sendAnnouncement(
                formatStats(stat),
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const pname = arg.slice(1).replace(/_/g, ' ').toLowerCase();
        const matches = await db.findStatsByName(pname);

        if (matches.length === 0) {
            room.sendAnnouncement(
                t('stats.nameNotFound'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (matches.length > 1 && (args[1] === undefined || isNaN(args[1]))) {
            const names = [];
            for (let i = 0; i < matches.length; i++) {
                const [auth] = matches[i];
                const nicks = await db.getNicknames(auth);
                names.push(t('stats.indexEntry', { index: i + 1, names: nicks.length > 0 ? nicks.join(', ') : auth }));
            }

            room.sendAnnouncement(
                t('stats.needIndex', { count: matches.length, names: names.join('\n') }),
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const index = matches.length === 1 ? 0 : Number(args[1]) - 1;
        const [, stat] = matches[index] ?? [];

        if (!stat) {
            room.sendAnnouncement(
                t('stats.notInStats'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            formatStats(stat),
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    async function renameCommand(player, message) {
        const args = message.split(/ +/).slice(1);
        const auth = getAuth(player.id);
        const newName = args.length === 0 ? player.name : args.join(' ');

        if (!(await db.setStatName(auth, newName))) {
            room.sendAnnouncement(
                t('rename.failed'),
                player.id,
                Color.GR_RED,
                'bold',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            t('rename.success', { name: newName }),
            player.id,
            Color.GR_GREEN,
            'bold',
            HaxNotification.CHAT
        );
    }

    const TOPS = {
        games: 1,
        wins: 2,
        goals: 3,
        blocks: 4,
        assists: 5,
        aces: 8,
        time: 10
    };

    async function topsCommand(player, message) {
        const args = message.split(/ +/).slice(1);
        const validTops = [...Object.keys(TOPS), 'all'];
        const top = args[0]?.toLowerCase();

        if (!top || !validTops.includes(top)) {
            room.sendAnnouncement(
                t('tops.invalidTop', { list: validTops.map(t2 => `"${t2}"`).join(', ') }),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        let len = 10;
        if (args.length >= 2) {
            len = Number(args[1]);
            if (isNaN(len) || len < 5 || len > 50) {
                room.sendAnnouncement(
                    t('tops.invalidLength'),
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }
        }

        const list = await db.getTopStats(5);

        if (list.length < len) {
            room.sendAnnouncement(
                t('tops.notEnoughPlayers', { missing: len - list.length }),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const buildTopLines = (statKey) => {
            const sorted = [...list].sort((a, b) => b[TOPS[statKey]] - a[TOPS[statKey]]);
            return sorted.slice(0, len).map((s, i) => {
                const value = statKey === 'time' ? getStatTime(s[TOPS[statKey]]) : s[TOPS[statKey]];
                return t('tops.entry', { index: i + 1, name: s[0], value });
            });
        };

        if (top === 'all') {
            for (const statKey of Object.keys(TOPS)) {
                room.sendAnnouncement(
                    t('tops.line', { statName: statKey, entries: buildTopLines(statKey).join(' ') }),
                    player.id,
                    Color.WH_BLUE,
                    'small',
                    HaxNotification.CHAT
                );
            }
            return;
        }

        room.sendAnnouncement(
            t('tops.line', { statName: top, entries: buildTopLines(top).join(' ') }),
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    function getAuthCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                t('getAuth.self', { name: player.name, auth: getAuth(player.id) }),
                player.id,
                Color.WH_BLUE,
                'small-italic',
                HaxNotification.CHAT
            );
            return;
        }

        const id = parsePlayerId(args[0]);
        if (id === null) {
            room.sendAnnouncement(
                t('getAuth.usage'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const target = room.getPlayer(id);
        if (!target) {
            room.sendAnnouncement(
                t('getAuth.notFound'),
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            t('getAuth.target', { name: target.name, auth: getAuth(target.id) }),
            player.id,
            Color.WH_BLUE,
            'small-italic',
            HaxNotification.CHAT
        );
    }

    async function queueCommand(player) {
        if (state.queue.length === 0) {
            room.sendAnnouncement(
                t('queue.empty'),
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const sorted = [...state.queue].sort((a, b) => b[1] - a[1]);
        const realQueue = sorted.filter(
            ([id]) => state.afkList.findIndex(p => p[0] === id) === -1
        );

        const vipQueue = [];
        for (const [id] of realQueue) {
            const p = room.getPlayer(id);
            if (p && vipQueueRoles.includes(await getRole(p))) {
                vipQueue.push([id, realQueue.find(q => q[0] === id)[1]]);
            }
        }

        let result = realQueue.length > 0
            ? t('queue.header', { list: realQueue.map(([id, missed]) => t('queue.entry', { name: room.getPlayer(id).name, missed })).join(', ') })
            : t('queue.empty');

        result += '\n' + (vipQueue.length > 0
            ? t('queue.vipHeader', { list: vipQueue.map(([id, missed]) => t('queue.entry', { name: room.getPlayer(id).name, missed })).join(', ') })
            : t('queue.vipEmpty'));

        room.sendAnnouncement(
            result,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    async function discordCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                t('discordLink.info', { discord: Discord }),
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const auth = getAuth(player.id);
        const account = await db.getAccount(auth);

        if (account && account.discord) {
            room.sendAnnouncement(
                t('discordLink.alreadyLinked'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const code = args[0];
        const result = await discordBot.confirmLink(code, auth);

        if (result.ok) {
            room.sendAnnouncement(
                t('discordLink.success'),
                player.id,
                Color.WH_GREEN,
                'bold',
                HaxNotification.CHAT
            );
            return;
        }

        const messages = {
            invalid: t('discordLink.invalidCode'),
            already_linked: t('discordLink.alreadyLinkedAccount'),
            already_linked_elsewhere: t('discordLink.alreadyLinkedElsewhere'),
            unknown_account: t('discordLink.unknownAccount'),
            unavailable: t('discordLink.unavailable')
        };

        room.sendAnnouncement(
            messages[result.reason] ?? t('discordLink.genericFail'),
            player.id,
            Color.GR_RED,
            'small',
            HaxNotification.CHAT
        );
    }

    async function discordUnlinkCommand(player, message) {
        const args = message.split(/ +/).slice(1);
        let targetAuth = getAuth(player.id);
        let targetLabel = player.name;

        if (args.length > 0) {
            const role = await getRole(player);
            if (role < Role.ADMIN) {
                room.sendAnnouncement(
                    t('discordLink.unlink.adminOnly'),
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            const arg = args[0];

            if (arg.length === 43) {
                targetAuth = arg;
                targetLabel = arg;
            } else {
                const idStr = arg.startsWith('#') ? arg.slice(1) : arg;
                const id = Number(idStr);

                if (!Number.isInteger(id) || id < 0) {
                    room.sendAnnouncement(
                        t('discordLink.unlink.usage'),
                        player.id,
                        Color.GR_RED,
                        'small',
                        HaxNotification.CHAT
                    );
                    return;
                }

                const target = room.getPlayer(id);
                if (!target) {
                    room.sendAnnouncement(
                        t('discordLink.unlink.targetNotFound'),
                        player.id,
                        Color.GR_RED,
                        'small',
                        HaxNotification.CHAT
                    );
                    return;
                }

                targetAuth = getAuth(target.id);
                targetLabel = target.name;
            }
        }

        const result = await discordBot.unlink(targetAuth);

        if (result.ok) {
            room.sendAnnouncement(
                t('discordLink.unlink.success', { target: targetLabel }),
                player.id,
                Color.WH_GREEN,
                'bold',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            t('discordLink.unlink.notLinked', { target: targetLabel }),
            player.id,
            Color.GR_RED,
            'small',
            HaxNotification.CHAT
        );
    }

    function telegramCommand(player) {
        room.sendAnnouncement(
            t('telegram.info', { telegram: Telegram }),
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    async function afkCommand(player) {
        const index = state.afkList.findIndex(p => p[0] === player.id);

        if (index !== -1) {
            state.afkList = state.afkList.filter(p => p[0] !== player.id);
            room.sendAnnouncement(
                t('afk.left', { name: player.name }),
                null,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        } else {
            if (player.team !== Team.SPECTATORS) {
                room.setPlayerTeam(player.id, Team.SPECTATORS);
            }
            state.afkList.push([player.id, player.name, Date.now()]);
            room.sendAnnouncement(
                t('afk.entered', { name: player.name }),
                null,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        }

        if (state.sit == Sits.CHOICE) {
            sendPickList(getCaptain(getPickTeam()));
        }

        await updateTeams();
        updateTeamSize();
    }

    function afkListCommand(player) {
        if (state.afkList.length === 0) {
            room.sendAnnouncement(
                t('afk.listEmpty'),
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const lines = state.afkList.map(
            ([, name, time]) => t('afk.listEntry', { name, mins: Math.ceil((Date.now() - time) / 1000 / 60) })
        );

        room.sendAnnouncement(
            t('afk.listHeader', { list: lines.join(', ') }),
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function idsCommand(player) {
        const lines = room.getPlayerList().map(p => t('ids.entry', { name: p.name, id: p.id }));
        room.sendAnnouncement(
            t('ids.header', { list: lines.join(', ') }),
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    async function deanonCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                t('deanon.usage'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const id = parsePlayerId(args[0]);
        if (id === null) {
            room.sendAnnouncement(
                t('deanon.notFound'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const target = room.getPlayer(id);
        if (!target) {
            room.sendAnnouncement(
                t('deanon.notFound'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const auth = getAuth(target.id);

        if (!(await db.hasNicknames(auth))) {
            room.sendAnnouncement(
                t('deanon.noNicknames'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const names = (await db.getNicknames(auth)).join(', ');
        room.sendAnnouncement(
            t('deanon.result', { name: target.name, names }),
            player.id,
            null,
            'small',
            HaxNotification.CHAT
        );
    }

    function myPointCommand(player) {
        if (player.team === Team.SPECTATORS || room.getScores() == null) {
            room.sendAnnouncement(
                t('myPoint.onlyInGame'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const prop = room.getPlayerDiscProperties(player.id);
        room.sendAnnouncement(
            t('myPoint.coords', { x: +prop.x.toFixed(2), y: +prop.y.toFixed(2) }),
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    async function accountCommand(player, message) {
        const args = message.split(/ +/).slice(1);
        const arg = args[0];

        if (arg) {
            const role = await getRole(player);
            if (role < Role.ADMIN) {
                room.sendAnnouncement(
                    t('account.adminOnly'),
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }
        }

        const resolved = resolveTargetAuth(player, arg);

        if (resolved.error) {
            room.sendAnnouncement(
                resolved.error,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const account = await db.getAccount(resolved.auth);

        if (!account) {
            room.sendAnnouncement(
                arg ? t('account.notFound') : t('account.notFoundOwn'),
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const view = await formatAccountView({ ...account, auth: resolved.auth });

        room.sendAnnouncement(
            view,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    return {
        teamChatCommand,
        helpCommand,
        admCommand,
        serveCommand,
        trySilentServe,
        bbCommand,
        statsCommand,
        renameCommand,
        topsCommand,
        getAuthCommand,
        queueCommand,
        discordCommand,
        discordUnlinkCommand,
        telegramCommand,
        afkCommand,
        afkListCommand,
        idsCommand,
        deanonCommand,
        myPointCommand,
        accountCommand
    };
};
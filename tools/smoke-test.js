/*
 * Usage: node tools/smoke-test.js
 */
const path = require('path');
const fs = require('fs');
const { createDb } = require('../db/sqlite');

let pass = 0;
let fail = 0;
function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok ? '' : `\n          got=${JSON.stringify(got)}\n         want=${JSON.stringify(want)}`));
    ok ? pass++ : fail++;
}

async function main() {
    console.log('--- utilities ---');
    {
        const {
            parseDuration,
            getRandomInt,
            getTimeGame
        } = require('../src/core/utils/utils');
        const { createLocale } = require('../src/core/locale');
        const { createTimeFormat } = require('../src/core/utils/timeFormat');
        const {
            parseSpawnValue,
            parseSpawnSettings,
            resolveSpawnValue,
            formatSpawnValue
        } = require('../src/core/utils/spawnRange');
        const createRoomUtils = require('../src/core/utils/roomUtils');
        const createSitState = require('../src/core/services/sitState');

        check('parseDuration hours', parseDuration('2h'), {
            amount: 2, unit: 'h', ms: 7_200_000
        });
        check('parseDuration plus sign', parseDuration('+30d').ms, 2_592_000_000);
        check('parseDuration invalid unit', parseDuration('10x'), null);
        check('parseDuration missing amount', parseDuration('h'), null);
        check('parseDuration compound value', parseDuration('1h30min'), null);
        check('parseDuration zero value', parseDuration('0h'), null);

        const russian = createLocale('ru');
        check('locale duration text', russian.getStringTime('2h'), '2ч');
        check('locale unknown fallback', createLocale('unknown').t('common.unknown'), russian.t('common.unknown'));

        const originalRandom = Math.random;
        try {
            Math.random = () => 0.999999;
            check('getRandomInt excludes max', getRandomInt(0, 5), 4);
        } finally {
            Math.random = originalRandom;
        }
            check('getTimeGame formats minutes and seconds', getTimeGame(125), '[02:05]');
            check('getTimeGame pads zero', getTimeGame(5), '[00:05]');

        check('parseSpawnValue range', parseSpawnValue('10..-5'), {
            isRange: true, min: -5, max: 10
        });
        check('parseSpawnSettings values', parseSpawnSettings(['1', '2..3']).map(p => p.isRange), [false, true]);
        check('resolveSpawnValue plain', resolveSpawnValue({ isRange: false, value: 4 }, () => 99), 4);
        check('formatSpawnValue range', formatSpawnValue({ isRange: true, min: -5, max: 10 }), '-5..10');

        const roomUtils = createRoomUtils({
            room: { getPlayerList: () => [] },
            state: { afkList: [] },
            lastIds: { auth1: [7, 'conn-7', 'auth-7'] },
            Team: { RED: 1, BLUE: 2 }
        });
        check('roomUtils auth lookup', roomUtils.getAuth(7), 'auth-7');
        check('roomUtils conn lookup', roomUtils.getConn(7), 'conn-7');
        check('roomUtils id lookup', roomUtils.getID('auth1'), 7);
        check('roomUtils missing lookup', roomUtils.getAuth(99), null);

            const teamPlayers = [
                { id: 1, team: 1 }, { id: 2, team: 2 },
                { id: 3, team: 0 }, { id: 4, team: 0 }
            ];
            const teamRoomUtils = createRoomUtils({
                room: { getPlayerList: () => teamPlayers },
                state: { afkList: [[4]] },
                lastIds: {},
                Team: { SPECTATORS: 0, RED: 1, BLUE: 2 }
            });
            check('roomUtils red team', teamRoomUtils.getTeamArray(1).map(p => p.id), [1]);
            check('roomUtils blue team', teamRoomUtils.getTeamArray(2).map(p => p.id), [2]);
            check('roomUtils active spectators', teamRoomUtils.getTeamArray(0).map(p => p.id), [3]);

            const updatesState = {
                afkList: [],
                mode: 0,
                teamSize: 2,
                training_mode: false
            };
            const createUpdatesUtils = require('../src/core/services/updates');
            const updates = createUpdatesUtils({
                room: { getPlayerList: () => [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }] },
                state: updatesState,
                getTeamArray: () => [],
                getAuth: () => null,
                getRole: async () => 0,
                getRandomInt: () => 0,
                Mods: { PUBLIC: 0 },
                Team: { SPECTATORS: 0, RED: 1, BLUE: 2 },
                Role: { VIP: 1 },
                Color: {},
                HaxNotification: {},
                defaultTeamSize: 2,
                upTeamSizePlayers: 8,
                queueMatches: 2,
                vipQueueRoles: [],
                maxPlayers: 14,
                vipSlots: 2,
                Sits: { NONE: 0, CHOICE: 1, RANDOMIZE: 2, TIMEOUT: 3, FORMING: 4, GAME: 5 },
                TeamPickMode: { CAPTAINS: 1 },
                getPickTeam: () => null,
                getCaptain: () => null,
                sendPickList: () => {},
                clearCaptainPickTimer: () => {},
                t: key => key
            });
            updates.updateTeamSize();
            check('updates increases team size at threshold', updatesState.teamSize, 3);

            const sitState = { sit: 0 };
            const sits = { NONE: 0, GAME: 1, RANDOMIZE: 2, CHOICE: 3, TIMEOUT: 4, FORMING: 5 };
            const sitController = createSitState({ state: sitState, Sits: sits });
            sitController.transitionTo(sits.FORMING);
            sitController.transitionTo(sits.CHOICE);
            sitController.transitionTo(sits.GAME);
            sitController.transitionTo(sits.TIMEOUT);
            sitController.transitionTo(sits.NONE);
            check('sit state valid route', sitState.sit, sits.NONE);
            check('sit state rejects invalid route', (() => {
                try {
                    sitController.transitionTo(sits.CHOICE);
                    return false;
                } catch {
                    return true;
                }
            })(), true);

            const tf = createTimeFormat('Europe/Moscow');
            check('timeFormat getDayKey format', /^\d{4}-\d{2}-\d{2}$/.test(tf.getDayKey(Date.UTC(2026, 0, 15, 12, 0, 0))), true);
            check('timeFormat getDayKey fixed date', tf.getDayKey(Date.UTC(2026, 0, 15, 20, 0, 0)), '2026-01-15');
            check('timeFormat getHour range', tf.getHour(Date.now()) >= 0 && tf.getHour(Date.now()) <= 23, true);
            check('timeFormat getParts has fields', Object.keys(tf.getParts(new Date())).sort(), ['day', 'hour', 'minute', 'month', 'second', 'year']);
            check('timeFormat exposes timeZone', tf.timeZone, 'Europe/Moscow');
    }

        console.log('\n--- isolated core services ---');
        {
            const { createTimeFormat } = require('../src/core/utils/timeFormat');
            const timeFormat = createTimeFormat('Europe/Moscow');

            const announcements = [];
            const createChatHelpers = require('../src/core/services/chat');
            const chat = createChatHelpers({
                room: { sendAnnouncement: (...args) => announcements.push(args) },
                getCommands: () => ({ help: { aliases: ['h'], roles: 0 } })
            });
            check('chat command name', chat.getCommand('help'), 'help');
            check('chat command alias', chat.getCommand('h'), 'help');
            check('chat unknown command', chat.getCommand('missing'), false);
            chat.sendAnnouncementTeam('hello', [{ id: 1 }, { id: 2 }], 3, 'bold', 4);
            check('chat team announcement count', announcements.length, 2);

            const createAccountsHelpers = require('../src/core/services/accounts');
            const accountHelpers = createAccountsHelpers({
                room: { getPlayer: id => id === 2 ? { id: 2 } : null },
                getAuth: id => `auth-${id}`,
                discordBot: { getUsername: async () => 'user' },
                getDate: value => `date-${value}`,
                t: key => key
            });
            check('account auth from caller', accountHelpers.resolveTargetAuth({ id: 1 }), { auth: 'auth-1' });
            check('account auth from public id', accountHelpers.resolveTargetAuth({ id: 1 }, 'a'.repeat(43)), { auth: 'a'.repeat(43) });
            check('account auth from player id', accountHelpers.resolveTargetAuth({ id: 1 }, '#2'), { auth: 'auth-2' });
            check('account invalid target', accountHelpers.resolveTargetAuth({ id: 1 }, 'bad'), { error: 'account.invalidFormat' });
            check('account offline target', accountHelpers.resolveTargetAuth({ id: 1 }, '3'), { error: 'account.playerOffline' });
            check('account view formatting', await accountHelpers.formatAccountView({
                auth: 'auth-1', nickname: 'Alice', role: 'vip', date: 123, discord: 'discord-1'
            }), 'account.view');

            const roleUpdates = [];
            const roleDb = {
                getAccount: async () => ({ role: 'vip', chat_color: 'ABCDEF' }),
                setRole: async (...args) => roleUpdates.push(args),
                expireRoles: async () => ['auth-1']
            };
            const roleHelpers = require('../src/core/utils/roles')({
                room: {
                    setPlayerAdmin: (...args) => roleUpdates.push(args),
                    sendAnnouncement: (...args) => roleUpdates.push(args)
                },
                db: roleDb,
                getAuth: () => 'auth-1',
                getID: () => 1,
                Role: { PLAYER: 0, VIP: 1, PREADMIN: 2 },
                RoleString: { player: 0, vip: 1, preadmin: 2 },
                Color: { WH_BLUE: 1 },
                HaxNotification: { MENTION: 2 },
                discordBot: { syncRole: auth => roleUpdates.push(['sync', auth]) },
                t: key => key
            });
            check('role lookup', await roleHelpers.getRole({ id: 1 }), 1);
            check('role color', await roleHelpers.getChatColor({ id: 1 }), '0xABCDEF');
            await roleHelpers.setRole({ id: 1 }, 'vip', 123);
            check('role update persisted', roleUpdates[0], ['auth-1', 'vip', 123]);
            await roleHelpers.checkRoles();
            check('role expiration sync', roleUpdates.some(value => value[0] === 'sync'), true);

            const captainPlayers = [
                { id: 1, team: 1, name: 'Captain' },
                { id: 2, team: 0, name: 'Alice' },
                { id: 3, team: 0, name: 'Bob' }
            ];
            const captainMoves = [];
            const createCaptainsHelpers = require('../src/core/services/captains');
            const captainHelpers = createCaptainsHelpers({
                room: {
                    getScores: () => null,
                    getPlayerList: () => captainPlayers,
                    setPlayerTeam: (...args) => captainMoves.push(args),
                    sendAnnouncement: () => {}
                },
                state: { teamSize: 2, game: null, captainAlertTimer: null, captainPickTimer: null },
                getTeamArray: team => captainPlayers.filter(player => player.team === team),
                Team: { SPECTATORS: 0, RED: 1, BLUE: 2 },
                Color: {},
                HaxNotification: {},
                t: key => key
            });
            check('captain pick team', captainHelpers.getPickTeam(), 2);
            check('captain lookup', captainHelpers.getCaptain(1).name, 'Captain');
            check('current captain', captainHelpers.isCurrentPickingCaptain(captainPlayers[0]), false);
            check('captain pick valid', captainHelpers.capPick(captainPlayers[0], 1, 1), true);
            check('captain pick moves player', captainMoves, [[2, 1]]);
            check('captain pick invalid', captainHelpers.capPick(captainPlayers[0], 1, 9), false);

            const trainingCalls = [];
            const createTrainingService = require('../src/core/services/training');
            const training = createTrainingService({
                room: {
                    getDiscProperties: () => ({ cGroup: 1 }),
                    setDiscProperties: (...args) => trainingCalls.push(args),
                    stopGame: () => trainingCalls.push(['stop']),
                    startGame: () => trainingCalls.push(['start']),
                    setCustomStadium: stadium => trainingCalls.push(['stadium', stadium])
                },
                state: { ball_color: 0, touches: 5, serveBall: false, training_mode_spawn: [], training_interval: null },
                volleyball_map: 'volleyball',
                noGoal_map: 'training',
                cf: { kick: 4 },
                Team: { RED: 1, BLUE: 2 },
                getRandomFloat: (min, max) => (min + max) / 2
            });
            training.ballSpawner([
                { isRange: true, min: 1, max: 3 },
                { isRange: false, value: 2 },
                { isRange: false, value: 0 },
                { isRange: false, value: -4 },
                1000
            ]);
            check('training spawn writes disc', trainingCalls.at(-1), [0, { x: 2, y: 2, xspeed: 0, yspeed: -4, color: 0xffffff }]);
            training.startTrainingMode();
            check('training mode starts game', trainingCalls.slice(-2), [['stadium', 'training'], ['start']]);

            const wrapEventHandlers = require('../src/core/safeEventHandlers');
            let handledError = false;
            const wrapped = wrapEventHandlers({
                sync: value => value + 1,
                asyncFailure: async () => { throw new Error('expected'); }
            });
            check('safe handler result', wrapped.sync(1), 2);
            const originalError = console.error;
            console.error = () => { handledError = true; };
            try {
                wrapped.asyncFailure();
                await new Promise(resolve => setImmediate(resolve));
            } finally {
                console.error = originalError;
            }
            check('safe handler catches async error', handledError, true);

            const enums = require('../src/core/models/enums');
            check('enum role ordering', enums.Role.MASTER > enums.Role.ADMIN, true);
            check('enum team values', [enums.Team.SPECTATORS, enums.Team.RED, enums.Team.BLUE], [0, 1, 2]);
            check('enum pick mode mapping', enums.TeamPickModeString.captains, enums.TeamPickMode.CAPTAINS);

            const createCommands = require('../src/core/commands/commands');
            const commandRegistry = createCommands({ Role: enums.Role });
            check('command registry aliases', commandRegistry.teampick.aliases.includes('tp'), true);
            check('command registry role', commandRegistry.up.roles, enums.Role.VIP);
            check('command registry entries', Object.values(commandRegistry).every(command =>
                Array.isArray(command.aliases) &&
                Number.isInteger(command.roles) &&
                (typeof command.function === 'undefined' || typeof command.function === 'function')
            ), true);

            const { DiscordBot } = require('../src/core/utils/discord');
            const discordBot = new DiscordBot({ db: {}, roomLabel: 'Test' });
            check('discord bridge unavailable', await discordBot.getUsername('id'), null);
            check('discord link unavailable', await discordBot.confirmLink('code', 'auth'), { ok: false, reason: 'unavailable' });

            const reports = require('../src/core/utils/reports');
            let recordingArgs = null;
            reports.fetchRecording({ rec: Uint8Array.from([72, 105]) }, {
                sendRecording: (...args) => { recordingArgs = args; }
            }, timeFormat);
            check('report recording encoding', recordingArgs[0], 'SGk=');
            check('report missing recording', reports.fetchRecording({ rec: null }, { sendRecording: () => { throw new Error('unexpected'); } }, timeFormat), undefined);
            check('report recording name uses timeFormat', typeof reports.getRecordingName(timeFormat), 'string');
            check('report replay id uses timeFormat', /^\d+$/.test(reports.getIdReplay(timeFormat)), true);

            const { createMockRoom, createMockDiscordBridge } = require('./test-mocks');
            const mockRoom = createMockRoom({
                players: [{ id: 1, name: 'Alice', team: 0, admin: false }],
                scores: { time: 10 }
            });
            const movement = require('../src/core/events/movement')({
                room: mockRoom,
                state: { afkList: [[1]], queue: [[1, 4]], inactivityTicks: {} },
                lastIds: {},
                db: {},
                getAuth: () => 'auth-1',
                getConn: () => 'conn-1',
                getRole: async () => 0,
                updateVipSlots: () => {},
                updateTeams: async () => {},
                updateTeamSize: () => {},
                stopTrainingMode: () => {},
                GhostKick: false,
                Role: { MASTER: 4 },
                Team: { SPECTATORS: 0, RED: 1, BLUE: 2 },
                Mods: { PUBLIC: 0 },
                Color: { GR_RED: 1 },
                HaxNotification: { MENTION: 2 },
                Discord: '',
                Telegram: '',
                maxPlayers: 14,
                discordBot: { sendLog: () => {} },
                Sits: { CHOICE: 1 },
                getPickTeam: () => null,
                getCaptain: () => null,
                sendPickList: () => {},
                t: key => key
            });
            movement.onPlayerTeamChange({ id: 1, name: 'Alice', team: 1 }, { id: 2 });
            check('movement returns AFK player to spectators', mockRoom.calls.at(-2).args, [1, 0]);

            const miscRoom = createMockRoom();
            const discordCalls = [];
            const misc = require('../src/core/events/misc')({
                room: miscRoom,
                getRole: async () => 0,
                roomName: 'Test room',
                state: { vipPassword: 123456 },
                discordBot: {
                    sendVipPassword: value => discordCalls.push(['password', value]),
                    sendLog: value => discordCalls.push(['log', value])
                },
                timeFormat,
                t: key => key
            });
            misc.onRoomLink('https://room.test');
            misc.onRoomLink('https://room.test/second');
            check('misc stores room link', miscRoom.calls.length, 0);
            check('misc sends room online notifications once', discordCalls.length, 2);

            const bridge = createMockDiscordBridge({
                consumeLinkCode: { ok: true },
                getDiscordUsername: 'alice'
            });
            global.window = { __discord: bridge };
            try {
                const bridgedBot = new DiscordBot({ db: {}, roomLabel: 'Test' });
                check('discord bridge result', await bridgedBot.confirmLink('CODE', 'auth'), { ok: true });
                check('discord bridge username', await bridgedBot.getUsername('discord'), 'alice');
                check('discord bridge calls', bridge.calls.map(call => call.method), ['consumeLinkCode', 'getDiscordUsername']);
            } finally {
                delete global.window;
            }
        }

    console.log('--- accounts ---');
    {
        const db = createDb(':memory:');

        db.ensureAccount('auth1', 'Alice');
        check('ensureAccount creates', db.getAccount('auth1'), {
            nickname: 'Alice', role: 'player', date: null, discord: null, chat_color: null
        });

        db.ensureAccount('auth1', 'Alicia');
        check('ensureAccount updates nickname', db.getAccount('auth1').nickname, 'Alicia');

        db.setRole('auth1', 'admin', null);
        check('setRole', db.getAccount('auth1').role, 'admin');

        db.setChatColor('auth1', 'FF0000');
        check('setChatColor', db.getAccount('auth1').chat_color, 'FF0000');

        db.setChatColor('auth1', null);
        check('clear chatColor', db.getAccount('auth1').chat_color, null);

        db.setRole('auth1', 'vip', Date.now() - 1000);
        const expired = db.expireRoles();
        check('expireRoles returns auth', expired, ['auth1']);
        check('expireRoles sets player', db.getAccount('auth1').role, 'player');
        check('expireRoles clears date', db.getAccount('auth1').date, null);

        check('hasAccount true', db.hasAccount('auth1'), true);
        check('hasAccount false', db.hasAccount('missing'), false);

        db.ensureAccount('auth2', 'Bob');
        db.setRole('auth2', 'vip', null);
        const byRole = db.getAccountsByRole('vip');
        check('getAccountsByRole', byRole.map(a => a.auth), ['auth2']);

        check('addMaster', db.addMaster('auth1'), true);
        check('addMaster role', db.getAccount('auth1').role, 'master');

        db.close();
    }

    console.log('\n--- bans ---');
    {
        const db = createDb(':memory:');
        const future = Date.now() + 60_000;

        db.addBan({ id: 1, auth: 'a', conn: 'x', name: 'A', date: future });
        db.addBan({ id: 2, auth: 'b', conn: 'y', name: 'B', date: future });
        check('getBans order', db.getBans().map(b => b.auth), ['a', 'b']);

        const removed = db.removeBanByIndex(0);
        check('removeBanByIndex returns ban', removed.auth, 'a');
        check('removeBanByIndex left', db.getBans().map(b => b.auth), ['b']);

        db.addBan({ id: 3, auth: 'c', conn: 'z', name: 'C', date: future });
        const byAuth = db.removeBanByAuth('b');
        check('removeBanByAuth', byAuth.auth, 'b');
        check('after removeBanByAuth', db.getBans().map(b => b.auth), ['c']);

        const found = db.findBan('c', 'other');
        check('findBan by auth', found.auth, 'c');

        db.updateBan(found.rowid, { id: 99, auth: 'c', conn: 'newconn', name: 'C2' });
        check('updateBan', db.getBans()[0].name, 'C2');

        db.addBan({ id: 10, auth: 'exp', conn: null, name: 'Exp', date: Date.now() - 1000 });
        const expiredBans = db.getExpiredBans();
        check('getExpiredBans', expiredBans.map(b => b.auth), ['exp']);
        db.removeExpiredBans();
        check('removeExpiredBans', db.getBans().map(b => b.auth), ['c']);

        db.close();
    }

    console.log('\n--- auths ---');
    {
        const db = createDb(':memory:');

        check('addAuth', db.addAuth('a'), true);
        check('addAuth duplicate', db.addAuth('a'), false);
        check('hasAuth', db.hasAuth('a'), true);
        db.addAuth('b');
        check('removeAuth', db.removeAuth('a'), true);
        check('after remove', db.hasAuth('a'), false);
        db.clearAuths();
        check('clearAuths', db.hasAuth('b'), false);

        db.close();
    }

    console.log('\n--- stats ---');
    {
        const db = createDb(':memory:');

        db.ensureStat('auth1', 'Alice');
        check('ensureStat', db.getStat('auth1'), ['Alice', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

        db.incrementStat('auth1', 1);
        db.incrementStat('auth1', 3);
        db.incrementStat('auth1', 3);
        check('incrementStat games+goals', db.getStat('auth1').slice(1, 4), [1, 0, 2]);

        db.setStatName('auth1', 'Alicia');
        check('setStatName', db.getStat('auth1')[0], 'Alicia');

        db.ensureStat('auth2', 'Bob');
        for (let i = 0; i < 5; i++) db.incrementStat('auth2', 1);
        db.incrementStat('auth2', 2);
        const top = db.getTopStats(5);
        check('getTopStats filters minGames', top.length, 1);
        check('getTopStats name', top[0][0], 'Bob');

        const found = db.findStatsByName('alicia');
        check('findStatsByName', found.length, 1);
        check('findStatsByName auth', found[0][0], 'auth1');

        db.setStatName('auth1', null);
        check('findStatsByName null-safe', db.findStatsByName('alicia').length, 0);
        db.setStatName('auth1', 'Alicia');

        const backup = db.backupAndClearStats();
        check('backupAndClearStats count', backup.count, 2);
        check('backupAndClearStats clears', db.getAllStats().length, 0);
        fs.unlinkSync(backup.filePath);

        db.clearStats();
        check('clearStats', db.getStat('auth1'), null);

        db.close();
    }

    console.log('\n--- nicknames ---');
    {
        const db = createDb(':memory:');

        db.addNickname('auth1', 'Alice');
        db.addNickname('auth1', 'Alicia');
        db.addNickname('auth1', 'Alice');
        check('addNickname order unique', db.getNicknames('auth1'), ['Alice', 'Alicia']);
        check('hasNicknames', db.hasNicknames('auth1'), true);
        check('hasNicknames false', db.hasNicknames('missing'), false);

        db.close();
    }

    console.log('\n--- mutes ---');
    {
        const db = createDb(':memory:');

        db.addMute({ id: 1, name: 'A', playerId: 5, auth: 'a', unmuteDate: 123 });
        check('getMutes', db.getMutes().length, 1);
        check('getMuteById', db.getMuteById(1).name, 'A');
        check('getMuteByPlayerId', db.getMuteByPlayerId(5).auth, 'a');
        check('getMuteByAuth', db.getMuteByAuth('a').id, 1);

        db.removeMuteById(1);
        check('removeMuteById', db.getMutes().length, 0);

        db.addMute({ id: 2, name: 'B', playerId: 6, auth: 'b', unmuteDate: 456 });
        db.removeMuteByAuth('b');
        check('removeMuteByAuth', db.getMutes().length, 0);

        db.close();
    }

    console.log('\n--- analytics ---');
    {
        const db = createDb(':memory:');
        const { createTimeFormat } = require('../src/core/utils/timeFormat');
        const timeFormat = createTimeFormat('Europe/Moscow');
        const { getDayKey } = timeFormat;

        const dayKey = getDayKey();
        const ts = Date.now();

        db.analyticsTouchPlayer({ auth: 'p1', nick: 'Alice', ts, dayKey });
        db.analyticsStartSession({
            sessionId: 'sess1', auth: 'p1', nick: 'Alice', joinedAt: ts, dayKey,
            roomType: 'public', roomCategory: 'public'
        });
        db.analyticsAddEvent({
            eventId: 'evt1', ts, dayKey, eventType: 'player_join',
            roomType: 'public', roomCategory: 'public', auth: 'p1', sessionId: 'sess1'
        });

        db.analyticsTouchPlayer({ auth: 'p2', nick: 'Bob', ts, dayKey });
        db.analyticsStartSession({
            sessionId: 'sess2', auth: 'p2', nick: 'Bob', joinedAt: ts, dayKey,
            roomType: 'public-2', roomCategory: 'public'
        });
        db.analyticsAddEvent({
            eventId: 'evt2', ts, dayKey, eventType: 'player_join',
            roomType: 'public-2', roomCategory: 'public', auth: 'p2', sessionId: 'sess2'
        });

        db.analyticsEndSession({ sessionId: 'sess1', leftAt: ts + 60_000, dayKey, leaveReason: 'leave' });

        db.analyticsTouchPlayer({ auth: 'p3', nick: 'Carl', ts, dayKey });
        db.analyticsStartSession({
            sessionId: 'sess3', auth: 'p3', nick: 'Carl', joinedAt: ts, dayKey,
            roomType: 'private', roomCategory: 'private'
        });
        db.analyticsAddEvent({
            eventId: 'evt3', ts, dayKey, eventType: 'player_join',
            roomType: 'private', roomCategory: 'private', auth: 'p3', sessionId: 'sess3'
        });

        db.analyticsStartMatch({
            matchId: 'match1', startedAt: ts, dayKey, roomType: 'public', roomCategory: 'public',
            playersStart: 4, isFull: true
        });
        db.analyticsEndMatch({ matchId: 'match1', endedAt: ts + 120000, dayKey, playersEnd: 4, winnerTeam: 1, endReason: 'finished' });

        db.analyticsStartMatch({
            matchId: 'match2', startedAt: ts, dayKey, roomType: 'public-2', roomCategory: 'public',
            playersStart: 2, isFull: false
        });
        db.analyticsEndMatch({ matchId: 'match2', endedAt: ts + 60000, dayKey, playersEnd: 2, winnerTeam: null, endReason: 'stopped' });

        db.analyticsUpsertOnlineMinute({
            minuteTs: Math.floor(ts / 60000) * 60000, dayKey, roomType: 'public', roomCategory: 'public', onlineCount: 3
        });
        db.analyticsUpsertOnlineMinute({
            minuteTs: Math.floor(ts / 60000) * 60000, dayKey, roomType: 'public-2', roomCategory: 'public', onlineCount: 2
        });

        db.analyticsAggregateDaily(dayKey, 'public');
        db.analyticsAggregateDaily(dayKey, 'private');

        const publicReport = db.analyticsGetDaily(dayKey, 'public');
        const privateReport = db.analyticsGetDaily(dayKey, 'private');

        check('analytics public joins summed across room_type', publicReport.joinsTotal, 2);
        check('analytics public joins unique', publicReport.joinsUnique, 2);
        check('analytics public new players', publicReport.newPlayers, 2);
        check('analytics public matches total summed across room_type', publicReport.matchesTotal, 2);
        check('analytics public matches full (is_full flag)', publicReport.matchesFull, 1);
        check('analytics public online peak summed across rooms', publicReport.onlinePeak, 5);
        check('analytics private isolated from public', privateReport.joinsTotal, 1);
        check('analytics private online peak zero (no online rows)', privateReport.onlinePeak, 0);
        check('analytics private matches total zero (no matches)', privateReport.matchesTotal, 0);
        check('analytics report not sent initially (public)', db.analyticsIsDailyReportSent(dayKey, 'public'), false);
        check('analytics report not sent initially (private)', db.analyticsIsDailyReportSent(dayKey, 'private'), false);
        db.analyticsMarkDailyReportSent(dayKey, 'public');
        check('analytics report sent flag scoped to public only', db.analyticsIsDailyReportSent(dayKey, 'public'), true);
        check('analytics report sent flag does not leak to private', db.analyticsIsDailyReportSent(dayKey, 'private'), false);

        db.analyticsStartSession({
            sessionId: 'dangling1', auth: 'p1', nick: 'Alice', joinedAt: ts - 5000, dayKey,
            roomType: 'public', roomCategory: 'public'
        });
        const closedCount = db.analyticsCloseDanglingSessions({ roomType: 'public', closedAt: ts, dayKey });
        check('analytics closes dangling sessions for room_type', closedCount, 1);

        const secondClose = db.analyticsCloseDanglingSessions({ roomType: 'public', closedAt: ts + 1000, dayKey });
        check('analytics dangling session already closed, no double-close', secondClose, 0);

        db.close();
    }

    console.log('\n--- models.js MuteList ---');
    {
        const db = createDb(':memory:');

        const room = { sendAnnouncement: () => {} };
        const Color = { WH_BLUE: 1, GR_GREEN: 2 };
        const HaxNotification = { CHAT: 1 };
        const t = (key) => key;
        const createModels = require(path.join(__dirname, '..', 'src', 'core', 'models', 'models'));
        const { MuteList, createMutePlayer } = createModels({ room, db, Color, HaxNotification, t });

        const muteArray = new MuteList();
        const MutePlayer = createMutePlayer(muteArray, room, Color, HaxNotification, t);

        const mute = new MutePlayer('Alice', 1, 'auth1');
        mute.setDuration(60000);
        check('mute persisted', db.getMutes().length, 1);
        check('mute findable by auth', muteArray.getByAuth('auth1').name, 'Alice');

        mute.remove();
        check('unmute persisted', db.getMutes().length, 0);

        db.close();
    }

    {
        const db = createDb(':memory:');
        db.ensureAccount('auth1', 'Alice');

        const discordBot = {
            syncRole: () => {}
        };

        const room = { setPlayerAdmin: () => {}, sendAnnouncement: () => {} };
        const Role = { PLAYER: 0, VIP: 1, PREADMIN: 2, ADMIN: 3, MASTER: 4 };
        const RoleString = { player: Role.PLAYER, vip: Role.VIP, preadmin: Role.PREADMIN, admin: Role.ADMIN, master: Role.MASTER };
        const Color = { WH_BLUE: 1 };
        const HaxNotification = { MENTION: 1 };
        const createRoleHelpers = require(path.join(__dirname, '..', 'src', 'core', 'utils', 'roles'));
        const { setRole, getRole } = createRoleHelpers({
            room, db, getAuth: () => 'auth1', getID: () => 1, Role, RoleString, Color, HaxNotification, discordBot
        });

        const player = { id: 1, auth: 'auth1' };
        check('starts as player', await getRole(player, 'auth1'), Role.PLAYER);

        await setRole(player, 'admin', null, 'auth1');
        check('role change visible', await getRole(player, 'auth1'), Role.ADMIN);
        const account = await db.getAccount('auth1');
        check('role durable', account.role, 'admin');

        db.close();
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
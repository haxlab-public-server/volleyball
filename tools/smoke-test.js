/*
 * Usage: node tools/smoke-test.js
 */
const path = require('path');
const { createDb } = require('../db/sqlite');

let pass = 0;
let fail = 0;
function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok ? '' : `\n          got=${JSON.stringify(got)}\n         want=${JSON.stringify(want)}`));
    ok ? pass++ : fail++;
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
    const expired = db.getExpiredBans();
    check('getExpiredBans', expired.map(b => b.auth), ['exp']);
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

console.log('\n--- models.js MuteList ---');
{
    const db = createDb(':memory:');

    const room = { sendAnnouncement: () => {} };
    const Color = { WH_BLUE: 1, GR_GREEN: 2 };
    const HaxNotification = { CHAT: 1 };
    const createModels = require(path.join(__dirname, '..', 'src', 'core', 'models', 'models'));
    const { MuteList, createMutePlayer } = createModels({ room, db, Color, HaxNotification });

    const muteArray = new MuteList();
    const MutePlayer = createMutePlayer(muteArray, room, Color, HaxNotification);

    const mute = new MutePlayer('Alice', 1, 'auth1');
    mute.setDuration(60000);
    check('mute persisted', db.getMutes().length, 1);
    check('mute findable by auth', muteArray.getByAuth('auth1').name, 'Alice');

    mute.remove();
    check('unmute persisted', db.getMutes().length, 0);

    db.close();
}

console.log('\n--- utils/roles.js ---');
{
    const db = createDb(':memory:');
    db.ensureAccount('auth1', 'Alice');

    const room = { setPlayerAdmin: () => {}, sendAnnouncement: () => {} };
    const Role = { PLAYER: 0, VIP: 1, PREADMIN: 2, ADMIN: 3, MASTER: 4 };
    const RoleString = { player: Role.PLAYER, vip: Role.VIP, preadmin: Role.PREADMIN, admin: Role.ADMIN, master: Role.MASTER };
    const Color = { WH_BLUE: 1 };
    const HaxNotification = { MENTION: 1 };
    const createRoleHelpers = require(path.join(__dirname, '..', 'src', 'core', 'utils', 'roles'));
    const { setRole, getRole } = createRoleHelpers({
        room, db, getAuth: () => 'auth1', getID: () => 1, Role, RoleString, Color, HaxNotification
    });

    const player = { id: 1, auth: 'auth1' };
    check('starts as player', getRole(player, 'auth1'), Role.PLAYER);

    setRole(player, 'admin', null, 'auth1');
    check('role change visible', getRole(player, 'auth1'), Role.ADMIN);
    check('role durable', db.getAccount('auth1').role, 'admin');

    db.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
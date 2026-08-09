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

function createFsBridge(db) {
    return {
        readFileSync(filePath) {
            return db.readFile(filePath) ?? '{}';
        },
        writeFileSync(filePath, data) {
            db.writeFile(filePath, data);
        },
        existsSync(filePath) {
            return db.exists(filePath);
        },
    };
}

console.log('--- db/sqlite.js: round-trips every known file shape ---');
{
    const db = createDb(':memory:');
    const fs = createFsBridge(db);

    fs.writeFileSync('accounts.json', JSON.stringify({
        auth1: { nickname: 'Alice', role: 'player', date: null, discord: null, chat_color: null }
    }));
    check('accounts round-trip', JSON.parse(fs.readFileSync('accounts.json')), {
        auth1: { nickname: 'Alice', role: 'player', date: null, discord: null, chat_color: null }
    });

    fs.writeFileSync('stats.json', JSON.stringify({ auth1: ['Alice', 1, 1, 2, 0, 1, 0, 0, 0, 0, 100] }));
    check('stats round-trip preserves array order', JSON.parse(fs.readFileSync('stats.json')).auth1, ['Alice', 1, 1, 2, 0, 1, 0, 0, 0, 0, 100]);

    fs.writeFileSync('bans.json', JSON.stringify([
        { id: 1, auth: 'a', conn: 'x', name: 'A', date: 999 },
        { id: 2, auth: 'b', conn: 'y', name: 'B', date: 888 }
    ]));
    const bans = JSON.parse(fs.readFileSync('bans.json'));
    check('bans keep insertion order (index-based !unban relies on this)', bans.map(b => b.auth), ['a', 'b']);

    fs.writeFileSync('bans.json', JSON.stringify(bans.filter((_, i) => i !== 0)));
    check('bans deletion by index leaves the right entry', JSON.parse(fs.readFileSync('bans.json')).map(b => b.auth), ['b']);

    fs.writeFileSync('nicknames.json', JSON.stringify({ auth1: ['Alice'] }));
    const deanon = JSON.parse(fs.readFileSync('nicknames.json'));
    deanon.auth1.push('Alicia');
    fs.writeFileSync('nicknames.json', JSON.stringify(deanon));
    check('nicknames append preserves history order', JSON.parse(fs.readFileSync('nicknames.json')).auth1, ['Alice', 'Alicia']);

    fs.writeFileSync('auths.json', JSON.stringify(['a', 'b']));
    check('auths round-trip', JSON.parse(fs.readFileSync('auths.json')), ['a', 'b']);

    fs.writeFileSync('mutes.json', JSON.stringify([{ id: 1, name: 'A', playerId: 5, auth: 'a', unmuteDate: 123 }]));
    check('mutes round-trip', JSON.parse(fs.readFileSync('mutes.json')), [{ id: 1, name: 'A', playerId: 5, auth: 'a', unmuteDate: 123 }]);

    check('unknown file does not exist', fs.existsSync('whatever.json'), false);
    check('known file exists even when empty', fs.existsSync('accounts.json'), true);

    db.close();
}

console.log('\n--- models.js MuteList: mutes/unmutes go through the sqlite-backed fs ---');
{
    const db = createDb(':memory:');
    const fs = createFsBridge(db);
    fs.writeFileSync('mutes.json', '[]');

    const room = { sendAnnouncement: () => {} };
    const Color = { WH_BLUE: 1, GR_GREEN: 2 };
    const HaxNotification = { CHAT: 1 };
    const createModels = require(path.join(__dirname, '..', 'src', 'core', 'models', 'models'));
    const { MuteList, createMutePlayer } = createModels({ room, fs, Color, HaxNotification });

    const muteArray = new MuteList();
    const MutePlayer = createMutePlayer(muteArray, room, Color, HaxNotification);

    const mute = new MutePlayer('Alice', 1, 'auth1');
    mute.setDuration(60000);
    check('mute persisted to sqlite', JSON.parse(fs.readFileSync('mutes.json')).length, 1);
    check('mute is findable by auth', muteArray.getByAuth('auth1').name, 'Alice');

    mute.remove();
    check('unmute persisted to sqlite', JSON.parse(fs.readFileSync('mutes.json')).length, 0);

    db.close();
}

console.log('\n--- utils/roles.js: role changes persist through the sqlite-backed fs ---');
{
    const db = createDb(':memory:');
    const fs = createFsBridge(db);
    fs.writeFileSync('accounts.json', JSON.stringify({
        auth1: { nickname: 'Alice', role: 'player', date: null, discord: null, chat_color: null }
    }));

    const room = { setPlayerAdmin: () => {}, sendAnnouncement: () => {} };
    const Role = { PLAYER: 0, VIP: 1, PREADMIN: 2, ADMIN: 3, MASTER: 4 };
    const RoleString = { player: Role.PLAYER, vip: Role.VIP, preadmin: Role.PREADMIN, admin: Role.ADMIN, master: Role.MASTER };
    const Color = { WH_BLUE: 1 };
    const HaxNotification = { MENTION: 1 };
    const createRoleHelpers = require(path.join(__dirname, '..', 'src', 'core', 'utils', 'roles'));
    const { setRole, getRole } = createRoleHelpers({
        room, fs, getAuth: () => 'auth1', getID: () => 1, Role, RoleString, Color, HaxNotification
    });

    const player = { id: 1, auth: 'auth1' };
    check('starts as player', getRole(player, 'auth1'), Role.PLAYER);

    setRole(player, 'admin', null, 'auth1');
    check('role change is visible to a fresh read', getRole(player, 'auth1'), Role.ADMIN);
    check('role change is durable across a new fs bridge instance', (() => {
        const otherFs = createFsBridge(db);
        return JSON.parse(otherFs.readFileSync('accounts.json')).auth1.role;
    })(), 'admin');

    db.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

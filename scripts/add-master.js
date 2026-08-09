const path = require('node:path');

const { createDb } = require('../db/sqlite');

const auth = process.argv[2];
if (!auth) {
    console.log('Usage: node scripts/add-master.js <auth>');
    process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const db = createDb(path.join(projectRoot, 'db', 'volleyball.sqlite'));

db.addMaster(auth);
console.log(`"${auth}" is now a master. Restart the bot for it to take effect.`)
db.close();
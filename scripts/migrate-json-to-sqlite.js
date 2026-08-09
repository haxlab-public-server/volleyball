const path = require('node:path');
const fs = require('node:fs');

const { createDb } = require('../db/sqlite');

const sourceDir = process.argv[2] ?? path.join(__dirname, '..', 'jsons');
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.join(projectRoot, 'db', 'volleyball.sqlite');

const FILES = ['accounts.json', 'bans.json', 'mutes.json', 'nicknames.json', 'auths.json', 'stats.json'];

const db = createDb(dbPath);

for (const filename of FILES) {
    const filePath = path.join(sourceDir, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`skip ${filename}: not found in ${sourceDir}`);
        continue;
    }

    const data = fs.readFileSync(filePath, 'utf8');
    db.writeFile(filename, data);
    console.log(`migrated ${filename}`);
}

db.close();

module.exports = function createAccountsHelpers({
    room,
    db,
    getAuth,
    discordBot,
    getDate
}) {

async function formatDiscordField(discordId) {
    if (!discordId) return 'не привязан';

    const username = await discordBot.getUsername(discordId);
    return username != null ? `${username} (${discordId})` : `unknown (${discordId})`;
}

async function formatAccountView(obj) {
    const toDate = obj.date != null ? getDate(obj.date) : 'бессрочно';
    const discordField = await formatDiscordField(obj.discord);

    return `📋${obj.nickname}:\npublic_id: ${obj.auth}\nроль: ${obj.role}\nдо: ${toDate}\ndiscord: ${discordField}`;
}

function resolveTargetAuth(caller, arg) {
    if (!arg) {
        return { auth: getAuth(caller.id) };
    }

    if (arg.length === 43) {
        return { auth: arg };
    }

    const idStr = arg.startsWith('#') ? arg.slice(1) : arg;
    const id = Number(idStr);

    if (!Number.isInteger(id) || id < 0) {
        return { error: 'Некорректный формат: !account <#ID | AUTH>' };
    }

    const target = room.getPlayer(id);
    if (!target) {
        return { error: 'Игрока с таким ID нет на сервере. Если он оффлайн, используйте его AUTH (43 символа).' };
    }

    return { auth: getAuth(target.id) };
}

return {
    formatAccountView,
    resolveTargetAuth
};

};
module.exports = function createAccountsHelpers({
    room,
    getAuth,
    discordBot,
    getDate,
    t
}) {

async function formatDiscordField(discordId) {
    if (!discordId) return t('account.discordUnlinked');

    const username = await discordBot.getUsername(discordId);
    return username != null ? `${username} (${discordId})` : `unknown (${discordId})`;
}

async function formatAccountView(obj) {
    const toDate = obj.date != null ? getDate(obj.date) : t('account.untilPermanent');
    const discordField = await formatDiscordField(obj.discord);

    return t('account.view', { nickname: obj.nickname, auth: obj.auth, role: obj.role, until: toDate, discord: discordField });
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
        return { error: t('account.invalidFormat') };
    }

    const target = room.getPlayer(id);
    if (!target) {
        return { error: t('account.playerOffline') };
    }

    return { auth: getAuth(target.id) };
}

return {
    formatAccountView,
    resolveTargetAuth
};

};
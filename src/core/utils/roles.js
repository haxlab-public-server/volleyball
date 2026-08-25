module.exports = function createRoleHelpers({
    room,
    db,
    getAuth,
    getID,
    Role,
    RoleString,
    Color,
    HaxNotification,
    discordBot,
    t
}) {

async function checkRoles() {
    const expiredAuths = await db.expireRoles();
    for (const auth of expiredAuths) {
        const id = getID(auth);
        if (id != null) {
            room.setPlayerAdmin(id, false);
            room.sendAnnouncement(
                t('role.expired'),
                id,
                Color.WH_BLUE,
                "bold",
                HaxNotification.MENTION
            );
        }
        discordBot.syncRole(auth);
    }
}

async function setRole(player, role, time, auth = null) {
    if (auth == null) {
        player.auth = getAuth(player.id);
    } else {
        player.auth = auth;
        player.admin = false;
    }
    await db.setRole(player.auth, role, time);
    discordBot.syncRole(player.auth);
    if (RoleString[role] >= Role.PREADMIN) {
        if (player.id == undefined) {
            player.id = getID(player.auth);
        }
        if (player.id != null) {
            room.setPlayerAdmin(player.id, true);
        }
    } else {
        if (player.id == undefined) {
            player.id = getID(player.auth);
        }
        if (player.id != null) {
            room.setPlayerAdmin(player.id, false);
        }
    }
}
    
async function getRole(player, auth = null) {
    let targetAuth = auth;

    if (targetAuth == null) {
        targetAuth = getAuth(player.id);
        if (targetAuth == null && player && player.auth) {
            targetAuth = player.auth;
        }
    } else {
        player.admin = false;
    }

    if (!targetAuth) {
        return Role.PLAYER;
    }

    const account = await db.getAccount(targetAuth);
    if (!account || account.role == null) {
        return Role.PLAYER;
    }

    return RoleString[account.role] ?? Role.PLAYER;
}


async function getChatColor(player) {
    if (await getRole(player) >= Role.VIP) {
        const account = await db.getAccount(getAuth(player.id));
        const color = account && account.chat_color != null ? account.chat_color : null;
        if (color != null) {
            return `0x${color}`;
        } else {
            return null;
        }
    } else {
        return null;
    }
}

return {
    checkRoles,
    setRole,
    getRole,
    getChatColor
}

};
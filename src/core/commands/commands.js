module.exports = function createCommands({
    Role,
    helpCommand,
    bbCommand,
    statsCommand,
    renameCommand,
    topsCommand,
    afkCommand,
    afkListCommand,
    idsCommand,
    serveCommand,
    discordCommand,
    telegramCommand,
    queueCommand,
    admCommand,
    deanonCommand,
    banCommand,
    unBanCommand,
    banListCommand,
    muteCommand,
    unMuteCommand,
    muteListCommand,
    setRoleCommand,
    getRoleListCommand,
    matchPointCommand,
    teamSizeCommand,
    getAuthCommand,
    passwordCommand,
    addAuthCommand,
    deleteAuthCommand,
    clearAuthsCommand,
    joinAuthsCommand,
    modeCommand,
    statsResetCommand,
    trainingCommand,
    trainingSettingCommands,
    myPointCommand,
    chatColorCommand,
    winstayCommand
}) {

return {
    help: {
        aliases: ["commands", "рудз"],
        roles: Role.PLAYER,
        function: helpCommand,
    },
    bb: {
        aliases: ["ии", "бб"],
        roles: Role.PLAYER,
        function: bbCommand,
    },
    stats: {
        aliases: ["s", "ы"],
        roles: Role.PLAYER,
        function: statsCommand
    },
    rename: {
        aliases: ["кутфьу"],
        roles: Role.PLAYER,
        function: renameCommand
    },
    tops: {
        aliases: ["топы", "top", "ещзы"],
        roles: Role.PLAYER,
        function: topsCommand
    },
    afk: {
        aliases: ["фал", "афк"],
        roles: Role.PLAYER,
        function: afkCommand
    },
    afks: {
        aliases: ["фалы"],
        roles: Role.PLAYER,
        function: afkListCommand
    },
    ids: {
        aliases: ["швы", "айди"],
        roles: Role.PLAYER,
        function: idsCommand
    },
    serve: {
        aliases: ["sr", "ык", "ыукму", "подача"],
        roles: Role.PLAYER,
        function: serveCommand
    },
    discord: {
        aliases: ["дискорд"],
        roles: Role.PLAYER,
        function: discordCommand
    },
    telegram: {
        aliases: ["телеграмм", "телеграм"],
        roles: Role.PLAYER,
        function: telegramCommand
    },
    queue: {
        aliases: ["очередь", "qu", "йгугу"],
        roles: Role.PLAYER,
        function: queueCommand
    },
    adm: {
        aliases: ["адм", "фвь"],
        roles: Role.PLAYER,
        function: admCommand
    },
    deanon: {
        aliases: ["деанон", "ники", "вуфтщт"],
        roles: Role.PLAYER,
        function: deanonCommand
    },
    ban: {
        aliases: ["бан"],
        roles: Role.PREADMIN,
        function: banCommand
    },
    unban: {
        aliases: ["разбан", "анбан"],
        roles: Role.PREADMIN,
        function: unBanCommand
    },
    bans: {
        aliases: ["баны", "banlist"],
        roles: Role.PREADMIN,
        function: banListCommand
    },
    mute: {
        aliases: ["мут"],
        roles: Role.PREADMIN,
        function: muteCommand
    },
    unmute: {
        aliases: ["анмут"],
        roles: Role.PREADMIN,
        function: unMuteCommand
    },
    mutes: {
        aliases: ["муты", "mutelist"],
        roles: Role.PREADMIN,
        function: muteListCommand
    },
    setrole: {
        aliases: [],
        roles: Role.MASTER,
        function: setRoleCommand
    },
    list: {
        aliases: [],
        roles: Role.MASTER,
        function: getRoleListCommand
    },
    matchpoint: {
        aliases: ["матч-поинт", "setmp", "mp"],
        roles: Role.MASTER,
        function: matchPointCommand
    },
    team_size: {
        aliases: ["team_size", "setts", "ts"],
        roles: Role.MASTER,
        function: teamSizeCommand
    },
    getauth: {
        aliases: ["public"],
        roles: Role.PLAYER,
        function: getAuthCommand
    },
    password: {
        aliases: ["pass", "setpassword", "setpass"],
        roles: Role.MASTER,
        function: passwordCommand
    },
    add_auth: {
        aliases: ["addauth", "ada"],
        roles: Role.MASTER,
        function: addAuthCommand
    },
    remove_auth: {
        aliases: ["removeauth"],
        roles: Role.MASTER,
        function: deleteAuthCommand
    },
    clear_auths: {
        aliases: ["clearauths"],
        roles: Role.MASTER,
        function: clearAuthsCommand
    },
    authjoins: {
        aliases: ["aj", "auth_joins"],
        roles: Role.MASTER,
        function: joinAuthsCommand
    },
    mode: {
        aliases: ["мод"],
        roles: Role.MASTER,
        function: modeCommand
    },
    statsclear: {
        aliases: ["statsreset"],
        roles: Role.MASTER,
        function: statsResetCommand
    },
    training: {
        aliases: ["tr", "ек"],
        roles: Role.VIP,
        function: trainingCommand
    },
    ball_spawner: {
        aliases: ["bs", "ballspawner", "иы"],
        roles: Role.VIP,
        function: trainingSettingCommands
    },
    mypoint: {
        aliases: ["myp"],
        roles: Role.PLAYER,
        function: myPointCommand
    },
    color: {
        aliases: ["chat_color", "цвет"],
        roles: Role.VIP,
        function: chatColorCommand
    },
    winstay: {
        aliases: [],
        roles: Role.MASTER,
        function: winstayCommand
    }
}

};
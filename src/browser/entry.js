/* Constants */
const {
    roomName,
    maxPlayers,
    roomPublic,
    geo,
    Discord,
    Telegram,
    gamesTimeout,
    defaultTeamSize,
    maxInactivity,
    queueMatches,
    upTeamSizePlayers,
    vipSlots,
    GhostKick,
    vipQueueRoles,
    buildGameConfig
} = require('../core/roomConstants');

async function main() {

const lastIds = {} // "auth": [id, conn, auth]

const room = HBInit(buildGameConfig(window.__secrets.token));

const cf = room.CollisionFlags;
const fs = window.__fs

/* Models */
const {
    Role,
    RoleString,
    HaxNotification,
    Color,
    Team,
    Mods
} = require('../core/models/enums');

const createModels = require('../core/models/models');
const {
    Game,
    MuteList,
    createMutePlayer
} = createModels({
    room,
    fs,
    Color,
    HaxNotification
});

const muteArray = new MuteList();
const MutePlayer = createMutePlayer(muteArray, room, Color, HaxNotification);

/* State */
const state = {};
state.roomPassword = window.__secrets.roomPassword;
room.setPassword(state.roomPassword != '' ? state.roomPassword : null);
state.matchPoint = 6
state.lastTouches = [];
state.inactivityTicks = [];
state.queue = []
state.touches = 0
state.ball_color = 0xffffff
state.goal_sit = false
state.onGameStopTimeout;
state.training_interval;
state.scores = null;
state.saveBall = false
state.serveBall = false
state.newMatchPoint = 0
state.afkList = []
state.randomize_sit = false
state.serve = null
state.teamSize = defaultTeamSize
state.joinAuths = false
state.training_mode = false
state.training_mode_spawn = []
state.mode = Mods.PUBLIC
state.game = new Game(defaultTeamSize);

const replayWebhook = window.__secrets.replayWebhookUrl;
const vipWebhook = window.__secrets.vipWebhookUrl;

/* Utils */
const createRoomUtils = require('../core/utils/roomUtils');
const {
    getAuth,
    getConn,
    getID,
    getTeamArray,
    ballSpawner
} = createRoomUtils({
    room,
    state,
    lastIds,
    cf,
    Team
})

const {
    getOnlyInt,
    stringToTime,
    getStringTime,
    getStatTime,
    getActTime,
    getDate,
    findFirstNumberCharString,
    getRandomInt,
    getMinutesGame,
    getSecondsGame,
    getTimeGame
} = require('../core/utils/utils');

const {
    getRecordingName,
    getIdReplay,
    fetchRecording
} = require('../core/utils/reports');

const createRoleHelpers = require('../core/utils/roles');
const {
    checkRoles,
    setRole,
    getRole,
    getChatColor
} = createRoleHelpers({
    room,
    fs,
    getAuth,
    getID,
    Role,
    RoleString,
    Color,
    HaxNotification
})

/* Generate VIP password */
state.vipPassword = getRandomInt(100000, 999999)

/* Services */
const createUpdatesUtils = require('../core/services/updates');
const {
    updateTeamSize,
    updateTeams,
    randomizeTeams,
    updateVipSlots
} = createUpdatesUtils({
    room,
    state,
    getTeamArray,
    getRole,
    getRandomInt,
    Mods,
    Team,
    Color,
    HaxNotification,
    defaultTeamSize,
    upTeamSizePlayers,
    queueMatches,
    vipQueueRoles,
    maxPlayers,
    vipSlots
})

const createIntervals = require('../core/services/intervals');
createIntervals({
    room,
    state,
    cf,
    fs,
    muteArray,
    lastIds,
    getRandomInt,
    getTeamArray,
    checkRoles,
    updateTeams,
    vipWebhook,
    maxInactivity,
    Team,
    Mods,
    Color,
    HaxNotification,
    updateVipSlots
})

const createChatHelpers = require('../core/services/chat');
const {
    getCommand,
    sendAnnouncementTeam
} = createChatHelpers({ 
    room,
    getCommands: () => commands
})

/* Default game settings */
const {
    volleyball_map,
    noGoal_map
} = require('../core/maps');

room.setTeamColors(1, 0, 0xFFDAA3, [0xFF4D17])
room.setTeamColors(2, 0, 0xFFDAA3, [0x0873FF])
room.setCustomStadium(volleyball_map)
room.setScoreLimit(0);
room.setTimeLimit(0);
room.setTeamsLock(true);

/* Player commands */
const createPlayerCommands = require('../core/commands/player');
const {
    teamChatCommand,
    helpCommand,
    admCommand,
    serveCommand,
    bbCommand,
    statsCommand,
    renameCommand,
    topsCommand,
    getAuthCommand,
    queueCommand,
    discordCommand,
    telegramCommand,
    afkCommand,
    afkListCommand,
    idsCommand,
    deanonCommand,
    myPointCommand
} = createPlayerCommands({
    room,
    state,
    fs,
    getAuth,
    getRole,
    getOnlyInt,
    getTeamArray,
    sendAnnouncementTeam,
    getStatTime,
    updateTeams,
    updateTeamSize,
    getCommands: () => commands,
    Role,
    Mods,
    Team,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    vipQueueRoles
})

/* VIP commands */
const createVipCommands = require('../core/commands/vip');
const {
    chatColorCommand,
    trainingSettingCommands,
    trainingCommand
} = createVipCommands({
    room,
    state,
    fs,
    getAuth,
    ballSpawner,
    noGoal_map,
    Mods,
    Color,
    HaxNotification
})

/* Admin commands */
const createAdminCommands = require('../core/commands/admin');
const {
    unBanCommand,
    banCommand,
    banListCommand,
    muteCommand,
    unMuteCommand,
    muteListCommand
} = createAdminCommands({
    room,
    lastIds,
    muteArray,
    getAuth,
    getConn,
    getRole,
    getOnlyInt,
    stringToTime,
    getStringTime,
    MutePlayer,
    Role,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    fs
})

/* Master commands */
const createMasterCommands = require('../core/commands/master');
const {
    passwordCommand,
    addAuthCommand,
    deleteAuthCommand,
    clearAuthsCommand,
    joinAuthsCommand,
    modeCommand,
    statsResetCommand,
    matchPointCommand,
    teamSizeCommand,
    setRoleCommand,
    getRoleListCommand
} = createMasterCommands({
    room,
    state,
    fs,
    getAuth,
    getRole,
    setRole,
    stringToTime,
    getStringTime,
    getDate,
    Role,
    RoleString,
    Mods,
    Color,
    HaxNotification
})

/* Commands init */
const createCommands = require('../core/commands/commands');
const commands = createCommands({
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
    chatColorCommand
})

/* EVENTS */
const wrapEventHandlers = require('../core/safeEventHandlers');

/* Movement events */
const createMovementEvents = require('../core/events/movement');
Object.assign(room, wrapEventHandlers(createMovementEvents({
    room,
    state,
    lastIds,
    fs,
    getAuth,
    getConn,
    getRole,
    updateVipSlots,
    updateTeams,
    updateTeamSize,
    GhostKick,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification,
    Discord,
    Telegram
})));

/* Activity events */
const createActivityEvents = require('../core/events/activity');
Object.assign(room, wrapEventHandlers(createActivityEvents({
    room,
    state,
    cf,
    fs,
    muteArray,
    getAuth,
    getRole,
    getCommand,
    commands,
    getTeamArray,
    sendAnnouncementTeam,
    getActTime,
    getChatColor,
    teamChatCommand,
    defaultTeamSize,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification
})));

/* Game events */
const createGameEvents = require('../core/events/game');
Object.assign(room, wrapEventHandlers(createGameEvents({
    room,
    state,
    fs,
    getAuth,
    getTeamArray,
    sendAnnouncementTeam,
    getTimeGame,
    ballSpawner,
    randomizeTeams,
    fetchRecording,
    replayWebhook,
    getIdReplay,
    Game,
    defaultTeamSize,
    noGoal_map,
    volleyball_map,
    gamesTimeout,
    Discord,
    Telegram,
    Team,
    Mods,
    Color,
    HaxNotification
})));

/* Misc events */
const createMiscEvents = require('../core/events/misc');
Object.assign(room, wrapEventHandlers(createMiscEvents({
    room,
    getRole,
    roomName,
    state
})));

return { commands };

};

const ready = main().catch((err) => {
    console.error('[FATAL] entry.js failed to initialise:', err);
    return err;
});
module.exports = { ready };
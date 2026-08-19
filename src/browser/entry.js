/* Config build */
const {
    buildGameConfig
} = require('../core/roomConstants');

async function main() {

const lastIds = {} // "auth": [id, conn, auth]

const config = window.__roomConfig;
const {
    roomName,
    maxPlayers,
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
    defaultMatchPoint,
    defaultTeamPickMode,
    defaultWinstay,
    joinAuths,
    mode,
    roomLabel,
    vipUpCooldownMs
} = config;

const room = HBInit(buildGameConfig(window.__secrets.token, config));

const cf = room.CollisionFlags;
const db = window.__db;

/* Models */
const {
    Role,
    RoleString,
    HaxNotification,
    Color,
    Team,
    Mods,
    TeamPickMode,
    TeamPickModeString,
    Sits
} = require('../core/models/enums');

const createModels = require('../core/models/models');
const {
    Game,
    MuteList,
    createMutePlayer
} = createModels({
    room,
    db,
    Color,
    HaxNotification
});

const muteArray = new MuteList();
const MutePlayer = createMutePlayer(muteArray, room, Color, HaxNotification);

/* Utils */
const {
    getOnlyInt,
    stringToTime,
    getStringTime,
    getStatTime,
    getActTime,
    getDate,
    findFirstNumberCharString,
    getRandomInt,
    getRandomFloat,
    getMinutesGame,
    getSecondsGame,
    getTimeGame,
} = require('../core/utils/utils');

const {
    DiscordBot
} = require('../core/utils/discord');

const {
    volleyball_map,
    noGoal_map
} = require('../core/maps');

/* State */
const state = {};

/* Settings */
state.roomPassword = window.__secrets.roomPassword;
room.setPassword(state.roomPassword != '' ? state.roomPassword : null);
state.matchPoint = defaultMatchPoint;
state.teamPickMode = defaultTeamPickMode;
state.winstay_mode = defaultWinstay;
state.teamSize = defaultTeamSize;
state.joinAuths = joinAuths;
state.mode = mode;

/* Utils */
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
state.waitingForServe = true;
state.newMatchPoint = 0
state.afkList = []
state.sit = Sits.NONE
state.captainAlertTimer = null;
state.captainPickTimer = null;
state.captainPickForTeam = null;
state.serve = null
state.training_mode = false
state.training_mode_spawn = []
state.game = new Game(defaultTeamSize);
state.vipPassword = getRandomInt(100000, 999999)
state.vipUpBooking = null;
state.vipUpCooldownUntil = 0;
state.pickSize = null;
state.pickUsedVipUpFor = null;
state.winstay = {
  streak: 0,
  team: [],
}

const discordBot = new DiscordBot({ db, roomLabel });

/* Room Utils */
const createRoomUtils = require('../core/utils/roomUtils');
const {
    getAuth,
    getConn,
    getID,
    getTeamArray
} = createRoomUtils({
    room,
    state,
    lastIds,
    Team
})

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
    db,
    getAuth,
    getID,
    Role,
    RoleString,
    Color,
    HaxNotification,
    discordBot
})

/* Services */
const createCaptainsHelpers = require('../core/services/captains');
const {
    getPickTeam,
    getCaptain,
    isCurrentPickingCaptain,
    sendPickList,
    capPick,
    clearCaptainPickTimer
} = createCaptainsHelpers({
    room,
    state,
    getTeamArray,
    Team,
    Color,
    HaxNotification
})

const createUpdatesUtils = require('../core/services/updates');
const {
    updateTeamSize,
    updateTeams,
    startPickingTeams,
    startCaptains,
    updateVipSlots,
    updateBallColor
} = createUpdatesUtils({
    room,
    state,
    getTeamArray,
    getAuth,
    getRole,
    getRandomInt,
    Mods,
    Team,
    Role,
    Color,
    HaxNotification,
    defaultTeamSize,
    upTeamSizePlayers,
    queueMatches,
    vipQueueRoles,
    maxPlayers,
    vipSlots,
    Sits,
    TeamPickMode,
    getPickTeam,
    getCaptain,
    sendPickList,
    clearCaptainPickTimer
})

const createTrainingService = require('../core/services/training');
const {
    ballSpawner,
    startBallSpawn,
    stopBallSpawn,
    startTrainingMode,
    stopTrainingMode
} = createTrainingService({
    room,
    state,
    volleyball_map,
    noGoal_map,
    cf,
    Team,
    getRandomFloat
})

const createIntervals = require('../core/services/intervals');
createIntervals({
    room,
    state,
    cf,
    db,
    muteArray,
    lastIds,
    getRandomInt,
    discordBot,
    getTeamArray,
    checkRoles,
    updateTeams,
    maxInactivity,
    Team,
    Mods,
    Color,
    HaxNotification,
    updateVipSlots,
    updateBallColor,
    Sits,
    Discord,
    Telegram
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
    db,
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
    vipQueueRoles,
    Sits,
    getPickTeam,
    getCaptain,
    sendPickList,
    defaultTeamSize,
    discordBot
})

/* VIP commands */
const createVipCommands = require('../core/commands/vip');
const {
    chatColorCommand,
    trainingSettingCommands,
    trainingCommand,
    upCommand
} = createVipCommands({
    room,
    state,
    db,
    getAuth,
    startBallSpawn,
    stopBallSpawn,
    startTrainingMode,
    stopTrainingMode,
    Mods,
    Color,
    HaxNotification,
    vipUpCooldownMs
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
    db,
    discordBot
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
    getRoleListCommand,
    winstayCommand,
    teamPickCommand
} = createMasterCommands({
    room,
    state,
    db,
    getAuth,
    getRole,
    setRole,
    stringToTime,
    getStringTime,
    getDate,
    stopTrainingMode,
    Role,
    RoleString,
    Mods,
    Color,
    HaxNotification,
    defaultTeamSize,
    TeamPickModeString
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
    chatColorCommand,
    winstayCommand,
    teamPickCommand,
    upCommand
})

/* EVENTS */
const wrapEventHandlers = require('../core/safeEventHandlers');

/* Movement events */
const createMovementEvents = require('../core/events/movement');
Object.assign(room, wrapEventHandlers(createMovementEvents({
    room,
    state,
    lastIds,
    db,
    getAuth,
    getConn,
    getRole,
    updateVipSlots,
    updateTeams,
    updateTeamSize,
    stopTrainingMode,
    GhostKick,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    maxPlayers,
    discordBot,
    Sits,
    getPickTeam,
    getCaptain,
    sendPickList
})));

/* Activity events */
const createActivityEvents = require('../core/events/activity');
Object.assign(room, wrapEventHandlers(createActivityEvents({
    room,
    state,
    cf,
    db,
    muteArray,
    getAuth,
    getRole,
    getCommand,
    commands,
    getTeamArray,
    sendAnnouncementTeam,
    getChatColor,
    teamChatCommand,
    defaultTeamSize,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification,
    discordBot,
    updateBallColor,
    Sits,
    isCurrentPickingCaptain,
    capPick
})));

/* Game events */
const createGameEvents = require('../core/events/game');
Object.assign(room, wrapEventHandlers(createGameEvents({
    room,
    state,
    db,
    getAuth,
    getTeamArray,
    sendAnnouncementTeam,
    getTimeGame,
    ballSpawner,
    startPickingTeams,
    fetchRecording,
    discordBot,
    getIdReplay,
    Game,
    noGoal_map,
    volleyball_map,
    gamesTimeout,
    Discord,
    Telegram,
    Team,
    Mods,
    Color,
    HaxNotification,
    TeamPickMode,
    Sits,
    defaultTeamSize
})));

/* Misc events */
const createMiscEvents = require('../core/events/misc');
Object.assign(room, wrapEventHandlers(createMiscEvents({
    room,
    getRole,
    roomName,
    state,
    discordBot
})));

return { commands };

};

const ready = main().catch((err) => {
    console.error('[FATAL] entry.js failed to initialise:', err);
    return err;
});
module.exports = { ready };
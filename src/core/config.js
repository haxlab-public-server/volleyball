const roomConstants = require('./roomConstants');

const publicToken = process.env.PUBLIC_TOKEN ?? '';
const privateToken = process.env.PRIVATE_TOKEN ?? '';

const publicPassword = process.env.PUBLIC_PASSWORD ?? '';
const privatePassword = process.env.PRIVATE_PASSWORD ?? '';

const discordBotToken = process.env.DISCORD_BOT_TOKEN ?? '';
const discordGuildId = process.env.DISCORD_GUILD_ID ?? '';

const discordRoleIds = {
    vip: process.env.DISCORD_VIP_ROLE_ID ?? null,
    preadmin: process.env.DISCORD_PREADMIN_ROLE_ID ?? null,
    admin: process.env.DISCORD_ADMIN_ROLE_ID ?? null,
    master: process.env.DISCORD_MASTER_ROLE_ID ?? null
};

const discordChannelIds = {
    log: process.env.DISCORD_LOG_CHANNEL_ID ?? null,
    report: process.env.DISCORD_REPORT_CHANNEL_ID ?? null,
    replay: process.env.DISCORD_REPLAY_CHANNEL_ID ?? null,
    vip: process.env.DISCORD_VIP_CHANNEL_ID ?? null
};

const discordOnlineMessages = {
    public: {
        channelId: process.env.DISCORD_PUBLIC_ONLINE_CHANNEL_ID ?? null,
        messageId: process.env.DISCORD_PUBLIC_ONLINE_MESSAGE_ID ?? null
    },
    private: {
        channelId: process.env.DISCORD_PRIVATE_ONLINE_CHANNEL_ID ?? null,
        messageId: process.env.DISCORD_PRIVATE_ONLINE_MESSAGE_ID ?? null
    }
};

const locale = process.env.LOCALE ?? 'ru';

module.exports = {
    ...roomConstants,
    publicToken,
    privateToken,
    publicPassword,
    privatePassword,
    discordBotToken,
    discordGuildId,
    discordRoleIds,
    discordChannelIds,
    discordOnlineMessages,
    locale
};
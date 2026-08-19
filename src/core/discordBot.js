const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    AttachmentBuilder
} = require('discord.js');

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(length = 6) {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += LINK_CODE_ALPHABET[Math.floor(Math.random() * LINK_CODE_ALPHABET.length)];
    }
    return out;
}

function createDiscordBot({
    token,
    guildId,
    roleIds,
    channelIds,
    db
}) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers
        ]
    });

    const pendingLinkCodes = new Map();

    function cleanupExpiredCodes() {
        const now = Date.now();
        for (const [code, entry] of pendingLinkCodes) {
            if (entry.expiresAt <= now) pendingLinkCodes.delete(code);
        }
    }

    function createLinkCode(discordId) {
        cleanupExpiredCodes();
        for (const [code, entry] of pendingLinkCodes) {
            if (entry.discordId === discordId) pendingLinkCodes.delete(code);
        }

        let code;
        do {
            code = generateCode();
        } while (pendingLinkCodes.has(code));

        pendingLinkCodes.set(code, { discordId, expiresAt: Date.now() + LINK_CODE_TTL_MS });
        return code;
    }

    async function consumeLinkCode(code, auth) {
        cleanupExpiredCodes();
        const entry = pendingLinkCodes.get(code.toUpperCase());
        if (!entry) return { ok: false, reason: 'invalid' };

        pendingLinkCodes.delete(code.toUpperCase());

        const account = await db.getAccount(auth);
        if (!account) return { ok: false, reason: 'unknown_account' };

        const existing = await db.getAccountByDiscordId(entry.discordId);
        if (existing && existing.auth !== auth) {
            return { ok: false, reason: 'already_linked_elsewhere' };
        }

        await db.setDiscordId(auth, entry.discordId);
        await syncRoleForAuth(auth);
        return { ok: true };
    }

    const MANAGED_ROLE_NAMES = ['vip', 'preadmin', 'admin', 'master'];

    async function getGuild() {
        return client.guilds.fetch(guildId);
    }

    async function syncRoleForAuth(auth) {
        try {
            const account = await db.getAccount(auth);
            if (!account || !account.discord) return;

            const guild = await getGuild();
            const member = await guild.members.fetch({ user: account.discord, force: true }).catch(() => null);
            if (!member) return;

            const allManagedRoleIds = MANAGED_ROLE_NAMES.map(name => roleIds[name]).filter(Boolean);
            const targetRoleId = MANAGED_ROLE_NAMES.includes(account.role) ? roleIds[account.role] : null;

            const toRemove = allManagedRoleIds.filter(
                id => id !== targetRoleId && member.roles.cache.has(id)
            );
            for (const id of toRemove) {
                await member.roles.remove(id).catch(() => {});
            }

            if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
                await member.roles.add(targetRoleId).catch(() => {});
            }
        } catch (err) {
            console.error('[Discord] syncRoleForAuth failed:', err);
        }
    }

    function truncate(str, max = 1900) {
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    async function sendLog(roomLabel, content) {
        if (!channelIds.log) return;
        const channel = await client.channels.fetch(channelIds.log).catch(() => null);
        if (channel) {
            const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
            await channel.send({ content: truncate(`${prefix}${content}`) }).catch(() => {});
        }
    }

    async function sendReport(roomLabel, adminName, toPlayerName, action, reason, time) {
        if (!channelIds.report) return;
        const actions = { mute: 'замутил', ban: 'забанил', unmute: 'размутил', unban: 'разбанил' };
        const channel = await client.channels.fetch(channelIds.report).catch(() => null);
        if (!channel) return;

        const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
        const content =
            `## ${prefix}🔴 ${adminName} ${actions[action]} ${toPlayerName}` +
            `${time != null ? ` на ${time}` : ''}` +
            `${reason != null ? ` по причине: ${reason}` : ''}`;

        await channel.send({ content: truncate(content) }).catch(() => {});
    }

    async function sendRecording(roomLabel, recBytes, name, id) {
        if (!channelIds.replay) return;
        const channel = await client.channels.fetch(channelIds.replay).catch(() => null);
        if (!channel) return;

        try {
            const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
            await channel.send({ content: `${prefix}\`№ ${id}\`` });
            const file = new AttachmentBuilder(Buffer.from(recBytes), { name });
            await channel.send({ files: [file] });
        } catch (err) {
            console.error('[Discord] sendRecording failed:', err);
        }
    }

    async function sendVipPassword(roomLabel, vipPassword) {
        if (!channelIds.vip) return;
        const channel = await client.channels.fetch(channelIds.vip).catch(() => null);
        if (channel) {
            const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
            await channel.send({ content: `# ${prefix}🌟VIP-Пароль: ${vipPassword}` }).catch(() => {});
        }
    }

    async function editOnlineMessage(channelId, messageId, content) {
        if (!channelId || !messageId) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            await message.edit({ content: truncate(content) });
        } catch (err) {
            console.error('[Discord] editOnlineMessage failed:', err);
        }
    }

    async function registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('link')
                .setDescription('Получить код для привязки Discord к аккаунту HaxBall')
        ].map(c => c.toJSON());

        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    }

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'link') return;

        const code = createLinkCode(interaction.user.id);

        await interaction.reply({
            content:
                `🔗 Ваш код привязки: **${code}**\n` +
                `Введите в HaxBall команду: \`!discord ${code}\`\n` +
                `Код действует 10 минут.`,
            ephemeral: true
        });
    });

    async function login() {
        await client.login(token);
        await new Promise(resolve => client.once('ready', resolve));
        await registerSlashCommands();
        console.log(`[Discord] Bot ready as ${client.user.tag}`);
    }

    return {
        login,
        consumeLinkCode,
        syncRoleForAuth,
        sendLog,
        sendReport,
        sendRecording,
        sendVipPassword,
        editOnlineMessage
    };
}

module.exports = { createDiscordBot };

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ONLINE_EMBED_COLOR = 0x5865F2;

function generateCode(length = 6) {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += LINK_CODE_ALPHABET[Math.floor(Math.random() * LINK_CODE_ALPHABET.length)];
    }
    return out;
}

function formatDate(d = new Date()) {
    const formatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return formatter.format(d).replace(', ', ' ');
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

        const account = await db.getAccount(auth);
        if (!account) return { ok: false, reason: 'unknown_account' };

        if (account.discord) {
            return { ok: false, reason: 'already_linked' };
        }

        const existing = await db.getAccountByDiscordId(entry.discordId);
        if (existing && existing.auth !== auth) {
            return { ok: false, reason: 'already_linked_elsewhere' };
        }

        pendingLinkCodes.delete(code.toUpperCase());

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

    async function removeAllManagedRoles(discordId) {
        try {
            const guild = await getGuild();
            const member = await guild.members.fetch({ user: discordId, force: true }).catch(() => null);
            if (!member) return;

            const allManagedRoleIds = MANAGED_ROLE_NAMES.map(name => roleIds[name]).filter(Boolean);
            const toRemove = allManagedRoleIds.filter(id => member.roles.cache.has(id));

            for (const id of toRemove) {
                await member.roles.remove(id).catch(() => {});
            }
        } catch (err) {
            console.error('[Discord] removeAllManagedRoles failed:', err);
        }
    }

    async function unlinkByAuth(auth) {
        const account = await db.getAccount(auth);
        if (!account || !account.discord) return { ok: false, reason: 'not_linked' };

        const discordId = account.discord;
        await db.setDiscordId(auth, null);
        await removeAllManagedRoles(discordId);
        return { ok: true };
    }

    async function unlinkByDiscordId(discordId) {
        const account = await db.getAccountByDiscordId(discordId);
        if (!account) return { ok: false, reason: 'not_linked' };

        await db.setDiscordId(account.auth, null);
        await removeAllManagedRoles(discordId);
        return { ok: true, auth: account.auth };
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

    async function editOnlineMessage(channelId, messageId, payload) {
        if (!channelId || !messageId || !payload) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);

            const { title, playersLine, count, maxPlayers, roomLink } = payload;

            const embed = new EmbedBuilder()
                .setColor(ONLINE_EMBED_COLOR)
                .setTitle(`${title} - ${count}/${maxPlayers}`)
                .addFields({ name: 'PLAYERS:', value: playersLine || '' })
                .setFooter({ text: `updated once per minute, latest update: ${formatDate()}` });

            const components = [];
            if (roomLink) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Присоединиться')
                        .setStyle(ButtonStyle.Link)
                        .setURL(roomLink)
                );
                components.push(row);
            }

            await message.edit({ content: '', embeds: [embed], components });
        } catch (err) {
            console.error('[Discord] editOnlineMessage failed:', err);
        }
    }

    async function registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('link')
                .setDescription('Получить код для привязки Discord к аккаунту HaxBall'),
            new SlashCommandBuilder()
                .setName('unlink')
                .setDescription('Отвязать ваш Discord от аккаунта HaxBall')
        ].map(c => c.toJSON());

        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    }

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'link') {
            const existing = await db.getAccountByDiscordId(interaction.user.id);
            if (existing) {
                await interaction.reply({
                    content: `❌ Ваш Discord уже привязан к аккаунту HaxBall. Чтобы привязать другой, сначала отвяжите текущий командой \`/unlink\`.`,
                    ephemeral: true
                });
                return;
            }

            const code = createLinkCode(interaction.user.id);

            await interaction.reply({
                content:
                    `🔗 Ваш код привязки: **${code}**\n` +
                    `Введите в HaxBall команду: \`!discord ${code}\`\n` +
                    `Код действует 10 минут.`,
                ephemeral: true
            });
            return;
        }

        if (interaction.commandName === 'unlink') {
            const result = await unlinkByDiscordId(interaction.user.id);

            if (result.ok) {
                await interaction.reply({
                    content: `✅ Discord отвязан от аккаунта HaxBall.`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `❌ Ваш Discord не привязан ни к одному аккаунту HaxBall.`,
                    ephemeral: true
                });
            }
            return;
        }
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
        unlinkByAuth,
        syncRoleForAuth,
        sendLog,
        sendReport,
        sendRecording,
        sendVipPassword,
        editOnlineMessage
    };
}

module.exports = { createDiscordBot };
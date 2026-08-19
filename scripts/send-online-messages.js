/*
 * Usage: node scripts/send-online-messages.js
 *
 * Sends one placeholder message per room (public/private) into the channels
 * configured via DISCORD_PUBLIC_ONLINE_CHANNEL_ID / DISCORD_PRIVATE_ONLINE_CHANNEL_ID.
 * The bot can only edit its own messages, so these seed messages must be
 * created once, up front, by the bot itself — copy the printed message IDs
 * into DISCORD_PUBLIC_ONLINE_MESSAGE_ID / DISCORD_PRIVATE_ONLINE_MESSAGE_ID.
 */
const path = require('node:path');

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
    if (err.code !== 'ENOENT') throw err;
}

const { Client, GatewayIntentBits } = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN;

const targets = [
    {
        label: 'public',
        channelId: process.env.DISCORD_PUBLIC_ONLINE_CHANNEL_ID,
        envVar: 'DISCORD_PUBLIC_ONLINE_MESSAGE_ID'
    },
    {
        label: 'private',
        channelId: process.env.DISCORD_PRIVATE_ONLINE_CHANNEL_ID,
        envVar: 'DISCORD_PRIVATE_ONLINE_MESSAGE_ID'
    }
];

async function main() {
    if (!token) {
        console.log('DISCORD_BOT_TOKEN is not set in .env');
        process.exit(1);
    }

    const missingChannel = targets.filter(t => !t.channelId);
    if (missingChannel.length > 0) {
        console.log('Channel IDs not set for: ' + missingChannel.map(t => t.label).join(', '));
        console.log('Fill in DISCORD_PUBLIC_ONLINE_CHANNEL_ID / DISCORD_PRIVATE_ONLINE_CHANNEL_ID in .env before running.');
        process.exit(1);
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    await client.login(token);
    await new Promise(resolve => client.once('ready', resolve));
    console.log(`Bot logged in as ${client.user.tag}\n`);

    for (const target of targets) {
        try {
            const channel = await client.channels.fetch(target.channelId);

            const roomName = target.label === 'public' ? 'Public room' : 'Private room';
            const message = await channel.send({
                content: `**Online message init** — ${roomName}`
            });

            console.log(`[${target.label}] message sent to channel ${target.channelId}`);
            console.log(`[${target.label}] message ID: ${message.id}`);
            console.log(`  → add to .env: ${target.envVar}=${message.id}\n`);
        } catch (err) {
            console.error(`[${target.label}] failed to send message:`, err.message);
        }
    }

    await client.destroy();
    process.exit(0);
}

main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
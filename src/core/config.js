const roomConstants = require('./roomConstants');

const roomPassword = process.env.ROOM_PASSWORD ?? '';
const token = process.env.HAXBALL_TOKEN ?? '';
const replayWebhookUrl = process.env.REPLAY_WEBHOOK_URL ?? '';
const vipWebhookUrl = process.env.VIP_WEBHOOK_URL ?? '';

module.exports = {
    ...roomConstants,
    roomPassword,
    token,
    replayWebhookUrl,
    vipWebhookUrl
}
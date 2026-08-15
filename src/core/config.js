const roomConstants = require('./roomConstants');

const publicToken = process.env.PUBLIC_TOKEN ?? '';
const privateToken = process.env.PRIVATE_TOKEN ?? '';

const publicPassword = process.env.PUBLIC_PASSWORD ?? '';
const privatePassword = process.env.PRIVATE_PASSWORD ?? '';

const replayWebhookUrl = process.env.REPLAY_WEBHOOK_URL ?? '';
const vipWebhookUrl = process.env.VIP_WEBHOOK_URL ?? '';
const logWebhookUrl = process.env.LOG_WEBHOOK_URL ?? '';
const reportWebhookUrl = process.env.REPORT_WEBHOOK_URL ?? '';

module.exports = {
    ...roomConstants,
    publicToken,
    privateToken,
    publicPassword,
    privatePassword,
    replayWebhookUrl,
    vipWebhookUrl,
    logWebhookUrl,
    reportWebhookUrl
};
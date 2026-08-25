module.exports = function createAnnouncementMessages({ Discord, Telegram, t }) {
    return [
        t('promo.discordAndTelegram', { discord: Discord, telegram: Telegram }),
        t('promo.vipInfo', { discord: Discord }),
        t('promo.linkDiscord', { discord: Discord })
    ];
};
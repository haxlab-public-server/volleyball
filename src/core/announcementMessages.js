module.exports = function createAnnouncementMessages({ Discord, Telegram }) {
    return [
        `Заходи на наш Discord-сервер: ${Discord}\nПодписывайся на мой Telegram: ${Telegram}`,
        `На нашей комнате есть привилегия VIP!\nВозможности, цена и другие подробности на нашем Discord-сервере: ${Discord}`,
        `Заходи на наш Discord-сервер и привяжи свой Discord-профиль к аккаунту HaxBall!\nПросто напиши команду /link в любом чате сервера.\n${Discord}`
    ];
};
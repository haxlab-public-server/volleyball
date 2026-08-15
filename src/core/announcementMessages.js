module.exports = function createAnnouncementMessages({ Discord, Telegram }) {
    return [
        `Заходи на наш discord-сервер: ${Discord}\nПодписывайся на мой telegram: ${Telegram}`,

        `На нашей комнате есть привилегия VIP!\nВозможности, цена и другие подробности на нашем discord-сервере: ${Discord}`
    ];
};
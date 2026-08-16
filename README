# 🏐 Volleyball \[chds\] — a [HaxBall](https://www.haxball.com) room bot.
**Languages: [🇬🇧 English](#english) | [🇷🇺 Русский](#русский)**

<a id="english"></a>
## README 🇬🇧

Bot for a [HaxBall](https://www.haxball.com) room implementing a full volleyball game mode: touch counting, blocks, power serves, aces, automatic team forming, and an admin role system.

The bot runs two rooms at once — **public** and **private** — via two independent headless browser instances.

### Game features

#### Game mechanics

- **Volleyball rules**: max 3 touches per team in a row, no double-touch by the same player, automatic goal/fault detection.

  ![Volleyball rules demo](docs/media/rules-demo.gif)

- **Power serves** (`!serve` / `!sr`) — the team whose turn it is to serve sends the ball with a boosted kick; a successful serve that crosses the net untouched counts as an **ACE**.

  ![Power serve and ace demo](docs/media/serve-ace-demo.gif)

- **Blocks** — counted when a player deflects the opponent's ball in a designated zone near the net; tracked separately from regular touches.

  ![Block demo](docs/media/block-demo.gif)

- **Save ball** — the third touch in the out zone is highlighted and physically boosted, and this hit can't be blocked, giving the team a chance to escape a difficult position.

  ![Save ball demo](docs/media/save-demo.gif)

- **Match point** with auto-extension: if the score ties at the expected match point, the game continues until there's a two-point lead.

- **Training mode** (private mode only) — a goal-less map with a configurable auto ball spawner (position, speed, interval) for practicing serves and receives.

  ![Training mode demo](docs/media/training-demo.gif)

#### Teams and queue

- Automatic team forming: **random** mode or **captains** mode (captains take turns picking players from spectators).
- **Winstay** — the winning team stays on the field, continuing to play in the same lineup until it loses.
- Spectator queue prioritized by number of missed games, plus a separate **VIP queue**.
- Team size automatically adjusts to the number of active players.

#### Roles and moderation

- Role hierarchy: `PLAYER → VIP → PREADMIN → ADMIN → MASTER`, with automatic timed role expiry.
- Bans and mutes with duration and reason, reported to Discord.
- Ability to enable a mode where only players from the whitelisted public ID list (`!add_auth`) can join.
- Colored chat nickname for VIP and above.
- A separate VIP password, refreshed hourly and set on the room once a certain number of VIP slots remain, letting VIP players enter an otherwise "full" room.

#### Stats and social features

- Personal stats: games, wins, goals, blocks, percentage of blocks beaten (POB), assists, errors, aces, serves, play time.
- Player leaderboards for any tracked stat.
- Nickname history (`!deanon`) to recognize players by past names.
- Discord integration: chat/event logs, ban/mute reports, auto-uploaded match replays, VIP password notifications.

### Architecture

The project runs across two processes:

```
Node.js (main.js → src/index.js)
   │
   │  launches headless Chrome via Puppeteer,
   │  opens haxball.com/headless
   │
   ▼
Browser context (src/browser/entry.js)
   │
   │  esbuild bundles entry.js + the whole src/core tree
   │  into a single IIFE bundle and injects it into the page
   │
   ▼
HaxBall Room API (HBInit)
```

- The **Node side** owns the browser lifecycle, bundle building (esbuild), and the single access point to SQLite — `window.__dbCall`, exposed to the browser via `page.exposeFunction`.
- The **browser side** (all code under `src/core/*`) is plain JS with no Node APIs, bundled by esbuild and executed inside the HaxBall page. DB calls go asynchronously through the bridge `window.__db.*` → `__dbCall` → Node → SQLite.

#### Directory layout

```
main.js                  — entry point, loads .env
src/
  index.js                — launches Puppeteer, builds bundle, DB bridge
  browser/
    entry.js               — entry point inside the browser context, wires up all modules
  core/
    config.js               — secrets and tokens from process.env
    roomConstants.js         — public/private room configs
    maps.js                  — stadium maps (with/without goals)
    announcementMessages.js  — rotating promo announcements
    safeEventHandlers.js     — wraps room.onX handlers with error catching
    models/
      enums.js                — Role, Color, Team, Mods, Sits, etc.
      models.js                — Game, MuteList, MutePlayer
    utils/
      utils.js                 — various utility functions
      roomUtils.js              — utility functions that need the room object to work
      roles.js                  — getRole/setRole/checkRoles (DB-backed)
      discord.js                — DiscordBot (webhooks)
      reports.js                — replay file naming
    services/
      chat.js                   — command/alias resolution
      captains.js                — captain-pick logic
      updates.js                 — team forming, winstay, randomizer
      intervals.js                — all setInterval loops (bans, mutes, roles, announcements, game tick)
    commands/
      commands.js                 — command registry → role → handler
      player.js, vip.js, admin.js, master.js — command implementations by access tier
    events/
      movement.js, activity.js, game.js, misc.js — room event handlers
db/
  sqlite.js               — wrapper over node:sqlite (DatabaseSync), schema and queries
scripts/
  add-master.js            — one-off MASTER role grant directly in the DB
tools/
  smoke-test.js             — in-memory smoke tests for the DB layer and role logic
.github/workflows/
  ci.yaml                    — runs smoke tests on push/PR
  deploy.yaml                 — deploys to a self-hosted runner via pm2
```

#### Storage

SQLite via the built-in `node:sqlite` module (`db/volleyball.sqlite`, WAL mode). Tables: `accounts`, `bans`, `mutes`, `nicknames`, `auths`, `stats`. `db/sqlite.js` is the only place with raw SQL; the browser side only ever sees promisified methods.

#### DB access boundary

`page.evaluate` registers an **explicit whitelist** of methods reachable from the browser (`getBans`, `setRole`, `incrementStat`, etc.) — browser code cannot call an arbitrary `db` method, only the ones listed in `src/index.js`.

### Requirements

- Node.js **≥ 22.18** (uses the native `node:sqlite` module)
- npm

### Installation

```bash
git clone <repo-url>
cd volleyball
npm install
cp .env.example .env
```

Fill in `.env`:

```ini
PUBLIC_TOKEN="token here"
PRIVATE_TOKEN="token here"
PUBLIC_PASSWORD="password or empty here"
PRIVATE_PASSWORD="password or empty here"
REPLAY_WEBHOOK_URL="webhook or empty here"
VIP_WEBHOOK_URL="webhook or empty here"
LOG_WEBHOOK_URL="webhook or empty here"
REPORT_WEBHOOK_URL="webhook or empty here"
```

`PUBLIC_TOKEN`/`PRIVATE_TOKEN` are HaxBall headless tokens for the respective room. Webhooks are optional — if left empty, the corresponding Discord integration simply won't send messages.

### Running

```bash
npm start
```

Runs `main.js`, which launches **both** rooms (public + private) in parallel. Room links and the VIP password will appear in the console log.

#### Granting the MASTER role

The first master must be granted manually, since `!setrole` doesn't allow assigning this role:

```bash
node scripts/add-master.js <public_id>
```

The bot needs to be restarted for the change to take effect.

### Tests

```bash
npm run test:smoke
```

In-memory smoke tests (`tools/smoke-test.js`) cover the DB layer (accounts, bans, stats, nicknames, mutes) and part of the business logic (`MuteList`, `getRole`/`setRole`). Run in CI on every push and PR (`.github/workflows/ci.yaml`).

### Deployment

`.github/workflows/deploy.yaml`, on push to `main`, runs `git reset --hard`, `npm ci`, and restarts the process via `pm2` on a self-hosted runner.

---

<a id="русский"></a>
## README 🇷🇺

Бот для комнаты [HaxBall](https://www.haxball.com), реализующий полноценный режим волейбола: подсчёт касаний, блоки, силовые подачи, эйсы, автоматическое формирование команд и систему ролей администрации.

Бот управляет двумя комнатами одновременно — **публичной** и **приватной** — через два независимых экземпляра headless-браузера.

### Особенности режима

#### Игровая механика

- **Волейбольные правила**: не более 3 касаний на команду подряд, запрет двойного касания одним игроком, автоматическое определение гола/фола.

  ![Волейбольные правила — демо](docs/media/rules-demo.gif)

- **Силовые подачи** (`!serve` / `!sr`) — команда, чей черёд подавать, отправляет мяч ускоренным ударом; успешная подача через сетку без касания соперником засчитывается как **ЭЙС**.

  ![Силовая подача и эйс — демо](docs/media/serve-ace-demo.gif)

- **Блоки** — засчитываются, если игрок отбивает мяч соперника в специальной зоне у сетки; учитываются раздельно от обычных касаний.

  ![Блок — демо](docs/media/block-demo.gif)

- **Сейв-мяч** — третье касание в аутовой зоне подсвечивается и физически усиливается, также этот удар нельзя блокировать, чтобы дать команде шанс спастись из сложного положения.

  ![Сейв-мяч — демо](docs/media/save-demo.gif)

- **Матч-поинт** с автопродлением: если счёт сравнивается на предполагаемом матч-поинте, игра продолжается до перевеса.

- **Тренировочный режим** (только в приватном моде комнаты) — карта без ворот и настраиваемый автоспавнер мяча (позиция, скорость, интервал) для отработки подач и приёма.

  ![Тренировочный режим — демо](docs/media/training-demo.gif)

#### Команды и очередь

- Автоматическое формирование команд: **случайный** режим или режим **капитанов** (капитаны по очереди выбирают игроков из зрителей).
- **Winstay** — команда-победитель остаётся на поле, продолжая играть в таком же составе пока не проиграет.
- Очередь зрителей с приоритетом по количеству пропущенных игр и отдельной **VIP-очередью**.
- Автоматическое подстраивание размера команд под количество активных игроков.

#### Роли и модерация

- Иерархия ролей: `PLAYER → VIP → PREADMIN → ADMIN → MASTER`, с автоматическим временным истечением роли.
- Баны и муты с указанием времени и причины, отчётность в Discord.
- Возможность включить режим, когда зайти смогут только игроки из списка авторизованных публичных ID (`!add_auth`).
- Цветной никнейм в чате для VIP и выше.
- Отдельный VIP-пароль, который обновляется раз в час и устанавливается на комнату когда осталось определенное количество VIP слотов, позволяя VIP игрокам входить в "заполненную" комнату.

#### Статистика и социальные функции

- Персональная статистика: игры, победы, голы, блоки, процент обойденных блоков (ПОБ), пасы, ошибки, эйсы, подачи, игровое время.
- Топы игроков по любому из показателей.
- История никнеймов (`!deanon`) для узнавания игроков по прошлым именам.
- Интеграция с Discord: логи чата и событий, репорты о банах/мутах, авто-отправка реплеев матчей, уведомления о VIP-пароле.

### Архитектура

Проект работает в двух процессах:

```
Node.js (main.js → src/index.js)
   │
   │  запускает headless Chrome через Puppeteer,
   │  открывает haxball.com/headless
   │
   ▼
Browser context (src/browser/entry.js)
   │
   │  esbuild собирает entry.js + всё дерево src/core
   │  в один IIFE-бандл и инжектит в страницу
   │
   ▼
HaxBall Room API (HBInit)
```

- **Node-сторона** отвечает за жизненный цикл браузера, сборку бандла (esbuild) и единственную точку доступа к SQLite — `window.__dbCall`, проброшенную в браузер через `page.exposeFunction`.
- **Browser-сторона** (весь код в `src/core/*`) — чистый JS без Node-API, собирается esbuild'ом и исполняется внутри страницы HaxBall. Обращения к БД идут асинхронно через мост `window.__db.*` → `__dbCall` → Node → SQLite.

#### Структура каталогов

```
main.js                  — точка входа, подгружает .env
src/
  index.js                — запуск Puppeteer, сборка бандла, мост к БД
  browser/
    entry.js               — точка входа в браузерном контексте, DI всех модулей
  core/
    config.js               — секреты и токены из process.env
    roomConstants.js         — конфиги public/private комнат
    maps.js                  — карты стадиона (с воротами / без ворот)
    announcementMessages.js  — ротация рекламных объявлений
    safeEventHandlers.js     — обёртка room.onX с перехватом ошибок
    models/
      enums.js                — Role, Color, Team, Mods, Sits и т.д.
      models.js                — Game, MuteList, MutePlayer
    utils/
      utils.js                 — различные функции утилиты
      roomUtils.js              — функции утилиты, которые для своей работы требуют объект room
      roles.js                  — getRole/setRole/checkRoles (с БД)
      discord.js                — DiscordBot (вебхуки)
      reports.js                — имена файлов реплеев
    services/
      chat.js                   — резолвинг команд/алиасов
      captains.js                — логика выбора капитанами
      updates.js                 — формирование команд, winstay, рандомайзер
      intervals.js                — все setInterval (баны, муты, роли, объявления, тик игры)
    commands/
      commands.js                 — реестр команд → роль → функция
      player.js, vip.js, admin.js, master.js — реализации команд по уровню доступа
    events/
      movement.js, activity.js, game.js, misc.js — обработчики событий комнаты
db/
  sqlite.js               — обёртка над node:sqlite (DatabaseSync), схема и запросы
scripts/
  add-master.js            — разовая выдача роли MASTER напрямую в БД
tools/
  smoke-test.js             — in-memory smoke-тесты БД и ролевой логики
.github/workflows/
  ci.yaml                    — прогон smoke-тестов на push/PR
  deploy.yaml                 — деплой на self-hosted раннер через pm2
```

#### Хранилище

SQLite через встроенный `node:sqlite` (`db/volleyball.sqlite`, WAL-режим). Таблицы: `accounts`, `bans`, `mutes`, `nicknames`, `auths`, `stats`. Слой `db/sqlite.js` — единственное место с SQL; вся браузерная сторона видит только промисифицированные методы.

#### Границы доступа к БД

`page.evaluate` регистрирует **явный whitelist** методов, доступных из браузера (`getBans`, `setRole`, `incrementStat` и т.д.) — браузерный код не может вызвать произвольный метод `db`, только те, что перечислены в `src/index.js`.

### Требования

- Node.js **≥ 22.18** (используется нативный `node:sqlite`)
- npm

### Установка

```bash
git clone <repo-url>
cd volleyball
npm install
cp .env.example .env
```

Заполните `.env`:

```ini
PUBLIC_TOKEN="token here"
PRIVATE_TOKEN="token here"
PUBLIC_PASSWORD="password or empty here"
PRIVATE_PASSWORD="password or empty here"
REPLAY_WEBHOOK_URL="webhook or empty here"
VIP_WEBHOOK_URL="webhook or empty here"
LOG_WEBHOOK_URL="webhook or empty here"
REPORT_WEBHOOK_URL="webhook or empty here"
```

`PUBLIC_TOKEN`/`PRIVATE_TOKEN` — headless-токены HaxBall для соответствующей комнаты. Webhooks — опциональны, при пустом значении соответствующая интеграция с Discord просто не отправляет сообщения.

### Запуск

```bash
npm start
```

Запускает `main.js`, который поднимает **обе** комнаты (public + private) параллельно. Ссылки на комнаты и VIP-пароль появятся в логе консоли.

#### Выдача роли MASTER

Первого мастера нужно выдать вручную, так как команда `!setrole` не позволяет назначать эту роль:

```bash
node scripts/add-master.js <public_id>
```

Бота нужно перезапустить, чтобы изменение вступило в силу.

### Тесты

```bash
npm run test:smoke
```

In-memory smoke-тесты (`tools/smoke-test.js`) покрывают слой БД (аккаунты, баны, статистика, ники, муты) и часть бизнес-логики (`MuteList`, `getRole`/`setRole`). Гоняются в CI на каждый push и PR (`.github/workflows/ci.yaml`).

### Деплой

`.github/workflows/deploy.yaml` при пуше в `main` на self-hosted раннере делает `git reset --hard`, `npm ci` и перезапускает процесс через `pm2`.
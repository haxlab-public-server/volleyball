# config/rooms.example/
**Languages: [🇬🇧 English](#english) | [🇷🇺 Русский](#русский)**

<a id="english"></a>
## README 🇬🇧

Reference room configs, committed to the repository as documentation /
starting templates. These are **not** read by the bot directly — the
bot reads `config/rooms/*.json` (no `.example` suffix), which is
gitignored on purpose (see the root `.gitignore`).

### Why the split

Each server running this bot has its own set of rooms — different
names, different room counts, possibly different numbering, and a
token pool sized to match. That's local, server-specific configuration,
not something that should live in the repository or get overwritten
every time `git pull`/the deploy runner updates the code.

So:
- `config/rooms.example/*.json.example` — committed, tracked, safe to
  update via normal commits. Shows the shape/fields available.
- `config/rooms/*.json` — **not** committed (gitignored). This is what
  actually gets loaded at startup. Lives only on each server's disk.

### Setting up a new server

1. Clone the repo as usual (or let the deploy runner do it).
2. `mkdir -p config/rooms` if it doesn't already exist (the folder
   itself is tracked via `.gitkeep`, but starts out empty of configs).
3. Copy whichever examples you need, minus the `.example` suffix, and
   edit them for this server:
   ```bash
   cp config/rooms.example/public.json.example config/rooms/public.json
   cp config/rooms.example/private.json.example config/rooms/private.json
   ```
4. Edit `count`, `numbering`, `roomName`, etc. in `config/rooms/*.json`
   to whatever this server actually needs.
5. Make sure `.env`'s `HAXBALL_TOKENS` has at least as many tokens as
   the total room count across every file in `config/rooms/`.
6. Run the bot as usual (`npm start`). Deploying new code afterwards
   (`git pull` / the deploy workflow) never touches `config/rooms/`,
   since it's gitignored — this server's room setup stays exactly as
   configured.

### You're not limited to these two examples

`public.json.example` and `private.json.example` are just a starting
point — the config loader doesn't care about filenames or how many
files there are. It scans every `*.json` file in `config/rooms/` at
startup with zero registration needed, so you can freely:

- Add as many config files as you want, named however you like
  (`tournament.json`, `eu-1.json`, `training.json`, ...).
- Give each one a different `count` (how many room instances to launch
  from that single config) and `numbering` setting.
- Mix and match `mode`, `roomCategory`, `defaultTeamPickMode`, and every
  other field independently per file.

Just make sure `HAXBALL_TOKENS` has enough tokens for the *combined*
room count across every file you add, and that any file with
`numbering: true` includes the `{num}` placeholder somewhere in its
`roomName` (the bot fails to start with a clear error otherwise).

---

<a id="русский"></a>
## README 🇷🇺

Справочные конфиги комнат, которые хранятся в репозитории как
документация / стартовые шаблоны. Бот их напрямую **не** читает — он
читает `config/rooms/*.json` (без суффикса `.example`), а эта папка
намеренно добавлена в `.gitignore` (см. корневой `.gitignore`).

### Зачем такое разделение

У каждого сервера, на котором запущен бот, свой набор комнат — разные
названия, разное количество, возможно разная нумерация и свой пул
токенов под это количество. Это локальная, специфичная для конкретного
сервера конфигурация, которая не должна храниться в репозитории и
перезаписываться при каждом `git pull`/обновлении кода через раннер
деплоя.

Поэтому:
- `config/rooms.example/*.json.example` — коммитится в репозиторий,
  отслеживается git'ом, безопасно обновляется обычными коммитами.
  Показывает структуру и доступные поля.
- `config/rooms/*.json` — **не** коммитится (в `.gitignore`). Именно
  отсюда бот реально читает конфиг при запуске. Существует только на
  диске конкретного сервера.

### Настройка нового сервера

1. Склонируйте репозиторий как обычно (или это сделает раннер деплоя).
2. Выполните `mkdir -p config/rooms`, если папки ещё нет (сама папка
   отслеживается через `.gitkeep`, но изначально пуста — без конфигов).
3. Скопируйте нужные примеры, убрав суффикс `.example`, и отредактируйте
   их под этот сервер:
   ```bash
   cp config/rooms.example/public.json.example config/rooms/public.json
   cp config/rooms.example/private.json.example config/rooms/private.json
   ```
4. Отредактируйте `count`, `numbering`, `roomName` и остальные поля в
   `config/rooms/*.json` под реальные нужды этого сервера.
5. Убедитесь, что в `.env` в `HAXBALL_TOKENS` указано не меньше токенов,
   чем суммарное количество комнат по всем файлам в `config/rooms/`.
6. Запустите бота как обычно (`npm start`). Последующий деплой нового
   кода (`git pull` / workflow деплоя) никогда не затронет
   `config/rooms/`, так как папка в `.gitignore` — конфигурация комнат
   этого сервера остаётся точно такой, как вы её настроили.

### Вы не ограничены этими двумя примерами

`public.json.example` и `private.json.example` — это лишь отправная
точка. Загрузчику конфигов не важны ни имена файлов, ни их количество:
при старте он сканирует **все** `*.json` файлы в `config/rooms/`, без
какой-либо регистрации в коде. Поэтому можно свободно:

- Добавлять сколько угодно файлов конфигов с любыми именами
  (`tournament.json`, `eu-1.json`, `training.json` и т.д.).
- Задавать каждому свой `count` (сколько экземпляров комнаты запускать
  из этого конкретного конфига) и свою настройку `numbering`.
- Свободно комбинировать `mode`, `roomCategory`, `defaultTeamPickMode`
  и любые другие поля независимо в каждом файле.

Главное — убедиться, что в `HAXBALL_TOKENS` хватает токенов на
**суммарное** количество комнат по всем добавленным файлам, и что у
любого файла с `numbering: true` в `roomName` где-то присутствует
плейсхолдер `{num}` (иначе бот откажется запускаться и явно укажет на
проблемный файл).
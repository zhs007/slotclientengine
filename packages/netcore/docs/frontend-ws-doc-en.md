# Frontend Integration Guide (WebSocket)

This project communicates with the frontend via WebSocket using JSON. This guide explains how to connect, send commands (cmd), receive messages (msg), the meaning of key fields, and a typical sequence. The content is derived from the repository’s current source; use exact field names and casing.

## Connection

- Protocol: WebSocket (text JSON)
- Endpoint: `ws://<service_host>:<service_port>/`
  - Source: root `cfg/config.json` (example: `cfg/config.example.json`)
  - Local example: `ws://127.0.0.1:3721/` or `ws://localhost:3721/`
- HTTP liveness: an HTTP GET on the same port returns `ok`
- Payload format: each frame is a JSON object; sending a JSON array (batch of objects) is also supported

## Conventions

- Client sends “commands” (cmd): the JSON must have `cmdid`, e.g. `{ cmdid: "keepalive" }`
- Server pushes “messages” (msg): the JSON has `msgid`, e.g. `{ msgid: "userbaseinfo", ... }`
- After processing any command, the server sends a command result:
  - `cmdret`: `{ msgid: "cmdret", cmdid: "<same as request>", isok: true|false }`
  - The client must listen for and correlate `cmdid` and `isok`
- Errors and notices are unified as `noticemsg2`:
  - Shape: `{ msgid: "noticemsg2", msgcode: <int>, msgparam: <object>, ctrltype: "restart"|"notice", type: <see NOTICETYPE> }`
  - `type`/`ctrltype` indicate semantics (e.g., force disconnect, modal message)
- The server may push asynchronous messages at any time (`userbaseinfo`, `gameuserinfo`, `commonjackpot`, ...). The client should route/handle by `msgid`.

## Message catalog (msgid)

- `cmdret`: command result. `{ cmdid, isok }`
- `noticemsg2`: error/notice. `{ msgcode, msgparam, ctrltype, type }`
- `timesync`: server time sync. `{ servtime }` (unix seconds)
- `keepaliveret`: heartbeat ack. `{ nettime }`
- `verinfo`: version check result. `{ info, isok }`
- `userbaseinfo`: base user info. `{ userbaseinfo, ispush, ver }`
- `gamecodeinfo`: game code map (reserved). `{ map }`
- `gamecfg`: per-game config after entering game (line bets, limits, plus logic configs)
- `gameuserinfo`: in-game user state. `{ lastctrlid, ctrlid, giftfree, playerState }`
- `gamemoduleinfo`: module info updates (may include `gmi.replyPlay`)
- `collectinfo`: collect-feature info
- `giftfreeinfo`: gift/free-spin info snapshot
- `commonjackpot`: common jackpot status (pool list, recent wins)
- `commonjackpotinfo`: common jackpot module info
- `wincommonjackpot`: hitting common jackpot broadcast (`{ jpwin, jpl }`, note `jpl` is server-incremented by +1)

## Error codes and notice types

- Error codes (subset from `src/errcode.js`):
  - 1 `EC_API_HTTPERR`, 3 `EC_API_NORESULT`, 6 `EC_API_ERROR`
  - 7 `EC_CTRLID_ERR`, 8 `EC_GAME_IS_UPDATING`
  - 10 `EC_UGI_CURCTRLID`, 13 `EC_UGI_ERROR`
  - 25 `EC_GAMECTRL_NOGAMECTRL`, 29 `EC_GAMECTRL_NOLASTGR`
  - 33 `EC_UNDEFINED_CMDID`, 34 `EC_GAMELOGIC_SERV_ERROR`
  - 37 `EC_GAMECTRL3_CANCEL`
  - 38/39 `EC_CJ_CTRLID`/`EC_CJ_CTRLID2`
  - 50 `EC_UPDBETID_ERR`, 51 `EC_CJ_BETID`, 52 `EC_CJ_ALREADYEND`
  - 53 `EC_GAMECTRL3_NOPROCPARAM`, 55 `EC_GAMECTRL3_NOPARAM`, 56 `EC_GAMECTRL3_INVALIDPARAM`
  - 57/58 `EC_CJ_STATECHG_OPEN/CLOSE`, 59/60 `EC_CJERR_STATECHG_OPEN/CLOSE`
  - 61 `EC_BET_DATAERR`
  - 100 `EC_PLOGIN_FAIL`, 101 `EC_CMD_PARAM_FAIL`, 102 `EC_GUESTLOGIN_FAIL`
  - 105 `EC_NOTLOGIN`, 107 `EC_TOKEN_FAIL`, 108 `EC_APP_NEED_UPD`
  - 109 `EC_NO_GAMELOGIC`, 110 `EC_INVALID_CTRLID`
  - 112 `EC_GIFT_PARAMFAIL`, 113 `EC_NO_FREECASH`, 115 `EC_NO_GIFTFREE`, 116 `EC_TOOFAST`
- Notice types (`base.NOTICETYPE`):
  - 0 INFO (informational)
  - 1 DEBUG (debugging; usually not shown to end users)
  - 2 ERROR (blocking error, needs confirmation)
  - 3 ENDING (connection will be terminated; client should cleanup/disconnect)
  - 5 CLOSEGAME (close the game)
  - 6 NOCTRL (no control; e.g., modal that blocks)

## User and state shapes

- `userbaseinfo` (from `src/user/userinfo.js` -> `tomsgobj()`):
  - `pid` platform/business id
  - `uid` user id
  - `nickname` display name
  - `gold` balance
  - `gamelevel`, `exp`, `iconid`, `spinnums` common fields
  - `token` session token (guest, etc.)
  - `dttoken` third-party token (same as login `token`) — not cached client-side
  - `currency` (e.g., USD)
  - `jurisdiction` (region)
  - `freecash` available free cash (if any)
  - Top-level extras: `ispush` (is push), `ver` (server/app version)

- `gameuserinfo`:
  - `ctrlid` the current encoded control ID
  - `lastctrlid` previous encoded control ID
  - `giftfree` free spin/gift state (module-defined)
  - `playerState` game engine’s player state (server strips `private`)
  - Client behavior: caches `ctrlid`, `lastctrlid`, and `playerState` into UserInfo; refreshed on each `gameuserinfo` push
  - Note: you must use this `ctrlid` as-is in subsequent `gamectrl3` requests.

- `gamecfg` (after entering a game):
  - `linebets` available line counts
  - `defaultLinebet` default line count
  - `maxTotalBetLimit` total bet cap (age/jurisdiction/currency dependent)
  - plus logic configs merged from backend `getLogicConfig/getLocalConfig`
  - Client also caches `ver` and `coreVer` from this message for diagnostics
  - Field `data` is a JSON string; the client parses and caches it in `UserInfo.gamecfgData`

- `giftfreeinfo` snapshot (from platform + server filtering):
  - `fSpin` array of items like `{ id, bet, lines, times, total, remaining, effectiveTime, expireTime, title, info, drawn }`
  - `totalWin` aggregated reward, etc.
  - Note: server filters out entries whose `lines` are not in game cfg `bets`.

- `commonjackpot`:
  - `lstpool` jackpot pools
  - `lstwin` recent wins
  - `isbussnessopen` business enabled, `isgameopen` game enabled, `ver` config version

## Commands (cmdid) and examples

Each request is a JSON object with at least `cmdid`. Besides business messages, the server will always send a `cmdret` to indicate success or failure.

- keepalive (heartbeat)
  - Request: `{ cmdid: "keepalive" }`
  - Response: `keepaliveret` + `cmdret`

// Deprecated: checkver (version check)

- Required: `nativever`, `scriptver`, `clienttype`, `businessid`
- Example:
  ```json
  {
    // Deprecated: "cmdid": "checkver",
    "nativever": 1710120,
    "scriptver": 1712260,
    "clienttype": "web",
    "businessid": "demo"
  }
  ```
- Success: `verinfo { isok:true }` + `cmdret{isok:true}`
- Failure: `noticemsg2 { msgcode:108(EC_APP_NEED_UPD), type:ENDING }` + `cmdret{isok:false}`

- flblogin (platform login)
  - Required: `token`, `language` (e.g., `en_US`)
  - Optional: `gamecode`, `clienttype`, `clientid`, `businessid`, `jurisdiction`, `isRobot`
  - On success, server will push: `timesync`, `gamecodeinfo`, `userbaseinfo`, `commonjackpot` and send `cmdret{isok:true}`

- guestlogin (guest login)
  - Required: `token`, `language`; optional: `guestuname`
  - On success: same as flblogin; `cmdret{isok:true}`

- logout
  - Request: `{ cmdid:"logout" }`
  - Success: clears session, `cmdret{isok:true}`; if not logged in: `noticemsg2(EC_NOTLOGIN, type:ENDING)` + `cmdret{isok:false}`

- comeingame3 (enter game)
  - Required: `gamecode`, `tableid`, `isreconnect` (boolean)
  - Note: `tableid` is currently reserved; pass an empty string `""`.
  - On success:
    - Pushes one or more: `gameuserinfo` (with first `ctrlid`), possibly `giftfreeinfo`, `commonjackpot`
    - Finally pushes: `gamecfg` (linebets/defaultLinebet/maxTotalBetLimit + logic config)
    - Returns `cmdret{isok:true}`

- gamectrl3 (in-game control/Spin/Buy Feature)
  - Required: `gameid`, `ctrlid`, `ctrlname`, `ctrlparam` (object)
  - Notes:
    - Use the latest `ctrlid` from `gameuserinfo` (encoded). The server decodes and validates against the user `uid`.
    - Common `ctrlparam` fields: `bet`, `lines`, `times`, `autonums`, etc.
    - For free spins/gifts: include `giftfree: true` and `giftfreeid`.
  - Success: typically pushes new `userbaseinfo` and `gameuserinfo`, then `cmdret{isok:true}`
  - Failure: `noticemsg2` (e.g., `EC_INVALID_CTRLID`/`EC_UGI_ERROR`/`EC_PLOGIN_FAIL`/`EC_GAME_IS_UPDATING`) + `cmdret{isok:false}`

- reqcommonjackpot
  - Request: `{ cmdid:"reqcommonjackpot" }`
  - Success: pushes `commonjackpot`, and `cmdret{isok:true}`

- usegiftfree
  - Required: `gameid`, `giftfreeid`, `action`
  - Currently supported: `action: "refuse"` (refuse free spin)
  - Success: may push `gameuserinfo` and `userbaseinfo` updates; `cmdret{isok:true}`

- collect
  - Required: `gameid`, `playIndex`
  - Success: `cmdret{isok:true}`; failure: `noticemsg2` + `cmdret{isok:false}`

- getfreecash
  - Optional: `gamecode` (defaults to current game)
  - Success: updates `userbaseinfo` (balance), `cmdret{isok:true}`; if none available, error `EC_NO_FREECASH`

## Typical sequence

1. Establish WebSocket connection
2. Version check: `checkver` (Deprecated – no longer required)
3. Login: `flblogin` or `guestlogin`
   - Server pushes: `timesync`, `gamecodeinfo`, `userbaseinfo`, (maybe) `commonjackpot`
4. Enter game: `comeingame3`
   - Pushes: `gameuserinfo` (with first `ctrlid`), (maybe) `giftfreeinfo`, `commonjackpot`
   - Pushes: `gamecfg`
5. Play loop: send `gamectrl3` repeatedly
   - Typically pushes: `userbaseinfo`, `gameuserinfo`; then `cmdret`
6. Other operations: `reqcommonjackpot`, `usegiftfree`, `collect`, `getfreecash`
7. Heartbeat: send `keepalive` every 20–30s
8. Exit: `logout` or disconnect

## ctrlid safety

- The server provides encoded `ctrlid/lastctrlid` in `gameuserinfo`.
- The client must echo the current `ctrlid` as-is in `gamectrl3`.
- Do not increment/guess locally; the server decodes and validates. Errors yield `EC_INVALID_CTRLID/EC_CTRLID_ERR`.

## Example snippets

- Enter a game:
  ```json
  { "cmdid": "comeingame3", "gamecode": "game-default", "tableid": "", "isreconnect": false }
  ```
- One spin:
  ```json
  {
    "cmdid": "gamectrl3",
    "gameid": 101,
    "ctrlid": 123456789,
    "ctrlname": "spin",
    "ctrlparam": { "bet": 1, "lines": 10, "times": 1 }
  }
  ```

## Notes

- The server may be under maintenance (`EC_GAME_IS_UPDATING`); handle gracefully
- Jurisdiction/age/currency can affect available lines and bet caps (see `gamecfg`)
- Free spins/gifts may reduce real cost (`realbet` can be 0)
- `gamecodeinfo` is currently an empty map; reserved for multi-language code mapping

---

This guide is based on: `cmd/*` (commands), `msg/*` (messages), `src/serv.js` (dispatch), `src/errcode.js` (error codes), `lib/base.js` (notice types), `config.js` and `cfg/config.json` (config).

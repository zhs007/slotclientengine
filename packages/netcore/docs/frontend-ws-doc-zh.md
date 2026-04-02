# 前端对接文档（WebSocket）

本项目是通过 WebSocket 与前端通讯的游戏服务器。本文面向前端接入工程师，说明如何建立连接、发送指令（cmd）、接收消息（msg）、字段含义与典型时序。示例基于当前仓库代码抽取，字段与大小写需严格一致。

## 连接信息

- 协议：WebSocket（纯文本 JSON）
- 服务地址：`ws://<service_host>:<service_port>/`
  - 配置来源：根目录 `cfg/config.json`（示例见 `cfg/config.example.json`）
  - 例如本地默认：`ws://127.0.0.1:3721/` 或 `ws://localhost:3721/`
- HTTP 探活：同端口直接 HTTP GET 返回 `ok`
- 传输格式：每条消息为一个 JSON 对象；也支持一次发送 JSON 数组（批量多个对象）

## 通用约定

- 前端发起“指令”（command）：消息体必须包含字段 `cmdid`，例如 `{ cmdid: "keepalive" }`
- 服务端推送“消息”（message）：消息体包含字段 `msgid`，例如 `{ msgid: "userbaseinfo", ... }`
- 每次处理完指令，服务端都会下发一条命令结果：
  - `cmdret`：`{ msgid: "cmdret", cmdid: "<与请求一致>", isok: true|false }`
  - 前端务必监听并核对 `cmdid` 与 `isok`
- 错误与提示统一通过 `noticemsg2` 下发：
  - 结构：`{ msgid: "noticemsg2", msgcode: <错误码>, msgparam: <对象>, ctrltype: "restart"|"notice", type: <见下文 NOTICETYPE> }`
  - `type`/`ctrltype` 用于提示语义与控制（例如强制结束连接、提示弹窗等）
- 服务器可能在任何时刻推送异步消息（如 `userbaseinfo`、`gameuserinfo`、`commonjackpot` 等），前端需做好订阅分发。

## 通用消息一览（msgid）

- `cmdret`：命令处理结果。`{ cmdid, isok }`
- `noticemsg2`：错误/提示。`{ msgcode, msgparam, ctrltype, type }`
- `timesync`：服务器时间同步。`{ servtime }`（秒级时间戳）
- `keepaliveret`：心跳回执。`{ nettime }`
- `verinfo`：版本校验返回。`{ info, isok }`
- `userbaseinfo`：用户基础信息。`{ userbaseinfo, ispush, ver }`
- `gamecodeinfo`：游戏码映射（预留，当前为空映射）。`{ map }`
- `gamecfg`：进入游戏后的配置集合（下注线、上限等 + 逻辑配置）。
- `gameuserinfo`：当前游戏内玩家态。`{ lastctrlid, ctrlid, giftfree, playerState }`
- `gamemoduleinfo`：模块信息更新（含 `gmi.replyPlay` 等）
- `collectinfo`：收集玩法信息
- `giftfreeinfo`：红包/免费旋转信息汇总（字段见下）
- `commonjackpot`：公共奖池状态（池子列表、最近中奖等）
- `commonjackpotinfo`：公共奖池模块信息
- `wincommonjackpot`：命中公共奖池广播（`{ jpwin, jpl }`，其中 `jpl` 已在服务端 +1）

## 错误码与通知类型

- 错误码（节选，来自 `src/errcode.js`）：
  - 1 `EC_API_HTTPERR`、3 `EC_API_NORESULT`、6 `EC_API_ERROR`
  - 7 `EC_CTRLID_ERR`、8 `EC_GAME_IS_UPDATING`
  - 10 `EC_UGI_CURCTRLID`、13 `EC_UGI_ERROR`
  - 25 `EC_GAMECTRL_NOGAMECTRL`、29 `EC_GAMECTRL_NOLASTGR`
  - 33 `EC_UNDEFINED_CMDID`、34 `EC_GAMELOGIC_SERV_ERROR`
  - 37 `EC_GAMECTRL3_CANCEL`
  - 38/39 `EC_CJ_CTRLID/EC_CJ_CTRLID2`
  - 50 `EC_UPDBETID_ERR`、51 `EC_CJ_BETID`、52 `EC_CJ_ALREADYEND`
  - 53 `EC_GAMECTRL3_NOPROCPARAM`、55 `EC_GAMECTRL3_NOPARAM`、56 `EC_GAMECTRL3_INVALIDPARAM`
  - 57/58 `EC_CJ_STATECHG_OPEN/CLOSE`、59/60 `EC_CJERR_STATECHG_OPEN/CLOSE`
  - 61 `EC_BET_DATAERR`
  - 100 `EC_PLOGIN_FAIL`、101 `EC_CMD_PARAM_FAIL`、102 `EC_GUESTLOGIN_FAIL`
  - 105 `EC_NOTLOGIN`、107 `EC_TOKEN_FAIL`、108 `EC_APP_NEED_UPD`
  - 109 `EC_NO_GAMELOGIC`、110 `EC_INVALID_CTRLID`
  - 112 `EC_GIFT_PARAMFAIL`、113 `EC_NO_FREECASH`、115 `EC_NO_GIFTFREE`、116 `EC_TOOFAST`
- 通知类型（`base.NOTICETYPE`）：
  - 0 INFO（普通信息，通常可直接提示）
  - 1 DEBUG（调试用，一般不展示给最终用户）
  - 2 ERROR（错误，需要确认）
  - 3 ENDING（连接将被终止，前端应清理并断开）
  - 5 CLOSEGAME（关闭游戏）
  - 6 NOCTRL（不做控制，用对话框卡住等）

## 用户与状态结构

- `userbaseinfo`（字段来自 `src/user/userinfo.js` -> `tomsgobj()`）：
  - `pid` 商户/平台ID
  - `uid` 用户ID
  - `nickname` 昵称
  - `gold` 余额
  - `gamelevel` `exp` `iconid` `spinnums` 等通用字段
  - `token` 会话token（游客等场景）
  - `dttoken` 第三方平台token（与登录 `token` 一致）——客户端不做本地缓存
  - `currency` 币种（如 USD）
  - `jurisdiction` 辖区
  - `freecash` 可领取的免费现金（如有）
  - 额外顶层：`ispush`（是否推送）`ver`（服务版本）

- `gameuserinfo`：
  - `ctrlid` 本轮可用的“控制ID”（已编码）
  - `lastctrlid` 上一控制ID（已编码）
  - `giftfree` 免费旋转/红包状态（结构由服务端模块给出）
  - `playerState` 游戏引擎玩家态（已去除 `private` 字段）
  - 客户端行为：会将 `ctrlid`、`lastctrlid`、`playerState` 缓存在 UserInfo 中，并在每次收到 `gameuserinfo` 时刷新
  - 说明：前端后续发起 `gamectrl3` 时，必须使用这里的 `ctrlid`（原样回传，不要自行推算）。

- `gamecfg`：进入游戏后下发，包含但不限于：
  - `linebets` 可选线数数组
  - `defaultLinebet` 默认线数
  - `maxTotalBetLimit` 总下注上限（按年龄/辖区/币种等策略限制）
  - 以及游戏逻辑配置（由后端 `getLogicConfig/getLocalConfig` 合并）
  - 客户端同时会缓存该消息中的 `ver` 与 `coreVer` 以便诊断定位
  - 其中 `data` 字段是一个 JSON 字符串；客户端会解析并缓存到 `UserInfo.gamecfgData`

- `giftfreeinfo`：红包/免费旋转列表与统计（来自 DT 接口+服务端过滤）。典型字段：
  - `fSpin`: 免费旋转项数组，每项可能包含 `{ id, bet, lines, times, total, remaining, effectiveTime, expireTime, title, info, drawn }`
  - `totalWin`: 当前累计可得奖励等
  - 注意：服务端会按游戏可用线数过滤 `lines` 不在 `cfg.bets` 的条目

- `commonjackpot`：
  - `lstpool` 奖池列表（每个奖池的当前值等）
  - `lstwin` 最近中奖记录
  - `isbussnessopen` 商户是否开启，`isgameopen` 该游戏是否开启，`ver` 配置版本号

## 指令定义（cmdid）与示例

以下所有请求均为 JSON 对象，至少包含 `cmdid` 字段。响应除业务消息外，都会附带一条 `cmdret` 表示是否成功。

- keepalive（心跳）
  - 请求：`{ cmdid: "keepalive" }`
  - 响应：`keepaliveret` + `cmdret`

// 已弃用：checkver（版本校验）

- 必填：`nativever` `scriptver` `clienttype` `businessid`
- 请求示例：
  ```json
  {
    // 已弃用："cmdid": "checkver",
    "nativever": 1710120,
    "scriptver": 1712260,
    "clienttype": "web",
    "businessid": "demo"
  }
  ```
- 成功：`verinfo { isok:true }` + `cmdret{isok:true}`
- 失败：`noticemsg2{ msgcode:108(EC_APP_NEED_UPD), type:ENDING }` + `cmdret{isok:false}`

- flblogin（平台登录）
  - 必填：`token` `language`（如 `en_US`）
  - 可选：`gamecode` `clienttype` `clientid` `businessid` `jurisdiction` `isRobot`
  - 成功后服务器会主动推送：`timesync`、`gamecodeinfo`、`userbaseinfo`、`commonjackpot`，并返回 `cmdret{isok:true}`
  - 失败：下发 `noticemsg2`，`cmdret{isok:false}`

- guestlogin（游客登录）
  - 必填：`token` `language`；可选：`guestuname`
  - 成功：同 flblogin，推送基础信息与奖池；`cmdret{isok:true}`

- logout（登出）
  - 请求：`{ cmdid:"logout" }`
  - 成功：清除会话，`cmdret{isok:true}`；未登录则 `noticemsg2(EC_NOTLOGIN, type:ENDING)` + `cmdret{isok:false}`

- comeingame3（进入游戏）
  - 必填：`gamecode` `tableid` `isreconnect`(布尔)
  - 说明：`tableid` 为保留字段，请传空字符串 `""`。
  - 成功：
    - 推送一次或多次：`gameuserinfo`（含 `ctrlid`）、可能的 `giftfreeinfo`、`commonjackpot`
    - 最终下发：`gamecfg`（含 `linebets/defaultLinebet/maxTotalBetLimit` + 逻辑配置）
    - 并返回：`cmdret{isok:true}`
  - 失败：`noticemsg2`（如参数错误/未登录/无此游戏）+ `cmdret{isok:false}`

- gamectrl3（游戏操作/Spin/Buy Feature 等）
  - 必填：`gameid` `ctrlid` `ctrlname` `ctrlparam`（对象）
  - 说明：
    - `ctrlid` 必须使用最近一次 `gameuserinfo` 推送中的（已编码）。服务端会按用户 `uid` 解码校验。
    - `ctrlparam` 常见字段：`bet`（单线注）`lines`（线数）`times`（倍数/次数）`autonums`（自动余量）等。
    - 若使用红包/免费旋转：需附加 `giftfree: true` 与 `giftfreeid`
  - 成功：通常会推送新的 `userbaseinfo` 和 `gameuserinfo`，再返回 `cmdret{isok:true}`
  - 失败：`noticemsg2`（可能包含 `EC_INVALID_CTRLID/EC_UGI_ERROR/EC_PLOGIN_FAIL/EC_GAME_IS_UPDATING` 等）+ `cmdret{isok:false}`

- reqcommonjackpot（请求公共奖池数据）
  - 请求：`{ cmdid:"reqcommonjackpot" }`
  - 成功：推送 `commonjackpot`，并 `cmdret{isok:true}`

- usegiftfree（红包/免费旋转处理）
  - 必填：`gameid` `giftfreeid` `action`
  - 当前支持：`action: "refuse"`（拒绝免费旋转）
  - 成功：可能推送 `gameuserinfo` 与 `userbaseinfo` 更新，并 `cmdret{isok:true}`

- collect（收集玩法结算）
  - 必填：`gameid` `playIndex`
  - 成功：`cmdret{isok:true}`；失败：`noticemsg2` + `cmdret{isok:false}`

- getfreecash（领取免费现金）
  - 可选：`gamecode`（不填默认当前游戏）
  - 成功：更新 `userbaseinfo`（余额刷新），`cmdret{isok:true}`；无可领则返回错误码 `EC_NO_FREECASH`

## 典型接入时序

1. 连接 WebSocket 成功
2. 版本校验：`checkver`（已弃用——不再需要）
3. 登录：`flblogin` 或 `guestlogin`
   - 服务端推送：`timesync`、`gamecodeinfo`、`userbaseinfo`、（可能）`commonjackpot`
4. 进入游戏：`comeingame3`
   - 推送：`gameuserinfo`（含首个 `ctrlid`）、（可能）`giftfreeinfo`、`commonjackpot`
   - 推送：`gamecfg`
5. 进行游戏：循环发 `gamectrl3`
   - 每次通常推送：`userbaseinfo`、`gameuserinfo`；并返回 `cmdret`
6. 其他：根据需要调用 `reqcommonjackpot`、`usegiftfree`、`collect`、`getfreecash` 等
7. 心跳：定期发 `keepalive`，建议 20~30 秒一次
8. 退出：`logout` 或直接断开

## ctrlid 安全说明

- 服务端在 `gameuserinfo` 提供已“编码”的 `ctrlid/lastctrlid`
- 前端在 `gamectrl3` 请求里必须原样回传当前 `ctrlid`
- 不要自行递增/猜测；服务端会按用户 `uid` 解码校验，错误会返回 `EC_INVALID_CTRLID/EC_CTRLID_ERR`

## 示例片段（仅供参考）

- 进入游戏：
  ```json
  { "cmdid": "comeingame3", "gamecode": "game-default", "tableid": "", "isreconnect": false }
  ```
- 一次 spin：
  ```json
  {
    "cmdid": "gamectrl3",
    "gameid": 101,
    "ctrlid": 123456789,
    "ctrlname": "spin",
    "ctrlparam": { "bet": 1, "lines": 10, "times": 1 }
  }
  ```

## 其他注意事项

- 服务端可能在维护中（`EC_GAME_IS_UPDATING`），需友好提示
- 某些辖区/年龄/币种会影响可下注线与上限（见 `gamecfg`）
- 红包/免费旋转会影响真实扣款（`realbet` 可能为 0）
- `gamecodeinfo` 目前为空映射，预留国际化/多语言游戏码场景

---

文档基于以下代码文件整理：`cmd/*` 指令、`msg/*` 推送、`src/serv.js` 消息分发、`src/errcode.js` 错误码、`lib/base.js` 通知类型、`config.js` 与 `cfg/config.json` 配置。

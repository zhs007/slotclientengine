# 任务 122：Platform Bootstrap Provider 执行报告

- 执行时间：2026-07-22 14:56:51 UTC
- 分支：`codex/task-122-platform-bootstrap-provider`
- 工作树基线：`1b6951a65df7e42eb851e2c20397285d2a0ef014`
- Task 121 基线：`b7e6096`，已确认是当前基线祖先
- Node：`v24.14.0`，`/Users/zerro/.nvm/versions/node/v24.14.0/bin/node`
- pnpm：`10.0.0`，`/Users/zerro/.nvm/versions/node/v24.14.0/bin/pnpm`
- 浏览器验收：按用户要求未执行，人工清单见文末

## 1. 结果

Task 122 的代码与自动化验收已完成。新增协议无关的 `@slotclientengine/platformbootstrap` 和 Leo 专用的 `@slotclientengine/platformbootstrap-leo`，game002 已在 Loading 首帧后并行启动 CDN resource、Leo bootstrap 和唯一 live session；99% 仅负责 readiness join 与 skin finalization。game003 未接入 Provider，完整回归通过。

没有迁移 test 分支的 `stateData`、Zustand、Inversify `GameContainer`、eventcore、netcore2、RoundService 或全局 round callback。Provider 只返回 per-instance、深度冻结且无 credential 的初始化 snapshot；runtime round state 仍属于既有 framework/adapter。

## 2. test 分支参数与实现审计

审计了 test 分支 Leo bridge/init/user/settings/IndexedDB 相关实现，仅保留协议事实并重建生命周期：

- launcher canonical：`gameCode`、`lang`、`platformToken`、`businessCode`；兼容 alias：`gamecode`、`language`、`token`、`businessid`。
- 其它参数：`configUrl`、`jurisdiction`、可选 `license`、`moneymode`、`replayurl`、`mode`、`currency`。
- canonical 与 alias 同时给出但值冲突、同 key 重复、空值、未编码空白、非安全 URL 均显式失败。
- `businessCode=guest&moneymode=fun` 为 fun；`mode=REPLAY` 必须与 `replayurl` 成对，当前 game002 transport 显式拒绝 replay。
- launcher config query 使用精确编码并禁止覆盖已有身份字段；请求/schema/common translation 失败为 fatal。
- optional game translation 失败生成 typed warning；setting/IndexedDB 失败使用严格默认值并生成 typed warning。
- setting API 仅替换精确 `/v1/` path segment 为 `/v2/`；禁止覆盖既有 token/gameCode query。
- fun setting 使用每实例 `GameDB` / `userSettings` adapter，并按当前 game code 过滤；销毁时关闭本实例 DB。

## 3. 交付内容

### 3.1 Platform packages

- `platformbootstrap`：Provider/handle/snapshot 协议、深冻结校验、Direct provider、abort/resolve race 与幂等 destroy。
- `platformbootstrap-leo`：strict launcher parser、launcher config、common/game translation、remote setting、IndexedDB setting、warning 与 Leo Provider。
- 两包 production runtime 没有第三方依赖；Leo 包仅依赖 workspace `platformbootstrap`。

### 3.2 Loading 与所有权

`gameloading` 新增 optional generic readiness，未提供时保持 game003/既有 consumer 行为。固定时序为：同一 start turn 启动 readiness 与 resource runner；resource 独立到 99%；join resource/readiness/visual readiness；随后执行 `onBeforeComplete`；成功后才发布 100% 并进入游戏。

| 场景                    | 验收结果                                                                    |
| ----------------------- | --------------------------------------------------------------------------- |
| readiness 先失败        | abort resource，原错误进入 Loading error                                    |
| resource 先失败         | abort readiness；晚到 fulfilled result 仍 dispose 一次                      |
| visual readiness 失败   | 清理已完成 readiness result                                                 |
| `onBeforeComplete` 失败 | dispose readiness result 一次，cleanup error 不覆盖原错误                   |
| controller destroy      | abort 两组任务并清理已完成/晚到 result                                      |
| `onBeforeComplete` 成功 | 所有权交给 prepared result，controller 不提前 dispose                       |
| enter/destroy           | game app 幂等清理 framework/session、platform handle、value resource bundle |

### 3.3 gameframeworks、Leo UI 与 game002

- framework options 新增 optional `initialMuted`、`initialFastMode`、`initialAutoMode`，默认仍为 `false`；首个 state snapshot 即反映初值。
- live session prepare 支持 AbortSignal，already-aborted、connect race、disconnect 均有回归。
- Leo UI 接收显式 typed labels；平台 snapshot 不进入 UI props。
- game002 query 只经过 `parseGame002LaunchQuery` 一次；fixed server、`skin=1`、`lines=30` 与原 spin request 保持不变。
- `game002-bootstrap` dynamic chunk 并行创建 Leo Provider 与一条既有 `SlotGameLiveSessionLike`；任一失败都会 abort sibling 并 best-effort 清理。
- 99% 只完成 skin/value-presentation finalization；100% 后 runtime 注入 brand/currency/locale、受控 translation labels 和初始 sound/fast/auto。
- 单 session 测试验证 session helper 只调用一次，framework 复用 prepared session，不再创建第二条连接。

### 3.4 game003 对照

game003 package/source/dist 均不含 platformbootstrap dependency、Leo launcher、`GameDB` 或 Leo setting warning marker。Loading UI、默认 initial preferences、live query、round、orientation-focus、bg-bar、minecart 与 Ways 路径不变。

## 4. 自动化验收

所有目标 package/app 的 format、lint、typecheck、test、build/release check 均通过。

| 范围                    |    测试 | statements | branches | 结果 |
| ----------------------- | ------: | ---------: | -------: | ---- |
| `platformbootstrap`     |     5/5 |     95.23% |   93.33% | 通过 |
| `platformbootstrap-leo` |   19/19 |     88.96% |   84.07% | 通过 |
| `gameloading`           |   25/25 |     91.75% |   86.62% | 通过 |
| `gameframeworks`        |   51/51 |     90.92% |   81.92% | 通过 |
| `game-ui-leo`           |   15/15 |     97.61% |   98.03% | 通过 |
| `game002`               | 102/102 |     86.45% |   80.47% | 通过 |
| `game003`               | 136/136 |     92.52% |   83.68% | 通过 |

合计 353/353 测试通过。`game002 release:check` 与 `game003 release:check` 均通过；唯一非失败构建提示为 Vite 对既有大型 runtime chunk 的 size warning。

另外完成：

- `pnpm install --frozen-lockfile`：通过，workspace 已是最新。
- `git diff --check`：通过。
- production source 禁用架构扫描：无匹配。
- game002 dist synthetic credential fixture 扫描：无匹配。
- game003 source/package/dist Provider marker 扫描：无匹配。
- fatal error/warning/snapshot serialization 测试：不包含 credential 或原始失败 URL。

## 5. 发布分块与体积

Task 121 报告基线 initial loading 为 180,964 B / gzip 33,687 B。本次最终产物：

| chunk                           |         raw |   gzip -9 | 说明                                          |
| ------------------------------- | ----------: | --------: | --------------------------------------------- |
| `index-D6m741Db.js`             |   182,874 B |  34,091 B | initial loading；无 React/Leo/Provider marker |
| `game002-bootstrap-DBjWOE46.js` |    15,861 B |   4,878 B | Provider/session readiness                    |
| `skin-id-BhVCdEZK.js`           |    73,325 B |  18,782 B | bootstrap/runtime 复用的同一 URL              |
| `game-entry-CP716fom.js`        | 1,560,731 B | 326,524 B | 100% 后 runtime、React、Leo HUD               |

initial 相比 Task 121 增加 1,910 B raw、404 B gzip。静态发布检查确认初始 chunk 无 Provider/React，bootstrap 与 runtime 各只有一个入口 URL，并共享同一个依赖 chunk，没有打两份等价代码。

## 6. lockfile

`pnpm-lock.yaml` 只有预期 workspace 变化：

- game002 增加两个 workspace link；
- 新增 `packages/platformbootstrap` importer；
- 新增 `packages/platformbootstrap-leo` importer，runtime 仅 link `platformbootstrap`；
- 新包 devDependencies 全部解析到 lockfile 已存在的根工具版本；没有新增第三方 runtime package。

## 7. 剩余风险与用户浏览器验收

自动化没有访问真实 launcher/translation/setting 服务，也没有建立真实 rgstest WebSocket；因此下列浏览器项目按用户要求保留为未执行，完成后才能确认真实环境端到端行为：

1. Leo Loading 视觉与 Task 121 一致。
2. Network waterfall 中 CDN 与 launcher/session 请求重叠，不是到 99% 才启动。
3. resource、config/translation/setting、WebSocket、visual readiness 全完成后才 99 -> 100。
4. setting request/console/error 不泄漏 token。
5. 全程只有一条 WebSocket。
6. WebSocket 指向固定 game002 server。
7. HUD brand/currency/translation 正确。
8. sound/fast 初值符合 setting，auto 不自动启动。
9. spin payload `lines=30`。
10. resize、Pixi focus、Leo HUD 对齐不变。
11. refresh/destroy 后无残留 fetch、DB/provider handle/socket。
12. invalid alias/config/common translation 阻止进入游戏。
13. optional game translation/setting failure 使用 fallback，并能从 typed warning 观察。
14. Console 无 unhandled Promise、重复 cleanup 或 credential。

最后再用当前 legacy game002 URL 验证 alias 兼容，并抽查 game003 默认 Loading/UI/round/resize 无变化。

## 8. 验收收尾

2026-07-23 对实现进行二次验收并完成以下修正：

- game002 为 test 分支最终 launcher 语言值 `en_GB` 显式映射 BCP-47 locale `en-GB`；
- HUD formatter 保留服务器 cents 语义，同时真实使用 platform snapshot 的 currency/locale；
- Leo 已确认的 `common_label_Balance`、`common_label_win`、`common_label_Totalbet` 进入受控 label mapping，原 Task 121 key 继续作为逐字段 fallback；
- 99% finalization 的 cleanup error 不再覆盖原始 abort/prepare error；
- entered game 的 destroy 改为共享、可等待的 Promise，所有资源仍恰好清理一次，beforeunload 显式处理 cleanup rejection。
- 默认 browser fetch 显式绑定 `globalThis` receiver，避免 Chrome 抛出 `Illegal invocation` 并误报 launcher config failure。
- launcher 的空 `gameTranslationJsonUrl` 规范化为未配置，与既有 Leo falsy/optional 语义保持一致。
- game002 dev server 显式预构建 Leo UI 间接使用的 workspace CJS netcore，避免 Vite 把 CJS `dist/index.js` 当原生 ESM 提供；app 源码与 package dependencies 仍只依赖 gameframeworks facade。
- Leo Loading 进度动画按 test 分支原实现恢复素材内几何：`a2` 以 `(50%, 35%)` 为圆心逆时针展开，`a3` 的揭示边界只在真实内容区从 `30%` 推进到 `70%`；同时恢复 `500ms` progress-art opacity transition。修正前横向裁切在整张透明画布的 `0%..100%` 移动，视觉上大部分时间没有变化。
- 浏览器复验发现快速资源会在 `3200ms` GIF intro 期间先到 `99%`，导致 reveal 第一帧已经是几乎完整的静态图、约 `100ms` 后退出。Leo UI 现在只在 intro 期间记录真实目标进度；reveal 可见后默认用 `1200ms` 从零追赶目标，并在显示进度真正达到 `99%` 后才完成 visual readiness。这个 gate 不改变 CDN、platform bootstrap 或 WebSocket 的真实完成状态，也不会创建第二条 session。

新增 5 项 Provider 回归测试，并为 Leo Loading 动画几何和“intro 期间先到 99%”时序补充断言；重新通过 gameloading-ui-leo 22/22 tests、platformbootstrap-leo 19/19 tests、game002 102/102 tests、lint、typecheck、format check、release check；game003 136/136 tests 与 release check 保持通过。

使用真实 rgstest launcher 参数完成浏览器 smoke：launcher config、空 game translation normalization、common translation、setting、单 WebSocket、enter game 和 Leo HUD 均完成，页面进入 `Ready`；余额、投注与币种按 platform snapshot 显示。测试凭据不写入源码、报告、构建产物或提交。

修复可见进度竞态后再次使用真实参数采样：同一次 reveal 的 `a3` right inset 依次为 `63.0865% -> 50.9392% -> 39.3529%`，证明裁切边界连续向右推进；随后 Loading DOM 移除、保留单个 Pixi canvas，页面进入 `Ready`。

## 9. 结论

除明确交由用户完成的浏览器人工验收外，Task 122 的实现、单元/集成测试、静态发布、依赖边界、安全扫描、game003 隔离与执行报告均满足计划完成标准。

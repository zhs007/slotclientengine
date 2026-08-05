# game003 rules

本文件保存 game003 专属业务和 presentation 合同。通用能力同时遵守 `shared-game-runtime.md`。

## 固定入口与资源 ownership

- 使用 `apps/game003`，严格只支持显式 `skin=2`。
- 唯一正式美术、layout、公开轮带、symbol 与 popup 输入是 `assets/minecart2` 的 mapped Scene Layout package；不得新增旧皮肤目录、平铺资源副本或 fallback。
- package 内部的 `game003-s1` 是稳定 symbol package id，不是仓库路径，也不表示可选皮肤。
- `assets/minecart2` 的当前美术 files/bytes 是 game003 权威交付；首次可由优化
  ZIP 完整接收，之后允许美术直接替换/增加文件。game runtime/build 天然不比对
  map `sha256`/`byteLength`、不因未引用 entry/file 阻断，不依赖 app 传 policy 才
  关闭 integrity gate；实际引用 logical key 仍必须路由到安全存在的 path 并通过
  资源 parser/decoder。资源分组和 generated Vite URL 表由对应工具同步，生成物
  禁止手改。
- live server 与 gamecode 来自 `config/game-runtime.manifest.json`，URL 中 `serverUrl` 显式失败。
- 首屏遵守 `loading-ui.md`：99% 准备 package ownership 和 live session，100% 后创建 framework/Pixi；失败与 destroy 都必须释放 resource/session ownership。

## Scene Layout 与主转轮

- variant、focus rect、art size、node placement、reel geometry、game modes、symbol package 和 award popup 只来自 package manifest。
- app 只使用 package initial mode 的 standard `bg-reel01` 5×5 presentation；未知或缺失 binding 显式失败。
- spin 使用 package symbol package 内的本地公开轮带。服务器 scene 只覆盖本轮临时可见落点，不缓存、推断或暴露服务器真实轮带。
- symbol scale、render priority、normal/state texture 和 VNI/Spine animation binding 只来自 package symbol manifest；app/viewer/test 不维护第二份业务表。
- Spine animation 名大小写精确；缺资源、manifest 闭包不完整、atlas/texture 映射错误或版本不兼容都显式失败。

## 暂停功能

- 传送带、动态 feature bar 和矿车互动当前全部移除：app 不解析对应 server component，不创建 player/runtime，不驱动 package 静态节点，也不把它们加入 `playSpin()` 等待条件。
- shared packages 不得出现 game003 的传送带、矿车、轨道、payload 或 feature 名语义。
- package 中后续补充相关资源不等于功能自动启用；恢复功能必须由独立任务定义 manifest contract、业务解析、ownership、测试和人工验收。
- package 已含 BaseGame、FreeGame、BonusGame 和 transition 视频；在没有业务 contract 前不新增 mode-switch 编排。

## bg-wins

- 中奖 component 名 `bg-wins` 只在 game003 app 配置；logiccore/gameframeworks/rendercore 不硬编码。
- 按 `usedResults` 指向的 results 顺序播放首轮；首轮结束后 spin 可以完成，轮播可 lingering 到下一 spin cleanup。
- `result.pos` 基于当前 5×5 窗口；缺失或越界显式失败。
- result 金额按字段存在性选择 `cashWin64 -> cashWin`，必须 finite positive，再经 `formatServerAmount` 显示；不使用 coinWin、totalwin 或全部 results 兜底。
- symbol 语义校验由 app 显式 validator 决定，shared code 不猜测。

## Coin otherScene

- `bg-gencoins`/CO overlay 把零份 otherScene 视为本 step 无 update；提供时最多一份。
- CO cell 显示 raw positive integer，非 CO cell 必须为 0；symbol code 从 package gameconfig 查询，不硬编码数值。
- shared package 不硬编码 bg-gencoins 或 CO。

## Win amount

- framework HUD、result overlay 和 package award popup 复用 `formatServerAmount`；服务器整数按 cents 解释，不显示货币符号。
- package popup 的 `amountFormat` 可供编辑器预览，runtime 必须注入 game-owned formatter。
- popup tier、VNI project、asset closure 和 segmented timing 只来自 package popup manifest/project，不在 app 或测试维护第二份正式业务表。
- 点击只调用 popup/player 的 advance/dismiss contract；awaiting-dismiss 不阻塞 spin，下一 spin 清理残留。

## 验收

- 资源变更至少运行 Minecart2 generator `--check`、game003 typecheck/test、release checker 和 `git diff --check`。
- 浏览器人工验收不能由单测替代；若用户明确接管，执行报告必须标记为待用户完成。

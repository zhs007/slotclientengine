# Task 228 RenderCore Game Layout Runtime Addressing 执行报告

UTC：2026-08-19T05:31:03Z

## 最终实现

- 新增 canonical `gamelayout:/` address formatter/parser、严格 percent encoding、immutable descriptor
  与 endpoint kind 合同；拒绝 relative、空 segment、`.`/`..`、query/fragment、trailing slash 和
  non-canonical encoding。
- `SceneLayoutPackageRuntime` 新增唯一 `addresses` SPI，提供 `list()`、`describe()`、`resolve()`、
  `bind()`、`wait()`；unknown address、kind mismatch、destroyed resolver、非 event 订阅和 abort 都显式失败。
- catalog 直接从 canonical Scene Layout、nested Popup package、audio binding 和 runtime resource 编译，覆盖
  root/node/reel layer、authored RenderObject、mode/BGM、transition/effect event、Popup layer/string、Symbols
  binding、music/effect 与 caller-owned resource factory；没有新增 manifest 字段、版本或 alias 表。
- Spine transition configured event 复用 package runtime 已有的 official update drain。目标 scene 先原子
  commit，再派发 exact `from/to/effect/spine/event/<name>` occurrence；未安装第二套 Spine listener。
- video transition 提供 `started/ended` lifecycle address；BGM 提供 exact music 与 mode-BGM 两个 owner 视角的
  `started/stopped`。Audiocore 只在 loop instance 成功接管后发 started，在 fade-out 到零并 stop 后发 stopped。
- authored node/layer 返回 borrowed safe capability；runtime resource factory 返回 caller-owned RenderObject。
  image-string factory 强制 typed text/options，authored owner 与 program resource 不按同名 fallback。
- Popup exact named string endpoint 生成 `SceneLayoutPopupStringInput`，继续由一次
  `requestGameMode(..., { preludePopupStrings })` transaction 负责 apply/restore；不直接改 Popup 内部对象。
- Gameframeworks re-export formatter/parser 与全部 production resolver/endpoint/event 类型。
- Game Layout Editor 的 transition inspector 显示/copy exact transition owner address；Spine 选择唯一 configured
  event 后显示/copy exact event address。地址由 shared formatter 派生，不写 manifest。
- 更新 RenderCore、Audiocore、Gameframeworks README 与 shared runtime/editor artifact 长期规则。

## 文档交付

- `docs/gamelayout-runtime-addresses.md`：完整 SPI reference、地址表、RenderObject/layer/resource、Popup string、
  effect、BGM、bind/wait、ownership、错误与 cleanup 示例。
- `docs/crave-task228-gamelayout-runtime-address-migration.md`：Crave 两条 transition `Start` 地址及手工接入步骤。

## 关键决策与计划偏差

- Popup layer 首期只公开稳定 descriptor，不开放内部 Container 或 placement mutation；Popup string 通过 typed
  request input 接入，保留原有 owner transaction。
- Editor 首期把最关键的 transition edge/effect event 做成可视、可复制地址。其它 authored owner 已完整进入
  production catalog，可由 preview/程序 `list()` 枚举；没有把 derived address 复制进 editor draft。
- 未修改任何游戏 app、Crave asset、Scene Layout schema、production ZIP、lockfile 或根工具链。
- 用户明确负责浏览器人工验收，因此本次只执行 headless typecheck、unit/integration test 和格式检查。

## 自动化验收

- `pnpm --filter @slotclientengine/audiocore typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `pnpm --filter @slotclientengine/gameframeworks typecheck`：通过。
- `pnpm --filter gamelayouteditor typecheck`：通过。
- Audiocore `audio-runtime.test.ts`：1 file / 4 tests 通过。
- RenderCore `runtime-address`、package runtime mode/video/base：4 files / 40 tests 通过。
- Game Layout Editor `transitions-workspace.test.ts`：1 file / 4 tests 通过。
- Prettier 已写入所有本任务代码与文档；`git diff --check` 通过。

## 浏览器验收交接

1. 在 Crave transition inspector 选择 `BaseGame → FreeGame`，确认显示并可复制
   `gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/Start`；反向边同理。
2. 用文档示例 bind 两个 `Start`，往返切换并确认每条 edge 每次只触发一次，回调时 target scene 已显示。
3. 用 `addresses.list()` 核对 mode、popup、layer、BGM、effect 和 runtime resource 均来自当前导出配置；未绑定
   audio asset 不应出现。
4. 实测 `wait(..., { signal })` 的正常、abort 与 runtime destroy；确认 listener 内异步返回会显式失败。
5. 实测 mode BGM started/stopped：异曲 crossfade、同曲 mode 切换、无 BGM、mute/pause/duck，确认没有伪事件。
6. 用 Popup exact string endpoint 生成 `preludePopupStrings`，确认结束、失败、取消后默认值恢复。
7. 创建 Spine 与 ImgNumber runtime resource，挂到 exact layer 后移除并 destroy，确认 ownership 无泄漏。

## 剩余风险

- headless fake backend/player 不能代替真实浏览器的音频自动播放策略、codec、fade 听感、Spine 美术 event
  occurrence 与剪贴板权限；这些由上述浏览器验收覆盖。
- event listener callback error 会在已提交 scene 的 event boundary fail-stop，不能回滚已经发生的画面 commit；
  游戏接入应保持 listener 同步且只做可靠的轻量调度，异步工作使用 `wait()`。

# 250 minecart2 bg-bar Up/Wild 执行报告

## 结果

- UTC 完成时间：`2026-08-26T06:58:45Z`
- slotclientengine 基线：`7530d40c31c1d8d3ddcaad2ea5a5f996c4198687`（detached HEAD）
- piximinecart2 基线：`9e1501477f323d420956468e6476781b8e6e3db3`（`rgs`）
- 已完成 RenderCore 通用对象池、canonical resource/symbol factory、Minecart2 Up/Wild compiler、Feature barrier、逐列 landing、Topick/WL 表现与自动测试。
- 浏览器视觉验收按用户要求未代做，状态为待用户验收。

## 最终合同

- public factory 只保留 `create({ pooled?: boolean })`；默认 `false` 创建永久对象。
- 永久与池化对象都调用 `destroy()`：前者真正释放，后者 detach、stop/cancel、复位并回到 canonical address 唯一池；旧句柄 stale。
- 池空池起步并按并发峰值惰性增长。image-string 不按 text 分池，每次取出重新设置 `text/anchor`，已测试同一地址 `100 -> 50` 复用。
- exact symbol factory 为 `gamelayout:/symbol-package/<binding-id>/symbol/<symbol>`；Minecart2 WL 从 active `minecart2` package 创建，不读取资源 bytes 或硬编码 code `0`。
- `bg-up`/`bg-addwilds` 从组件顶层 `pos` 和唯一 `usedScenes` final scene 编译；Up 在 `Topick_End` 启动时替换，Wild 在 End 完成后完成 preview 到正式 WL 的 handoff，再播放 `appear -> normal`。

## 主要改动

- slotclientengine：新增 `render-object-pool.ts` 与 pool/address tests；扩展 RenderObject reset、ImgNumber anchor、runtime address 与 Symbols program factory；更新 RenderCore/地址/领域文档。
- piximinecart2：逐文件同步 9 个 shared 文件；新增 `feature-symbol-transform.ts` 及测试；修改 feature bar、round compiler/adapter、source boundary 与 README。
- 未修改 LogicCore、资源 manifest/YAML/production bytes、lockfile、根工具链或外部既有 `render-reel.ts` rolling-hole 修复。
- 两仓 9 个本任务 shared 文件逐字一致。

## 自动验收

1. `@slotclientengine/rendercore` 指定 4 个测试文件：通过，`18` tests。
2. `@slotclientengine/rendercore typecheck`：通过。
3. Minecart2 指定 6 个测试文件：通过，`49` tests。
4. `minecart2 build`：通过，包含同步后的 RenderCore distribution 与 Vite production consumer。
5. 两仓 `git diff --check`：通过。
6. `minecart2 typecheck`：命令已执行，但被任务前已有的 `packages/bridgecore` 与 `packages/device-detector` NodeNext 相对 import 缺 `.js`（TS2834/TS2835）以及 BridgeCore 两处 implicit-any（TS7006）阻断；最终输出没有本任务 `apps/minecart2` 或 `packages/rendercore` 文件错误，且同次 prepare 中 RenderCore build 通过。该跨包基线问题未扩张到任务范围修复。

## 浏览器验收（待用户）

- Up：完整 Feature 后三个目标格同时 Start/Loop；第 0 列与第 1 列分别落停时 End 并升级，之后才进入 win。
- Wild：Start 完成后 normal WL 在 symbol 上、topick 下；第 2 列落停且 End 完成后无闪跳 handoff，正式 WL 播放 appear 后回 normal。
- 回归：normal/其它 feature 的 0.5 秒 gate、首次初始化、横竖屏、连续 spin、取消/退出、多轮触发池数量稳定。

## 计划偏差与剩余风险

- 按用户执行期确认，把原候选的多入口 API 收敛为单一 `create({ pooled })` 与 `destroy()`；image-string 也进入同地址池。这是有意的合同简化。
- 未新增独立 GMI fixture 文件；真实 parser 链测试改为从既有 spin fixture 构造顶层 `pos` 与 `usedScenes`，覆盖同一协议形态。
- Topick skeleton 尺寸、mask、低 FPS 时的 preview/正式 WL 视觉 handoff仍需真实浏览器确认。
- 未 commit、push 或创建 PR。

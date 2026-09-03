# 289 gamelayout-splash-mode-audio-unlock 执行报告

## 结果

任务已实现，真实浏览器点击与听觉验收按用户要求保留给用户执行。

- Scene Layout latest 从 v7 升到 v8，新增 optional `gameModes.splashMode`。strict parser 要求 Splash 与
  `initialMode` 不同、引用已声明 mode、拥有 exact Splash→initial direct edge，且已有 `primaryAction` 只能指向
  initial。
- RenderCore 统一使用 `resolveSceneLayoutStartupMode()` 区分 authored startup 与 gameplay initial。配置 Splash
  时先显示该 mode；未配置时在已准备的 initial 上方显示无资源、全 viewport 的纯黑默认 Splash。
- 默认黑 Splash 门禁期间拒绝直接 mode request。第一个有效 primary action 解锁音频，成功后移除黑层；解锁失败
  保留黑层并允许重试。配置 Splash 时同一原生点击栈、任何 await 之前同步启动 AudioCore unlock 与既有 direct
  transition request。进行中的重复点击复用同一个 Promise，不会重复 unlock 或 transition。
- Game Layout Editor 新项目只创建 BaseGame；用户可把自己创建的 mode 设为或清除 Splash。initial/Splash
  互斥，rename/delete、badge、状态摘要、preview startup、v1–v8 import、v8 export/round-trip 均已同步。
- Gamelayout package CLI 和 delivery loader 以 `splashMode ?? initialMode` 作为 physical initial owner。配置
  Splash 后，正式 initial 保留独立 `mode:<initial>` chunk；默认黑 Splash 不增加 manifest、allocation 或 delivery
  资源。
- 合法 v1–v7 artifact 仍先按原版本 strict 读取，再确定性升级为不含 authored Splash 的 v8；不会按 mode id、旧
  initial 或 primary action 推断角色。所有 export 都是 v8。

## 主要文件

- 新增：
  - `packages/rendercore/src/scene-layout/manifest-v8.ts`
  - `packages/rendercore/tests/scene-layout/manifest-v8.test.ts`
- RenderCore：`types.ts`、manifest/upgrader/barrel、geometry/allocation/reference、runtime、package runtime/resource、
  presentation surface、delivery loader及直接测试。
- Editor：project model、mode commands、state manager/app shell、preview、ZIP import/export及直接测试。
- CLI：asset groups、delivery builder、audio/reference rewrite及直接测试。
- 文档：RenderCore/Editor/CLI README、`docs/scene-layout-manifest.md`、三份相关领域规则和任务计划。

## 关键决策与计划偏差

- 用户在执行中补充“无配置也必须有黑色默认 Splash 并强制点击”。实现为 package-runtime-owned transient Pixi
  overlay，不新增伪 mode id，也不改变 delivery bytes ownership；旧版规范化后也进入同一门禁。
- 为保持 video trusted gesture，配置 Splash 的 unlock 和 transition request 并发启动，而不是先 await unlock。
- 旧 package runtime 测试原先会在 init 后直接切 mode；按新合同调整为先消费默认 Splash，没有为旧测试保留绕过
  门禁的 production fallback。
- 执行环境起初没有依赖。可用 pnpm 11 无法按仓库 pnpm 10 lockfile 完成 frozen install，最终以
  `CI=true pnpm install --no-frozen-lockfile --lockfile=false` 安装；未修改 `pnpm-lock.yaml` 或 package manifest。

## 自动验收

通过：

1. RenderCore 受影响测试：13 files / 98 tests。
2. Game Layout Editor 受影响测试：9 files / 75 tests。
3. Gamelayout package CLI 受影响测试：4 files / 34 tests。
4. 三个目标自身 `tsc --noEmit` 均通过。
5. `@slotclientengine/rendercore typecheck`、`gamelayoutpkgcli typecheck` 均通过。
6. `@slotclientengine/rendercore` 与 `gamelayoutpkgcli` package build 均通过。
7. Game Layout Editor Vite production bundle 通过；仅有既有 dynamic-import/chunk-size warning。
8. Prettier changed-file check 与 `git diff --check` 通过。

Editor package 的完整 `typecheck/build` 依赖准备链被既有、非本任务文件
`packages/editorcore/src/assets/adapters/default-adapters.ts:806` 阻塞：`popup-object` union 分支没有 `.path`。该文件
没有本任务 diff。`editorcore` 的 TypeScript emit 已产生，其脚本因上述错误未执行末尾 CSS copy；仅为验证本任务
bundle，在 ignored `dist` 中补执行了脚本声明的 CSS copy，随后 Editor Vite build 通过。未扩大范围修复该问题。

## 待人工验收

- 浏览器中验证无 authored Splash 时初始纯黑、一次点击解锁后显示 BaseGame，连续点击不重复处理。
- 验证 authored Splash 的 none/Spine/有声 MP4 到 initial；UI control、Popup 消费的点击不误触发欢迎页流程。
- 验证旧 v7 ZIP重开/导出以及 CDN delivery 的 Splash initial chunk 与 gameplay initial target chunk。

## 剩余风险

- happy-dom/fake audio backend 不能替代 iOS/Chrome 的真实 autoplay、trusted gesture和听觉验证。
- Editor package 顶层脚本仍受上述既有 `editorcore` 编译错误影响；本任务源码与 bundle 本身已单独验证。
- 未执行整仓 L3、未修改游戏 app、未 commit/push。

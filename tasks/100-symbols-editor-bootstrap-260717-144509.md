# 任务 100：Symbols Editor Bootstrap 执行报告

## 1. 执行信息

- UTC 初次完成时间：`2026-07-17 14:45:09`
- 浏览器模块解析修正完成时间：`2026-07-17 14:51:11`
- 分支：`main`
- 执行基线 HEAD：`4ebde11c7af7677d9f836095d847959bd8852285`
- Node.js：`v24.14.0`
- pnpm：`10.0.0`
- 最终状态：自动化、构建和静态 HTTP 验收完成；浏览器交互验收按用户要求留给用户执行。
- 未提交：本任务未创建分支、未暂存、未提交；原任务计划 `tasks/100-symbols-editor-bootstrap.md` 保持为用户的未跟踪文件。

## 2. 最终实现与 ownership

### `packages/browserartifactio`

新增 browser-safe 小包 `@slotclientengine/browserartifactio`，拥有：

- canonical POSIX package path、manifest `./` 引用和相对引用解析；
- exact duplicate、NFC、case-fold collision、zip-slip 防护；
- streaming/bounded ZIP extract、稳定 ZIP create；
- 幂等 `ObjectUrlRegistry`。

它不依赖 Pixi、DOM renderer 或 Node fs。布局包继续使用 `256 / 50 MiB / 20 MiB / 100 MiB` 限制；symbol 包使用 `1024 / 100 MiB / 25 MiB / 250 MiB`，没有放宽布局合同。

### `packages/rendercore/symbol`

新增 `package.ts` 并从 symbol public index 导出，拥有：

- `SymbolPackageManifestV1` strict parser；
- package entries 与资源闭包校验；
- game config/display set code/paytable 交叉校验；
- image、VNI project/asset、official Spine、value image 的精确资源分类；
- uploaded bytes/Object URL 到 catalog、resolver、value resources 的组装；
- 幂等 destroy 和初始化失败清理。

编辑器没有复制 symbol manifest、VNI、Spine、value controller 或 RenderSymbol 算法。

### `apps/symbolseditor`

新增纯前端 Vite + TypeScript + Pixi v8 编辑器，包含：

- 从公开 `gameconfig.json` 新建项目，默认 `160 x 160`、全选 code 顺序 symbol；
- project id、cellSize、display include/exclude、scale、renderPriority；
- single/layered normal、texture states/settings；
- builtin/static/VNI/Spine/activeSpine animation 的结构化字段；
- Spine transform 和完整 valuePresentation 字段；
- 单 symbol/gallery、单 state、Replay、value 输入预览；
- 受限 ZIP 导入、严格导出、稳定 JSON/ZIP、未映射文件隔离；
- revision/request token 防止旧异步资源覆盖新 draft。

明确没有 sequence list、hold、next、自动轮播、spin/cascade 等业务编排。

### `apps/gamelayouteditor`

在原布局编辑器中增加独立 symbols package 生命周期：

- 导入同一 symbols ZIP，不再上传第二份 game config；
- 单事务覆盖 `main` grid 的 width/height，并重派生 focus；
- 越界时整个事务失败，不出现半更新或 auto-fit；
- normal-only、code-order、row-major grid overlay；
- value symbol 固定使用 `defaultValues[0]`；
- cell center/stride/viewport 全部来自 scene-layout snapshot；
- 清除 symbols preview 不回滚已应用的 cellSize；
- layout ZIP schema 和资源闭包保持独立、未混入 symbol 文件。

### 文档与规则

- 新增 `docs/symbol-package.md`、`apps/symbolseditor/README.md`；
- 更新 gamelayouteditor/rendercore README；
- 更新 `agents.md`，固化 package、两个 editor 和 symbolsviewer sequence 的 ownership 边界；
- 更新 workspace lockfile 和相关 package/Vite 配置。

## 3. Symbols ZIP v1 最终合同

```text
<project-id>-symbols.zip
  symbols.package.json
  gameconfig.json
  symbol-state-textures.manifest.json
  <resources 中逐项声明的精确资源>
```

```ts
interface SymbolPackageManifestV1 {
  version: 1;
  kind: "symbol-package";
  id: string;
  cellSize: { width: number; height: number };
  entrypoints: {
    gameConfig: string;
    symbolManifest: string;
  };
  resources: readonly string[];
}
```

ZIP 实际文件必须精确等于 package manifest、两个不同 entrypoint 和排序后的 resources。唯一 game config 负责 symbol code/paytable/公开 reel；symbol manifest 负责 display、状态、动画/value；package cellSize 负责逻辑 reel cell 大小。多文件、少文件、orphan、逃逸引用和大小写/NFC 冲突均失败，不做 fallback 或 glob 猜测。

## 4. Production fixture

- `game002-s3`：13 个 config/display symbol；精确闭包覆盖 PNG、official Spine、四档 CN、image value 候选，测试通过。
- `game003-s1`：27 个 config symbol、14 个显式 display symbol；辅助 symbol 合法不打包；精确闭包覆盖 PNG、VNI project/asset 与 official Spine，测试通过。
- 两套 fixture 经过同一 `createSymbolPackageResource()` 路径，没有修改 production manifest、game config 或 Vite closure。

Node fixture 负责 parser、display mapping、直接/间接闭包和资源组装；真实浏览器图片 decode、WebGL/Pixi、VNI/Spine exact playback 属于用户最后的浏览器矩阵。

## 5. 自动化验收

### 相关包

| 范围              | format | lint | typecheck | test                | build |
| ----------------- | ------ | ---- | --------- | ------------------- | ----- |
| browserartifactio | 通过   | 通过 | 通过      | 15/15               | 通过  |
| rendercore        | 通过   | 通过 | 通过      | 312/312（51 files） | 通过  |
| symbolseditor     | 通过   | 通过 | 通过      | 5/5（2 files）      | 通过  |
| gamelayouteditor  | 通过   | 通过 | 通过      | 36/36（9 files）    | 通过  |
| symbolsviewer     | 通过   | 通过 | 通过      | 17/17（2 files）    | 通过  |

覆盖率摘要：

- browserartifactio：statements `86.53%`，branches `74.77%`；
- rendercore：statements `87.76%`，branches `80.01%`，通过全局 `80%` branch 门槛；
- symbolseditor：statements `28.76%`，branches `22.55%`；model 为 `75.28%`，ZIP IO 为 `90.47%`，Pixi/UI 留给浏览器验收；
- gamelayouteditor：statements `82.92%`，branches `71.46%`，通过既有门槛；
- symbolsviewer：statements `86.51%`，branches `78.94%`。

### 根级门禁

- `pnpm lint`：26/26 通过；
- `pnpm typecheck`：26/26 通过；
- `pnpm test`：26/26 通过；
- `pnpm build`：最终 26/26 通过；
- `git diff --check`：通过；
- `pnpm format:check`：任务相关五个包全部通过，但根级仍被范围外既有格式问题阻断。

根级 format 首个错误为 `apps/gengameconfig/src/cli.ts`，同包还报告 `generator.ts`、`index.ts`、`paytable.ts`、`reels.ts` 和两个测试文件；`apps/uiframeworksviewer`、`apps/spine2victoryani-demo` 也有既有格式警告。这些文件不在本任务 diff 中，因此没有越权格式化。

第一次根级并行 build 曾在 `game002` Vite/Rolldown 阶段失败；同命令串行 `pnpm --filter game002 build` 立即通过，第二次根级 `pnpm build` 以 26/26 通过收敛。保留该记录以便后续关注 monorepo 中多个 app 并发写共享依赖 dist 的竞争。

基线阶段 `gamelayouteditor` 因 workspace link 尚未安装而失败；使用 Node 24 和代理执行 `pnpm install --no-frozen-lockfile` 后恢复，lockfile 已同步。

## 6. 静态 HTTP 验收

从仓库根启动只读静态 HTTP 服务，验证：

- `/apps/symbolseditor/dist/`：index `200`；
- `/apps/gamelayouteditor/dist/`：index `200`；
- 两个 index 声明的全部 26 个 JS、CSS、modulepreload：逐项 `200`；
- 两个 Vite 配置均为 `base: "./"`；
- symbolseditor 源码与生产 bundle 扫描未发现 netcore、gameframeworks、WebSocket、wss、session 或 loading 链路；
- symbolseditor 源码未出现 viewer sequence、holdSeconds、Next State 或 Play Sequence 控件。

## 7. 浏览器人工验收（用户执行，当前待验）

按用户要求，本报告不代替浏览器人工验收。建议直接按任务计划第 16 节执行，重点记录：

1. game002 13 symbol、状态/VNI/Spine/value exact playback、导出再导入；
2. game003 27 config / 14 display 的显式选择；
3. 缺 VNI asset、错 Spine animation 大小写、orphan 均阻止导出；
4. layout 导入后 cellSize 原子覆盖、真实 cell center、variant/resize；
5. 越界/坏 ZIP 保留旧 package，clear 后 cellSize 不回滚；
6. layout ZIP 不包含 gameconfig 或 symbol assets。

浏览器矩阵通过前，任务的“人工验收”状态应保持待验；自动化交付物已经准备完毕。

### 开发服务器模块解析修正

用户首次打开开发服务器时发现 `logiccore/dist/index.js` 是 CommonJS，Vite `/@fs/` 直取时无法提供 ESM named export `createGameConfig`。已在 symbolseditor 和 gamelayouteditor 的 Vite 配置中把 `@slotclientengine/logiccore` 统一解析到公共 TypeScript ESM 入口。

修正后实际启动 symbolseditor Vite dev server 并逐层请求验证：

- `/`、`/src/main.ts`、`/src/ui/app-shell.ts`、`/src/model/editor-project.ts`：`200`；
- rendercore `dist/symbol/package.js`：`200`，转换后明确导入 `packages/logiccore/src/index.ts`；
- logiccore TypeScript 入口：`200`，明确导出 `createGameConfig`；
- 两个编辑器 lint、typecheck、test、build 均重新通过。

## 8. 已知限制与后续建议

- 初版不做 sequence、timeline、spin/cascade、云保存或合并发布包，符合任务范围。
- 编辑器生产 bundle 较大，Vite 有 `>500 kB` chunk warning；不影响功能，可在后续独立任务做动态拆包。
- Pixi/WebGL/official Spine/VNI 的真实浏览器播放和资源 decode 无法由 Node/jsdom 完整替代，必须完成上述浏览器矩阵。
- 根级 format 的范围外存量问题建议另立清理任务，避免将全仓格式化混入本功能提交。

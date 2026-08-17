# Crave：task 221 Symbols 分层迁移

## 基线与结论

- slotclientengine 基线：`68a6cf6db8e999f1140991535738ebfae4596f96` 加 task 221 最终 diff。
- Crave 只读审计基线：`e726d37acf4da4238df29830b0b374fa23638d6c`，审计时工作区干净。
- 可以把 slotclientengine 的 `packages/` 整体覆盖同步到 Crave 的 `packages/`，但不得使用 `--delete`，也不得删除或覆盖 Crave 独有的 `packages/bridgecore`、`eventcore`、`device-detector`、`game-fontsize`、`game-ui-ws`、`gameloading-ui-ws`。
- task 221 的最小共享同步集合是 `packages/rendercore` 和 `packages/gameframeworks`；若采用整目录覆盖，同步的是两个仓库同名的 17 个 shared package，必须在同一个提交中完成，不能只复制 `rendercore/src/symbol`。

本文件只描述修改；task 221 不写 `/Users/zerro/gitee.com/pixicrave`。

## 必须同步的共享改动

1. 完整同步 `packages/rendercore`，包含 package exports、三个 symbol barrel、reel/Scene Layout 内部调用、测试和重命名文件。
2. 同步 `packages/gameframeworks/src/index.ts` 与 `packages/gameframeworks/vite.config.ts`，使 `SymbolCellBounds`、`SymbolGroup` 从 `@slotclientengine/rendercore/symbol/core` 转出。
3. 删除旧文件而不是并存：
   - `src/symbol/render-symbol.ts` → `src/symbol/symbol-player.ts`
   - `src/symbol/symbol-render.ts` → `src/symbol/symbol-handle.ts`
   - `src/reel/render-symbol-pool.ts` → `src/reel/symbol-player-pool.ts`
   - `src/symbol-value-presentation/render-symbol-value-controller.ts` → `symbol-player-value-controller.ts`
   - 对应测试文件同步重命名。
4. 不手改 `dist/`；在 Crave 仓库重新 build 生成 declaration/output。

`@slotclientengine/rendercore/symbol` 与 root symbol wildcard 已删除，不提供兼容 alias：

- `symbol/data`：manifest/package 类型、strict parser、upgrade、闭包和纯查询。
- `symbol/core`：游戏 runtime resource、catalog、reel registry 与公开 `SymbolHandle`。
- `symbol/editor`：data + core 加 mapped package、materialize、introspection、生成器和 preview wrapper。

内部 mutable Pixi occurrence 叫 `SymbolPlayer`，不从 package public barrel 导出；游戏取得的 borrowed/owned/empty occurrence capability 叫 `SymbolHandle`。

## Crave app 修改

Crave 当前只有两个 app 类型 import 需要从 root 拆出；其它 Scene Layout/reel 函数继续从 root 获取。

`apps/crave/src/spin-presentation.ts`：

```ts
import type { SceneLayoutGridCellSpinPlanStage } from "@slotclientengine/rendercore";
import { orderGridCellPositions } from "@slotclientengine/rendercore";
import type { SymbolPackageResource } from "@slotclientengine/rendercore/symbol/core";
```

`apps/crave/src/default-scene-values.ts`：

```ts
import {
  createWeightedGridCellPresentationValueResolver,
  type GridCellSymbolPresentationValueResolver,
} from "@slotclientengine/rendercore";
import type { SymbolPackageResource } from "@slotclientengine/rendercore/symbol/core";
```

同步修改 `apps/crave/tests/default-scene-values.test.ts` 的 type import。不要改变 Crave grid-cell spin、Nearwin、cascade、CO value、loading 或资源路径逻辑。

## Vite alias

在 `apps/crave/vite.config.ts` 的 root rendercore alias 之前加入：

```ts
{
  find: "@slotclientengine/rendercore/symbol/core",
  replacement: resolve(__dirname, "../../packages/rendercore/src/symbol/core/index.ts"),
},
```

删除指向 `packages/rendercore/src/symbol/index.ts` 的旧 `@slotclientengine/rendercore/symbol` alias。Crave app 不需要 `symbol/data` 或 `symbol/editor` alias。

`packages/bridgecore/vite.config.ts` 同样删除旧 symbol alias。只有 bridgecore 后续源码实际 import 新子路径时，才按职责在 root alias 前加入对应 `symbol/data` 或 `symbol/core` alias；不得为了兼容旧路径建立映射。`packages/bridgecore/src/**` 是 Crave-owned，不能用 slotclientengine 的 gameframeworks 覆盖。

## 禁止覆盖项

- `packages/bridgecore/**` 及 Crave 独有 package。
- Crave app 的业务 config、assets、static output、launch/platform 接线。
- Crave 独有的 bridge exports、错误/UI 实现。
- `pnpm-lock.yaml`，除非同步后的 package manifests 确实令 lockfile checker 要求更新；task 221 本身不新增依赖。

## 自动验收

在 Crave 仓库执行其现有 Node 24/pnpm 定向命令，至少包括：

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/bridgecore typecheck
pnpm --filter crave typecheck
pnpm --filter crave test
pnpm --filter crave build
```

最后搜索：

```bash
rg 'render-symbol|symbol-render|RenderSymbol|SymbolRender|@slotclientengine/rendercore/symbol["'"']' packages apps
```

结果只允许历史文档中明确描述旧 API 的迁移文字；生产源码、测试、Vite alias 与 package exports 必须为零。

## 浏览器复验

复验 Crave loading 99%/100%、base/free grid-cell spin、连续 spin、Nearwin 延迟、refill/cascade、CO value/ImgNumber、occurrence clone/attachment 和重复进入/销毁。用 Performance/Memory 连续执行至少 50 轮，确认 player、Spine/VNI/ImgNumber、Texture、Object URL、listener 和 pool entry 不持续增长。

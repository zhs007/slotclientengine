# anieditorv5runtime-cc atlas assets 执行报告

## 1. 实现摘要

已按任务 43 完成 `packages/anieditorv5runtime-cc` 的 Cocos runtime 更新：

- 新增 `SpriteAtlas` 资源绑定 public API，默认按 `filenameStem(asset.path)` 查询 atlas。
- 已按后续更正修正 atlas key 规则：`respin_asset_image_mqkv73wu_e` 来自 JSON `asset.path` 的文件名 stem，而不是 `asset.id`。
- 已按后续简化移除 `prefix` 参数；atlas key 现在只由 `asset.path` 的文件名 stem 决定。
- 已按真实合图行为调整：atlas `SpriteFrame` 可能是 trim/crop 后尺寸，atlas source 不再做 SpriteFrame 可读尺寸与 JSON 尺寸的 mismatch 校验；旧 resolver 仍保留该校验。
- 保留旧 `getSpriteFrame(assetPath, assetId)` resolver API，兼容已有宿主。
- atlas 缺资源、无效 atlas 均显式失败，不做 asset id/originalName fallback、placeholder、跳过图层或吞错。
- runtime 与 standalone 均不再创建 `V5G Background`，不再导入或使用 Cocos `Graphics` 绘制 stage 背景。
- `standalone/anieditorv5runtime-cc.ts`、`standalone/V5GPreview.example.ts` 和 `standalone.zip` 已同步更新。
- README 已同步新资源绑定方式和背景职责边界。

## 2. 修改文件清单

- `packages/anieditorv5runtime-cc/src/cocos/types.ts`
- `packages/anieditorv5runtime-cc/src/cocos/player.ts`
- `packages/anieditorv5runtime-cc/src/cocos/node-driver.ts`
- `packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts`
- `packages/anieditorv5runtime-cc/src/cocos/index.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts`
- `packages/anieditorv5runtime-cc/tests/fakes/cc.ts`
- `packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts`
- `packages/anieditorv5runtime-cc/standalone.zip`：已重建；该文件被 git ignore，`git status --short` 不显示。
- `tasks/43-anieditorv5runtime-cc-atlas-prefix-assets.md`
- `tasks/43-anieditorv5runtime-cc-atlas-prefix-assets-260623-100030.md`

未修改 `packages/vnicore`、`apps/anieditorv5viewer`、`docs/anieditor5/export*` 或其它无关资源文件。

## 3. atlas public API

最终 public API 形态：

```ts
export interface V5GCocosAssetResolver<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(assetPath: string, assetId: string): TSpriteFrame | null;
}

export interface V5GCocosSpriteAtlasLike<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(name: string): TSpriteFrame | null;
}

export interface V5GCocosSpriteAtlasAssetSource<
  TSpriteFrame = SpriteFrame,
> {
  atlas: V5GCocosSpriteAtlasLike<TSpriteFrame>;
}

export type V5GCocosAssetSource<TSpriteFrame = SpriteFrame> =
  | V5GCocosAssetResolver<TSpriteFrame>
  | V5GCocosSpriteAtlasAssetSource<TSpriteFrame>;
```

推荐宿主用法：

```ts
const player = createV5GCocosPlayer({
  root,
  project,
  assets: {
    atlas,
  },
  loop: true,
});
```

更正后的 atlas 查询规则是：

```text
atlasKey = filenameStem(asset.path)
```

`filenameStem(asset.path)` 表示 `asset.path` 去掉目录和扩展名后的文件名。

当 `asset.path = "assets/respin_asset_image_mqkv73wu_e.png"` 时，runtime 只查询：

```text
atlas.getSpriteFrame("respin_asset_image_mqkv73wu_e")
```

atlas 取出的 frame 如果因为合图裁切导致可读尺寸小于 JSON 逻辑尺寸，不会触发 size mismatch；runtime 仍按 JSON `asset.width/height` 设置 Cocos 节点 content size。旧 resolver 路径仍会做尺寸 mismatch 校验。

旧 resolver 仍可用：

```ts
const player = createV5GCocosPlayer({
  root,
  project,
  assets: {
    getSpriteFrame(_assetPath, assetId) {
      return framesByAssetId.get(assetId) ?? null;
    },
  },
});
```

## 4. fail-fast 错误文案

旧 resolver 缺资源仍保持兼容文案：

```text
Missing Cocos SpriteFrame for V5G asset "asset-1" at "assets/a.png".
```

atlas 缺资源新增可定位文案，包含 asset id、asset path、atlas key：

```text
Missing Cocos SpriteFrame for V5G asset "asset-1" at "assets/a.png" using atlas key "a".
```

无效 atlas 会在 `init()` 阶段显式失败：

```text
V5GCocosPlayer assets.atlas must provide getSpriteFrame(name).
```

## 5. stage 背景不再渲染

验证结果：

- `V5GCocosPlayer.init()` 不再调用 `parseColorHex(project.stage.backgroundColor)` 创建背景。
- `V5GCocosNodeDriver` 不再包含 `createBackgroundNode(...)`。
- `src/cocos/cocos-node-driver.ts` 和 standalone runtime 不再从 `"cc"` import `Graphics`。
- stage runtime 子节点顺序已变为：

```text
V5G Stage
  V5G Content
  V5G Particles
```

`project.stage.backgroundColor` 仍由 core validation 校验，未扩大 schema 接收范围；runtime 只是停止绘制背景。

## 6. standalone 更新

已同步更新：

- `standalone/anieditorv5runtime-cc.ts`
- `standalone/V5GPreview.example.ts`
- `scripts/check-standalone.mjs`
- standalone tests
- `standalone.zip`

`V5GPreview.example.ts` 现在默认只需要绑定：

- `root`
- `projectJson`
- `atlas`

示例已删除默认 `assetIds: string[]` 和 `spriteFrames: SpriteFrame[]` 数组绑定。示例会先检查：

```text
V5GPreview.atlas must be assigned.
```

然后用：

```ts
assets: {
  atlas: this.atlas,
}
```

`standalone.zip` 已用 `zip -X -r` 重建。`zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 输出：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

## 7. README 更新摘要

README 已更新：

- 推荐 Cocos Creator 项目使用 standalone 单文件。
- 默认资源绑定改为 `SpriteAtlas`。
- 说明 atlas 内 SpriteFrame 名字必须是 `filenameStem(asset.path)`。
- 明确缺资源会显式失败，不会 placeholder、跳过、fallback 或吞错。
- 明确 atlas frame 可能被 trim/crop，因此 atlas source 不用 SpriteFrame 可读尺寸校验 JSON 尺寸，旧 resolver 仍保留尺寸校验。
- 保留旧 resolver 作为高级兼容用法。
- 明确 runtime 不再创建 `V5G Background`，不再绘制 `project.stage.backgroundColor`。
- 更新 `V5GPreview.example.ts` 说明，不再把 `assetIds + spriteFrames` 当作默认入口。

## 8. 验收命令结果

在仓库根目录 `/Users/zerro/github.com/slotclientengine` 执行：

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck` | 通过 |
| `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone` | 通过 |
| `pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check` | 通过，输出 `standalone runtime check passed` |
| `pnpm --filter @slotclientengine/anieditorv5runtime-cc test` | 通过，13 files / 110 tests passed |
| `pnpm --filter @slotclientengine/anieditorv5runtime-cc lint` | 通过 |
| `pnpm --filter @slotclientengine/anieditorv5runtime-cc build` | 通过 |
| `pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check` | 通过，输出 `All matched files use Prettier code style!` |
| `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` | 通过，只包含两个 standalone 文件 |
| `git diff --check` | 通过，无输出 |

执行过程中 `format:check` 曾在格式化前提示 5 个文件需要 Prettier；已执行 `pnpm --filter @slotclientengine/anieditorv5runtime-cc format` 修复，并已重新执行最终 `format:check` 通过。

按后续更正先把 atlas key 从 `prefix + asset.id` 改为 `prefix + filenameStem(asset.path)`，随后又移除 `prefix` 参数，最终变为 `filenameStem(asset.path)`。期间曾有测试夹具仍按旧 key 放置 SpriteFrame，导致 `pnpm --filter @slotclientengine/anieditorv5runtime-cc test` 暂时失败；已修正测试夹具。后续又按合图 trim 行为跳过 atlas SpriteFrame 尺寸校验，并补充模块化与 standalone 测试，最终复跑通过，仍为 13 files / 112 tests passed。

本任务未新增 npm 依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 未变化。

## 9. git status 摘要

最终 `git status --short` 摘要：

```text
 M packages/anieditorv5runtime-cc/README.md
 M packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
 M packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
 M packages/anieditorv5runtime-cc/src/cocos/index.ts
 M packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
 M packages/anieditorv5runtime-cc/src/cocos/player.ts
 M packages/anieditorv5runtime-cc/src/cocos/types.ts
 M packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
 M packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
 M packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
 M packages/anieditorv5runtime-cc/tests/fakes/cc.ts
 M packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
 M packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
 M packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
 M packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
?? tasks/43-anieditorv5runtime-cc-atlas-prefix-assets-260623-100030.md
?? tasks/43-anieditorv5runtime-cc-atlas-prefix-assets.md
```

补充：`packages/anieditorv5runtime-cc/standalone.zip` 已重建，但该文件被 git ignore；`git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip` 显示：

```text
!! packages/anieditorv5runtime-cc/standalone.zip
```

## 10. AGENTS / agents 同步判断

本任务只修改 `packages/anieditorv5runtime-cc` 的 runtime API、standalone 示例、README、测试、shim 和 standalone 交付文件，没有修改仓库协作规则、目录规范、根级脚本或基础执行约定。

因此不需要同步更新 `AGENTS.md` / `agents.md`。

## 11. 二次遗漏检查

- 搜索 `assetIds|spriteFrames`：只剩 `tests/standalone/standalone-import.test.ts` 中对 `V5GPreview.example.ts` 的禁止出现断言；示例和 README 默认入口已无旧数组绑定。
- 搜索 `V5G Background|createBackgroundNode|backgroundNode|Graphics`：runtime 和 standalone 不再出现背景创建；`Graphics` 仅保留在 `types/cc-3.8.6-shim.d.ts` 与 `tests/fakes/cc.ts` 的通用 fake/shim 类型中，README 只作为“不再使用 Graphics 绘制背景”的否定说明。
- 搜索 `getSpriteFrame(`：模块化和 standalone 只有两条运行期解析路径：旧 resolver 调用 `getSpriteFrame(asset.path, asset.id)`；新 atlas 调用 `atlas.getSpriteFrame(filenameStem(asset.path))`，无 asset id/originalName fallback。
- atlas SpriteFrame 尺寸校验：atlas source 不再调用 `assertSpriteFrameSize(...)`；旧 resolver source 仍调用该校验。测试覆盖 trim 后 frame 仍按 JSON 逻辑尺寸设置节点。
- standalone public API：`V5GCocosSpriteAtlasLike`、`V5GCocosSpriteAtlasAssetSource`、`V5GCocosAssetSource` 已同时存在于模块化源码、standalone 单文件和 `scripts/check-standalone.mjs` required exports。
- README 不再宣称 runtime 会绘制 stage background。
- `standalone.zip` 已重建，`zipinfo -1` 只包含两个任务要求文件，无 macOS metadata 条目。
- `AGENTS.md` / `agents.md` 不需要同步，原因见第 10 节。
- `git diff --name-only` 确认未修改 `packages/vnicore`、`apps/anieditorv5viewer`、`docs/anieditor5/export*`。

## 12. 已知限制和人工验收事项

- 本仓库内已完成 TypeScript、Vitest fake `cc`、standalone 边界扫描、build、lint、format 和 zip 内容验收。
- 未在真实 Cocos Creator 3.8.6 编辑器中执行人工导入验收；宿主项目仍需确认 atlas 资源导入、SpriteFrame 命名、场景节点绑定、`.meta` 与实际 bundle 加载结果。
- stage 背景现在完全由宿主场景或外部 UI 负责；如果宿主仍需要原来的纯色背景，需要在 runtime 外部自行创建。

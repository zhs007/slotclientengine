# anieditorv5runtime-cc standalone runtime assets 执行报告

## 修改摘要

- `packages/anieditorv5runtime-cc` 已同步任务 29、31、33 后的 VNI/runtime_50 导出合同。
- 模块化 runtime 和 standalone 单文件都支持 `V5G_0.x` / `VNI_0.x` schema、`victory_editor_v5_g` / `VNI` editor 名称。
- `fileWidth`、`fileHeight`、`fileScale`、`exportProfile` 已进入 core 类型、assert/validate、Cocos player 和 standalone。
- `runtime_50` SpriteFrame 按真实文件像素校验，Cocos 节点和粒子显示尺寸仍按逻辑 `width/height`。
- `standalone.zip` 已重建，只包含 standalone runtime 和示例。

## 修改文件清单

- `packages/anieditorv5runtime-cc/src/core/types.ts`
- `packages/anieditorv5runtime-cc/src/core/validation.ts`
- `packages/anieditorv5runtime-cc/src/cocos/player.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/tsconfig.standalone.json`
- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/tests/fixtures/export2-runtime-50.json`
- `packages/anieditorv5runtime-cc/tests/core/validation.test.ts`
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts`
- `packages/anieditorv5runtime-cc/standalone.zip`
- `tasks/35-anieditorv5runtime-cc-standalone-runtime-assets-260618-042647.md`

## runtime_50 合同落地

- SpriteFrame 文件尺寸校验使用 `asset.fileWidth/fileHeight`，缺失压缩字段时 fallback 到旧导出的 `asset.width/height`。
- Cocos layer node 的 `UITransform` 内容尺寸继续设置为 `asset.width/height`。
- 粒子节点内容尺寸和粒子采样边界继续使用逻辑 `asset.width/height`。
- `fileScale` 只参与 metadata 校验和错误诊断，不参与节点 `scaleX/scaleY`。
- `fileWidth/fileHeight/fileScale` 必须同时存在或同时缺失。
- `fileWidth === Math.max(1, Math.round(width * fileScale))`，`fileHeight` 同理。
- `project.exportProfile.assetScale < 1` 或 `purpose === "runtime"` 时，每个 asset 必须有压缩字段。
- asset `fileScale` 必须等于 `project.exportProfile.assetScale`。

## 任务 34 兼容性

任务 34 的 `playRange(...)`、`addPlaybackEvent(...)`、`clearPlaybackEvent(...)`、`clearPlaybackEvents(...)`、`onPlaybackComplete(...)` 没有回退。模块化 player、standalone player 和 parity 测试仍覆盖 range、frame marker、complete callback、disposer 和 callback 抛错透传。

## standalone.zip

`unzip -l packages/anieditorv5runtime-cc/standalone.zip` 摘要：

```text
standalone/anieditorv5runtime-cc.ts      74902 bytes
standalone/V5GPreview.example.ts          3745 bytes
2 files, total 78647 bytes
```

`zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 摘要：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

zip 内没有 `edit_full`、`runtime_50/assets`、`dist`、`src`、`tests`、`node_modules`、`__MACOSX` 或 `._*`。

## runtime_50 源资源检查

已执行 PNG 头和尺寸检查：

```text
runtime_50 png dimensions match project metadata
```

确认 `docs/anieditor5/export2/runtime_50/assets/*` 的真实 PNG 像素与 `project.json` 中 `fileWidth/fileHeight` 一致。

## 验证命令结果

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
```

结果：通过，输出 `standalone runtime check passed`。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
```

结果：通过，`10 passed (10)`，`76 passed (76)`。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
```

结果：通过。

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

结果：最终通过。过程中首次检查发现本任务触碰的 `src/core/validation.ts` 和新增 fixture 需要格式化，已按计划执行 `pnpm --filter @slotclientengine/anieditorv5runtime-cc format` 后重跑通过。

```bash
unzip -l packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
```

结果：通过，zip 只包含两个 standalone 文件。

```bash
node -e "..."
```

结果：通过，`runtime_50 png dimensions match project metadata`。

```bash
git diff --check
```

结果：通过，无 whitespace error。

## 二次遗漏检查

- 已执行关键字扫描：`V5G_0`、`VNI_0`、`fileWidth`、`fileHeight`、`fileScale`、`exportProfile`、`SpriteFrame size mismatch`、`runtime_50`、`edit_full`。
- `src` 和 `standalone` 均已同步压缩资源合同。
- 反馈后追加检查：standalone runtime 面向 Cocos Creator ES2015，已移除 `.includes(...)`，`tsconfig.standalone.json` 已收紧为 `target: ES2015` / `lib: ES2015`，`standalone:check` 已禁止 standalone runtime 源码出现 `.includes(`。
- `src/index.ts` 仍未 runtime re-export `createV5GCocosPlayer` 或 `createCocosNodeDriver`。
- 没有复制 `edit_full` 图片资源或 `runtime_50/assets` 图片资源到 runtime package。
- 未新增 npm 依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 未变化。
- 无需更新 `agents.md`：本任务只更新 runtime package、测试、README、standalone zip 和任务报告，没有改变仓库协作规则、目录规范、根级脚本或通用执行约定。

## 已知限制

- runtime 不加载资源。
- runtime 不读取 `project.json`。
- runtime 不解析 bundle manifest。
- runtime 不选择 profile。
- runtime 不复制或发布 `edit_full` 资源。
- 真实 Cocos Creator 3.8.6 编辑器内资源导入、`.meta`、场景绑定和最终渲染仍需宿主项目人工确认。

## 严格验收补充

后续严格验收时发现 `packages/anieditorv5runtime-cc/standalone.zip` 曾处于缺失状态，已按计划在 `packages/anieditorv5runtime-cc` 下重新执行：

```bash
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
```

重新生成后复查结果：

- `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 只包含 `standalone/anieditorv5runtime-cc.ts` 和 `standalone/V5GPreview.example.ts`。
- `unzip -l packages/anieditorv5runtime-cc/standalone.zip` 显示 2 个文件，总大小 78647 bytes。
- 已重新执行 package 验收命令：`typecheck`、`typecheck:standalone`、`standalone:check`、`test`、`lint`、`build`、`format:check` 均通过。
- 已重新执行 `runtime_50` PNG 尺寸检查，结果仍为 `runtime_50 png dimensions match project metadata`。
- 已重新执行 `git diff --check`，无 whitespace error。

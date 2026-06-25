# 任务 47 执行报告：anieditorv5runtime-cc safe glow sync

报告时间：260625-042718 UTC

## 实现摘要

- 已将 `safe_glow` 从 `packages/vnicore` 的任务 46 语义同步到 `packages/anieditorv5runtime-cc` 的模块化源码和 standalone 单文件。
- `safe_glow` 已加入类型、supported animation type、默认 easing、参数校验、project sampler 可见性状态、Cocos player 渲染树和 standalone checker。
- `V5GCocosPlayer` 现在为每个 image layer 创建 `<layer name> Safe Glow` 容器，渲染顺序为：源 image node、safe glow container、particles container。
- `safe_glow keepOriginal=false` 会隐藏源图，但保留 safe glow 副本渲染；旧 `shatter` / `glow` 在 Cocos validation/init 阶段仍 fail-fast unsupported。
- 已新增真实 `lock_01.json` fixture，覆盖 `VNI_0.017`、`safe_glow`、`idle`、`particle_twinkle` 和单 group 无合法 slot。

## 修改文件清单

- core：`src/core/types.ts`、`animation-sampler.ts`、`project-sampler.ts`、`validation.ts`、`safe-glow-sampler.ts`、`index.ts`
- Cocos runtime：`src/cocos/player.ts`
- standalone：`standalone/anieditorv5runtime-cc.ts`、`scripts/check-standalone.mjs`、`standalone.zip`
- tests/fixtures：`tests/fixtures/lock_01.json`
- tests：`tests/core/*`、`tests/cocos/player.test.ts`、`tests/standalone/*`
- docs：`README.md`
- 报告：`tasks/47-anieditorv5runtime-cc-safe-glow-sync-260625-042718.md`

## safe_glow 同步说明

- `V5GAnimationType` 新增 `"safe_glow"`，`SUPPORTED_ANIMATION_TYPES` 新增 `"safe_glow"`，默认 easing 为 `linear`。
- `validateV5GProject(...)` 校验 `spread`、`minOpacity`、`maxOpacity`、`pulses` 为 finite number，校验 `keepOriginal` 为 optional boolean。
- `validateCocosV5GProject(...)` 接受 enabled `safe_glow`，但继续拒绝 enabled `shatter` / `glow`。
- 新增 `sampleSafeGlowSpritesForLayer(...)`，使用同图副本、normal blend、cosine opacity wave、`scale * (1 + spread)`，并在 `alpha <= 0.002` 或 `spread <= 0.001` 时不输出副本。
- `project-sampler` 新增 `hasActiveSafeGlowAnimation`，让 `keepOriginal=false` 时 `renderImageDisplay=false` 但 layer 仍保持 runtime 可见以渲染副本。
- Cocos safe glow node 使用同一 `SpriteFrame`、JSON 逻辑尺寸、原 layer anchor、sampled transform position/scale/rotation、normal blend 和 sampled alpha。

## lock_01 fixture 验证

- `schemaVersion`: `VNI_0.017`
- `name`: `lock_01`
- `engineTarget`: `cocos_creator 3.8.6`
- animation types 覆盖 `safe_glow`、`idle`、`particle_twinkle`
- `layerGroups.length = 1`
- `getVNIProjectLayerGroupSlots(project) = []`
- `validateV5GProject(project)`：通过
- `validateCocosV5GProject(project)`：通过
- `V5GCocosPlayer.init()` 使用 fake SpriteFrame resolver：通过

## Standalone 结果

- `standalone/anieditorv5runtime-cc.ts` 已同步 safe glow 类型、sampler、project sampler 字段、validation 和 Cocos player 渲染逻辑。
- `scripts/check-standalone.mjs` 已新增 safe glow public API 和片段检查。
- `standalone.zip` 已重建；该文件被 `.gitignore` 的 `*.zip` 忽略，未被 git 跟踪，但已作为本地交付物生成。
- `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip`：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

## 真实 Cocos Creator standalone 验收

本机存在：

```text
/Applications/Cocos/Creator/3.8.6/CocosCreator.app
```

尝试执行：

```bash
/Applications/Cocos/Creator/3.8.6/CocosCreator.app/Contents/MacOS/CocosCreator --version
```

该命令 5 秒内未输出 CLI 版本信息，表现为启动 GUI/编辑器进程，已中断。当前未在真实 Cocos Creator 3.8.6 项目中完成 standalone 导入、场景绑定、截图或视频验收。因此本任务结论是：monorepo 自动化验收通过，真实 Cocos Creator 3.8.6 standalone 验收待人工项目环境执行。

换机或真实项目验收文件清单：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
docs/anieditor5/export/lock_01.json
docs/anieditor5/export/assets/2_asset_image_mqqlcjh9_h.png
docs/anieditor5/export/assets/image_asset_image_mqp7sep7_i.png
docs/anieditor5/export/assets/image_asset_image_mqp7sgo9_k.png
docs/anieditor5/export/assets/image_asset_image_mqp7sii7_m.png
docs/anieditor5/export/assets/image_asset_image_mqp7sjxy_o.png
docs/anieditor5/export/assets/image_asset_image_mqs1j1mw_g.png
docs/anieditor5/export/assets/image_asset_image_mqs1pl10_h.png
```

换机验收步骤：

1. 用 Cocos Creator 3.8.6 打开临时或现有验证项目，不提交 `.meta`、Library、场景临时文件。
2. 复制 `standalone/anieditorv5runtime-cc.ts` 到项目脚本目录。
3. 由宿主 Component 加载 `lock_01.json` 和图片资源，按 `filenameStem(asset.path)` 绑定 SpriteFrame 或 SpriteAtlas。
4. 创建 `V5GCocosPlayer`，调用 `init()`，在宿主 `update(deltaTime)` 中驱动 `player.update(deltaTime)`。
5. 播放 `lock_01`，确认起始帧附近和 0.5 秒左右 safe glow 可见，表现为同图放大和透明度呼吸，控制台无错误。
6. 构造或复用 `keepOriginal=false` 的最小 project，确认源图隐藏时 safe glow 副本仍显示。
7. 可选验证旧 `glow` fixture 仍 fail-fast，不能静默降级为 `safe_glow` 或 normal。

需要回传证据：Cocos Creator 版本、控制台结果、`lock_01` 截图或短视频、`keepOriginal=false` 验证说明、旧 `glow` fail-fast 错误文本。

## AGENTS 同步

- 未更新 `AGENTS.md` / `agents.md`。
- 原因：现有规则已经要求更新 `packages/anieditorv5runtime-cc` public runtime 行为时同步模块化源码、standalone、checker、standalone 测试和 `standalone.zip`，本任务没有新增长期协作规则。
- `cmp -s AGENTS.md agents.md`：通过。

## 依赖和 lockfile

- 未新增 npm 依赖。
- 未执行 `pnpm install`。
- `pnpm-lock.yaml` 未变化。

## 命令验收

- `node --version`：`v24.14.0`
- `pnpm --version`：`10.0.0`
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck`：通过
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc lint`：通过
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc test`：通过，15 files / 144 tests
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone`：通过
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check`：通过
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc build`：通过
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check`：通过
- `git diff --check`：通过
- `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip`：通过，仅两个 standalone 文件
- standalone 禁止依赖扫描：通过，无 relative/workspace/Pixi/Node/DOM/resources loader 命中
- package 根入口 Cocos factory/driver re-export 扫描：通过，无输出

## 二次遗漏检查

- [x] 只改 `packages/anieditorv5runtime-cc`、相关测试/README/standalone/任务报告；未误改 `packages/vnicore` 或 `apps/anieditorv5viewer`。
- [x] `safe_glow` 类型、default easing、参数校验已同步。
- [x] safe glow sampler 与 vnicore 公式一致。
- [x] `keepOriginal=false` 隐藏源图但不隐藏副本。
- [x] `renderImageDisplay` 和 layer `visible` 表达不同语义。
- [x] Cocos render tree 中 safe glow 位于 image 和 particles 之间。
- [x] Cocos safe glow node 使用 normal blend。
- [x] Cocos safe glow node 使用同一 SpriteFrame 和 JSON 逻辑尺寸。
- [x] Cocos safe glow node 正确处理 opacity、scale、rotation、anchor、position。
- [x] 多余 safe glow nodes 会销毁，不残留上一帧画面。
- [x] `lock_01` 作为真实 fixture 覆盖 `VNI_0.017`。
- [x] 单 group 无 slot 已覆盖。
- [x] 旧 `3reel_multipay_02` slot 挂接不回归。
- [x] 旧 `3reel_multipay_01` enabled `glow` 仍 fail-fast。
- [x] standalone 单文件、checker、tests、zip 已同步。
- [x] README 已说明 safe glow 支持、旧 glow/shatter 边界和 standalone 交付面。
- [x] 真实 Cocos Creator standalone 验收未冒充通过，已写明待人工项目环境执行和换机步骤。
- [x] `cmp -s AGENTS.md agents.md` 通过。
- [x] `git diff --check` 通过。
- [x] 无隐藏 fallback。

## 遗留风险

- 未完成真实 Cocos Creator 3.8.6 编辑器内导入、资源绑定和画面截图验收；当前验收基于 TypeScript、Vitest fake driver、standalone checker、build 和边界扫描。
- 旧 `shatter` / `glow` 仍为 Cocos fail-fast unsupported；后续若要支持，需要真实 Cocos mask/blend/Effect 验证后另行实现。

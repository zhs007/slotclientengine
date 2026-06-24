# 任务 45 执行报告：anieditorv5runtime-cc layer groups render effects

报告时间：260624-065715 UTC

## 实现摘要

- `packages/anieditorv5runtime-cc` 已同步任务 44 的 VNI group schema：`project.layerGroups + layer.groupId`、默认 `group_default` 旧导出兼容、render group 顺序、相邻 slot 查询和 fail-fast 校验。
- `V5GCocosPlayer` 已改为 group-aware Cocos tree，支持查询 `getLayerGroups()` / `getLayerGroupSlots()`，并支持把外部 Cocos `Node` 或 runtime-owned image node 挂接到两个相邻 group 中间。
- `idle` 已作为 no-op coverage marker 支持；`shatter` / `glow` 走路线 B：通用 schema/参数校验支持，Cocos runtime 在 `validateCocosV5GProject(...)` / `init()` 阶段显式失败。
- standalone 单文件、示例、checker、测试、README 和协作规则已同步。

## 修改文件清单

- core：`src/core/types.ts`、`layer-groups.ts`、`validation.ts`、`animation-sampler.ts`、`project-sampler.ts`、`index.ts`。
- Cocos runtime：`src/cocos/player.ts`、`types.ts`、`node-driver.ts`、`cocos-node-driver.ts`。
- standalone：`standalone/anieditorv5runtime-cc.ts`、`standalone/V5GPreview.example.ts`、`scripts/check-standalone.mjs`、`standalone.zip`。
- tests/fixtures：`tests/core/*`、`tests/cocos/player.test.ts`、`tests/standalone/*`、`tests/fixtures/3reel_multipay_01.json`、`3reel_multipay_02.json`。
- docs/rules：`README.md`、`agents.md`。`AGENTS.md` 与 `agents.md` 内容已用 `cmp -s` 确认一致；git 仅跟踪 `agents.md`。

## 同步自任务 44 的功能

- `DEFAULT_VNI_LAYER_GROUP_ID`
- `normalizeVNIProjectLayerGroups(...)`
- `getVNIProjectRenderGroupOrder(...)`
- `getVNIProjectLayerGroupSlots(...)`
- `assertVNIAdjacentLayerGroupSlot(...)`
- `idle`、`shatter`、`glow` 类型识别和参数校验
- 旧无 group 导出仅在整项目完全没有 group 信息时规范化为 `group_default`

## 新增或变更 public API

- core helper：`VNIRenderGroupInfo`、`VNILayerGroupSlot`、`V5GRenderGroupInfo`、`V5GLayerGroupSlot`。
- Cocos player：`getLayerGroups()`、`getLayerGroupSlots()`、`attachNodeBetweenLayerGroups(...)`、`detachMountedNode(...)`、`clearMountedNodes()`。
- Cocos image helper：`attachProjectAssetBetweenLayerGroups(...)`、`attachSpriteFrameBetweenLayerGroups(...)`。
- driver：新增 `removeChild(parent, child)`，用于外部 node detach 时只移除不销毁。

## Fixture 验证结果

- `3reel_multipay_01.json`：`VNI_0.016`，render order 为 `layer_group_mqqo064b_4 -> group_default`，合法 slot 为下层 group 到 `group_default`；通用 `assertV5GProject(...)` 和 group helper 通过，Cocos validation 因 enabled `glow` fail-fast。
- `3reel_multipay_02.json`：`VNI_0.016`，render order 为 `layer_group_mqqo4zrn_6 -> group_default`，不含 `shatter/glow`，Cocos init、slot 查询、外部 node 挂接和播放测试通过。

## Cocos render tree

当前结构：

```text
V5G Stage
  V5G Content
    V5G Group <lower group id>
      <layer image node>
      <layer particles node>
    V5G Slot <lower group id> -> <upper group id>
      <mounted external nodes>
    V5G Group <upper group id>
      <layer image node>
      <layer particles node>
  V5G Particles
```

group 和 slot container 均设置 stage content size 和 `0.5, 0.5` anchor；外部 node 保持宿主传入 transform，不做 Pixi 坐标转换。

## 挂接 API 验证

- 重复 id、空 id、未知 group、反向 group、非相邻 group 均显式失败。
- 外部 node 默认 detach 不 destroy。
- `destroyOnDetach: true` 和 project asset / spriteFrame helper 创建的 runtime-owned node 会 destroy。
- 返回的 dispose 函数幂等。
- `destroy()` 会清空 mounted node registry，避免宿主 Component 销毁后残留引用。

## Render effect 决策

选择路线 B。原因：本任务没有可靠依据证明 Cocos Creator 3.8.6 中 `shatter` 的真实裁剪碎片和 `glow` 的 blend 表现可与 VNI/Pixi 语义一致；为避免半支持和隐藏 fallback，Cocos runtime 先 fail-fast unsupported。

验证结果：

- `validateV5GProject(...)` 会校验 `shatter` required numeric params 和 `fadeOut` boolean。
- `validateV5GProject(...)` 会校验 `glow` required numeric params 和 `keepOriginal` boolean。
- enabled `shatter/glow` 在 `validateCocosV5GProject(...)` 或 `player.init()` 阶段失败，错误包含 project、layer、animation id 和 type。
- `3reel_multipay_01.json` fail-fast 后 root 不残留半初始化节点。

## Standalone 结果

- `standalone/anieditorv5runtime-cc.ts` 已同步 core/cocos/driver/public API。
- `V5GPreview.example.ts` 展示 `getLayerGroupSlots()` 和 `attachNodeBetweenLayerGroups(...)`，仍不调用 `resources.load()`，不隐藏 loader。
- `scripts/check-standalone.mjs` 已检查新增 exports、禁止 import、禁止 `.includes(...)` 等边界。
- 已重建 `standalone.zip`。

`zipinfo -1 standalone.zip`：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

## AGENTS 同步

已更新长期规则：修改 `packages/anieditorv5runtime-cc` public runtime 行为时，必须同步模块化源码、standalone 单文件、standalone checker、standalone 测试和 `standalone.zip`。

- `cmp -s AGENTS.md agents.md`：通过。
- git 当前仅跟踪 `agents.md`，但两份文件内容一致。

## 依赖和 lockfile

- 未新增 npm 依赖。
- 未执行 `pnpm install`。
- `pnpm-lock.yaml` 未变化。

## 命令验收

- `node -v`：`v24.14.0`
- `pnpm -v`：`10.0.0`
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc lint`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc test`：通过，14 个 test files，129 个 tests。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc build`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check`：通过。
- standalone zip rebuild：通过，内容仅两个 standalone 文件。
- `rg -n "^\\s*import.*from ['\\\"]cc['\\\"]" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`：仅命中 standalone、`src/cocos/cocos-node-driver.ts` runtime import，以及 `src/cocos/types.ts` / `src/cocos/index.ts` type-only import。
- `rg -n "createV5GCocosPlayer|createCocosNodeDriver|cocos-node-driver" packages/anieditorv5runtime-cc/src/index.ts`：无输出，根入口未新增真实 Cocos factory 或 driver re-export。
- `git diff --check`：通过。

## 测试修改说明

- 新增 `layer-groups.test.ts` 覆盖默认 group、半新半旧失败、重复 id/order、未知 group、非连续 group run、order/visible/collapsed 不重排和 slot adjacency。
- 更新 validation/sampler/project sampler 测试，覆盖 `idle`、`shatter/glow` 参数、route B fail-fast。
- 更新 Cocos player 和 standalone player 测试，从旧线性 tree 断言改为 group-aware tree、slot container 和 mounted node API。
- 更新 standalone parity/import 测试，防止 single-file public API 和模块化实现漂移。

## 二次遗漏检查

- [x] `types.ts` 已包含 `layerGroups`、`groupId`、`idle`、`shatter`、`glow`。
- [x] 旧无 group 导出仅在完全无 group 信息时规范化为 `group_default`。
- [x] 半新半旧 group schema 会失败。
- [x] render order 来自 `project.layers`，不是 `layerGroups.order`。
- [x] group run 非连续会失败。
- [x] group slot 只允许相邻 group。
- [x] `V5GCocosPlayer` 已有 `getLayerGroups()` 和 `getLayerGroupSlots()`。
- [x] `attachNodeBetweenLayerGroups(...)` 支持外部 node 插入、detach、clear、destroy 清理。
- [x] external node 默认不 destroy；runtime-owned image helper 默认 destroy。
- [x] slot container 坐标保持 Cocos stage center 体系。
- [x] Cocos tree 中 group、slot、particle child order 有测试。
- [x] `idle` 是 no-op coverage marker。
- [x] 路线 B：enabled `shatter/glow` 在 Cocos validation/init 阶段显式失败。
- [x] 路线 B：`3reel_multipay_01.json` fail-fast，`3reel_multipay_02.json` 可播放并可挂接外部节点。
- [x] standalone 单文件、checker、tests、zip 均已同步。
- [x] README 已说明 group slot、external node、`shatter/glow` fail-fast unsupported 和 standalone 用法。
- [x] 模块化导入边界和 package 根入口边界已记录。
- [x] `AGENTS.md` / `agents.md` 内容一致。
- [x] 所有验收命令通过。
- [x] `git diff --check` 通过。

## 遗留风险

- 本仓库仍未运行真实 Cocos Creator 3.8.6 编辑器导入和场景验收；当前验收基于 TypeScript、Vitest fake `cc`、standalone checker 和 build。
- `shatter/glow` 当前为 Cocos fail-fast unsupported；若后续要走路线 A，需要真实 Cocos mask/blend 验证后再实现。

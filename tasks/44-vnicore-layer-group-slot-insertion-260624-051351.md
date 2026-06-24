# 任务 44 执行报告：vnicore layer group slot insertion

报告时间：260624-051351 UTC

## 实现摘要

- `packages/vnicore` 已支持 `project.layerGroups + layer.groupId` 的 VNI group schema，并保持旧无 group 导出的 `group_default` 兼容。
- `VNIPlayer` 改为 group-aware Pixi tree，公开相邻 group slot 查询和节点/图片挂接 API，外部宿主不需要访问私有 Pixi tree。
- 新增 `idle`、`shatter`、`glow` 动画类型支持与 fail-fast 参数校验；`shatter/glow` 作为 deterministic render effect，不污染 live particle drain。
- `apps/anieditorv5viewer` 增加 `3reel_MultiPay_01/02` bundled project 与“组间插入”UI，可从当前 bundle/profile 的 assets 目录全集中选择图片插入到相邻 group 中间。
- 文档、示例、测试和协作规则已同步。

## 主要改动文件

- vnicore runtime/API：`packages/vnicore/src/core/types.ts`、`validation.ts`、`layer-groups.ts`、`animation-sampler.ts`、`render-effect-sampler.ts`、`project-sampler.ts`、`packages/vnicore/src/pixi/vni-player.ts`、`layer-instance.ts`。
- vnicore 测试/fixtures：`packages/vnicore/tests/core/*`、`packages/vnicore/tests/pixi/vni-player.test.ts`、`packages/vnicore/tests/fixtures/export/3reel_multipay_01.json`、`3reel_multipay_02.json`。
- viewer：`apps/anieditorv5viewer/src/config/bundled-projects.ts`、`main.ts`、`ui/controls.ts`、`styles.css`、`tests/*`、`src/assets/projects/3reel_multipay_01.json`、`3reel_multipay_02.json`。
- docs/examples：`packages/vnicore/README.md`、`docs/api-zh.md`、`docs/usage-zh.md`、`docs/migration-from-viewer-zh.md`、`examples/README.md`、`examples/group-slot-insertion.ts`。
- 协作规则：`agents.md`。

执行前工作区已有 `docs/anieditor5/src/*` 和 `docs/anieditor5/export/3reel_multipay_01.json` / `3reel_multipay_02.json` 相关改动；本任务按计划读取并同步导出合同，未回滚这些既有改动。

## agents.md 同步

已更新 `agents.md`，新增长期规则：`packages/vnicore` 拥有 layer group 渲染顺序和 group slot 挂接能力，viewer 只能通过 public API 调用，不得复制相邻判断或操作私有 Pixi 容器。

环境中 `AGENTS.md` 与 `agents.md` 均可访问，执行 `cmp -s AGENTS.md agents.md` 通过，内容一致。

## 新增 public API

- `DEFAULT_VNI_LAYER_GROUP_ID`
- `normalizeVNIProjectLayerGroups(project)`
- `getVNIProjectRenderGroupOrder(project)`
- `getVNIProjectLayerGroupSlots(project)`
- `assertVNIAdjacentLayerGroupSlot(project, afterGroupId, beforeGroupId)`
- `VNIPlayer.getLayerGroups()`
- `VNIPlayer.getLayerGroupSlots()`
- `VNIPlayer.attachNodeBetweenLayerGroups(options)`
- `VNIPlayer.attachImageBetweenLayerGroups(options)`
- `VNIPlayer.attachExternalImageBetweenLayerGroups(options)`
- `VNIPlayer.detachMountedNode(id)`
- `VNIPlayer.clearMountedNodes()`

## 3reel_multipay 支持结果

- `3reel_multipay_01.json`：`VNI_0.016`，group 为 `group_default/上层光效/order 0`、`layer_group_mqqo064b_4/下层光效/order 1`；runtime render order 按 `project.layers` 得出 `layer_group_mqqo064b_4 -> group_default`。
- `3reel_multipay_02.json`：`VNI_0.016`，group 为 `group_default/上层光效/order 0`、`layer_group_mqqo4zrn_6/下层光效/order 1`；runtime render order 为 `layer_group_mqqo4zrn_6 -> group_default`。
- 支持动画类型：`idle`、`shatter`、`glow` 已进入类型、校验、采样和 Pixi effect 路径；原 `particle_wall`、`particle_combo` live particle 语义保留。

## viewer UI 验收

实际 URL：`http://127.0.0.1:5173/`

- project 下拉可见 `3reel_MultiPay_01 (legacy/3reel_multipay_01.json, 100%)` 和 `3reel_MultiPay_02 (legacy/3reel_multipay_02.json, 100%)`。
- `3reel-multipay-01` 显示合法 slot：`下层光效 -> 上层光效`，value 为 `layer_group_mqqo064b_4\0group_default`。
- 插入 asset：`asset_image_mqp31v5g_14`，path 为 `assets/image_asset_image_mqp31v5g_14.jpg`。
- 插入后 diagnostics：`data-vni-layer-groups=2`、`data-vni-layer-group-slots=1`、`data-vni-mounted-nodes=1`、`data-vni-non-background-samples=1`。
- 播放穿越中段：`data-vni-time=3.63`、`data-vni-mounted-nodes=1`、`data-vni-particle-sprites=230`、`data-vni-render-effect-sprites=2`。
- 播放到结束附近：`data-vni-time=6.57`、`data-vni-mounted-nodes=1`，插入节点未丢失。
- 点击移除后：`data-vni-mounted-nodes=0`，移除按钮禁用。
- 切到其它 project 再切回 `3reel-multipay-01`：`data-vni-mounted-nodes=0`，旧插入节点没有泄漏。
- `3reel-multipay-02` 插入并播放通过：slot 为 `layer_group_mqqo4zrn_6\0group_default`，播放时 `data-vni-time=1.45`、`data-vni-mounted-nodes=1`、`data-vni-particle-sprites=140`、`data-vni-non-background-samples=1`。
- 浏览器 console 只有 Vite connect/connected debug 日志，无运行时报错。
- 未保存截图；本次浏览器证据来自 in-app browser DOM 快照、canvas/stage diagnostics 和可见画面观察。

后续按验收口径修正：插入 asset 下拉不是只列当前动画 `project.assets[]`，而是列当前 bundle/profile 的 assets 目录全集。复验 `3reel-multipay-01` 时，asset 下拉共有 60 项，包含当前动画资源 `assets/image_asset_image_mqp31v5g_14.jpg`，也包含非当前动画资源 `assets/bigwin_asset_image_mqgf7e6h_g.png`。选择该非当前动画资源插入后，播放时 diagnostics 为 `data-vni-time=1.25`、`data-vni-mounted-nodes=1`、`data-vni-non-background-samples=3`、`data-vni-max-pixel-delta=735`，移除后 `data-vni-mounted-nodes=0`，console 无 warning/error。

说明：浏览器插件对 `input[type=range]` 的 `fill`、键盘和 CUA 拖拽没有成功触发页面 range `input` 事件；为覆盖 seek 合同，已新增 viewer 单测确认 timeline `pointerdown` 调用 `pause()`、`input` 调用 `VNIPlayer.seek(1.25)`，浏览器侧则用播放穿越 0/中段/结束附近验证挂接节点不丢失。

## 命令验收

- `node -v`：`v24.14.0`
- `pnpm -v`：`10.0.0`
- 导出摘要核对：`3reel_multipay_01/02` 的 schema、group、动画、asset path 与计划一致。
- `pnpm --filter @slotclientengine/vnicore typecheck`：通过。
- `pnpm --filter @slotclientengine/vnicore lint`：通过。
- `pnpm --filter @slotclientengine/vnicore test`：通过，11 个 test files，125 个 tests。
- `pnpm --filter @slotclientengine/vnicore examples:typecheck`：通过。
- `pnpm --filter @slotclientengine/vnicore build`：通过。
- `pnpm --filter @slotclientengine/vnicore format:check`：通过。
- `pnpm --filter anieditorv5viewer typecheck`：通过。
- `pnpm --filter anieditorv5viewer lint`：通过。
- `pnpm --filter anieditorv5viewer test`：通过，2 个 test files，10 个 tests。
- `pnpm --filter anieditorv5viewer build`：通过；Vite 仍提示 chunk 大小超过 500k，这是既有 bundle 体积 warning，不影响构建结果。
- `pnpm --filter anieditorv5viewer format:check`：通过。
- `git diff --check`：通过。

启动 dev server 时，sandbox 内 `listen EPERM`，按工具权限要求使用已批准的 escalated dev server 重试成功。

## 测试修改说明

- 修改测试是为了跟进新的真实导出合同：group schema、contiguous group run、相邻 slot、反向/非相邻/重复 id fail-fast、`idle/shatter/glow` 参数校验。
- Pixi 测试 mock 随 production API 能力补齐，未削弱生产逻辑。
- viewer 测试新增 group 插入 UI、当前 assets 目录全集选择、external image URL 插入、asset URL 解析、timeline seek wiring，并保留 export2 profile-scoped asset URL 覆盖。

## 依赖和 lockfile

未新增 npm 依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 未变化。

## 二次遗漏检查

- 已同步 `3reel_multipay_01/02` 到 viewer assets 和 vnicore fixtures。
- 新 project 的 3 个 `asset.path` 已通过 viewer asset manifest 解析测试。
- `VNI_0.016`、`layerGroups`、`groupId`、`idle`、`shatter`、`glow` 已进入 vnicore 类型和校验。
- 旧无 group 导出仍规范化为 `group_default`，但只有整项目没有 group 信息时才兼容。
- `type: "group"` layer、`parentId`、非空 keyframes、top-level particles 仍保持显式失败。
- group render order 来自 `project.layers`，没有用 `layerGroups.order` 重排。
- 非连续 group、反向 group id、非相邻 group 插入均有 fail-fast 测试。
- viewer 未访问 `VNIPlayer` 私有字段。
- `attachImageBetweenLayerGroups(...)` 复用已加载 texture 和 display compensation。
- `destroy()` 清理 mounted nodes 和 diagnostics。
- `glow keepOriginal=false`、`shatter sourceOpacity=0` 不会让 render effect 丢失。
- `particle_combo`、segmented playback、particle draining 语义未退化。
- README、API、usage、viewer migration 文档已更新。
- `group-slot-insertion.ts` 示例已登记并通过 examples typecheck。
- export2 profile-scoped asset URL、runtime_50 texture size 校验和 manifest/profile 一致性测试未删除。
- 新 JSON import 使用具体文件名，未引入所有项目都叫 `project.json` 的假设。
- `agents.md` 同步判断已写入本报告。

## 遗留风险

- 浏览器自动化未能直接拖动 range 触发 seek；已用单测和播放穿越补齐验证。若后续需要完整 e2e seek，可引入仓库级 Playwright 测试或给 timeline 增加更稳定的测试 id 后再补。

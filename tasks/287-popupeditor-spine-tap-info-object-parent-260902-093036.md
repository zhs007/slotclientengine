# 287 Popup Editor Spine Tap info 子对象父节点执行报告

## 1. 最终实现

- Popup v9 普通 Spine manifest 新增可选 `spine.tapInfoObject.attachment`。窄 union 只接受主 Spine exact slot，或当前 `spine.overlays` 中 VNI 图层的 exact 文字层；v1–v8 夹带字段、Popup root、overlay Spine slot、空 identity 与 unknown key 都 strict 失败。
- RenderCore package prepare 在 display tree mutation 前复验父节点：main target 合入 official Spine required slots，VNI target 使用 prepared project 核对 exact `type="text"` layer。该 metadata 不进入 overlay DAG、资源闭包或 runtime 实例生命周期。
- Popup Editor 项目模型增加 nullable attachment；新建和旧包导入默认未配置，ZIP 导出、重开、再次导出精确保留配置，清空后完全省略字段。
- 普通 Spine 项目页新增“Tap info 子对象”配置。候选只来自当前主 Spine 的 exact slots，以及当前 Spine overlays 内 VNI 的 exact 文字层；没有候选时只显示“未配置”，不猜首项或根节点。
- 删除被 Tap info 引用的 VNI overlay 会被拒绝；主 Spine/VNI 内容替换后 exact slot/text layer 失效会进入既有 strict diagnostics/prepare 失败边界并保留最后一次成功 preview。
- 未新增 Tap info 对象资源选择、placeholder、Container、ticker、input、completion、绑定 API 或 destroy 逻辑；实际对象来源与 ownership 仍留给后续 consumer 的显式合同。
- 同步更新 Popup manifest、Popup Editor/RenderCore README 与 Editor artifact 领域规则。

## 2. 关键决策与计划偏差

- Popup latest 保持 v9，沿用任务 286 的 workspace lockstep 前提；未升级到 v10，也未放宽旧版本 unknown-field 策略。
- 当前 Popup Editor 没有普通 Spine overlay id 的 rename authoring，因此没有增加不存在的 rename 流程；已覆盖现有 delete 和 resource replacement 边界。未来若开放 overlay id 编辑，必须在同一 transaction 结构化改写该引用。
- production preview 已经固定走 `projectToManifest → package prepare → player`，因此无需修改 preview runtime；现有 preview 定向测试与 production build 证明合法 metadata 可随正式包准备，画面不会产生伪 Tap info 节点。
- 新字段不含 path/resource reference，资源集合与 ZIP closure 不变；未扩大到 Game Layout、Scene Layout、GameFrameworks、VNI runtime、生成器、package manifest、lockfile或游戏 assets。

## 3. 自动化验收

工作树最初没有 package-local `node_modules`。既有 `pnpm-lock.yaml` 在 frozen offline install 时报告缺少 TypeScript ESLint entry，因此验收复用了同仓现有 Node 24 与已安装依赖链接；没有修改 package 或 lockfile。

通过的 L2 定向验收：

```text
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
  passed

RenderCore Popup Vitest
  3 files / 104 tests passed
  覆盖 v9 两类 target、旧版本 gate、unknown/wider target、official slot、prepared VNI text与旧包不生成默认值

Popup Editor Vitest
  3 files / 34 tests passed
  覆盖项目页真实 select/change、配置与清空、ZIP export/import/re-export、closure不变、删除保护与 preview回归

pnpm --filter popupeditor build
  passed；仅有既有 chunk size warning

Prettier（全部任务文件）
  passed

git diff --check
  passed
```

## 4. 人工验收

按用户要求未启动浏览器，浏览器验收由用户执行。建议按以下顺序复验：

1. 新建普通 Spine Popup，导入有多个 slot 的 official Spine；项目页选择“主 Spine slot”和一个 exact slot，导出重开后确认保持。
2. 添加含文字层的 VNI overlay；项目页选择对应 VNI 文字层，尝试删除该 VNI 或覆盖为缺少该文字层的内容，确认失败并保留最后成功 preview。
3. 清空配置后导出重开，确认 production manifest 不含 `tapInfoObject`；award、single-state 与 Popup Object 项目页不显示该控件。
4. 播放普通 Spine preview，确认没有 Tap info placeholder，既有 start→loop→end 与点击关闭行为不变。

## 5. 剩余风险与未完成项

- 浏览器中的真实 Spine/VNI 候选显示、导出重开操作和动画视觉尚待用户人工确认；自动化不能替代这部分验收。
- 含新 optional 字段的 v9 package 需要与本次更新后的 strict reader lockstep 发布；旧的独立 strict v9 reader会按 unknown field显式失败。
- 实际 Tap info 对象的来源、同父兄弟顺序、显示时机、attach/detach/destroy ownership不属于本任务，后续实现不得从 metadata 猜默认行为。
- 除用户保留的浏览器验收与后续 runtime绑定任务外，没有已知未完成实现项。

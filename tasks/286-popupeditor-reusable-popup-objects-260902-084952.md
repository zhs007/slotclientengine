# 286 Popup Editor 可复用 Popup Object 执行报告

## 1. 最终实现

- 新增独立 `popup-object.manifest.json` v1：只保存 lowercase kebab-case `name`、typed resources 与无状态 layers，不包含 Popup id/type、focus、adaptation、backdrop、audio 或状态机，并显式禁止 object-in-object。
- Popup manifest 保持 v9；award、Spine、single-state 三类 Popup 都可引用 `popup-object` resource 和原子实例 layer，v1–v8 出现该 kind 会严格失败。award 跨 tier 的同 id 对象要求保持同一 exact resource。
- RenderCore 支持对象的严格解析、attachment/DAG 校验、mapped/direct exact closure、namespace/materialize/rewrite、递归 prepare/rollback/destroy，并为每个实例创建独立 runtime；三类 player 都提供 instance-local `getObject()` handle，内部 string/image-string handle 不扁平并入宿主 registry。
- Popup Editor 新建类型增加 Popup Object。对象项目页只显示 name，复用现有 image、text、image-string、VNI、Spine 资源和 layer 编辑能力，独立导入/导出 `<name>-popup-object.zip`，preview 不应用 focus 或 backdrop。
- 普通 Popup 可从资源入口导入对象 ZIP 并添加对象实例。对象使用稳定 root key 与完整闭包摘要 namespace：同名更新只对 root 触发 overwrite/keep-both；两种选择都保持完整 owner closure，提交前重新解析和核对精确闭包，失败不修改当前项目。
- Popup package、EditorCore/Game Layout 既有 adapter 与 production ZIP 后处理通过 RenderCore typed helper 递归 vendor/改写对象及其 image-string/VNI/Spine/font/image 依赖；没有引入 raw JSON 旁路。
- 更新 Popup Object、Popup v9、RenderCore、Popup Editor 和两份领域规则文档。Popup manifest 没有升级到 v10。

## 2. 关键决策与计划偏差

- object runtime 复用已经通过生产验证的 single-state layer runtime，并用对象自己的 atomic container 包装，而不是复制或维护第二套 layer collection/state 实现；对象没有可见的 backdrop，也不接管宿主 input/completion。
- 为保护最终 Scene Layout production ZIP 的 nested reference rewrite，计划外最小修改 `apps/gamelayoutpkgcli/src/reference-rewriter.ts`。定向用例证明只改写宿主 object root 会留下对象内部旧 key，因此该 consumer 修改是正式交付闭包所必需。
- Popup Editor 内部 project 仍沿用单一可克隆结构并以 `type="popup-object"` 分支约束；独立 manifest、ZIP 与 UI 的可观察合同只暴露 name/resources/layers。没有为此扩大为全 store 重构。
- 未修改 lockfile、package manifest、游戏 assets、Scene Layout schema、根工具链或根 `AGENTS.md`。

## 3. 自动化验收

本工作树的既有 `pnpm-lock.yaml` 缺少当前 TypeScript ESLint importer，`pnpm install --frozen-lockfile --offline` 无法建立完整依赖；验收使用同仓现有 Node 24/pnpm store，并通过 source alias 直接指向本工作树代码，未修改 lockfile。

通过的 L2 定向验收：

```text
Popup Editor Vitest
  4 files / 42 tests passed
  覆盖对象 ZIP round-trip、稳定 root、完整闭包 overwrite/keep-both、资源导入、UI 与 preview

RenderCore Popup Vitest
  7 files / 139 tests passed
  覆盖 object parser/closure、package prepare、三类 player、atomic overlay lifecycle 与既有 v1–v9 回归

RenderCore public/Scene Layout Vitest
  3 files / 20 tests passed

EditorCore adapters-and-ui Vitest
  1 file / 17 tests passed

Game Layout Editor popup-package Vitest
  1 file / 7 tests passed

Game Layout production reference rewriter Vitest
  1 file / 12 tests passed

Popup Editor + 当前 RenderCore source 联合 TypeScript check
  passed

Game Layout package CLI + 当前 RenderCore data source 联合 TypeScript check
  passed

Popup Editor Vite production build
  passed；仅有既有 chunk size warning

Prettier（全部任务文件）
  passed

git diff --check
  passed
```

完整 RenderCore tests typecheck 仍会在未修改的 `tests/scene-layout/package-runtime.test.ts` 报告原工作树 `audiocore` dist 缺少 `AudioBackendActivityState` export；任务涉及的 RenderCore source 与直接消费者联合 typecheck 均已通过，没有通过修改无关 audio 合同掩盖该基线。

## 4. 人工验收

按用户要求未启动浏览器，真实美术资源的视觉验收由用户执行。建议按计划第 8 节至少复验：

1. 新建 `tap-to-continue` Object，确认项目页没有 id/focus/backdrop/type，制作 image + text 后横竖/方形 viewport 只改变观察范围。
2. 导出重开对象 ZIP，并分别在 award、Spine、single-state 中添加实例，检查整体 transform/order、root/slot/VNI attachment 与多实例隔离。
3. 修改同名源对象并选择 overwrite，再选择 keep-both 各测一次；坏资源/坏 attachment 替换应保留最后一次成功项目和 preview。
4. 导出宿主 Popup 并经 Game Layout/Scene Layout production package 路径复验，确认对象 root 与全部 nested payload 存在且没有 orphan。

## 5. 剩余风险与未完成项

- 浏览器中的真实字体、Spine 4.3、VNI 粒子、slot/VNI text attachment、横竖屏视觉结果尚未人工确认；自动化不能替代这些视觉与动画检查。
- 对象内部 child handle 以 instance-local API 暴露；宿主 string registry 刻意不扁平化 child name，这是避免多个对象实例重名的正式边界。
- 除用户保留的浏览器验收和上述既有依赖/typecheck 基线外，没有已知未完成实现项。

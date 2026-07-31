# 143 popupeditor-vni-text-layer-imgnumber 任务计划

## 1. 目标与完成定义

### 目标

在 Popup Editor 中允许每个档位的动态 ImgNumber 图层显式挂载到同档 VNI 图层的文字
占位层。ImgNumber 仍是独立的第二个 Popup 图层和独立资源，但其 Pixi container 成为
VNI text layer 的宿主节点，继承该文字层的位移、缩放、旋转、透明度、可见性、混合模式、
渲染顺序和播放生命周期；ImgNumber 自身的 `x/y/scale` 与 `anchor` 继续可编辑，并改为
相对该父节点解释。

### 完成定义

- [ ] Popup Editor 自动从已校验的 VNI project 枚举 `type="text"` 图层，用户可在
      ImgNumber 图层中选择“Popup 根节点”或同档某个 VNI 图层的 exact 文字层。
- [ ] VNI 与 ImgNumber 继续保存为两个 Popup 图层，不合并、改写 VNI 或新增占位图层。
- [ ] 选择 VNI 文字层后，production preview 和导出 ZIP 中的 ImgNumber 跟随该文字层
      的实际 VNI 动画；ImgNumber 自身 `x/y/scale/anchor` 仍可独立微调。
- [ ] 未选择 VNI 文字层时保持当前 Popup 根节点定位、order 叠放和五档共享单一
      ImgNumber renderer 的行为。
- [ ] 旧 Popup v1 未声明父节点配置时继续按 Popup 根节点读取；Popup Editor 新建或重导
      后输出 canonical 父节点配置，不引入第二套 legacy draft。
- [ ] 绑定必须精确引用同档 VNI Popup layer id 和该资源内 exact text layer id；缺失、
      重复、类型错误、资源替换后失效或跨档引用均显式失败，不回退到根节点或首个文字层。
- [ ] 档位切换和上一档 VNI end drain 期间，占位原文字不重新闪现；destroy、重建和
      prepare 失败不销毁共享 ImgNumber、泄漏挂载节点或留下半提交 preview。
- [ ] Popup ZIP 往返、Game Layout vendoring、资源闭包和既有 package 保持不变。
- [ ] L2 定向自动化、真实 Pixi 浏览器验收和任务 143 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `rendercore/popup` 的 ImgNumber 父节点合同、strict parser、VNI text target 交叉校验、
  host-node 挂载、档位切换和资源生命周期。
- `popupeditor` 的 VNI 文字层枚举、父节点选择、相对 transform 编辑、diagnostics、
  preview 和 ZIP round-trip。
- Popup manifest、rendercore README 和 Popup Editor README 的最小文档更新。
- 直接保护旧 v1 root 行为、新 binding、strict failure、rollback/destroy 的自动化测试。

### 不包含

- 修改 VNI project/bundle schema、VNI Editor、导出 profile 或 `packages/vnicore`
  的 text-layer API；现有 `VNIPlayer.attachNodeToTextLayer(...)` 已提供所需能力。
- 把 ImgNumber glyph、manifest 或金额文本写入 VNI project，或把两个资源合并成一个
  VNI/Popup layer。
- 自动按名称、中文“文字”、唯一候选或首项猜测绑定；导入只枚举候选，父节点由用户显式选择。
- 支持 image、Spine、普通 Pixi image 挂入 VNI text layer；本任务只处理每档唯一的
  `image-string + win-amount`。
- 修改 VNI 动画采样、文字层 transform、播放、金额、档位或 glyph layout。
- 修改 production `assets/crave`、`assets/minecart2` 或其它现有游戏配置；由后续美术交付
  在 Popup Editor 中选择目标并重新导出。
- 新增依赖、修改 lockfile、根工具链或整仓发布验收。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T01:07:28Z
HEAD: bec0911c18d055a1c1a43f721c66f0d431a10dec
branch: detached HEAD
git status --short --untracked-files=all: clean
```

执行时重新核对基线并保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

实际读取的规则、模板和长期文档：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/vni-runtime.md
tasks/templates/task-plan.md
apps/popupeditor/README.md
packages/rendercore/README.md
packages/vnicore/README.md
docs/popup-manifest.md
```

`apps/popupeditor`、`packages/rendercore` 和 `packages/vnicore` 下没有更深层 `AGENTS.md`。

当前实现结论：

- `PopupLayer` 的独立 ImgNumber 仅有 `binding/anchor/transform`；parser 要求每档恰好一个
  ImgNumber 和唯一 `order`，但没有父节点或跨 layer binding。
- `DefaultAwardCelebrationPlayer` 全局只创建一个金额 runtime；切档时把 container 移到档位
  根的 `amountChildIndex`。VNI runtime 已创建真实 `VNIPlayer`，但未暴露 text mount。
- `VNIPlayer.attachNodeToTextLayer(...)` 已支持宿主节点继承 text layer 动画和 lifecycle；
  dispose 会恢复原文字，因此旧档 end drain 需要稳定的 tier-owned 空 mount。
- `package-resource.ts::validateAnimationBindings()` 在资源 prepare 后校验 VNI，是 nested
  text id/type 的权威位置。
- Popup Editor 自动创建独立 VNI/ImgNumber layer，仅编辑 root transform；`popup-zip.ts`
  通过 parser/clone 往返 layer，不需要 app 私有 ZIP schema。
- `assets/crave`、`assets/minecart2` 的现有 Popup v1 均无父节点字段，必须保持 root 语义。
- `number2.json` 的 `layer_text_mqz6k97v_z` 有可用于人工验收的文字动画和配套图片。

不需要审计完整 Git 历史；public API、parser、现有 fixtures 和 vnicore 文档已足以确认能力
与缺口。

## 4. 需求解释与技术决策

### 需求解释

- “类似 Spine slot”指 ImgNumber container 挂入导出的 text placeholder content，不改 JSON。
- “位移或别的动画也能附加”解释为使用 vnicore 的真实 display tree inheritance；
  rendercore/popup 不重新采样或复制 VNI transform。
- “2 个图层”仍是一个 VNI 与一个 ImgNumber；父子关系只改变挂载点和 transform 基准。
- “大小、位移依然可以调整”解释为现有 `transform.x/y/scale` 与 `anchor` 字段保留；
  root 模式相对 Popup 中心，VNI 模式相对 text layer local origin。

### 关键决策

1. **在 ImgNumber layer 上增加判别父节点合同**

   ```ts
   type PopupImageStringParent =
     | { readonly kind: "popup-root" }
     | {
         readonly kind: "vni-text-layer";
         readonly vniLayerId: string;
         readonly textLayerId: string;
       };
   ```

   `vniLayerId` 引用同档 Popup 的 VNI layer，`textLayerId` 引用该 VNI project 的 exact
   layer id。配置属于 ImgNumber placement，不塞进 VNI playback，也不以 resource filename
   代替 layer identity。

2. **保持 Popup manifest v1 的兼容读取，canonical 输出显式写 parent**
   - 旧 v1 省略 `parent` 时唯一解释为既有 `{kind:"popup-root"}`，parser 输出规范对象。
   - 新建 layer 和 Popup Editor 重导始终显式写 `parent`；不维护另一份 legacy draft。
   - `parent` 存在时严格校验白名单字段和判别值；不接受 alias、空 id、额外字段或 null。
   - 不升级 v2，因为未声明字段的既有语义没有改变，新能力是可选 placement；升级会迫使
     所有现有 production Popup 做无关迁移。

3. **分两层校验 exact target**
   - manifest parser 在 tier 内校验 `vniLayerId` 存在且 kind 为 VNI，禁止跨档和错误 kind。
   - package prepare 使用已校验 `VNIProjectConfig` 确认 `textLayerId` 唯一存在且
     `type === "text"`；资源替换后目标失效立即失败。
   - Popup Editor 通过 `assertVNIProject()` 枚举和显示候选、提前给出 diagnostics，但
     production prepare 仍是权威校验；UI 不复制动画采样或私有 display tree。

4. **使用稳定的 tier-owned text mount，金额 renderer 仍全局复用**
   - 目标 VNI runtime 初始化后，用 public `attachNodeToTextLayer()` 挂入一个由
     rendercore 拥有的空 `PIXI.Container`，并持续隐藏 authored placeholder。
   - 活跃档位只把共享 ImgNumber container 移入该 mount；切档后旧 VNI 的 mount 保持，
     因而 end drain 不会重新显示原占位文字。
   - root parent 继续按 `amountChildIndex` 挂到 tier container；attached parent 的实际
     z-order 由 VNI text layer 决定，ImgNumber `order` 只保留 manifest 唯一性与两层结构。

5. **Popup runtime 只暴露最小 host-mount capability**
   - 在 `PopupLayerRuntime`/factory 的内部组合合同中增加可选、typed text mount 能力，
     默认 VNI runtime 用 `VNIPlayer` 实现，其它 layer 不实现。
   - Award player 按配置精确找到对应 runtime；能力缺失显式失败，不访问 VNI private
     container，也不在 Popup Editor 中做 reparent。

6. **候选自动识别，绑定必须显式**
   - UI select 首项是“Popup 根节点”，其余项显示同档 VNI layer id、VNI text layer
     name 和 exact id。
   - 导入 VNI/ImgNumber 后仍沿用现有资源识别和建议绑定；不因“只有一个 text layer”
     自动选择首项。
   - 修改 parent 后保留当前 `x/y/scale/anchor` 数值，不自动换算世界坐标；UI 明确标注
     新坐标基准，避免隐藏猜测。

## 5. 职责与合同

- **vnicore**：继续拥有 VNI project validation、text layer display tree、动画采样、
  `attachNodeToTextLayer()` 和 mounted-node lifecycle；本任务不修改。
- **rendercore popup manifest**：拥有 ImgNumber parent schema、同档 layer 引用和 root
  compatibility normalization。
- **rendercore popup resource**：拥有 VNI project/text layer exact 交叉校验及 prepare
  rollback。
- **rendercore award player**：拥有共享 ImgNumber renderer、root/text mount 切换、
  authored placeholder 隐藏、end drain 和 destroy 顺序。
- **Popup Editor model/UI**：拥有候选枚举、显式选择、相对 transform 表单、draft
  diagnostics 和 canonical ZIP 往返，不复制 runtime 状态机。
- **资源 ownership**：ImgNumber renderer 仍由 award player 唯一拥有；tier mount 由对应
  VNI layer runtime 拥有并通过 dispose 清理；VNI 不得 destroy 宿主 ImgNumber。
- **失败策略**：未知 parent、缺 sibling VNI、缺 text id、非 text target、能力缺失、
  init/attach 失败均在 publish preview 前显式失败并完整 rollback。
- **禁止行为**：不按 name 猜 layer、不默认首项、不静默回 root、不恢复原文字 fallback、
  不复制 VNI transform、不共享 mutable VNI project、不手改 content-addressed payload。

## 6. 文件范围

### 预计新增

```text
tasks/143-popupeditor-vni-text-layer-imgnumber-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/types.ts
packages/rendercore/src/popup/manifest.ts
packages/rendercore/src/popup/package-resource.ts
packages/rendercore/src/popup/award-player.ts
packages/rendercore/tests/popup/fixtures.ts
packages/rendercore/tests/popup/manifest.test.ts
packages/rendercore/tests/popup/package-resource.test.ts
packages/rendercore/tests/popup/award-player.test.ts
packages/rendercore/README.md
apps/popupeditor/src/model/project.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/styles.css
apps/popupeditor/tests/project.test.ts
apps/popupeditor/tests/app-shell.test.ts
apps/popupeditor/README.md
docs/popup-manifest.md
```

测试 helper 可按现有结构并入上述测试文件；若 UI 不需新增样式，不强制修改 `styles.css`。

### 原则上不应修改

```text
packages/vnicore/**
packages/rendercore/src/image-string/**
packages/rendercore/src/scene-layout/**
apps/popupeditor/src/io/resource-import.ts
apps/popupeditor/src/io/popup-zip.ts
apps/gamelayouteditor/**
apps/gamelayoutpkgcli/**
apps/game002/**
apps/game003/**
assets/**
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若执行时发现现有 vnicore public API 不能保持 placeholder 隐藏或正确继承 text layer
transform，先用最小复现说明缺口；不得直接访问 private Pixi tree 或扩大到 VNI schema。

## 7. 实施步骤

1. **确认执行基线**
   - 重查 HEAD/status、任务计划、三份领域规则、Popup v1 文档和当前 public types。
   - 复核 `attachNodeToTextLayer()` 的 hide/dispose/destroy 行为；若基线发生重大改变，
     先说明并重新界定范围。

2. **扩展并校验 Popup layer 合同**
   - 在 `types.ts` 增加判别 parent 类型并接入 image-string layer。
   - 在 `manifest.ts` 规范化旧字段缺失为 popup-root，严格解析新 union，并在每个 tier
     校验 exact sibling VNI layer。
   - 更新 fixtures/tests，覆盖 legacy root、canonical root、合法 text binding、unknown
     key/kind、空 id、缺 target 和错误 target kind。

3. **增加资源级 VNI text target 校验**
   - 在 `package-resource.ts` 使用 prepared VNI project 核对 exact layer id/type。
   - 覆盖 target 缺失、指向 image/group/sequence、VNI resource 替换失效和合法 text；
     所有失败发生在 package resource 发布前并清理已准备资源。

4. **接入 award runtime host mount**
   - 为 Popup VNI layer runtime 增加最小 text mount capability，内部只调用
     `VNIPlayer.attachNodeToTextLayer()`。
   - prepare 每档稳定 mount，root/text 两种 parent 切换，共享 amount rebind/setText 保持。
   - 明确 dispose 顺序和 init rollback，保证旧档 end drain 不闪回原文字，VNI destroy
     不连带销毁共享 amount。

5. **接入 Popup Editor 配置**
   - model 从当前 asset bytes 调用 `assertVNIProject()`，按同档 VNI layers 枚举 text
     candidates；新 ImgNumber 默认 canonical popup-root。
   - ImgNumber card 增加父节点 select 和相对坐标说明，继续显示 `x/y/scale/anchor`。
   - 父节点改变使用单次 store transaction；目标删除/替换失效显示 diagnostics，不自动改值。

6. **保护编辑、导入和导出往返**
   - project/app-shell 测试覆盖候选标签、显式选择、保留 transform、无候选、失效 target。
   - Popup ZIP round-trip 断言 parent 精确保留；旧 ZIP 导入后规范化 root，新导出不丢字段。
   - 保持 content-addressed exact closure 不变，parent ids 不进入 filename-key rewrite。

7. **文档、人工验收与收尾**
   - 更新 Popup manifest、rendercore Popup API 和 Popup Editor README，说明父节点 union、
     坐标基准、z-order、兼容边界和 strict failure。
   - 运行第 8 节 L2 命令与真实 Pixi 浏览器验收，检查 diff 后生成 UTC 中文报告。

## 8. 测试与验收

### 测试原则

- parser 测试同时保护旧 v1 输入和新 canonical 输出，不以放宽 unknown-key 校验换兼容。
- runtime 测试观察 parent/child、dispose、placeholder、共享 amount、drain 和 rollback。
- Editor 测试经过 select/change/preview/export；failure 覆盖 sibling、text id/type、资源替换。
- mock 只能证明编排调用与 ownership，不能替代真实 Pixi 中文字层动画继承的浏览器验收。

### 验收级别

`L2`。任务扩展 `rendercore/popup` public manifest/type contract，并由 Popup Editor 直接消费；
同时改变跨 layer mount lifecycle。无需修改 VNI public API、root 工具链、lockfile 或 release，
因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter popupeditor build
pnpm --filter @slotclientengine/rendercore --filter popupeditor lint
git diff --check
```

失败时先缩小到 `popup/manifest`、`popup/package-resource`、`popup/award-player` 或
`popupeditor` 对应单测，不立即运行根级全仓命令。

### 人工验收

1. 启动 Popup Editor，优先导入美术的文字占位 VNI bundle 和 ImgNumber ZIP；无真实包时，
   用 `number2.json`、配套图片和 `assets/game002-s3/.../cn-digits/**` 组装临时包，不提交。
2. 在同档保持 VNI + ImgNumber 两层，先用 popup-root 确认现有定位，再选择 exact
   `layer_text_mqz6k97v_z`；调整 ImgNumber `x/y/scale/anchor` 并 Build preview。
3. 播放、跨档和 end drain，确认金额继承实际动画、原文字不显示、相对微调生效且无残留。
4. ZIP 导出再导入应保留选择和数值；删除/替换目标后 preview/export 应显式失败。

真实美术包未提供时，报告必须区分“仓库 fixture Pixi 验收通过”和“待美术包复验”。

### 独立验收建议

`必须`。涉及跨包 public schema、跨 runtime display-tree ownership 和 destroy/rollback。
独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
git diff --check
```

另执行一次 text placeholder 的真实浏览器播放、切档和 ZIP round-trip，不重复其它命令。

## 9. 环境与依赖

- 使用 Node.js 24 与 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`。
- 下载失败后才设置仓库代理并重试；不新增 package、不修改版本或 lockfile。

## 10. 生成物、文档与规则

- 不修改 YAML、VNI schema 或生成物；Popup ZIP/map 仍由正式 exporter 生成，禁止手改。
- `docs/popup-manifest.md` 说明 parent、legacy、相对 transform、z-order 和 end drain。
- 更新 `packages/rendercore/README.md` 与 `apps/popupeditor/README.md` 的最小 public workflow。
- 现有领域规则已覆盖职责和 host text binding，不修改领域规则或根 `AGENTS.md`。
- 不把任务 143 的具体 text layer id、临时 ZIP 或美术资源清单写入长期规则。

## 11. 执行报告

规划时不生成报告。执行完成后以 UTC 创建
`tasks/143-popupeditor-vni-text-layer-imgnumber-<utctime>.md`：

```bash
date -u +%y%m%d-%H%M%S
```

报告记录实现、文件、决策、偏差、命令、浏览器结果和剩余风险，不收集无关统计。

## 12. 风险、假设与待确认

### 风险

- 非均匀缩放、旋转和父子层级会与 ImgNumber scale 组合，必须用真实 Pixi 验证。
- mount 生命周期错误会导致旧档原文字闪回、宿主被误销毁或泄漏。
- 替换 VNI 后 text id 可能失效并要求重选；attached z-order 改由 VNI text layer 决定。
- 仓库 fixture 能证明功能链路，但不能保证尚未提供的最终美术包 layer identity 和效果。

### 假设

- 每档仍恰好一个 ImgNumber；一个 ImgNumber 同时最多挂到一个同档 VNI text layer。
- 美术希望替换并隐藏 VNI 原文字，而不是同时显示 authored text 与 ImgNumber。
- 切换 parent 不保持世界坐标，只保留 `x/y/scale` 数值并按新父坐标系预览。
- 旧 v1 缺少 parent 的唯一合法语义是当前 Popup 根节点，不需要批量迁移 production assets。

### 待确认

无。多个 text target、跨档 target、自动按名称绑定或世界坐标无损换父均属于新范围。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] parent schema、exact target、共享 mount 和 rollback/destroy 符合计划。
- [ ] Editor 配置、preview、ZIP round-trip、文档和 L2 验收已完成。
- [ ] 自动化与真实 Pixi/美术包人工验收已明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对 Git 基线、现有 Popup v1 compatibility 和工作区；
3. 按 parent contract、resource validation、runtime mount、editor UI 顺序实现；
4. 重大 schema/API/文件范围扩张时先停止说明，只运行计划规定的 L2 验收；
5. 区分 mock 与人工 Pixi 结果，生成 UTC 报告；除非用户要求，不 commit/push/建 PR。

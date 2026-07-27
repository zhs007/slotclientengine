# 128 anieditorv5runtime-cc alpha blend parity 任务计划

## 1. 目标与完成定义

### 目标

修复 `packages/anieditorv5runtime-cc` 在 Cocos Creator 3.8.6 中播放 Cocos-compatible VNI 动画时，半透明 PNG 光效与背景出现黑色/脏色叠加、与编辑器 Pixi 预览和 `vniviewer` 不一致的问题。

本任务以用户提供的 `bigwinanimation.zip` 为正式复现输入，重点验证 `旋涡1` 与 `旋涡2`，但修复必须落在通用的 Cocos alpha/blend 合同中，不得按图层名、asset id 或该 ZIP 写特例。

### 完成定义

- [ ] 同一份 `runtime_100/bigwinanimation.json` 和同一组图片资源在 Cocos Creator 3.8.6 中播放时，`旋涡1`、`旋涡2` 不再产生透明区域染色、黑框或把底图压暗的矩形。
- [ ] `旋涡1` 的 `screen` 效果与编辑器 Pixi 预览/`vniviewer` 在关键帧上视觉等价；`旋涡2` 的 `normal` 透明混合独立显示正确，并且两层叠加后仍正确。
- [ ] JPG/RGB PNG 的无有效 alpha 光效与带有效 alpha 的 PNG 分开验证；不得只按 `.jpg`/`.png` 扩展名猜测 alpha 语义。
- [ ] `normal`、`add`、`screen`、`multiply`、`lighten` 的既有支持不静默退回 `normal`，未知模式继续显式失败。
- [ ] 模块化源码、生成的 standalone、standalone checker/tests 和本地 `standalone.zip` 保持一致。
- [ ] 自动化测试证明 blend 配置、alpha 分支和资源生命周期；真实 Cocos Creator 3.8.6 截图对比作为必须的独立视觉验收，不能由 fake `cc` 测试替代。

## 2. 范围

### 包含

- 复现并定位 Cocos Sprite 采样结果、图片导入的 Premultiply Alpha 状态、Sprite/material pass blend state 之间的组合错误。
- 修正 `packages/anieditorv5runtime-cc` 的通用 alpha/blend 策略及 Cocos driver/player 接入。
- 使用真实样本保护 `旋涡1=screen`、`旋涡2=normal` 的图层合同，并用最小合成像素覆盖透明像素仍含非零 RGB、部分透明 alpha、全不透明黑底光效三类输入。
- 如正确实现必须增加 Cocos Effect/Material，完整纳入模块化 API、standalone 交付、checker、示例和真实 Creator 验收。
- 更新 package README 和执行报告；只有形成稳定的新职责边界时才最小更新 `docs/agent-rules/cocos-runtime.md`。

### 不包含

- 不修改 `packages/vnicore` 的 Pixi 实现；它只作为已正确视觉语义和 alpha 分流的对照。
- 不修改 `docs/anieditor5` 编辑器预览或导出结果来掩盖 Cocos runtime bug。
- 不修改用户提供的 PNG/JPG，不把重新导出、清黑边或手工改 alpha 作为 runtime 修复。
- 不为 `旋涡1`、`旋涡2`、`BigWinAnimation` 或当前 asset id 增加硬编码。
- 不恢复 DOM/canvas、Pixi renderer、URL loader 或让 Cocos runtime 依赖 `@slotclientengine/vnicore`。
- 不顺手处理与 alpha/blend 无关的动画时间、布局、粒子数量、mask 或业务接入问题。

## 3. 制定计划时的基线

```text
UTC: 2026-07-27T10:10:57Z
HEAD: 7b775456824b70a50d7998248fcf648d4acdb52b
branch: main
git status --short --untracked-files=all: empty
```

制定计划时实际读取：

```text
AGENTS.md
docs/agent-rules/vni-runtime.md
docs/agent-rules/cocos-runtime.md
tasks/templates/task-plan.md
tasks/42-anieditorv5runtime-cc-special-blend-modes.md
tasks/42-anieditorv5runtime-cc-special-blend-modes-260623-082032.md
tasks/71-anieditorv5runtime-cc-vnicore-runtime-sync.md
tasks/71-anieditorv5runtime-cc-vnicore-runtime-sync-2026-07-02T055146Z.md
tasks/86-vnicore-editor-effect-parity.md
tasks/117-anieditorv5runtime-cc-vni095-sync-260722-051617.md
packages/vnicore/src/pixi/additive-matte-texture.ts
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/tests/cocos/blend-mode.test.ts
packages/anieditorv5runtime-cc/scripts/build-standalone.mjs
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/README.md
```

### 正式复现输入

```text
/Users/zerro/Downloads/bigwinanimation.zip
SHA-256: a8d611becafa2285d86f448ea37ed28fa286eb0cececd9a4c3f1cdcd0d63e94f

/var/folders/cd/n3582jj17nv6fx4zw7r3qyw00000gn/T/codex-clipboard-2bc7184a-0c88-4c53-a96c-7db3c482c520.png
SHA-256: c9f5db2812ca83c8e2dee15744628fa81d2e0a0d18a49b8f49a013b86e16545d
```

ZIP 当前事实：

- manifest/project 均为 `VNI_0.085`，`engineTarget=cocos_creator 3.8.6`，`maskCompositeMode=legacy_alpha`，正式运行入口是 `runtime_100/bigwinanimation.json`。
- `旋涡1` 使用 `WinPopup_EEX_BigWin_1.png`，layer blend mode 为 `screen`。
- `旋涡2` 使用 `WinPopup_EEX_BigWin_2.png`，layer blend mode 为 `normal`。
- 两张图都是 RGBA PNG，alpha 实际范围都是 `0..255`，不是 JPG，也不是全不透明 RGB PNG。
- `旋涡1` 的 Green 通道在所有像素上都是 `255`，同时大量像素 alpha 接近或等于 `0`；因此透明像素的隐藏 RGB 不能参与目标颜色因子。
- `packages/vnicore/src/pixi/additive-matte-texture.ts` 只对全部像素 alpha 都为 `255` 的 additive JPG/RGB PNG 派生 luminance matte；遇到本样本这类有效 alpha PNG会返回 `null`。所以“漏同步 vnicore matte”不是当前样本可直接成立的根因。

当前 Cocos 实现事实：

- `getCocosBlendModeConfig("screen")` 当前配置为 color `SRC_ALPHA / ONE_MINUS_SRC_COLOR`。
- 对 straight-alpha 源纹理，source RGB 尚未乘 alpha，而 `ONE_MINUS_SRC_COLOR` 会直接读取隐藏 RGB；即使像素 alpha 为 `0`，它仍可能压暗或染色 destination。这与样本透明区域 Green=255 的数据组合存在明确污染风险。
- `normal` 当前保留 Cocos Sprite 默认状态；因此要先单独隐藏 `旋涡1` 验证 `旋涡2` 是否真的错误，不能把上层 `screen` 污染误判成两张图都坏。
- 任务 42 只用 fake `cc` 验证“参数被写入”，其报告明确记录没有运行真实 Cocos Creator 3.8.6 视觉探针。
- Cocos 官方 3.8 文档区分 straight alpha 与 Premultiply Alpha：前者使用 `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`，后者使用 `ONE / ONE_MINUS_SRC_ALPHA`。执行时必须记录样本在真实 Creator 中的导入设置，不能假设两种纹理可共用同一 source factor。

## 4. 需求解释与技术决策

### 需求解释

- 用户看到的“像和黑色叠起来”定义为透明/低 alpha 区域仍改变底图颜色或透明度，而不只是亮度与 Pixi 有轻微差别。
- `vniviewer` 正确是视觉 oracle，不表示应把 Pixi canvas 预处理代码复制进 Cocos。
- 当前样本已经证明“按文件扩展名区分 JPG/PNG”不充分；判定必须基于真实 alpha 数据或由资源准备方显式提供的 alpha 编码合同。
- 截图只能证明最终合成异常，不能单独证明 `旋涡2` 的 normal path 有 bug；执行时必须做单层和叠层 A/B。

### 关键决策

1. **先做真实像素/Creator 探针，再选择实现路线。**
   - 固定测试 `normal`、当前 `screen`、alpha-correct `screen`，并对 Premultiply Alpha 开/关各跑一次。
   - 探针必须回答污染来自图片导入、shader 输出、fixed-function blend state，还是它们的组合。

2. **不把 vnicore 的 DOM/canvas matte 代码直接迁入 Cocos。**
   - Cocos runtime 不拥有 URL loader、DOM 或隐藏 renderer。
   - 如果无 alpha 黑底资源需要预处理，优先使用 Cocos 原生且可在 prepare 阶段完成的纹理/Material 路径；无法可靠读取像素时，通过严格的显式资源合同处理，不能猜扩展名。

3. **alpha-correct `screen` 必须满足透明像素不改变 destination。**
   - 若 Cocos builtin Sprite + blend state 无法对 straight-alpha texture 表达正确公式，则使用最小自定义 Effect/Material 或 prepare-time 派生纹理。
   - 不接受把 `screen` 改成 `normal/add`、降低 opacity 或清理美术透明区作为替代。

4. **优先不改 VNI schema。**
   - 当前导出已经包含正确 layer blend mode，问题属于 Cocos 资源/渲染适配。
   - 如果真实探针证明必须由宿主声明 straight/premultiplied/matte，先在 Cocos asset resolver/driver 增加最小 typed contract；若必须修改正式 VNI schema、编辑器导出或跨包 public API，停止执行并说明 L2 范围扩张，不能事后扩大计划。

5. **修复覆盖所有创建 Sprite 的路径。**
   - image/sequence、safe glow、chaser light、particles、deterministic effects 和 runtime SpriteFrame replacement 使用同一 blend/alpha 决策入口。
   - 逐帧更新只能切换已缓存的 material/blend key，不得每帧创建 Material、Texture2D、SpriteFrame 或读取像素。

## 5. 职责与合同

- **模块职责**：`blend-mode.ts` 表达 VNI blend 到 Cocos 渲染策略；真实 Cocos API 和材质绑定属于 `cocos-node-driver.ts`；`player.ts` 只传递 layer/sample 语义并管理生命周期。
- **数据/API**：VNI JSON 继续提供 `blendMode`；Cocos `SpriteFrame` 的 alpha 编码若无法从稳定 public API 得到，必须由最小 typed asset/driver contract 显式提供。
- **资源生命周期**：宿主拥有输入 SpriteFrame；runtime 只拥有自己创建的 Material/派生 Texture/SpriteFrame/cache。init/prepare 失败、切换 project 和 destroy 必须释放未提交及已提交的 runtime-owned 资源，不销毁宿主 SpriteFrame。
- **失败策略**：alpha 编码未知且无法保证正确视觉、Effect/Material 缺失、Sprite API 不兼容、非法模式或资源尺寸错误时尽早抛错；不得静默退回 normal。
- **性能合同**：同一 Sprite/策略复用 material/cache；steady-state update 不创建渲染资源，不读回 GPU 像素。
- **禁止行为**：图层名/asset id 特例、按扩展名猜 alpha、修改源图、隐藏 canvas、额外 Pixi renderer、placeholder、首项默认值或效果降级。

## 6. 文件范围

### 预计新增

```text
packages/anieditorv5runtime-cc/tests/fixtures/bigwinanimation.json
```

若真实探针证明 builtin Sprite 无法正确表达 straight-alpha `screen`，允许新增最小的 Cocos Effect/Material adapter 与对应测试/standalone 资产；文件名在实现时按现有 package 结构确定，并在执行报告记录选择依据。

### 预计修改

```text
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/src/index.ts
packages/anieditorv5runtime-cc/tests/cocos/blend-mode.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/standalone.zip
```

没有 public type/Effect 交付变化时，删除上述未实际需要的条目，不制造无关改动。`standalone/anieditorv5runtime-cc.ts` 只能由 `scripts/build-standalone.mjs` 生成，禁止手改；`standalone.zip` 是受 ignore 管理的本地正式交付物。

### 原则上不应修改

```text
docs/anieditor5
packages/vnicore
apps/anieditorv5viewer
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/vni-runtime.md
```

## 7. 实施步骤

1. **确认执行基线与样本完整性**
   - 重新核对 HEAD、工作区、ZIP/Screenshot SHA-256、manifest、runtime JSON 和两张旋涡 PNG 的通道统计。
   - 把 `runtime_100/bigwinanimation.json` 原样复制为测试 fixture；不复制 1.9 MB 完整 ZIP 或图片到仓库，真实视觉验收继续使用带 hash 的外部正式输入。

2. **建立真实 Cocos 3.8.6 最小探针**
   - 使用同一 SpriteFrame、同一背景和固定时间点，分别渲染 `旋涡2 only`、`旋涡1 only`、两层叠加。
   - 对 straight/Premultiply Alpha 导入、当前 screen 配置和候选 alpha-correct 配置生成截图；记录 Sprite/Texture/Material 可公开读取的 alpha 状态与最终 pass state。
   - 与 `vniviewer` 在 `0s`、`1s`、`2.8s`、`5s` 对照；确认真正失败层和公式后再改生产代码。

3. **实现统一 blend/alpha 合同**
   - 在 `blend-mode.ts` 表达 straight、premultiplied 和必要的 matte/effect 策略，不允许一种 factor 配置冒充所有输入。
   - 在 Cocos driver 中一次性准备并缓存所需 material/texture；player 的所有 Sprite 创建/替换路径走同一入口。
   - 若采用自定义 Effect，把资产加载/注入、缺失错误、standalone 复制方式和 destroy ownership 一并实现；若采用派生纹理，证明 prepare-only、跨 web/native 可用并完整释放。

4. **同步 fixture、测试与 standalone**
   - fixture 测试锁定样本的 layer/asset/blend 合同。
   - 增加透明像素隐藏 RGB 不得污染 destination 的公式测试，以及 straight/premultiplied/opaque-light 三类分支测试。
   - 更新 fake `cc`、3.8.6 shim、player tests、standalone parity/player tests 和 checker。
   - 运行正式生成器更新 standalone；按最终交付清单重建 `standalone.zip`，检查无旧文件和 macOS metadata。

5. **文档、真实验收与收尾**
   - README 写明支持的 alpha 编码、导入设置、blend 策略、额外 Effect/Material（如有）、性能和 fail-fast 行为。
   - 在真实 Cocos Creator 3.8.6 中用正式 ZIP 完成关键帧截图和连续 loop 验收。
   - 只有新增稳定跨任务边界时更新 `docs/agent-rules/cocos-runtime.md`；生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 测试必须验证 alpha-correct 合成关系，不能只断言 enum/factor 被写入。
- 覆盖 alpha=0 且 RGB 非零、0<alpha<1、alpha=1、straight/premultiplied、screen 与 normal 隔离、重复 init/destroy。
- 正式样本测试锁定 `旋涡1=screen`、`旋涡2=normal`，但生产代码不得读取中文层名。
- 如果 fake `cc` 与真实 Creator 行为冲突，以真实 Creator 3.8.6 为准并修正 fake。

### 验收级别

`L2`。原因是会修改 Cocos runtime 的共享渲染行为，并同步生成的 standalone 和本地 ZIP 正式交付物；影响所有直接消费该 package/standalone 的 Cocos 项目，但不需要整仓 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:build
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
git diff --check
```

`build` 证明模块化源码和 public exports，`standalone:build/typecheck/check` 分别证明生成、Cocos 单文件编译和交付约束，不能互相替代。

### 人工验收

- 必须使用 Cocos Creator 3.8.6 和 hash 匹配的 `bigwinanimation.zip`。
- Cocos 画布背景与 `vniviewer` 对照背景一致，缩放和截图裁切一致。
- 分别截图 `旋涡2 only`、`旋涡1 only`、两层叠加，并覆盖 `0s`、`1s`、`2.8s`、`5s`。
- 透明区域不得改变底图；旋涡边缘不得出现矩形/黑边/绿色污染；叠加亮度与 viewer 在可接受的色彩空间差异内一致。
- 连续 loop 5 分钟观察节点、Material、Texture/SpriteFrame cache 和内存计数不持续增长。
- 如果 Effect/Material 路线涉及 web/native 差异，至少验证 Creator Web Preview 和目标生产平台；未执行的平台必须在报告中列为剩余风险。

### 独立验收建议

`必须`。本任务涉及 Cocos 真实 GPU blend、纹理 alpha 编码、runtime-owned Material/Texture 生命周期和 standalone 正式交付。独立复验高风险点：

1. 正式 ZIP 的四个关键帧与 `vniviewer` 对照；
2. straight/Premultiply Alpha 设置与 runtime 策略匹配；
3. loop/destroy 后无 Material/Texture/SpriteFrame 泄漏。

## 9. 环境与依赖

- 使用仓库要求的 Node 24；当前普通 shell 无 `node` 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 使用 pnpm，不切换 npm/yarn。
- 现有依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试。
- 原则上不新增 npm 依赖、不修改 lockfile。Cocos Effect/Material 应使用 Creator 3.8.6 内置能力；确需依赖时先说明无法使用内置能力的证据和交付影响。

## 10. 生成物、文档与规则

- `standalone/anieditorv5runtime-cc.ts` 由 `standalone:build` 生成，禁止手改。
- 更新 public runtime 行为时必须同步 checker、standalone tests 和本地 `standalone.zip`；报告记录 ZIP 内容及 SHA-256。
- README 必须替换当前把 `screen` 简化为固定 `SRC_ALPHA / ONE_MINUS_SRC_COLOR` 的无条件说明，改为最终经真实探针验证的 alpha-aware 合同。
- 本任务默认不更新 `AGENTS.md`；只有职责边界跨包变化才更新。若只是细化 Cocos alpha/blend 长期约束，最小更新 `docs/agent-rules/cocos-runtime.md`。

## 11. 执行报告

规划时不生成报告。完成后创建：

```text
tasks/128-anieditorv5runtime-cc-alpha-blend-parity-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终根因、真实 Creator 探针矩阵、实现路线与资源 ownership、实际文件、自动化结果、关键帧视觉结果、standalone ZIP hash、计划偏差和剩余平台风险。

## 12. 风险、假设与待确认

### 风险

- Cocos web/native 后端或 Premultiply Alpha 导入设置可能采用不同纹理编码；只在 fake `cc` 或单一平台通过不足以证明交付正确。
- fixed-function blend 可能无法正确表达 straight-alpha screen；若需 Effect，会扩大 standalone 资产清单和宿主接入步骤。
- 同一 SpriteFrame 若被 normal 与 screen 同时复用，不能原地修改宿主纹理；必须使用独立 runtime-owned material/view。
- atlas、压缩纹理或 native 图片可能无法稳定读回像素；不得建立依赖 DOM/ImageData 的隐藏路径。

### 假设

- 用户提供 ZIP 是出现问题时使用的原始 Cocos-compatible 导出，SHA-256 可用于执行时确认未变化。
- `vniviewer`/编辑器 Pixi 预览是本任务的视觉语义基线。
- 业务宿主可以提供真实 Cocos Creator 3.8.6 视觉验收环境。

### 待确认

无。具体 alpha 编码和最终渲染策略由计划中的真实 Creator 探针查明，不留作用户主观选择。

## 13. 完成清单

- [ ] 目标与非目标均满足，无样本硬编码或源图修改。
- [ ] 已证明 `旋涡1`、`旋涡2` 各自及叠加的真实失败/修复结果。
- [ ] straight/premultiplied/无有效 alpha 分支和未知状态 fail-fast 有自动化保护。
- [ ] 所有 Sprite 创建/替换路径使用统一 alpha/blend 合同。
- [ ] runtime-owned Material/Texture/SpriteFrame 的 prepare、rollback、destroy 已覆盖。
- [ ] modular、standalone、checker、tests、README 和 ZIP 已同步。
- [ ] 指定自动化验收通过，真实 Cocos 视觉验收与 fake 测试明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/vni-runtime.md`、`docs/agent-rules/cocos-runtime.md` 和本计划；
2. 核对 Git、ZIP、截图和当前 Cocos 导入设置；
3. 先完成真实 Creator 最小探针并记录证据，再选择 blend-state、Effect 或 prepare-time 纹理路线；
4. 按计划实现，不把 vnicore Pixi/DOM 路径复制到 Cocos；
5. 若必须修改 VNI schema、编辑器导出、跨包 public contract 或 lockfile，先停止说明范围扩张；
6. 只运行计划规定的 L2 定向验收，并完成真实 Cocos 关键帧对照；
7. 生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。

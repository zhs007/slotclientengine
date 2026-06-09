# agentani-demo2 初始化任务计划

## 1. 任务目标

新增一个可运行测试项目 `apps/agentani-demo2`，用于验证另一条动画代码化路线：把 `assets/editor2` 导出的编辑器 JSON 转换为 **engine-specific TypeScript 动画实现**，而不是转换为统一数据协议再由通用 runtime 解释。

本任务的核心原则：

- JSON 只是开发期输入，不是运行时格式。
- 转换后的动画 TS 是作品代码，不是配置 JSON 的薄翻译。
- 首期目标引擎为 PixiJS，动画文件可以直接使用 PixiJS 与 GSAP。
- 不实现通用 animation runtime、timeline interpreter 或 effect interpreter。
- 必须按视频编辑时间片语义理解源 JSON：图层或片段只在它的动画区间内出现；没有覆盖的时间段默认应视为隐藏或不参与画面，而不是一直静态显示。
- 必须尽量复用相同图片资源；同一张图片不要因为出现在多个图层或多个分离时间片里就复制多份。
- 后续如果需要 CocosCreator 版本，由 agent 参考 Pixi 版 TS 与源 JSON 再翻译一份 CocosCreator 版 TS，而不是通过扩展 core/runtime 来兼容。
- 特殊动画逻辑优先留在具体动画文件内，避免污染公共层。

首期必须完成 `bg` 动画：

- 从 `assets/editor2/bg/project.json` 读取图层、动画和 base64 图片资源。
- 将 `project.json` 中内嵌的 base64 图片解码导出为独立图片文件，放入 `apps/agentani-demo2/src/assets/bg/`。
- 不把 `project.json` 复制到新项目运行时资源中，运行时也不读取导出的 JSON。
- 用 TypeScript 代码直接实现 PixiJS 场景构建与 GSAP 时间线，核心实现命名为 `bg.ts`。
- 页面提供动画下拉列表，为后续把 `assets/editor2/*` 下每个目录都转为 engine-specific TS 动画做扩展。
- 新项目包含中文 `README.md`，说明 demo2 与 `agentani-demo` 的设计差异。

本计划是可直接执行版本，不依赖额外上下文。

## 2. 已知输入

当前仓库内可确认的事实如下：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- workspace 匹配 `apps/*` 与 `packages/*`。
- 可参考的既有项目包括：
  - `apps/agentani-demo`
  - `apps/victoryani-demo`
  - `apps/spine2pixiani-demo`
  - `packages/pixiani`
- `apps/agentani-demo` 当前路线是：
  - `src/animations/*.ts` 保存代码化数据配置。
  - `src/runtime/*` 负责解释项目、构建图层、执行效果、播放时间线。
- `agentani-demo2` 需要刻意避开上述 runtime/interpreter 路线。
- `assets/editor2` 当前包含这些动画目录：
  - `bg`
  - `fang`
  - `heart`
  - `mei`
  - `tao`
  - `海滩`
  - `竹子1`
- `assets/editor2/bg/project.json` 当前特征：
  - `version`: `13.19`
  - `duration`: `3`
  - 图层数：`15`
  - 所有图层都是 `pic`
  - 所有图层的 `asset` 都是 base64 data URL
  - 使用到的混合模式包括 `normal` 与 `add`
  - 使用到 1 个遮罩关系：`刷光.maskId = 隐形框_copy_7`
  - 使用到的动画类型：
    - `fadeIn`
    - `fadeOut`
    - `pulse`
    - `starlight`
    - `sweepLight`
    - `swing`

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- 已新增 `apps/agentani-demo2`，并被 pnpm workspace 自动识别。
- 应用可通过以下命令运行和校验：

```bash
pnpm --filter agentani-demo2 dev
pnpm --filter agentani-demo2 typecheck
pnpm --filter agentani-demo2 lint
pnpm --filter agentani-demo2 test
pnpm --filter agentani-demo2 build
```

- `assets/editor2/bg/project.json` 中 15 个 base64 图片已解码为独立图片文件，保存到 `apps/agentani-demo2/src/assets/bg/`。
- 新项目运行时不包含、不 import、不 fetch `assets/editor2/bg/project.json` 或复制后的 `project.json`。
- `bg` 动画的 PixiJS + GSAP 实现落在 TypeScript 代码中，建议路径：
  - `apps/agentani-demo2/src/animations/pixi/bg.ts`
- `bg.ts` 是一个直接创建 Pixi 场景并返回播放控制对象的动画模块，不依赖通用 project/layer/effect interpreter。
- `bg.ts` 至少包含：
  - 动画元信息，例如 `id`、`label`、`duration`
  - 图片资源 import
  - Pixi `Container` / `Sprite` 创建逻辑
  - 图层基础属性
  - 图层或片段的可见时间区间处理
  - 相同图片资源复用策略
  - 遮罩关系
  - 混合模式设置
  - GSAP timeline 定义
  - 播放、暂停、重播、销毁所需的最小控制接口
- 页面可正确加载并播放 `bg`。
- 下拉列表可展示 `assets/editor2` 下的动画项。
- 下拉列表至少能选择并播放已实现的 `bg`；未实现目录应清晰标记为未转换或禁用，后续新增对应 TS 后无需重构 UI。
- `bg` 的 6 种动画行为均在 `bg.ts` 或 `bg.ts` 的同目录局部 helper 中显式实现：
  - `fadeIn`
  - `fadeOut`
  - `pulse`
  - `starlight`
  - `sweepLight`
  - `swing`
- 禁止新增这些通用解释器式模块：
  - `src/runtime/animation-effects.ts`
  - `src/runtime/timeline.ts`
  - `src/runtime/player.ts`，如果它承担项目解释和效果调度职责
  - 任何 `playProjectJson(project)` / `buildProjectTimeline(project)` / `createAnimationEffect(step)` 形式的公共运行时
- 允许保留极薄的 app shell 或 engine-local helper，但它们不能知道编辑器 effect 类型，也不能解释动画 JSON。
- 页面至少提供：
  - Pixi 渲染区域
  - 动画选择下拉列表
  - 播放、暂停或重播控制
  - 循环开关
  - 当前动画名称与支持状态提示
- 新项目包含 `README.md`，说明：
  - 项目目的
  - 运行方式
  - 与 `agentani-demo` 的差异
  - 为什么不做通用 runtime/interpreter
  - 资源来源
  - base64 图片导出方式
  - 动画 TS 的组织方式
  - 如何新增下一个 Pixi 动画
  - 如何让 agent 参考 Pixi 版翻译 CocosCreator 版
  - 当前支持范围与已知限制
- 至少完成最小测试，覆盖：
  - base64 data URL 到文件名/扩展名解析
  - `bg` 代码实现不依赖 JSON
  - `bg` 模块导出元信息和创建函数
  - `bg` 覆盖源 JSON 的 15 个图层片段，但不强制创建 15 个 Pixi 图层实例
  - `刷光` 遮罩关系绑定到 `隐形框_copy_7`
  - `add` 混合模式应用到对应光效图层
  - 没有动画覆盖的区间默认隐藏，不把视频编辑片段误当成全程常显图层
  - 同一图片内容不会被重复导出为多份资源
  - 同一图片在动画区间彻底分开的情况下，优先复用同一个 Pixi 显示实例或同一个 texture
  - 时间线总时长不短于 `3s`
  - 重播前能够恢复关键初始状态，尤其是负 `scaleX` 镜像图层
- 任务完成后，在 `tasks/` 下新增中文任务报告，命名为：

```text
14-agentani-demo2-bootstrap-[utctime].md
```

其中 `utctime` 使用 UTC 时间，格式为 `年月日时分秒` 的短格式，例如：

```text
260512-181300
```

- 若执行中修改了仓库协作规则、目录规范或基础脚本，需要同步更新根级 `agents.md`；若仅新增 demo 应用、资源、测试和文档，则无需修改。

## 4. 默认实现假设

为保证任务可落地，默认按以下假设推进：

- 首期只要求完整转换并播放 `assets/editor2/bg`。
- 运行时禁止读取编辑器导出的 JSON；开发期可以用脚本读取源 JSON 生成图片和代码草稿。
- 转换后的图片资源必须提交在新项目自己的 `src/assets/bg/` 目录下。
- `bg.ts` 是最终运行时事实来源，不能只是薄封装 JSON，也不能只是把 JSON 字段换成 TS object。
- 允许 `bg.ts` 直接 import `pixi.js` 与 `gsap`。
- 允许动画文件里出现局部函数，例如 `createLayer`、`fadeIn`、`pulse`、`bindMask`，只要这些函数是 `bg` 的实现细节或 Pixi 动画局部工具。
- 源 JSON 按类视频编辑器模型理解：
  - 一个 layer 更接近时间线片段或轨道片段。
  - 有动画区间时才应显示或参与播放。
  - 不在任何片段/动画覆盖区间内时，默认隐藏，除非源数据明确表达静态常显背景。
- 图片导出需要做内容去重：
  - 对 base64 解码后的 bytes 计算 hash。
  - 相同 hash 只写出一个图片文件。
  - 多个图层引用同一图片时，在 TS 中复用同一个 import/texture。
- Pixi 实例也应尽量复用：
  - 同一图片、同一轨道语义或可安全合并的多个片段，如果动画时间区间完全不重叠，优先用同一个 `Sprite`，在 timeline 中切换属性和显隐。
  - 如果两个片段时间有重叠、需要不同 mask/blend、父容器不同或视觉上必须同时存在，则可以创建多个 Sprite，但仍复用同一个 texture。
- 后续目录转换时可以新增：
  - `src/animations/pixi/fang.ts`
  - `src/animations/pixi/heart.ts`
  - `src/animations/pixi/mei.ts`
  - `src/animations/pixi/tao.ts`
  - `src/animations/pixi/beach.ts`
  - `src/animations/pixi/bamboo1.ts`
- 中文目录或中文图层名可保留在 label 或 Pixi label 中，但文件名建议转为稳定 ASCII slug，避免跨平台路径和 import 问题。
- 图层 `id` 可以保留中文字符串，用于遮罩、调试和对照源数据。
- 编辑器里 `PRESET_ANIMATIONS` 通过字符串和 `new Function` 执行动画；新项目应改为显式 TypeScript 代码，不直接执行字符串脚本。
- 若依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 5. 实施范围

本任务默认可以修改以下路径：

- `apps/agentani-demo2/**`
- `tasks/14-agentani-demo2-bootstrap.md`
- 任务完成报告 `tasks/14-agentani-demo2-bootstrap-[utctime].md`

可只读参考以下路径：

- `assets/editor2/**`
- `docs/victory_editor_v2/main.ts`
- `apps/agentani-demo/**`
- `apps/victoryani-demo/**`
- `apps/spine2pixiani-demo/**`
- `packages/pixiani/src/core/**`
- `packages/pixiani/src/layout.ts`
- 根级 `package.json`
- 根级 `tsconfig.base.json`
- 根级 `turbo.json`
- 根级 `agents.md`

默认不修改以下共享区域，除非执行中确认确有必要：

- `packages/**`
- 根级工具链配置
- 根级 `agents.md`

## 6. 核心设计决策

### 决策 1：动画 TS 是 engine-specific 作品代码

原因：

- 本实验目标是降低 core/runtime 变重的风险。
- 如果把 JSON 先转换为统一数据协议，再由 runtime 解释，随着动画特例增加，runtime 会持续膨胀。
- 用户希望未来换 engine 时由 agent 对照翻译一份，而不是提前设计复杂抽象。

结论：

- `bg.ts` 直接实现 PixiJS 版动画。
- `bg.ts` 可以直接创建 `PIXI.Container`、`PIXI.Sprite`、`gsap.timeline()`。
- 不追求 Pixi 版和未来 CocosCreator 版共享同一份运行时解释器。

### 决策 2：不实现通用 animation runtime/interpreter

原因：

- 通用 runtime 会自然吸收 effect 类型、layer schema、mask/blend 映射、timeline 调度和各种特殊逻辑。
- 这会让 core 越来越接近另一套小型动画引擎，甚至像重新实现一套小 GSAP。
- 特殊逻辑留在具体动画里，影响范围更小。

结论：

- 不新增 `runtime/animation-effects.ts`。
- 不新增 `runtime/timeline.ts`。
- 不新增按 JSON/TS 配置解释项目的 `runtime/player.ts`。
- 可以有一个很薄的 app 播放壳，例如 `src/player-shell.ts` 或 `src/main.ts` 中的局部控制逻辑，但它只负责：
  - 初始化 Pixi Application。
  - 挂载当前动画 root。
  - 调用动画模块返回的 `play/pause/replay/destroy`。
  - 切换动画时清理旧动画。

### 决策 3：公共 helper 只保留低风险局部工具

原因：

- 完全复制粘贴所有 Pixi 细节会降低可读性。
- 但过早抽象又会把特殊逻辑吸入公共层。

结论：

- 允许存在 `src/animations/pixi/helpers.ts`，但只能放 engine-local、低语义工具，例如：
  - 创建居中 anchor 的 Sprite。
  - 应用基础 transform。
  - 应用 Pixi blend mode。
  - 安全销毁 Container。
- `helpers.ts` 禁止包含编辑器 effect 分发逻辑。
- `helpers.ts` 禁止定义 `CodeAnimationProject` / `CodeAnimationLayer` / `CodeAnimationStep` 这类统一协议。
- 如果某个 helper 只服务 `bg`，优先放在 `bg.ts` 内部。

### 决策 4：跨引擎靠 agent 翻译，不靠 runtime 兼容

原因：

- 如果未来需要 CocosCreator，Pixi 的 `Container/Sprite/Texture/mask/blendMode` 和 Cocos 的 `Node/SpriteFrame/Mask/Blend` 本来就有不同语义。
- 强行设计一层完全统一的 facade，长期可能比直接翻译更复杂。
- agent 可以把 Pixi 版 TS 当成可读的“动画说明书”，再结合源 JSON 翻译成另一份 CocosCreator 代码。

结论：

- README 需要记录跨引擎翻译策略。
- 未来建议目录可以演进为：

```text
src/animations/
  pixi/
    bg.ts
  cocos/
    bg.ts
```

- 不要求首期实现 CocosCreator 版。
- 不为了未来 CocosCreator 在首期引入抽象 adapter。

### 决策 5：UI 只做测试播放器，不做编辑器

原因：

- 本任务目标是验证动画代码化路线，不是复刻编辑器。
- UI 需要服务于切换和验收。

结论：

- 首屏就是播放器。
- 不做营销页或复杂编辑功能。
- 保持控制面板简洁：
  - 下拉选择动画
  - 播放
  - 暂停
  - 重播
  - 循环开关
  - 状态文本

### 决策 6：按视频编辑时间片处理显隐

原因：

- 源 JSON 的组织方式更接近视频编辑器时间线，而不是游戏对象常驻场景树。
- 一个图片图层可能只代表某个时间片里的出现、淡入、扫光或闪烁。
- 如果把所有导出图层都当成全程常显对象，会出现画面状态错误，也会让后续动画代码膨胀。

结论：

- 转换 `bg.ts` 时必须先分析每个图层的可见区间。
- 只有明确作为底图或常驻元素的图层才默认常显。
- 带动画的片段应在进入区间前 `visible = false` 或 `alpha = 0`，在开始时间设置为可见，并在结束时间按源语义隐藏、淡出或重置。
- 多段动画复用同一 Sprite 时，每段开始前必须设置该段所需的 transform、alpha、blend、mask 等状态，避免继承上一段残留状态。
- replay 前必须恢复所有被复用对象的基准状态。

### 决策 7：图片资源和可分离时间片都要尽量复用

原因：

- 编辑器导出可能为相同图片复制出多个图层或多个时间片。
- 如果代码转换时每个图层都导出一份图片并创建一个 Sprite，项目体积和运行时对象数都会快速膨胀。
- demo2 的目标是让 agent 写更自由的动画代码，但不代表接受无意义的资源复制。

结论：

- 资源导出阶段必须按图片内容 hash 去重。
- `src/assets/[id]/` 中同一图片内容只保留一份文件。
- TS 动画中多个片段可以 import 同一个资源 URL，Pixi 中多个对象可以共享同一个 `Texture`。
- 当同一图片的多个动画区间彻底分开，且 mask、blend、父节点、锚点和视觉层级允许合并时，优先复用一个 Sprite，通过 GSAP 在不同时间段设置属性并播放。
- 当多个片段需要同时显示，或合并会破坏层级、遮罩、混合模式、交互顺序时，允许创建多个 Sprite，但仍不能复制图片文件。

## 7. 建议目标目录结构

建议最终形成如下结构：

```text
apps/agentani-demo2/
  index.html
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vite.config.ts
  eslint.config.cjs
  README.md
  src/
    assets/
      bg/
        layer-00.png
        layer-01.png
        layer-02.png
        ...
    animations/
      pixi/
        bg.ts
        registry.ts
        types.ts
        helpers.ts
    ui/
      controls.ts
    main.ts
    styles.css
    vite-env.d.ts
  tests/
    animations/
      bg.test.ts
      registry.test.ts
    runtime-boundary.test.ts
    setup.ts
  tools/
    extract-editor2-assets.mjs
```

说明：

- `animations/pixi/types.ts` 只定义动画模块接口，例如 `PixiAnimationModule`、`PixiAnimationInstance`，不定义 editor project/layer/step 协议。
- `tools/extract-editor2-assets.mjs` 可以保留为开发辅助工具，但运行时不得 import 它。
- 如不希望保留工具脚本，也可在完成转换后删除；README 仍需记录转换规则。
- 若新增空目录，必须放置 `.keepme`。

## 8. 分阶段实施步骤

### 阶段 1：建立应用骨架

1. 参考 `apps/agentani-demo` 创建 `apps/agentani-demo2`，但不要复制 `src/runtime/**`。
2. 配置 `package.json`：
   - `name`: `agentani-demo2`
   - `private`: `true`
   - `type`: `module`
   - scripts 包含：
     - `dev`
     - `build`
     - `lint`
     - `test`
     - `typecheck`
     - `format`
     - `format:check`
3. 依赖建议：
   - `pixi.js`
   - `gsap`
4. 开发依赖与根级基础工具链版本保持一致或沿用既有 app 的写法。
5. 创建 Vite 入口：
   - `index.html`
   - `src/main.ts`
   - `src/styles.css`

### 阶段 2：解码 `bg` 的 base64 图片

1. 编写转换工具 `apps/agentani-demo2/tools/extract-editor2-assets.mjs`。
2. 工具输入：

```text
assets/editor2/bg/project.json
```

3. 工具输出：

```text
apps/agentani-demo2/src/assets/bg/layer-00.png
apps/agentani-demo2/src/assets/bg/layer-01.png
...
```

4. 工具逻辑：
   - 读取并解析 JSON。
   - 遍历 `layers`。
   - 跳过非 `pic` 或空 `asset` 图层。
   - 支持 `data:*;base64,*`。
   - 对解码后的图片 bytes 计算稳定 hash。
   - 相同 hash 只写出一个图片文件，并记录哪些源图层复用了该文件。
   - 从 MIME 或文件头推断扩展名：
     - `image/png` 或 PNG 文件头 -> `.png`
     - `image/jpeg` -> `.jpg`
     - 其他类型默认 `.bin`，并在终端输出警告。
   - 解码并写入文件。
   - 输出一份图层摘要到终端，包含：
     - 顺序
     - 原始 `id`
     - 导出文件名
     - 图片 hash
     - 是否复用已有文件
     - 图片字节数
     - 动画类型
5. 转换完成后确认：
   - `bg` 原始 15 个图层均有资源映射。
   - 输出图片数量小于或等于 15；如果存在相同图片，必须少于原始图层数。
   - 文件能被 Vite import。
   - 没有把源 `project.json` 复制进运行时目录。

### 阶段 3：定义动画模块接口

1. 创建 `src/animations/pixi/types.ts`。
2. 只定义用于 app shell 的模块接口，例如：

```ts
import type { Application, Container } from "pixi.js";

export interface PixiAnimationInstance {
  root: Container;
  play(): void;
  pause(): void;
  replay(): void;
  setLoop(loop: boolean): void;
  destroy(): void;
}

export interface PixiAnimationModule {
  id: string;
  label: string;
  duration: number;
  create(app: Application): Promise<PixiAnimationInstance>;
}
```

3. 该接口只描述“动画模块如何被播放器挂载和控制”，不描述 editor JSON 的 layer/step/effect。

### 阶段 4：直接实现 `bg.ts`

1. 创建 `src/animations/pixi/bg.ts`。
2. 在 `bg.ts` 中 import 去重后的图片资源，数量小于或等于 15。
3. 在 `create(app)` 内部直接：
   - 加载 Pixi texture。
   - 创建 root container。
   - 按源时间线语义分析 15 个源图层对应的显示片段。
   - 为相同图片、互不重叠且可安全合并的显示片段复用同一个 layer container/sprite。
   - 对无法合并的片段创建独立 layer container/sprite，但共享同一个 texture。
   - 设置 anchor、position、scale、rotation、alpha、visible。
   - 设置 blend mode。
   - 绑定 `刷光` 到 `隐形框_copy_7` mask。
   - 将图层按视觉顺序加入 root。
   - 构建 GSAP master timeline。
4. `bg.ts` 需要保留局部初始状态，用于 replay 前 reset。
5. `bg.ts` 需要显式实现 6 种动画行为：
   - `fadeIn`
   - `fadeOut`
   - `pulse`
   - `starlight`
   - `sweepLight`
   - `swing`
6. 重点核对：
   - `刷光` 使用 `add` 混合模式，并被 `隐形框_copy_7` 遮罩。
   - `隐形框_copy_7` 与 `隐形框` alpha 为 `0`，但仍可作为遮罩或占位图层参与逻辑。
   - 负 `scaleX` 图层需要保留镜像效果。
   - 视频时间线片段进入前默认隐藏，不把所有图层当成全程常显。
   - 片段结束后应按语义淡出、隐藏或恢复，避免后续空白区间残留上一段画面。
   - 相同图片的分离时间片应尽量复用 Sprite 或至少复用 texture。
   - `底1` 在 `0.5s` 后淡出。
   - `底2` 无动画，作为静态底图。
7. 禁止在 `bg.ts` 中 import 源 JSON。

### 阶段 5：实现动画注册和下拉切换

1. 创建 `src/animations/pixi/registry.ts`。
2. 注册项建议包含：

```ts
{
  id: "bg",
  label: "bg",
  status: "ready",
  module: bgAnimation,
}
```

3. 同时注册未实现目录：

```ts
{
  id: "fang",
  label: "fang",
  status: "todo",
}
```

4. 下拉列表展示所有项。
5. `ready` 项可选择并播放。
6. `todo` 项显示为未转换，默认禁用或选择后显示提示但不崩溃。
7. 后续新增动画时，只需要：
   - 解码资源到 `src/assets/[id]/`
   - 新增 `src/animations/pixi/[id].ts`
   - 在 `registry.ts` 标记为 `ready`

### 阶段 6：实现 Pixi app shell 和 UI

1. `src/main.ts` 负责：
   - 创建 DOM shell。
   - 初始化 Pixi `Application`。
   - 加载当前选择的动画模块。
   - 切换动画时调用旧实例 `destroy()`。
   - 将新实例 `root` 挂到 stage。
   - 绑定播放、暂停、重播、循环。
2. `src/ui/controls.ts` 负责创建下拉和按钮。
3. app shell 不知道具体图层、效果类型或源 JSON 字段。
4. app shell 不提供 `playProject(project)` 这样的通用解释入口。

### 阶段 7：实现 README

`apps/agentani-demo2/README.md` 需要包含：

- 项目目的。
- 运行命令。
- 依赖安装失败时的代理命令。
- 与 `agentani-demo` 的差异。
- 为什么不使用导出 JSON。
- 为什么不做通用 runtime/interpreter。
- 为什么允许动画 TS 直接使用 PixiJS + GSAP。
- base64 图片如何导出到独立文件。
- 图片内容 hash 去重规则。
- 视频编辑时间片语义：无动画覆盖区间默认隐藏。
- 同一图片、分离时间片如何在 Pixi 动画中复用 texture 或 Sprite。
- `src/animations/pixi/bg.ts` 的组织方式。
- 如何新增下一个 Pixi 动画。
- 未来如何由 agent 参考 Pixi 版翻译 CocosCreator 版。
- 当前已实现动画：
  - `bg`
- 当前待转换动画：
  - `fang`
  - `heart`
  - `mei`
  - `tao`
  - `海滩`
  - `竹子1`
- 当前支持的动画行为：
  - `fadeIn`
  - `fadeOut`
  - `pulse`
  - `starlight`
  - `sweepLight`
  - `swing`
- 已知限制。

### 阶段 8：测试和验收

1. 编写单元测试。
2. 至少覆盖：
   - `registry` 返回全部目录状态。
   - `bg` 模块没有 JSON 依赖。
   - `bg` 模块导出 `id === "bg"`、`duration === 3` 和 `create()`。
   - `bg.create()` 能覆盖源 JSON 的 15 个图层片段，但允许因复用优化导致 Pixi 图层实例数量少于 15。
   - `刷光` 遮罩绑定到 `隐形框_copy_7`。
   - `add` 混合模式应用到目标光效图层。
   - 没有动画覆盖的时间段不会残留上一段应隐藏的图层。
   - 相同图片内容只导出一份资源文件。
   - 同一图片的完全分离时间片优先复用 texture；能安全合并时复用 Sprite。
   - GSAP timeline 总时长不短于 `3s`。
   - 重播后负 `scaleX` 图层保持镜像。
   - 源码中不存在 `createAnimationEffect`、`buildProjectTimeline`、`CodeAnimationProject` 等 demo1 式 interpreter API。
3. 运行：

```bash
pnpm --filter agentani-demo2 typecheck
pnpm --filter agentani-demo2 lint
pnpm --filter agentani-demo2 test
pnpm --filter agentani-demo2 build
```

4. 若依赖下载或构建依赖获取失败，设置代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

5. 手工验收：
   - 页面首屏不是空白。
   - 下拉列表可见。
   - `bg` 可播放。
   - `bg` 重播后视觉状态可重置。
   - `add` 混合模式的光效可见。
   - `刷光` 被遮罩限制在预期区域。
   - 星光闪烁可见。
   - 切换未实现项不会报错或白屏。

### 阶段 9：任务报告

任务完成后新增报告：

```text
tasks/14-agentani-demo2-bootstrap-[utctime].md
```

报告内容至少包括：

- 任务目标。
- 实际完成内容。
- 与 `agentani-demo` 的关键差异。
- 资源转换结果：
  - 输入路径。
  - 输出图片数量。
  - 输出目录。
  - 是否保留/删除转换脚本。
- 代码实现说明：
  - `bg.ts`
  - 注册表
  - Pixi app shell
  - UI
- 明确说明没有新增通用 animation runtime/interpreter。
- 验证命令与结果。
- 已知限制。
- 是否修改 `agents.md`；若未修改，说明原因。

## 9. 风险和处理策略

- 风险：直接写 engine-specific TS 会产生重复代码。
  - 处理：接受重复作为本实验的设计取舍；只抽取低语义 Pixi helper，不抽取 effect interpreter。
- 风险：动画文件过长。
  - 处理：允许在同目录拆出 `bg.layers.ts` 或 `bg.helpers.ts`，但这些文件仍服务 `bg` 或 Pixi 局部实现，不形成通用项目协议。
- 风险：后续多个动画重复实现 `fadeIn`、`pulse` 等函数。
  - 处理：初期接受重复；只有当多个动画出现完全一致、低风险的 Pixi helper 时才抽取，且禁止抽成按字符串 effect type 分发的解释器。
- 风险：换引擎时没有统一抽象，翻译成本上升。
  - 处理：把 Pixi 版代码写得清晰、局部、可读；README 记录 agent 翻译策略，并保留源 JSON 作为对照输入。
- 风险：误把视频编辑时间片当成常驻图层，导致空白区间仍显示旧画面。
  - 处理：转换前分析每个片段的可见区间；进入区间前显式隐藏，开始时显式设置状态，结束后显式隐藏或淡出；测试覆盖区间外不残留。
- 风险：相同图片因多个图层或多个时间片被重复导出，导致资源体积膨胀。
  - 处理：导出阶段按图片 bytes hash 去重；TS 中复用同一 import；Pixi 中复用同一 texture。
- 风险：过度复用 Sprite 破坏层级、遮罩或同时显示需求。
  - 处理：只在时间区间彻底分开且 mask/blend/父节点/层级兼容时复用 Sprite；否则创建多个 Sprite 但共享 texture。
- 风险：base64 MIME 不是标准 `image/png` 或 `image/jpeg`。
  - 处理：转换脚本输出警告，优先按文件头识别 PNG/JPEG，无法识别时使用 `.bin` 并人工确认。
- 风险：中文图层名作为文件名跨平台不稳定。
  - 处理：图片文件名用顺序号，图层 label/id 在代码里保留中文。
- 风险：pulse 处理负 scale 时破坏镜像。
  - 处理：以初始 scale 为基准乘法缩放，不强行改为正数。
- 风险：遮罩图层 alpha 为 0 导致视觉或遮罩行为与编辑器不一致。
  - 处理：在 `bg.ts` 内对遮罩对象做 Pixi 专用处理，并在 README 中说明。
- 风险：运行时意外读取 JSON。
  - 处理：测试或源码检查确认 `src/` 不 import `.json`，`src/assets/bg/` 不包含 `project.json`。

## 10. 不做事项

本任务不包含：

- 不改造 `docs/victory_editor_v2/main.ts`。
- 不修改 `packages/pixiani` 共享实现。
- 不实现编辑器功能。
- 不要求首期转换 `fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1`。
- 不要求首期实现 CocosCreator 版。
- 不设计跨引擎 adapter/facade。
- 不实现通用 animation runtime、timeline interpreter 或 effect interpreter。
- 不直接执行编辑器导出的字符串脚本或 `custom` 动画脚本。
- 不把 `assets/editor2/bg/project.json` 作为运行时资源。

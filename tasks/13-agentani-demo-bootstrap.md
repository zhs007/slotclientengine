# agentani-demo 初始化任务计划

## 1. 任务目标

新增一个可运行测试项目 `apps/agentani-demo`，用于把 `assets/editor2/bg/project.json` 中由 `docs/victory_editor_v2` 编辑器导出的动画，转换为不依赖导出 JSON 的代码实现。

首期必须完成 `bg` 动画：

- 从 `assets/editor2/bg/project.json` 读取图层、动画和 base64 图片资源。
- 将 `project.json` 中内嵌的 base64 图片解码导出为独立图片文件，放入 `apps/agentani-demo/src/assets/bg/`。
- 不把 `project.json` 复制到新项目运行时资源中，运行时也不读取导出的 JSON。
- 用 TypeScript 代码重写动画配置与播放逻辑，核心实现命名为 `bg.ts`。
- 基于 PixiJS、GSAP 与应用内复制的 `pixiani core` 实现播放。
- 页面提供动画下拉列表，为后续把 `assets/editor2/*` 下每个目录都转为代码动画做扩展。
- 新项目包含中文 `README.md`。

本计划是可直接执行版本，不依赖额外上下文。

## 2. 已知输入

当前仓库内可确认的事实如下：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- workspace 匹配 `apps/*` 与 `packages/*`。
- 可参考的既有项目包括：
  - `apps/victoryani-demo`
  - `apps/spine2pixiani-demo`
  - `packages/pixiani`
- `packages/pixiani/src/core` 可直接复制到新项目内使用。
- 编辑器源码位于 `docs/victory_editor_v2/main.ts`。
- 编辑器导出协议核心字段包括：
  - `version`
  - `name`
  - `duration`
  - `layers[]`
- 图层字段包括：
  - `id`
  - `type`
  - `asset`
  - `text`
  - `x`
  - `y`
  - `scaleX`
  - `scaleY`
  - `rotation`
  - `alpha`
  - `blendMode`
  - `visible`
  - `locked`
  - `maskId`
  - `animations[]`
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
- 其他目录也可能含 base64 内嵌资源，例如 `fang`、`heart`、`mei`、`tao`、`竹子1`；`海滩` 已有独立 `assets/*` 文件。

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- 已新增 `apps/agentani-demo`，并被 pnpm workspace 自动识别。
- 应用可通过以下命令运行和校验：

```bash
pnpm --filter agentani-demo dev
pnpm --filter agentani-demo typecheck
pnpm --filter agentani-demo lint
pnpm --filter agentani-demo test
pnpm --filter agentani-demo build
```

- `packages/pixiani/src/core/**` 已复制到 `apps/agentani-demo/src/core/**`，必要时同步复制 `packages/pixiani/src/layout.ts`。
- `assets/editor2/bg/project.json` 中 15 个 base64 图片已解码为独立图片文件，保存到 `apps/agentani-demo/src/assets/bg/`。
- 新项目运行时不包含、不 import、不 fetch `assets/editor2/bg/project.json` 或复制后的 `project.json`。
- `bg` 动画的配置与实现落在 TypeScript 代码中，建议路径：
  - `apps/agentani-demo/src/animations/bg.ts`
- `bg.ts` 至少包含：
  - 动画元信息，例如 `id`、`label`、`duration`
  - 图层代码配置
  - 资源 import 或资源 URL 映射
  - 图层基础属性
  - 遮罩关系
  - 混合模式
  - 动画时间线定义
- 播放器可正确消费 `bg.ts`，构建 Pixi 图层并播放动画。
- 下拉列表可展示 `assets/editor2` 下的动画项。
- 下拉列表至少能选择并播放已实现的 `bg`；未实现目录应清晰标记为未转换或禁用，后续新增对应 `*.ts` 后无需重构 UI。
- `bg` 的 6 种动画类型均有显式 TypeScript 实现：
  - `fadeIn`
  - `fadeOut`
  - `pulse`
  - `starlight`
  - `sweepLight`
  - `swing`
- 页面至少提供：
  - Pixi 渲染区域
  - 动画选择下拉列表
  - 播放、暂停或重播控制
  - 当前动画名称与支持状态提示
- 新项目包含 `README.md`，说明：
  - 项目目的
  - 运行方式
  - 资源来源
  - base64 图片导出方式
  - 代码动画组织方式
  - 如何新增下一个 `assets/editor2/*` 动画
  - 当前支持范围与已知限制
- 至少完成最小测试，覆盖：
  - base64 data URL 到文件名/扩展名解析
  - `bg` 代码配置不依赖 JSON
  - 图层实例构建
  - 遮罩关系绑定
  - 混合模式映射
  - 时间线调度
  - 动画注册表包含 `bg` 使用到的 6 种动画
- 任务完成后，在 `tasks/` 下新增中文任务报告，命名为：

```text
13-agentani-demo-bootstrap-[utctime].md
```

其中 `utctime` 使用 UTC 时间，格式为 `年月日时分秒` 的短格式，例如：

```text
260401-181300
```

- 若执行中修改了仓库协作规则、目录规范或基础脚本，需要同步更新根级 `agents.md`；若仅新增 demo 应用、资源、测试和文档，则无需修改。

## 4. 默认实现假设

为保证任务可落地，默认按以下假设推进：

- 首期只要求完整转换并播放 `assets/editor2/bg`。
- 运行时禁止读取编辑器导出的 JSON；开发期可以用脚本读取源 JSON 生成图片和代码草稿。
- 转换后的图片资源必须提交在新项目自己的 `src/assets/bg/` 目录下。
- `bg.ts` 是最终运行时事实来源，不能只是薄封装 JSON。
- 后续目录转换时可以新增 `fang.ts`、`heart.ts`、`mei.ts`、`tao.ts`、`beach.ts`、`bamboo1.ts` 等文件，再注册到统一动画列表。
- 中文目录或中文图层名可保留在 label 中，但文件名建议转为稳定 ASCII slug，避免跨平台路径和 import 问题。
- 图层 `id` 可以保留中文字符串，用于遮罩、调试和对照源数据。
- 编辑器里 `PRESET_ANIMATIONS` 通过字符串和 `new Function` 执行动画；新项目应改为显式 TypeScript 函数，不直接执行字符串脚本。
- 若依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 5. 实施范围

本任务默认可以修改以下路径：

- `apps/agentani-demo/**`
- `tasks/13-agentani-demo-bootstrap.md`
- 任务完成报告 `tasks/13-agentani-demo-bootstrap-[utctime].md`

可只读参考以下路径：

- `assets/editor2/**`
- `docs/victory_editor_v2/main.ts`
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

### 决策 1：运行时使用代码动画，不使用导出 JSON

原因：

- 用户明确要求最终不要用导出的 JSON 文件。
- 目标是验证能否把编辑器产物沉淀为可维护代码。
- 后续每个动画都要转代码实现，首期需要建立正确模式。

结论：

- 不把 `project.json` 放进 `apps/agentani-demo/src/assets/` 作为运行资源。
- `bg` 的运行配置写入 `src/animations/bg.ts`。
- `project.json` 只作为开发期转换输入。

### 决策 2：base64 图片必须解码成独立文件

原因：

- `assets/editor2/bg/project.json` 的所有图片都以内嵌 base64 存储。
- 直接保留 base64 会让代码不可读，也违背“asset 放自己 assets 目录下”的目标。

结论：

- 编写或临时运行一个 Node 转换脚本，读取 `assets/editor2/bg/project.json`。
- 对每个 `layer.asset`：
  - 解析 MIME 类型。
  - 解码 base64。
  - 按稳定规则写入 `apps/agentani-demo/src/assets/bg/`。
  - 生成资源清单供 `bg.ts` 使用。
- 文件名建议规则：

```text
[two-digit-order]-[slugified-layer-id].[ext]
```

示例：

```text
00-shuaguang.png
01-mask-copy-7.png
02-mask.png
```

如 slug 转换成本过高，可使用更稳定的顺序名：

```text
layer-00.png
layer-01.png
layer-02.png
```

并在 `bg.ts` 中保留原始中文 `id`。

### 决策 3：复制 pixiani core 到应用内

原因：

- 用户明确允许复制。
- 这是测试项目，局部修改运行时会更轻量。
- 不影响共享 `packages/pixiani` 的稳定性。

结论：

- 复制 `packages/pixiani/src/core/**` 到 `apps/agentani-demo/src/core/**`。
- 如需要布局工具，复制 `packages/pixiani/src/layout.ts` 到 `apps/agentani-demo/src/layout.ts`。
- 不把首期需求反推到 `packages/pixiani`。

### 决策 4：动画播放层用注册表扩展

原因：

- 当前 `bg` 只用 6 种动画，但其他目录会继续增加。
- 下拉切换需要统一动画定义接口。

结论：

- 定义统一接口，例如：

```ts
export interface CodeAnimationProject {
  id: string;
  label: string;
  duration: number;
  size: { width: number; height: number };
  layers: CodeAnimationLayer[];
}
```

- 建议建立：
  - `src/animations/bg.ts`
  - `src/animations/registry.ts`
  - `src/runtime/animation-effects.ts`
  - `src/runtime/player.ts`
- `registry.ts` 中维护所有目录状态：
  - 已实现：`bg`
  - 未实现：`fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1`

### 决策 5：UI 只做测试播放器，不做编辑器

原因：

- 本任务目标是播放代码动画，不是复刻编辑器。
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

## 7. 建议目标目录结构

建议最终形成如下结构：

```text
apps/agentani-demo/
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
      bg.ts
      registry.ts
      types.ts
    core/
      entitymanager.ts
      index.ts
      objectpool.ts
      visualentity.ts
    runtime/
      animation-effects.ts
      blend-mode.ts
      layer-factory.ts
      mask-manager.ts
      player.ts
      timeline.ts
    ui/
      animation-select.ts
      controls.ts
    layout.ts
    main.ts
    styles.css
    vite-env.d.ts
  tests/
    animations/
      bg.test.ts
      registry.test.ts
    runtime/
      animation-effects.test.ts
      layer-factory.test.ts
      mask-manager.test.ts
      timeline.test.ts
    setup.ts
  tools/
    extract-editor2-project.mjs
```

说明：

- `tools/extract-editor2-project.mjs` 可以保留为开发辅助工具，但运行时不得 import 它。
- 如不希望保留工具脚本，也可在完成转换后删除；README 仍需记录转换规则。
- 若新增空目录，必须放置 `.keepme`。

## 8. 分阶段实施步骤

### 阶段 1：建立应用骨架

1. 参考 `apps/victoryani-demo` 或 `apps/spine2pixiani-demo` 创建 `apps/agentani-demo`。
2. 配置 `package.json`：
   - `name`: `agentani-demo`
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
6. 复制并接入 `pixiani core`。

### 阶段 2：解码 `bg` 的 base64 图片

1. 编写转换工具 `apps/agentani-demo/tools/extract-editor2-project.mjs`。
2. 工具输入：

```text
assets/editor2/bg/project.json
```

3. 工具输出：

```text
apps/agentani-demo/src/assets/bg/layer-00.png
apps/agentani-demo/src/assets/bg/layer-01.png
...
```

4. 工具逻辑：
   - 读取并解析 JSON。
   - 遍历 `layers`。
   - 跳过非 `pic` 或空 `asset` 图层。
   - 校验 `asset` 是否为 `data:*;base64,*`。
   - 从 MIME 推断扩展名：
     - `image/png` -> `.png`
     - `image/jpeg` -> `.jpg`
     - 其他类型默认 `.bin`，但要在终端输出警告。
   - 解码并写入文件。
   - 输出一份图层摘要到终端，包含：
     - 顺序
     - 原始 `id`
     - 导出文件名
     - 图片字节数
     - 动画类型
5. 转换完成后人工确认：
   - `bg` 输出 15 个图片文件。
   - 文件能被 Vite import。
   - 没有把源 `project.json` 复制进运行时目录。

### 阶段 3：把 `bg` 改写为代码配置

1. 创建 `src/animations/types.ts`，定义代码动画协议。
2. 创建 `src/animations/bg.ts`。
3. 在 `bg.ts` 中 import 15 个图片资源。
4. 按源 JSON 顺序写出 15 个图层配置。
5. 保留每个图层的关键字段：
   - `id`
   - `type`
   - `texture`
   - `x`
   - `y`
   - `scaleX`
   - `scaleY`
   - `rotation`
   - `alpha`
   - `blendMode`
   - `visible`
   - `maskId`
   - `animations`
6. 重点核对 `bg` 图层：
   - `刷光` 使用 `add` 混合模式，并被 `隐形框_copy_7` 遮罩。
   - `隐形框_copy_7` 与 `隐形框` alpha 为 `0`，但仍可作为遮罩或占位图层参与逻辑。
   - `光_copy_9`、`底光_copy_8` 等负 `scaleX` 图层需要保留镜像效果。
   - `底1` 在 `0.5s` 后淡出。
   - `底2` 无动画，作为静态底图。
7. 不复制 `project.json` 到 `src/assets/bg`。

### 阶段 4：实现播放运行时

1. 实现 `blend-mode.ts`：
   - `normal`
   - `add`
   - `multiply`
   - `screen`
   - 未知值回退 `normal`
2. 实现 `layer-factory.ts`：
   - 创建 `PIXI.Container`
   - 创建 `PIXI.Sprite`
   - 设置 anchor 为 `0.5`
   - 设置位置、缩放、旋转、透明度、可见性
   - 应用混合模式
3. 实现 `mask-manager.ts`：
   - 根据 `maskId` 查找目标图层首个显示对象。
   - 绑定 `sourceContainer.mask = targetObject`。
   - 遮罩对象自身 blend mode 回退为 normal。
4. 实现 `animation-effects.ts`：
   - 每种动画是显式函数，不用 `new Function`。
   - 输入包括 `target`、`container`、`duration`、`params`。
   - 返回 GSAP tween 或 timeline。
5. 实现 `timeline.ts`：
   - 重建播放前先 reset 图层状态。
   - 按 `startTime` 将每个图层动画加入 master timeline。
   - timeline 总长度至少等于 project `duration`。
6. 实现 `player.ts`：
   - 初始化 Pixi Application。
   - 加载动画资源。
   - 构建图层。
   - 应用遮罩。
   - 构建和控制 timeline。
   - 切换动画时销毁旧场景、清理旧 timeline、重建新场景。

### 阶段 5：实现 `bg` 使用到的 6 种动画

按编辑器 `docs/victory_editor_v2/main.ts` 的语义实现：

- `fadeIn`
  - 从 `params.fromAlpha ?? 0` 到当前 alpha。
- `fadeOut`
  - 到 `params.toAlpha ?? 0`。
- `pulse`
  - 对 `target.scale` 做 yoyo 缩放。
  - 默认 `params.scale ?? 1.1`。
- `swing`
  - 在正负角度之间 yoyo。
  - 默认 `params.angle ?? 0.2`。
- `sweepLight`
  - 对目标 x 做横向扫光移动。
  - 默认 `params.startX ?? -200` 到 `params.endX ?? 800`。
- `starlight`
  - 以编辑器语义做近似实现。
  - 至少包含 alpha/scale 闪烁，必要时加轻微旋转。

注意：

- 动画函数要尊重 `startTime` 和 `duration`。
- tween 构建时不要永久污染初始状态；重播前必须 reset。
- 对 `scaleX < 0` 的镜像图层，pulse 不能把符号弄丢。

### 阶段 6：实现动画注册和下拉切换

1. 创建 `src/animations/registry.ts`。
2. 注册项建议包含：

```ts
{
  id: "bg",
  label: "bg",
  status: "ready",
  project: bgProject,
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
   - 新增 `src/animations/[id].ts`
   - 在 `registry.ts` 标记为 `ready`

### 阶段 7：实现 README

`apps/agentani-demo/README.md` 需要包含：

- 项目目的。
- 运行命令。
- 依赖安装失败时的代理命令。
- 为什么不使用导出 JSON。
- base64 图片如何导出到独立文件。
- `bg.ts` 的组织方式。
- 下拉列表如何扩展更多动画。
- 当前已实现动画：
  - `bg`
- 当前待转换动画：
  - `fang`
  - `heart`
  - `mei`
  - `tao`
  - `海滩`
  - `竹子1`
- 当前支持的动画效果：
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
   - `bgProject` 没有 JSON 依赖。
   - `bgProject.layers.length === 15`。
   - `刷光.maskId === "隐形框_copy_7"`。
   - `blend-mode` 可映射 `add`。
   - `animation-effects` 包含 6 种动画。
   - `timeline` 按 startTime 添加动画。
   - 负 scale 图层 reset 后保持镜像。
3. 运行：

```bash
pnpm --filter agentani-demo typecheck
pnpm --filter agentani-demo lint
pnpm --filter agentani-demo test
pnpm --filter agentani-demo build
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
tasks/13-agentani-demo-bootstrap-[utctime].md
```

报告内容至少包括：

- 任务目标。
- 实际完成内容。
- 资源转换结果：
  - 输入路径。
  - 输出图片数量。
  - 输出目录。
  - 是否保留/删除转换脚本。
- 代码实现说明：
  - `bg.ts`
  - 注册表
  - 播放器
  - 动画效果
  - UI
- 验证命令与结果。
- 已知限制。
- 是否修改 `agents.md`；若未修改，说明原因。

## 9. 风险和处理策略

- 风险：base64 MIME 不是标准 `image/png` 或 `image/jpeg`。
  - 处理：转换脚本输出警告，使用 `.bin` 或手动确认真实格式后修正。
- 风险：中文图层名作为文件名跨平台不稳定。
  - 处理：图片文件名用顺序号，图层 `id` 在代码里保留中文。
- 风险：pulse 处理负 scale 时破坏镜像。
  - 处理：以初始 scale 为基准乘法缩放，不强行改为正数。
- 风险：遮罩图层 alpha 为 0 导致视觉或遮罩行为与编辑器不一致。
  - 处理：遮罩对象可以保持 alpha 0，但应确认 Pixi mask 仍按几何或纹理区域生效；如不生效，给遮罩对象单独处理 renderable/alpha 策略并写入 README。
- 风险：编辑器 `starlight` 原效果复杂。
  - 处理：首期实现可验收近似效果，并在 README 中说明近似范围。
- 风险：运行时意外读取 JSON。
  - 处理：测试或代码检查中确认 `src/animations/bg.ts` 不 import `.json`，`src/assets/bg/` 不包含 `project.json`。

## 10. 不做事项

本任务不包含：

- 不改造 `docs/victory_editor_v2/main.ts`。
- 不修改 `packages/pixiani` 共享实现。
- 不实现编辑器功能。
- 不要求首期转换 `fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1`。
- 不直接执行编辑器导出的字符串脚本或 `custom` 动画脚本。
- 不把 `assets/editor2/bg/project.json` 作为运行时资源。

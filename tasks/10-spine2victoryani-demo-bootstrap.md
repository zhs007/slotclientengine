# spine2victoryani-demo 初始化任务计划

## 1. 任务目标

新增一个可运行的测试项目 `apps/spine2victoryani-demo`，基于 `apps/spine2pixiani-demo` 现有 Spine 数据解析与采样能力，把其中使用的 `cabin` Spine 示例转换为可直接输出的 VictoryAni 动画文件，并提供一个最小预览/导出页面，用来验证“Spine -> VictoryAni”这条链路可以独立落地。

本计划是可直接执行版本，不依赖额外口头说明。

## 2. 已知输入

当前仓库内可确认的事实如下：

- 现成的 Spine 参考项目为 `apps/spine2pixiani-demo`。
- 该项目内已经内置了本次可直接复用的示例资源：
  - `src/assets/cabin.atlas`
  - `src/assets/cabin.png`
  - `src/data/cabin-spine.json`
- 该 Spine 示例当前至少包含以下已验证能力：
  - atlas 文本解析
  - 旋转子图恢复
  - Spine 骨骼/插槽/attachment 适配
  - `translate` / `rotate` / `scale`
  - `attachment` / `color`
  - bezier / linear / stepped 曲线采样
  - 镜像骨骼分支采样，已存在 `ui_k` / `ui_k2` 对称性测试
- 可直接复用的最小运行时代码位于 `apps/spine2pixiani-demo/src/core/**`，用户允许直接复制到新项目内。
- VictoryAni 参考项目为 `apps/victoryani-demo`。
- 当前 VictoryAni demo 已确认的导出/消费结构位于：
  - `apps/victoryani-demo/src/assets/project.json`
  - `apps/victoryani-demo/src/config/victory-types.ts`
  - `apps/victoryani-demo/src/config/victory-project.ts`
- 当前 VictoryAni 项目核心数据结构至少包含：
  - `version`
  - `name`
  - `duration`
  - `layers[]`
- 当前单个 layer 至少支持：
  - `id`
  - `type`
  - `asset`
  - `text`
  - `x`
  - `y`
  - `scale`
  - `scaleX`
  - `scaleY`
  - `rotation`
  - `alpha`
  - `blendMode`
  - `visible`
  - `locked`
  - `maskId`
  - `animations[]`
- 当前 VictoryAni demo 的运行方式是“读取一个 `project.json` + 一组图片资源并播放”。
- 用户额外给出的约束与提示如下：
  - 要参考 `apps/spine2pixiani-demo` 的 Spine 例子
  - 要参考 `apps/victoryani-demo` 理解 VictoryAni 格式
  - 新项目需要“直接输出符合 VictoryAni 的动画文件”
  - atlas 大概率需要先切图
  - `ui_k` 和 `ui_k2` 应该完全镜像
  - 如果当前没有镜像参数，可以考虑通过图片本身或输出资源来完成镜像效果
  - 需要配套 `README.md`

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `apps/spine2victoryani-demo` 已创建为标准 workspace 应用。
- 应用可以通过 `pnpm --filter spine2victoryani-demo dev` 本地运行。
- 项目内已复制并接入 `spine2pixiani-demo` 的 `core` 基础层，且不依赖额外共享改造才能启动。
- 项目可读取 `cabin-spine.json`、`cabin.atlas`、`cabin.png`，完成 Spine 数据适配与时间轴采样。
- 项目可将 Spine 示例转换为一套实际落盘的 VictoryAni 导出结果，而不是只在内存里构造对象。
- 导出结果至少包含：
  - 一个符合 `victoryani-demo` 当前消费结构的 `project.json`
  - 一组被 `project.json` 正确引用的图片资源
- 导出的 `project.json` 能被 `apps/victoryani-demo` 的现有标准化逻辑读取，不需要改 VictoryAni 数据协议才能消费。
- 新项目自身提供最小预览能力，能够加载自己导出的 `project.json` 与资源进行回放，验证导出结果可用。
- atlas 已有明确处理方案，并真实落地到实现中：
  - 要么导出前切图，生成每个 attachment 独立图片
  - 要么提供等价且可维护的资源拆分流程
  - 不能只停留在文档说明
- `ui_k` / `ui_k2` 镜像问题有明确落地方案，并具备自动化校验或固定验收步骤。
- 若 VictoryAni 当前 layer 结构无法原生表达镜像，需在导出资源或导出坐标策略中给出兜底实现，并记录在 README 与任务报告中。
- 项目包含最小自动化校验，至少覆盖：
  - Spine 输入解析
  - atlas 切图/纹理导出
  - Spine -> VictoryAni 数据映射
  - 镜像分支输出一致性
  - 导出文件结构校验
- 项目包含 `README.md`，说明：
  - 项目目的
  - 输入资源
  - 输出文件
  - 转换流程
  - atlas 处理方式
  - 镜像处理方式
  - 运行与导出命令
  - 已知限制
- 任务完成后，在 `tasks/` 下新增一份中文任务报告，命名为 `10-spine2victoryani-demo-bootstrap-[utctime].md`，其中 `utctime` 使用 UTC 时间，格式为 `年月日时分秒`，例如 `260401-181300`。
- 若执行过程中修改了仓库协作规则、目录规范或基础脚本，需要同步更新根级 `AGENTS.md`；若仅新增 demo 应用、文档与测试，则无需修改。

## 4. 默认实现假设

为保证任务可落地，默认按以下假设推进：

- 本项目是测试项目，目标优先级是“把当前这份 Spine 示例稳定转换并输出为 VictoryAni 文件”，而不是一次性抽象成通用转换器。
- 初版只要求覆盖 `cabin-spine.json` 当前真正使用到的 Spine 数据子集，不追求全面兼容所有 Spine 特性。
- 初版 VictoryAni 输出以 `apps/victoryani-demo` 当前可消费的数据结构为准，不额外发明新的导出协议。
- 导出器应当显式生成文件，建议使用：
  - `src/generated/` 作为应用内置示例输出目录，或
  - `public/exported/` 作为浏览器直接可访问的导出目录
  二选一即可，但必须在计划执行时固定下来。
- 为降低实现复杂度，初版允许把 Spine 的连续骨骼动画“采样成 VictoryAni 可播放的分段/关键帧动画描述”，而不是要求保留 Spine 原始时间轴语义。
- atlas 默认采用“先切图再导出”方案，因为 VictoryAni 当前按单图层图片资源消费更直接，也更容易处理镜像与定位问题。
- 镜像问题默认采用以下优先级处理：
  - 第一优先级：直接输出 `scaleX = -1` 等可被 VictoryAni 正确消费的 layer 数据
  - 第二优先级：若现有 VictoryAni 层协议或渲染实现不能稳定支持镜像，则在切图导出阶段同步输出镜像图片，避免运行时再做特殊处理
- 导出结果的视觉一致性以“结构、层级、相对位置、旋转、缩放、显隐、镜像关系、时序基本一致”为验收标准，不要求与 Spine 播放结果逐像素完全一致。
- 如果依赖下载失败，可先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 5. 实施范围

本任务默认覆盖以下路径：

- `apps/spine2victoryani-demo/**`
- `tasks/10-spine2victoryani-demo-bootstrap.md`
- 任务完成后的报告文件 `tasks/10-spine2victoryani-demo-bootstrap-[utctime].md`

如有必要，可只读参考以下路径：

- `apps/spine2pixiani-demo/**`
- `apps/victoryani-demo/**`
- 根级 `package.json`
- 根级 `turbo.json`
- 根级 `tsconfig.base.json`
- 根级 `AGENTS.md`

默认不修改以下共享区域，除非执行中确认确有必要：

- `packages/**`
- 根级工具链配置
- 根级 `AGENTS.md`

## 6. 核心设计决策

### 决策 1：新项目同时承担“转换器 + 最小验证播放器”两种职责

原因：

- 用户要求的是“能直接输出符合 VictoryAni 的动画文件”，不能只做概念验证。
- 仅生成文件但不在项目内复播，后续很难快速判断导出结果是否可用。
- 直接复用 `victoryani-demo` 的消费模式，可以让新项目自己成为闭环。

结论：

- `apps/spine2victoryani-demo` 需要同时包含：
  - Spine 输入读取与适配
  - 导出文件生成
  - 导出结果预览

### 决策 2：优先复制 `spine2pixiani-demo` 的 `core` 与 Spine 运行时，再在新项目内局部改造

原因：

- 用户明确允许复制。
- 该路径对测试项目最快，也最不影响共享库稳定性。
- 当前镜像、atlas、采样逻辑已经在 `spine2pixiani-demo` 中经过初步验证。

结论：

- 初版直接复制以下内容到新项目内起步：
  - `src/core/**`
  - `src/runtime/atlas.ts`
  - `src/runtime/spine-types.ts`
  - `src/runtime/spine-adapter.ts`
  - `src/runtime/timeline-sampler.ts`
  - 以及实现导出器所需的少量辅助模块

### 决策 3：VictoryAni 输出优先贴近当前 `project.json` 结构，而不是先设计另一层中间协议

原因：

- 现有 `victoryani-demo` 已经给出可消费目标。
- 先对齐最终产物，可以降低中间抽象过度带来的偏差。
- 这个任务的重点是把结果导出来，而不是建立一套长期协议演进框架。

结论：

- Spine 转换后的结果应直接落成：
  - `VictoryProjectConfigRaw` 兼容 JSON
  - 对应图片资源目录

### 决策 4：atlas 问题采用“导出阶段切图”而不是把 atlas 运行时能力迁移到 VictoryAni

原因：

- VictoryAni 当前按图片资源消费，切图后最直接。
- 切图后每个 attachment 有独立资产，后续镜像、调试和问题定位都更清晰。
- 运行时继续背 atlas 语义会让新项目同时背两套资源系统，复杂度不必要。

结论：

- 需要实现一个 atlas 切图步骤，把 `cabin.png + cabin.atlas` 拆成独立图片资源。
- 切图结果必须进入导出产物，不能只在运行时内存生成。

### 决策 5：镜像问题优先在导出映射层显式处理，并保留资源级兜底

原因：

- `ui_k` / `ui_k2` 是本次明确点名的风险点。
- Spine 里父骨骼 `scaleX = -1` 的镜像传播已知存在。
- VictoryAni 当前示例协议没有显式“mirror”字段，必须在落地前确定映射方案。

结论：

- 需要在计划执行中明确完成三件事：
  - 验证 `scaleX = -1` 是否能被 VictoryAni 层正确消费
  - 若能消费，则输出原始镜像层数据并补测试
  - 若不能稳定消费，则在导出时生成镜像图片或镜像后的单独 layer 资源作为兜底

## 7. 建议目标目录结构

建议最终形成如下结构：

```text
apps/spine2victoryani-demo/
  index.html
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vite.config.ts
  eslint.config.cjs
  README.md
  src/
    main.ts
    layout.ts
    core/
      visualentity.ts
      objectpool.ts
      entitymanager.ts
    assets/
      cabin.atlas
      cabin.png
    data/
      cabin-spine.json
    generated/
      project.json
      assets/
        ...
    runtime/
      atlas.ts
      spine-types.ts
      spine-adapter.ts
      timeline-sampler.ts
      export-types.ts
      atlas-slicer.ts
      spine-to-victoryani.ts
      file-manifest.ts
    preview/
      asset-loader.ts
      layer-factory.ts
      timeline.ts
      player.ts
    ui/
      export-panel.ts
      animation-select.ts
  tests/
    runtime/
      atlas-slicer.test.ts
      spine-to-victoryani.test.ts
      mirror-mapping.test.ts
      export-manifest.test.ts
```

说明：

- `src/generated/` 代表应用内自带的示例导出结果；若执行时选择 `public/exported/`，则将这里整体替换为目标导出目录即可。
- `preview/` 可以直接复用或裁剪 `victoryani-demo` 的运行时实现，但只保留验证导出结果所需的最小能力。
- `runtime/spine-to-victoryani.ts` 是本任务的核心转换模块。

## 8. 执行步骤

### 任务 1：初始化应用骨架

目标：先让 `apps/spine2victoryani-demo` 成为标准可运行应用。

执行内容：

- 新建 `apps/spine2victoryani-demo/`。
- 参考现有 demo，补齐：
  - `package.json`
  - `tsconfig.json`
  - `tsconfig.eslint.json`
  - `vite.config.ts`
  - `eslint.config.cjs`
  - `index.html`
  - `src/main.ts`
- 如果创建空目录，补 `.keepme`。
- 接入和仓库一致的 `pnpm`、`turbo`、`vite`、`vitest`、`eslint`、`prettier` 工具链脚本。

验收标准：

- `pnpm --filter spine2victoryani-demo dev` 能启动空白页面或占位页面。
- `pnpm --filter spine2victoryani-demo typecheck` 能通过。

### 任务 2：复制并接通 Spine 基础能力

目标：让新项目具备读取并采样当前 Spine 示例的能力。

执行内容：

- 从 `apps/spine2pixiani-demo` 复制以下模块到新项目内：
  - `src/core/**`
  - `src/layout.ts`
  - `src/runtime/atlas.ts`
  - `src/runtime/spine-types.ts`
  - `src/runtime/spine-adapter.ts`
  - `src/runtime/timeline-sampler.ts`
- 复制以下数据资源到新项目内：
  - `src/assets/cabin.atlas`
  - `src/assets/cabin.png`
  - `src/data/cabin-spine.json`
- 修正 import 路径，使新项目可独立运行。
- 建立最小调试入口，至少能读取 Spine 数据并在浏览器控制台或页面中输出基础摘要：
  - 动画名
  - bones 数量
  - slots 数量
  - attachments 数量

验收标准：

- 新项目能成功解析 `cabin-spine.json`。
- 新项目能成功解析 `cabin.atlas`。
- 可对 `cabin` / `cabin_s` 任意时间点完成骨骼和 slot 采样。

### 任务 3：定义 Spine -> VictoryAni 的最小映射规则

目标：在开工导出器前，把“什么数据如何落到 VictoryAni”固定下来。

执行内容：

- 基于 `apps/victoryani-demo/src/config/victory-types.ts`，整理本项目要输出的 VictoryAni JSON 子集。
- 对以下 Spine 概念逐项给出映射规则并写成代码旁注释或 README 草稿：
  - bone
  - slot
  - attachment
  - draw order
  - color / alpha
  - rotation
  - scaleX / scaleY
  - visible / attachment 切换
- 明确 layer 粒度：
  - 默认以“可见 attachment 对应一个 layer”为基本单位
  - 若某 slot 在不同时刻切 attachment，则要定义是复用同一 layer 还是拆多层
- 明确动画导出策略：
  - 是导出为 VictoryAni 预设动画参数
  - 还是导出为按帧/按关键点生成的通用层动画描述
- 明确本项目初版支持范围与不支持范围。

验收标准：

- 产出一份代码内可执行的映射定义，而不是仅停留在口头约定。
- 团队成员不依赖其他上下文，阅读该项目源码即可知道当前导出规则。

### 任务 4：实现 atlas 切图导出

目标：把 atlas 中的 attachment 纹理真正拆成导出阶段可落盘的独立资源。

执行内容：

- 复用 `spine2pixiani-demo` 中 atlas 解析逻辑。
- 新增 `atlas-slicer` 模块，把 atlas region 恢复为独立图片。
- 处理以下情况：
  - 普通子图
  - `rotate = true`
  - `orig` / `offset`
- 设计导出文件命名规则，避免重名和路径不可读：
  - 建议以 slot 或 attachment 名生成稳定文件名
  - 若同名 attachment 来源不同，需追加去重后缀
- 生成导出资源清单，供 `project.json` 中 `asset` 字段引用。

验收标准：

- 切出的图片数量与期望 attachment 集合一致。
- 随机抽查若干关键图片，裁切、朝向、透明区域正确。
- 生成的资产路径可被后续 `project.json` 直接引用。

### 任务 5：实现镜像处理策略

目标：把 `ui_k` / `ui_k2` 这类镜像分支问题在导出器里落地解决。

执行内容：

- 利用现有采样逻辑，确认 `ui_k` / `ui_k2` 在默认姿态与动画过程中的世界变换关系。
- 先验证 VictoryAni 当前 layer 模型对 `scaleX = -1` 的可用性：
  - 预览层是否能正确显示
  - 锚点、旋转与透明区域是否保持正确
- 若直接输出负缩放可行：
  - 导出 `scaleX = -1`
  - 补充镜像对称性测试
- 若直接输出不可行：
  - 在 atlas 切图导出阶段同步生成镜像图
  - 为镜像层单独写入资源引用，保持最终视觉对称
- 在 README 中明确最终采用的是哪条路径，以及原因。

验收标准：

- `ui_k` / `ui_k2` 在导出预览中保持肉眼可见的左右镜像关系。
- 至少有一条自动化测试覆盖该关系，不只依赖人工观察。

### 任务 6：实现 Spine -> VictoryAni 导出器

目标：从 Spine 采样结果生成真实的 VictoryAni 导出文件。

执行内容：

- 新增核心模块，例如 `src/runtime/spine-to-victoryani.ts`。
- 实现从 Spine 模型到 VictoryAni `project.json` 的转换逻辑。
- 至少输出以下内容：
  - `version`
  - `name`
  - `duration`
  - `layers`
- 每个 layer 至少正确写出：
  - `id`
  - `type`
  - `asset`
  - `x`
  - `y`
  - `scaleX`
  - `scaleY`
  - `rotation`
  - `alpha`
  - `visible`
  - `blendMode`
  - `animations`
- 若初版需要把 Spine 动画采样成离散关键帧或分段动画，应在导出结构中固定一种规则，并保证预览器与导出器使用同一套规则。
- 实现导出清单生成，保证 `project.json` 与图片资源一一对应。

验收标准：

- 能稳定输出一份完整 `project.json`。
- 输出后的字段结构与 `victoryani-demo` 当前消费结构兼容。
- 资源引用不存在丢图或路径失配。

### 任务 7：实现最小导出结果预览

目标：在新项目内回放自己导出的结果，形成闭环验证。

执行内容：

- 参考 `apps/victoryani-demo`，实现最小版本的：
  - 资源加载
  - layer 构建
  - 时间线播放
  - 重播/循环控制
- 预览页面至少提供：
  - 播放
  - 重播
  - 动画选择（若输出多个动画）
  - 导出摘要信息
- 页面中明确展示当前使用的是“导出结果预览”而不是直接播放原始 Spine。

验收标准：

- 页面能加载新项目自己生成的 `project.json` 与图片资源并完成播放。
- 停止、重播、循环至少有一个最小控制入口可操作。

### 任务 8：补齐自动化测试

目标：给最容易回归的转换链路建立最小保护网。

执行内容：

- 新增以下测试类型：
  - atlas 切图结果测试
  - Spine 基础映射测试
  - 导出 `project.json` 结构测试
  - 镜像分支对称性测试
  - 导出资源引用完整性测试
- 如有必要，可增加快照测试，但应避免把大体积二进制资源直接做快照。
- 对“当前不支持”的能力添加显式断言或注释，避免后续误判为已支持。

验收标准：

- `pnpm --filter spine2victoryani-demo test` 可运行并覆盖关键转换路径。
- 失败信息能直接指向是 atlas、映射、镜像还是导出清单问题。

### 任务 9：编写 README

目标：让任何接手者不依赖聊天记录也能理解并运行本项目。

执行内容：

- 编写 `apps/spine2victoryani-demo/README.md`。
- README 至少包含：
  - 项目目的
  - 参考来源
  - 输入资源
  - 输出目录与输出文件说明
  - Spine -> VictoryAni 的处理流程
  - atlas 切图方案
  - 镜像处理方案
  - 当前支持范围
  - 已知限制
  - 运行命令
  - 测试命令
- 明确说明本项目是测试项目，采用了复制 `core` 的策略。

验收标准：

- 新同学只读 README 即可知道项目是做什么、怎么跑、产物在哪、已知问题是什么。

### 任务 10：执行联调、记录结果并产出任务报告

目标：在交付前完成一次端到端确认，并留下可追溯记录。

执行内容：

- 依次执行：
  - `pnpm --filter spine2victoryani-demo typecheck`
  - `pnpm --filter spine2victoryani-demo test`
  - `pnpm --filter spine2victoryani-demo build`
- 如依赖安装失败，先按仓库约定设置代理再重试。
- 手工检查至少以下项目：
  - 导出目录是否生成
  - `project.json` 是否可读
  - 图片资源是否齐全
  - 导出预览是否能播放
  - `ui_k` / `ui_k2` 是否仍为镜像
- 在 `tasks/` 下新增任务报告：
  - 文件名：`10-spine2victoryani-demo-bootstrap-[utctime].md`
  - 语言：中文
  - 内容至少包括：
    - 实际完成项
    - 与计划差异
    - 导出产物位置
    - 验证结果
    - 已知问题
    - 后续建议

验收标准：

- 有完整可读的任务报告。
- 报告中的路径、命令、限制和实际工程状态一致。

## 9. 风险与应对

### 风险 1：VictoryAni 当前协议不适合表达 Spine 的连续骨骼动画

应对：

- 初版接受“采样后导出”的策略。
- 若无法映射为现有预设动画，就在新项目内定义一套最小可消费的分段动画结构，但必须保证仍兼容 `victoryani-demo` 当前的 JSON 基本结构，不破坏其读取入口。

### 风险 2：atlas 切图后锚点与偏移失真

应对：

- 切图时严格使用 `orig` / `offset` 恢复原始逻辑尺寸。
- 用少量关键 attachment 做像素级位置比对或数值校验。

### 风险 3：镜像层负缩放在 VictoryAni 预览里产生旋转或锚点异常

应对：

- 优先做单独验证，不通过再切到“镜像图资源兜底”。
- 不把镜像问题拖到最后再处理。

### 风险 4：导出结果只能在新项目内播放，无法被 `victoryani-demo` 消费

应对：

- 导出结构必须先对齐 `victoryani-demo/src/config/victory-types.ts`。
- 联调阶段增加“用 `victoryani-demo` 现有标准化逻辑加载导出 JSON”的兼容性检查。

## 10. 非目标

以下内容不属于本次初始化任务的必须范围，除非执行中发现已经是完成闭环所必需：

- 支持任意 Spine 项目的一般化批量转换
- 支持 Spine mesh、clipping、path constraint、ik constraint 等当前示例未使用特性
- 改造 `packages/` 下共享包，抽出正式通用库
- 一次性补齐 VictoryAni 编辑器全部预设动画生态
- 提供生产可用的命令行发布工具

## 11. 交付清单

本任务完成时，至少应交付以下内容：

- `apps/spine2victoryani-demo` 可运行应用
- 可复用的 Spine -> VictoryAni 转换代码
- 一份实际导出的 `project.json`
- 一组可被导出 JSON 引用的图片资源
- 最小预览页面
- 最小自动化测试
- `apps/spine2victoryani-demo/README.md`
- `tasks/10-spine2victoryani-demo-bootstrap-[utctime].md` 中文任务报告


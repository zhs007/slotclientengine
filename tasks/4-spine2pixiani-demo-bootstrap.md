# spine2pixiani-demo 初始化任务计划

## 1. 任务目标

新增一个可运行的测试项目 `apps/spine2pixiani-demo`，基于 `packages/pixiani` 的现有动画基础能力，将 `assets/spine2pixiani/` 中的 Spine 资源转换为“不依赖 Spine 运行时”的 Pixi/Pixiani 手写动画实现，并提供一个下拉框在 `cabin` 与 `cabin_s` 两个动画之间切换播放。

本计划是可直接执行版本，不依赖额外口头说明。

## 2. 已知输入

当前仓库内可确认的事实如下：

- 资源目录为 `assets/spine2pixiani/`。
- 当前资源文件有：
  - `cabin.json`
  - `cabin.atlas`
  - `cabin.png`
- `cabin.json` 中包含 2 个动画：
  - `cabin`
  - `cabin_s`
- `packages/pixiani` 已提供最小动画基础设施：
  - `src/core/visualentity.ts`
  - `src/core/objectpool.ts`
  - `src/core/entitymanager.ts`
  - `src/layout.ts`
  - `src/main.ts`
- 当前 `apps/` 下还没有现成示例应用，因此本项目需要从零初始化目录、脚本、预览入口和测试骨架。

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `apps/spine2pixiani-demo` 已创建为标准 workspace 应用。
- 应用可以通过 `pnpm --filter spine2pixiani-demo dev` 本地运行。
- 应用运行时不依赖任何 Spine 运行时库，也不调用 Spine 播放接口。
- `cabin.atlas` / `cabin.png` 资源可被 Pixi 正确加载并用于渲染。
- `cabin.json` 中的骨骼、插槽、皮肤、动画数据已被转换为本项目可消费的数据结构。
- 至少能播放 `cabin`、`cabin_s` 两个动画，且支持循环播放。
- 页面上提供动画选择下拉框，可在两个动画之间切换。
- 项目包含最小测试或校验脚本，能验证核心转换结果与播放入口可用。
- 任务完成后，在 `tasks/` 下新增一份中文任务报告，命名为 `4-spine2pixiani-demo-bootstrap-[utctime].md`，其中 `utctime` 使用 `年月日时分秒` 格式，如 `260401-181300`。
- 若执行过程中修改了仓库协作规则、目录规范或基础脚本，已同步更新根级 `agents.md`；若仅新增 demo 应用且不改变协作规则，则无需更新。

## 4. 默认假设

为保证任务可落地，执行时默认采用以下假设：

- 本项目是测试应用，不追求通用 Spine 兼容层，只覆盖当前 `cabin.json` 所使用的数据子集。
- 目标是“用手写 Pixi/Pixiani 动画代码实现相同视觉运动逻辑”，而不是在项目里再包一层 Spine 运行时。
- 允许把 `packages/pixiani/src/core` 与必要的布局代码复制到应用内使用，以减少对共享包的侵入式修改。
- 初版优先直接消费 `cabin.atlas + cabin.png`，不强制先拆图；只有在 atlas 直接使用明显阻碍开发时，才改为拆图方案。
- 动画一致性以“结构、层级、位移、旋转、缩放、显示切换、绘制顺序基本一致”为验收标准，不要求像素级误差对齐。
- 初版只支持 Spine JSON 中当前资源真正使用到的时间轴类型；如果发现额外类型，再按实际数据补齐。

## 5. 实施范围

本任务默认覆盖以下路径：

- `apps/spine2pixiani-demo/**`
- `assets/spine2pixiani/**`
- `tasks/4-spine2pixiani-demo-bootstrap.md`
- 任务完成后的报告文件 `tasks/4-spine2pixiani-demo-bootstrap-[utctime].md`

如有必要，可只读参考以下路径：

- `packages/pixiani/src/core/**`
- `packages/pixiani/src/layout.ts`
- `packages/pixiani/src/main.ts`
- `packages/pixiani/package.json`
- 根级 `package.json`
- 根级 `turbo.json`
- 根级 `agents.md`

默认不修改以下共享区域，除非执行中确认有明确必要：

- `packages/pixiani/**`
- 根级工具链配置

## 6. 建议落地方案

### 方案结论

建议采用“应用内自带最小 Pixiani Runtime + 一次性 Spine 数据适配”的方案：

- 在 `apps/spine2pixiani-demo` 内复制 `packages/pixiani` 的 `core` 和必要布局代码。
- 在应用内新增一套只服务当前资源的轻量播放层。
- 使用一次性脚本或手工整理的方式，把 `cabin.json` 的关键数据变成可维护的 TypeScript 常量或模块。
- 最终运行时只依赖 `pixi.js`、`gsap` 与项目自身代码，不依赖 Spine 官方库。

这样做的原因：

- 测试项目允许复制 `core`，更适合快速试错。
- 不会把“Spine 兼容逻辑”污染进 `packages/pixiani` 的稳定基础层。
- 即使后续需要改 `VisualEntity` 或时间轴组织方式，也能直接在 demo 内局部修改。

## 7. 目标目录结构

建议最终形成如下结构：

```text
apps/spine2pixiani-demo/
  index.html
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vite.config.ts
  eslint.config.cjs
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
      cabin-atlas.ts
      cabin-animation-data.ts
    runtime/
      atlas.ts
      spine-types.ts
      spine-adapter.ts
      timeline-sampler.ts
      display-factory.ts
    ani/
      cabin/
        cabin-animation.ts
        cabin-scene.ts
        index.ts
    ui/
      animation-select.ts
  tests/
    runtime/
      spine-adapter.test.ts
      timeline-sampler.test.ts
    ani/
      cabin-animation.test.ts
```

说明：

- `src/core` 与 `src/layout.ts` 从 `packages/pixiani` 复制起步，再按 demo 实际需要微调。
- `src/data` 存放资源原始数据和转换后的静态模块。
- `src/runtime` 是本 demo 的轻量播放层，不做成通用库。
- `src/ani/cabin` 存放真正的“手写动画代码”。

## 8. 执行步骤

### 任务 1：初始化应用骨架

目标：先让 `apps/spine2pixiani-demo` 成为一个标准可运行应用。

执行内容：

- 新建 `apps/spine2pixiani-demo/` 目录。
- 参考仓库根级工具链约束，补齐：
  - `package.json`
  - `tsconfig.json`
  - `vite.config.ts`
  - `eslint.config.cjs`
  - `index.html`
  - `src/main.ts`
- 应用脚本至少包含：
  - `dev`
  - `build`
  - `lint`
  - `test`
  - `typecheck`
  - `format`
  - `format:check`
- 如需新增空目录，放置 `.keepme`。

验收标准：

- `pnpm --filter spine2pixiani-demo dev` 能启动页面。
- `pnpm --filter spine2pixiani-demo typecheck` 可通过。

### 任务 2：复制最小 Pixiani 基础层到应用内

目标：让 demo 独立具备最小生命周期、池化与更新调度能力。

执行内容：

- 从 `packages/pixiani/src/core` 复制以下文件到应用内：
  - `visualentity.ts`
  - `objectpool.ts`
  - `entitymanager.ts`
- 将 `packages/pixiani/src/layout.ts` 复制到应用内。
- 根据应用路径与构建方式修正 import。
- 保持复制后的核心代码尽量小，不额外引入不必要抽象。

验收标准：

- 应用内可以独立完成基础渲染与逐帧更新。
- 不依赖直接导入 `@slotclientengine/pixiani` 才能运行。

### 任务 3：建立资源加载与 atlas 解析层

目标：让 atlas 中的子纹理能被 Pixi 正确创建。

执行内容：

- 将 `assets/spine2pixiani/cabin.png` 与 `cabin.atlas` 复制到应用可访问位置。
- 编写 atlas 解析逻辑，至少支持当前 atlas 中出现的字段：
  - `rotate`
  - `xy`
  - `size`
  - `orig`
  - `offset`
  - `index`
- 基于 atlas 数据创建 `Texture` 字典，供后续插槽渲染复用。
- 明确处理 atlas 中旋转子图的方式，避免贴图方向错误。

验收标准：

- 可以通过名称拿到每个 attachment 对应的 Pixi `Texture`。
- 随机抽取若干 attachment 渲染时，方向与裁切正确。

### 任务 4：分析并固化 Spine JSON 的最小可用数据模型

目标：把 `cabin.json` 中真正需要的结构整理为可维护的 TypeScript 数据。

执行内容：

- 提取并定义当前 demo 必需的数据模型：
  - bones
  - slots
  - skins
  - animations
  - draw order
  - attachment 名称映射
- 编写一次性转换逻辑，推荐方式二选一：
  - 方式 A：保留原始 `cabin.json`，运行时读取并适配为内部数据结构。
  - 方式 B：写一次性脚本把 `cabin.json` 转成 `cabin-animation-data.ts`。
- 默认优先采用方式 B，因为更利于后续手写动画代码阅读、调试与裁剪。
- 在转换结果中只保留当前两个动画实际需要的数据，不追求完整 Spine Schema。

验收标准：

- 代码内有一份清晰的内部数据结构定义。
- `cabin` 与 `cabin_s` 可从同一份内部模型中读取播放数据。

### 任务 5：实现不依赖 Spine 的轻量时间轴采样器

目标：把 Spine 动画时间轴映射为可逐帧计算的本地播放逻辑。

执行内容：

- 针对当前资源实际使用的时间轴类型实现采样逻辑，优先覆盖：
  - bone transform
  - slot attachment 切换
  - slot color / alpha（若数据中存在且实际生效）
  - draw order（若动画中存在）
- 支持：
  - 动画总时长读取
  - 循环播放
  - 指定时间采样
  - 动画切换后状态重建
- 若 JSON 中存在 Spine 曲线插值，需支持当前资源所使用的曲线类型；未使用到的类型可暂不实现，但要在报告中说明。

验收标准：

- 给定任意时间点，能计算出当前骨骼姿态和插槽显示状态。
- `cabin` 与 `cabin_s` 两个动画都能完整循环播放。

### 任务 6：实现 cabin 手写 Pixiani 动画实体

目标：把采样结果映射为真正的 Pixi 显示列表与更新逻辑。

执行内容：

- 在 `src/ani/cabin/` 下实现动画实体，建议至少包含：
  - 场景构建
  - 骨骼节点容器组织
  - 插槽显示对象创建与复用
  - 每帧姿态刷新
- 实现方式要求：
  - 每个 bone 对应一个 `Container`
  - 每个 slot 绑定一个显示对象或显示对象容器
  - attachment 切换时更新纹理或显隐状态
  - draw order 变化时同步调整子节点顺序
- 动画实体应提供：
  - `play(animationName)`
  - `stop()`
  - `reset()`
  - `setLoop(boolean)` 或等价能力

验收标准：

- 页面内可见完整 cabin 动画。
- 切换到 `cabin_s` 后能播放另一套动画数据，而不是仅重播同一段。

### 任务 7：实现预览页与动画切换 UI

目标：让使用者能直观看到转换结果并切换动画。

执行内容：

- 在页面上新增最小调试 UI：
  - 动画选择下拉框
  - 可选的重播按钮
  - 可选的循环开关
- 默认启动后自动播放 `cabin`。
- 切换下拉框时：
  - 停止当前播放
  - 重建或重置动画实体
  - 播放目标动画
- 保持 UI 实现简单，不引入额外前端框架。

验收标准：

- 下拉框可在 `cabin` / `cabin_s` 间切换。
- 切换后动画状态正确，不出现残留贴图或层级错乱。

### 任务 8：补最小测试与校验

目标：确保关键转换逻辑可回归验证。

执行内容：

- 至少补以下测试：
  - atlas 解析结果测试
  - Spine 数据适配结果测试
  - 时间轴采样器测试
  - 动画切换时关键状态重置测试
- 如果完整 Pixi 场景测试成本过高，可对“纯数据层”和“播放状态层”做单元测试，对渲染层做最小冒烟测试。

验收标准：

- `pnpm --filter spine2pixiani-demo test` 可执行并通过。
- 测试能覆盖两个动画名、至少一个 attachment 切换场景和至少一个时间采样场景。

### 任务 9：整理文档与任务报告

目标：保证后续接手者无需额外上下文也能继续推进。

执行内容：

- 在应用目录下补最小 README，写清楚：
  - 项目目标
  - 不依赖 Spine 运行时
  - 资源来源
  - 运行方式
  - 当前支持的数据子集
- 完成实现后，在 `tasks/` 下新增中文任务报告：
  - 文件名：`4-spine2pixiani-demo-bootstrap-[utctime].md`
- 报告中至少记录：
  - 实际实现范围
  - 未覆盖的数据类型
  - 验证命令
  - 遗留问题

验收标准：

- 新接手者只看应用内 README 与任务报告，就能理解实现边界与下一步工作。

## 9. 关键技术决策

### 决策 1：是否引入 Spine 运行时

结论：

- 不引入。

原因：

- 用户目标已明确要求最终不基于 Spine 库。
- 本任务的核心价值就是把 Spine 资源“翻译”为可维护的 Pixiani 手写动画实现。

### 决策 2：是否直接依赖 `packages/pixiani`

结论：

- 初版不强依赖，采用“复制最小 core 到应用内”的方案。

原因：

- 这是测试项目，允许复制基础层。
- 这样更便于修改，不会把 demo 特有的 Spine 适配逻辑推回共享包。

### 决策 3：是否先拆 atlas

结论：

- 初版优先不拆，直接消费 `cabin.atlas + cabin.png`。

原因：

- atlas 已经是更贴近运行时效率的资产形式。
- 当前目标是完成动画还原，不是做图片资源再加工流程。

### 决策 4：转换方式是运行时适配还是预生成

结论：

- 优先采用“预生成或静态固化内部数据”的方式。

原因：

- 便于调试与维护。
- 更符合“手写代码实现”的目标。
- 后续如果需要人工微调某些节点或轨道，直接改 TypeScript 数据更直观。

## 10. 验证清单

执行完成后，至少完成以下验证：

- `pnpm --filter spine2pixiani-demo lint`
- `pnpm --filter spine2pixiani-demo test`
- `pnpm --filter spine2pixiani-demo typecheck`
- `pnpm --filter spine2pixiani-demo build`
- `pnpm --filter spine2pixiani-demo dev`

手工验证项：

- 页面默认能播放 `cabin`
- 下拉框可切换到 `cabin_s`
- 切换后无明显贴图错位、旋转错误、层级错乱
- 页面刷新后仍能正常加载资源并播放

若依赖下载失败，可先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 11. 风险与应对

- 风险：`cabin.json` 使用了当前未预估的 Spine 时间轴类型。
  - 应对：先统计实际出现的时间轴类型，再按资源真实使用范围实现；未覆盖部分写入任务报告。
- 风险：atlas 旋转子图处理错误导致贴图方向异常。
  - 应对：先做 atlas 单测，并挑选 `rotate: true` 的 attachment 做视觉验证。
- 风险：draw order 或 attachment 切换遗漏，导致显示顺序与原动画不一致。
  - 应对：在适配层把 draw order 单独建模，并补切换测试。
- 风险：为了追求通用性导致实现过重。
  - 应对：坚持“只支持当前 cabin 资源所需子集”的原则，不做通用 Spine Runtime。

## 12. 关于 `agents.md` 的处理规则

本计划阶段不要求立即更新 `agents.md`。

执行时按以下规则判断：

- 如果只是新增 `apps/spine2pixiani-demo` 测试应用，不改变仓库协作规则、目录规范或基础脚本，则不需要更新根级 `agents.md`。
- 如果执行过程中新增了仓库级共识，例如“Spine 资源转 Pixiani 的统一目录规范”或“动画 demo 的统一脚手架规则”，则应同步更新根级 `agents.md`。
- 若仅在 demo 应用内部形成局部约定，优先写入该应用 README，不扩大到仓库级规则。

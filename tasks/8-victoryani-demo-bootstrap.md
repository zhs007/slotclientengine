# victoryani-demo 初始化任务计划

## 1. 任务目标

新增一个可运行的测试项目 `apps/victoryani-demo`，基于 `pixi.js`、`gsap` 与应用内复制的 `pixiani core`，播放 `docs/victory_editor_v2/export-example/` 导出的动画示例，并尽可能兼容 `docs/victory_editor_v2/main.ts` 中定义的导出数据结构与预设动画效果。

本计划是可直接执行版本，不依赖额外口头说明。

## 2. 已知输入

当前仓库内可确认的事实如下：

- 编辑器实现位于 `docs/victory_editor_v2/main.ts`。
- 导出示例位于 `docs/victory_editor_v2/export-example/`，包含：
  - `project.json`
  - `assets/*`
- 编辑器导出的核心数据结构至少包含：
  - `version`
  - `name`
  - `duration`
  - `layers[]`
- 每个图层当前可包含：
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
- 编辑器预设动画在 `PRESET_ANIMATIONS` 中定义，当前可见的类型包括：
  - `custom`
  - `sweepLight`
  - `swing`
  - `slideIn`
  - `slideOut`
  - `fadeIn`
  - `fadeOut`
  - `bounceIn`
  - `zoomIn`
  - `float`
  - `pulse`
  - `rotate`
  - `wave`
  - `flipX`
  - `flipY`
  - `plexus`
  - `shatter`
  - `glitch`
  - `magicShine`
  - `cloudSea`
  - `firework`
  - `particleBurst`
  - `starlight`
  - `sequenceScale`
  - `fireDistortion`
- 导出示例 `project.json` 当前包含：
  - 16 个图层
  - 全部为 `pic` 图层
  - 2 个带 `maskId` 的遮罩关系
  - 混合模式至少用到 `normal` 与 `screen`
  - 实际使用到的动画类型有：
    - `bounceIn`
    - `fadeIn`
    - `fadeOut`
    - `fireDistortion`
    - `firework`
    - `float`
    - `particleBurst`
    - `slideIn`
    - `starlight`
    - `sweepLight`
    - `swing`
    - `wave`
    - `zoomIn`
- 仓库中已有可参考项目：
  - `apps/spine2pixiani-demo`
  - `packages/pixiani`
- 用户允许：
  - 将 `packages/pixiani/src/core` 直接复制到新项目内
  - 将 `docs/victory_editor_v2/export-example` 下的文件直接复制到新项目内使用

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `apps/victoryani-demo` 已创建为标准 workspace 应用。
- 应用可通过 `pnpm --filter victoryani-demo dev` 本地运行。
- 应用启动后能自动加载内置示例数据，并在画布中播放 `docs/victory_editor_v2/export-example/project.json` 对应动画。
- 示例中 16 个图层的基础属性均被正确消费：
  - 位置
  - 缩放
  - 旋转
  - 透明度
  - 显隐
  - 绘制顺序
  - 遮罩关系
  - 混合模式
- 示例当前使用到的 13 种动画类型均可播放，且播放时序与导出配置的 `startTime`、`duration` 一致。
- 运行时具备可扩展的动画注册机制，后续补齐剩余预设动画时无需推翻项目结构。
- 对编辑器全部预设动画类型给出明确支持状态：
  - 已支持
  - 示例未用但已实现
  - 暂不支持且原因明确
- 至少完成最小自动化校验，覆盖：
  - 导出配置解析
  - 图层实例构建
  - 时间线调度
  - 遮罩/混合模式基础行为
  - 至少一种特效动画的运行时构建
- 项目包含 `README.md`，说明：
  - 项目目的
  - 运行方式
  - 资源来源
  - 当前支持范围
  - 已知限制
- 任务完成后，在 `tasks/` 下新增一份中文任务报告，命名为 `8-victoryani-demo-bootstrap-[utctime].md`，其中 `utctime` 使用 UTC 时间，格式为 `年月日时分秒`，例如 `260403-031500`。
- 若执行过程中修改了仓库协作规则、目录规范或基础脚本，需要同步更新根级 `agents.md`；若仅新增 demo 应用与文档，则无需修改。

## 4. 默认实现假设

为保证任务可落地，默认按以下假设推进：

- 本项目是测试应用，优先目标是“能稳定播放编辑器导出的示例动画”，其次才是通用化。
- 允许复制 `packages/pixiani/src/core/**` 到应用内，再按示例播放需求做局部调整。
- 允许直接复制 `docs/victory_editor_v2/export-example/project.json` 与 `assets/*` 到应用目录内，作为内置 demo 数据。
- 运行时不直接依赖编辑器页面代码，不把 `docs/victory_editor_v2/main.ts` 原样搬入应用。
- 动画执行引擎应优先采用“预设动画注册表 + 每层 GSAP timeline”的方式，与编辑器导出语义保持接近。
- `custom` 动画默认不作为首批必做项；若实现成本可控，则支持；若有安全或复杂度风险，可在 README 中标为暂不支持。
- 由于导出示例当前全部是 `pic` 图层，`font` 图层可作为第二优先级兼容项，但项目结构必须预留扩展位。
- 若依赖下载失败，可先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 5. 实施范围

本任务默认覆盖以下路径：

- `apps/victoryani-demo/**`
- `tasks/8-victoryani-demo-bootstrap.md`
- 任务完成后的报告文件 `tasks/8-victoryani-demo-bootstrap-[utctime].md`

如有必要，可只读参考以下路径：

- `docs/victory_editor_v2/main.ts`
- `docs/victory_editor_v2/export-example/**`
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

### 决策 1：新项目采用“应用内自带运行时”而不是改造共享包

原因：

- 用户明确接受复制 `pixiani core`。
- 当前目标是快速落地测试项目，而不是抽象通用动画播放框架。
- 编辑器导出格式仍可能调整，运行时放在 demo 内更便于快速迭代。

结论：

- 复制 `packages/pixiani/src/core` 到 `apps/victoryani-demo/src/core`。
- 必要时复制 `packages/pixiani/src/layout.ts` 到应用内使用。

### 决策 2：数据导入与动画播放解耦

原因：

- 导出配置是静态 JSON，动画执行是运行时行为。
- 后续若要支持更多导出版本或多套示例，拆层更容易维护。

结论：

- 独立实现：
  - 配置类型定义层
  - 资源加载层
  - 图层构建层
  - 动画注册与时间线层
  - 场景播放层

### 决策 3：优先完整支持“示例实际用到的效果”，同时预留全量预设扩展位

原因：

- “尽可能支持全部效果”需要分优先级，否则初始化任务容易失控。
- 当前示例已覆盖不少关键能力：遮罩、混合模式、位移/缩放/透明度、程序特效、粒子、扰动。

结论：

- 第一优先级：完整支持示例使用到的 13 种动画类型。
- 第二优先级：补齐剩余预设动画中实现成本低且复用度高的类型。
- 第三优先级：评估 `custom` 是否安全可控，若不做则明确标注限制。

### 决策 4：兼容逻辑尽量复刻编辑器语义，但避免直接执行来源不明脚本

原因：

- 编辑器里部分动画通过字符串 + `new Function(...)` 动态执行。
- 在测试项目中直接开放任意脚本执行，后续维护和安全边界都不清晰。

结论：

- 预设动画改为显式 TypeScript 实现。
- `custom` 默认不开放任意代码执行；若要支持，需限定仅加载受信任本地示例或做显式开关。

## 7. 建议目标目录结构

建议最终形成如下结构：

```text
apps/victoryani-demo/
  index.html
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vite.config.ts
  eslint.config.cjs
  README.md
  src/
    main.ts
    styles.css
    layout.ts
    core/
      entitymanager.ts
      objectpool.ts
      visualentity.ts
    assets/
      project.json
      images/
        ...
    config/
      victory-project.ts
      victory-types.ts
    runtime/
      asset-loader.ts
      blend-mode.ts
      layer-factory.ts
      layer-instance.ts
      mask-manager.ts
      timeline.ts
      animation-registry.ts
      animation-context.ts
    animations/
      basic/
        fade.ts
        move.ts
        scale.ts
        rotate.ts
      effects/
        sweep-light.ts
        firework.ts
        particle-burst.ts
        starlight.ts
        fire-distortion.ts
      index.ts
    scene/
      victory-player.ts
      victory-stage.ts
    ui/
      control-panel.ts
  tests/
    runtime/
      asset-loader.test.ts
      layer-factory.test.ts
      timeline.test.ts
      animation-registry.test.ts
    scene/
      victory-player.test.ts
```

说明：

- `src/assets/` 用于存放复制后的示例资源。
- `src/config/` 负责类型与配置适配，不直接耦合渲染。
- `src/runtime/` 负责播放器底层能力。
- `src/animations/` 按效果拆分，避免单文件过大。
- `src/scene/` 负责拼装 Pixi 应用、舞台、时间线与交互。

## 8. 任务拆分

### 任务 1：梳理编辑器导出协议并固化应用内类型

目标：把导出数据从“文档代码中的隐式结构”整理成新项目可直接消费的显式类型。

执行内容：

- 阅读 `docs/victory_editor_v2/main.ts` 中与下列内容相关的实现：
  - `AnimConfig`
  - `LayerConfig`
  - `PixiAniConfig`
  - `BLEND_MODE_MAP`
  - `PRESET_ANIMATIONS`
  - `buildMasterTimeline()`
  - `applyMasks()`
- 在新项目内定义导出协议类型。
- 为动画参数保留 `Record<string, string | number | boolean>` 兼容口。
- 整理一份“预设动画支持矩阵”，明确每种动画的实现优先级。

验收标准：

- 类型定义可独立表达当前 `project.json`。
- 新项目内不再需要依赖编辑器源码才能理解导出结构。

### 任务 2：初始化 `apps/victoryani-demo` 应用骨架

目标：先让项目成为标准可运行的 workspace 应用。

执行内容：

- 新建 `apps/victoryani-demo/`。
- 参考现有 demo 与根级工具链补齐：
  - `package.json`
  - `tsconfig.json`
  - `tsconfig.eslint.json`
  - `vite.config.ts`
  - `eslint.config.cjs`
  - `index.html`
  - `src/main.ts`
  - `src/styles.css`
- 脚本至少包含：
  - `dev`
  - `build`
  - `lint`
  - `test`
  - `typecheck`
  - `format`
  - `format:check`
- 如需新增空目录，放置 `.keepme`。

验收标准：

- `pnpm --filter victoryani-demo dev` 可启动空白或最小页面。
- `pnpm --filter victoryani-demo typecheck` 可通过。

### 任务 3：复制最小 Pixiani 基础层并接入应用生命周期

目标：让 demo 拥有最小实体管理、更新循环与布局能力。

执行内容：

- 从 `packages/pixiani/src/core` 复制：
  - `entitymanager.ts`
  - `objectpool.ts`
  - `visualentity.ts`
- 如有必要，复制 `packages/pixiani/src/layout.ts`。
- 根据新项目结构修正 import 路径。
- 在 `main.ts` 中接入 Pixi `Application` 与 ticker。

验收标准：

- 新应用内可以独立完成逐帧更新。
- 不依赖直接导入 `@slotclientengine/pixiani` 也能运行。

### 任务 4：复制示例资源并建立配置装载层

目标：让项目可以稳定读取内置示例。

执行内容：

- 将 `docs/victory_editor_v2/export-example/project.json` 复制到应用内。
- 将 `docs/victory_editor_v2/export-example/assets/*` 复制到应用内资源目录。
- 处理资源路径，使 `project.json` 在 Vite 环境下可正确解析。
- 实现配置装载器，负责：
  - 读取 JSON
  - 标准化资源路径
  - 校验必要字段
  - 给缺省字段补默认值

验收标准：

- 启动后可以稳定拿到完整配置对象。
- 不需要依赖 `docs/` 原路径即可播放示例。

### 任务 5：实现图层构建、绘制顺序、混合模式与遮罩

目标：先把静态场景完全搭起来，为动画播放打底。

执行内容：

- 实现图层到 Pixi 显示对象的映射：
  - `pic` -> `PIXI.Sprite`
  - `font` -> `PIXI.Text` 或占位兼容
- 设置每个图层的基础属性：
  - `position`
  - `scale`
  - `rotation`
  - `alpha`
  - `visible`
- 按导出层顺序还原绘制顺序。
- 实现 `blendMode` 映射，至少支持：
  - `normal`
  - `add`
  - `multiply`
  - `screen`
- 实现 `maskId` 关系应用，与编辑器的“source layer 被 target layer 遮罩”语义对齐。

验收标准：

- 不开启动画时，示例静态初始画面可正确渲染。
- 两处遮罩与 `screen` 混合模式表现符合预期。

### 任务 6：建立统一动画注册表与主时间线调度器

目标：把“图层动画配置”转换为可维护的运行时执行模型。

执行内容：

- 为每个图层创建独立容器与目标显示对象。
- 实现动画注册表：
  - `animationType -> factory function`
- 实现主时间线构建器，按 `startTime` 与 `duration` 将动画挂到 GSAP timeline。
- 播放前统一重置图层状态：
  - 位置
  - 缩放
  - 旋转
  - 透明度
  - filters
- 对临时创建的粒子、滤镜、Graphics、遮罩辅助对象提供清理逻辑，避免重复播放时泄漏。

验收标准：

- 可以一键播放、停止、重播示例。
- 重播多次后不会出现明显残留对象或状态污染。

### 任务 7：实现示例所需的 13 种动画类型

目标：完整覆盖当前导出示例实际用到的效果。

执行内容：

- 优先实现以下动画：
  - `fadeIn`
  - `fadeOut`
  - `slideIn`
  - `bounceIn`
  - `zoomIn`
  - `float`
  - `swing`
  - `wave`
  - `sweepLight`
  - `particleBurst`
  - `starlight`
  - `firework`
  - `fireDistortion`
- 对每种动画：
  - 对齐编辑器参数命名
  - 对齐时长语义
  - 处理 repeat/yoyo/cleanup
  - 尽量贴近编辑器视觉表现
- 程序特效类动画要显式清理：
  - 粒子精灵
  - `Graphics`
  - `DisplacementFilter`
  - 临时 `Texture`

验收标准：

- 示例中所有图层动画均有对应实现。
- 页面播放结果在节奏、显隐、主要运动与特效构成上与编辑器示例基本一致。

### 任务 8：补齐剩余预设动画的支持矩阵

目标：在初始化阶段尽可能接近“支持 victory_editor_v2 全部动画效果”。

执行内容：

- 评估并尽量实现示例未用到但编辑器已定义的动画：
  - `slideOut`
  - `pulse`
  - `rotate`
  - `flipX`
  - `flipY`
  - `plexus`
  - `shatter`
  - `glitch`
  - `magicShine`
  - `cloudSea`
  - `sequenceScale`
- 对 `custom` 明确策略：
  - 若实现：限定为本地受信任脚本并在 README 说明边界
  - 若不实现：在支持矩阵中标明暂不支持与原因

验收标准：

- README 中有一份完整支持矩阵。
- 除 `custom` 外，尽量实现剩余预设动画；若有未实现项，必须给出明确技术原因与后续建议。

### 任务 9：补控制面板与开发调试能力

目标：让测试项目更方便验证动画兼容性。

执行内容：

- 添加最小控制面板，至少包含：
  - 播放
  - 停止
  - 重播
  - 是否循环
  - 当前时间显示
- 如成本可控，可增加：
  - 时间拖动
  - 图层显隐调试
  - 动画列表查看

验收标准：

- 不改代码即可反复验证示例动画。
- 调试控件不会破坏主舞台显示。

### 任务 10：补自动化测试与手工验收清单

目标：让初始化项目具备最小回归能力。

执行内容：

- 至少新增以下测试：
  - 配置解析测试
  - 图层实例构建测试
  - 动画注册表测试
  - 主时间线调度测试
  - 至少一种滤镜类或粒子类效果测试
- 整理手工验收清单，至少覆盖：
  - 首屏能否出现
  - 16 个图层是否齐全
  - 遮罩是否生效
  - `screen` 混合模式是否生效
  - 关键特效是否出现
  - 重播后是否残留

验收标准：

- `pnpm --filter victoryani-demo test` 可运行。
- 手工验收步骤可被他人直接照着执行。

### 任务 11：编写 README 与任务报告

目标：把项目使用方式和当前能力边界写清楚。

执行内容：

- 在 `apps/victoryani-demo/README.md` 中说明：
  - 项目定位
  - 启动命令
  - 示例资源来源
  - 播放器架构概览
  - 当前支持的动画类型
  - 暂不支持项与原因
  - 后续扩展建议
- 任务完成后，在 `tasks/` 下新增中文任务报告：
  - 文件名：`8-victoryani-demo-bootstrap-[utctime].md`
  - `utctime` 采用 UTC 时间，例如 `260403-031500`
- 报告中记录：
  - 实际完成项
  - 与计划差异
  - 测试结果
  - 已知问题

验收标准：

- 新成员只看 README 就能把示例跑起来。
- 只看任务报告也能知道本轮交付边界。

## 9. 推荐实施顺序

建议按以下顺序执行，避免返工：

1. 初始化应用骨架。
2. 复制 `pixiani core` 并接入最小 Pixi 应用。
3. 复制示例资源并跑通配置读取。
4. 先完成静态图层、遮罩、混合模式。
5. 再实现主时间线和示例用到的 13 种动画。
6. 页面可稳定播放后，再补剩余预设动画支持矩阵。
7. 最后补 README、测试和任务报告。

## 10. 风险与应对

### 风险 1：编辑器特效高度依赖临时对象与滤镜，重播时容易残留

应对：

- 每种特效动画必须设计显式销毁逻辑。
- 在播放器重播前统一清理上次运行产生的临时对象。

### 风险 2：导出示例路径与 Vite 打包路径不一致

应对：

- 复制示例资源到应用内静态路径。
- 在配置装载层统一重写相对路径。

### 风险 3：部分预设动画直接照搬编辑器代码会与 Pixi 版本差异冲突

应对：

- 优先按语义重写，而不是复制字符串脚本。
- 若某些滤镜或 API 在当前 `pixi.js` 版本行为不同，先保证示例可用，再在 README 标注偏差。

### 风险 4：`custom` 动画的动态脚本执行带来维护和安全边界问题

应对：

- 初始化阶段默认不开放任意脚本执行。
- 如业务强依赖，再单独立任务做受限脚本能力。

## 11. agents.md 是否需要同步

当前任务只是新增 demo 应用、配套文档和任务文件，不改变仓库协作规则、目录规范或基础脚本。

结论：

- 默认不需要修改根级 `agents.md`。
- 若执行中新增了新的仓库级约束或脚本约定，再同步补充。

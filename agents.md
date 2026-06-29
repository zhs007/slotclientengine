# Agents

本仓库是基于 `pnpm` + `turbo` 的 TypeScript monorepo，面向 slot 游戏前端引擎开发，后续会承载游戏模版、网络库、渲染库及可运行应用。

## 仓库约束

- Node.js 版本要求：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- 代码检查：`eslint`
- 代码格式化：`prettier`
- VS Code 调试运行 TypeScript：`ts-node`

## 目录约定

- `apps/`：可运行项目
- `packages/`：内部依赖库
- `packages/gameframeworks`：后续 slot 游戏默认 facade，整合 UI、网络和逻辑数据流。
- `packages/vnicore`：Pixi.js v8 VNI 动画核心库，供 `apps/anieditorv5viewer` 等 Pixi 运行时使用；不要与 `packages/anieditorv5runtime-cc` 的 Cocos Creator runtime 混用。
- `tasks/`：任务计划、任务报告和执行记录
- `docs/`：项目文档

## 执行约定

- 新增空目录时请放置 `.keepme` 文件，避免目录丢失。
- 子项目如需使用根级基础工具链依赖，应与根目录版本保持一致。
- 后续游戏默认依赖 `@slotclientengine/gameframeworks`，不要直接依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`，除非是在框架内部或任务明确要求。
- `packages/rendercore` 拥有通用 Pixi slot 渲染算法，包括 symbol 状态、普通 reel、grid-cell reel 等可复用转轮表现；游戏 app 只能配置和调用，不要在 app 内复制通用转轮调度、裁切、状态机或 grid-cell spin 算法。
- live slot 前端不能也不应该拿到服务器真实轮带。spin 渲染必须使用本地公开轮子配置滚动；拿到服务器实际停下来的 scene 后，只把本轮目标可见窗口叠加进临时轮带数据。不要因为服务器 scene 无法在本地轮带反查 stop y 就失败，也不要改用、缓存或泄露服务器真实轮带。
- game002 系列 symbols 中的透明 `BN` 只能作为显式配置的空图标或明确服务器映射边界的兜底入口；不要在通用 symbol catalog 中静默吞掉缺图、缺 manifest 或缺配置错误。
- game002 系列 symbol manifest 的每个 symbol 必须声明显示 `scale`；当前 `skin=1` / `assets/symbols001` 为 `0.8`，`assets/symbols`、`assets/symbols002`、`assets/symbols003`、`assets/game002-s2`、`assets/game002-s3` 为 `1`。`symbolsviewer` 和 `game002` 应从 manifest 读取 scale，不要在 app 内维护第二份手写 scale 表。
- `packages/rendercore` 拥有 Pixi 游戏内部的 art-size、focus-rect、visible-viewport 适配算法；游戏 app 只能配置 art 尺寸、focus 区域和资源，不要在 app 内复制通用裁切、居中或可见区域策略。
- `game002` 的响应式适配重点区域必须由每套 skin 显式配置，坐标相对于完整 `2000 x 2000` 背景；不要把转轮 board frame 当作隐式适配 focus，也不要在 app 内复制 `rendercore` 的 art-viewport 映射算法。
- `game002` 当前支持 `skin=1|2|3|4|5`；`skin=4` 映射 `assets/game002-s2/bg.png` 和 `assets/game002-s2` symbols，`skin=5` 映射 `assets/game002-s3/bg.jpg` 和 `assets/game002-s3` symbols。`assets/game002-s2/bg.png` 是背景不是 symbol，不要让 viewer/runtime 把它当成 symbol catalog fallback；新 skin 仍复用 `assets/gamecfg002/gameconfig.json` 和本地公开轮带，不改变 live 参数、`gamecode` 或服务器协议。
- `packages/uiframeworks` 拥有页面 DOM frame、canvas 逻辑尺寸上限、黑边居中和 viewport resize 适配；游戏 app 不要直接用 CSS/DOM 私有逻辑绕过 framework 的 frame policy。
- `packages/vnicore` 拥有 VNI 播放状态机、segmented 高级播放、live 粒子排空、layer group render order 和 group slot 挂接语义；viewer 只能做 UI 配置、输入校验、状态展示和调用，不要在 `apps/anieditorv5viewer` 里复制播放状态机、group adjacency 算法或直接操作 runtime 私有 Pixi container。
- 更新 `packages/anieditorv5runtime-cc` 的 public runtime 行为时，必须同步模块化源码、`standalone/anieditorv5runtime-cc.ts`、`scripts/check-standalone.mjs`、standalone 测试和 `standalone.zip`，避免 Cocos 主要交付面与 workspace package 漂移。
- Prettier 校验不应覆盖 `dist/`、`coverage/` 等生成物；如果 package 脚本在子目录内执行 `prettier --check .`，需要在对应 package 放置 `.prettierignore` 保持一致。
- 若依赖安装失败，可先执行：
  `export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;`
- 当任务影响仓库协作规则、目录规范或基础脚本时，需要同步更新本文件。

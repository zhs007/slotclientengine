# anieditorv5viewer bootstrap 任务报告

## 任务摘要

已按任务 29 新增 `apps/anieditorv5viewer`，实现 Vite + TypeScript + Pixi.js viewer，用于加载并渲染 `docs/anieditor5/export/project.json` 的 V5G 动画样例。

本次实现复制了当前导出的 `project.json` 和 4 个图片资源，建立 Vite asset manifest，按 V5G 中心坐标系、图层顺序、混合模式、锚点、透明度、负缩放镜像、动画时间线和动画覆盖区间外隐藏规则渲染。

## 新增/修改文件

新增：

- `apps/anieditorv5viewer/package.json`
- `apps/anieditorv5viewer/.prettierignore`
- `apps/anieditorv5viewer/README.md`
- `apps/anieditorv5viewer/index.html`
- `apps/anieditorv5viewer/vite.config.ts`
- `apps/anieditorv5viewer/eslint.config.cjs`
- `apps/anieditorv5viewer/tsconfig.json`
- `apps/anieditorv5viewer/tsconfig.eslint.json`
- `apps/anieditorv5viewer/src/main.ts`
- `apps/anieditorv5viewer/src/styles.css`
- `apps/anieditorv5viewer/src/vite-env.d.ts`
- `apps/anieditorv5viewer/src/v5g/types.ts`
- `apps/anieditorv5viewer/src/config/bundled-project.ts`
- `apps/anieditorv5viewer/src/runtime/animation-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts`
- `apps/anieditorv5viewer/src/runtime/blend-mode.ts`
- `apps/anieditorv5viewer/src/runtime/coordinates.ts`
- `apps/anieditorv5viewer/src/runtime/layer-instance.ts`
- `apps/anieditorv5viewer/src/runtime/project-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/validation.ts`
- `apps/anieditorv5viewer/src/runtime/v5g-player.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `apps/anieditorv5viewer/tests/setup.ts`
- `apps/anieditorv5viewer/tests/runtime/animation-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts`
- `apps/anieditorv5viewer/tests/runtime/coordinates.test.ts`
- `apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/validation.test.ts`
- `tasks/29-anieditorv5viewer-bootstrap-260616-083930.md`

修改：

- `pnpm-lock.yaml`：新增 workspace importer `apps/anieditorv5viewer`。

未修改：

- `docs/anieditor5/**` 仅作为输入和复制来源读取。
- `agents.md` 未更新。

## 实现要点

V5G schema 校验：

- 支持 `schemaVersion` 形如 `V5G_0.x` 且 `editor.name === "victory_editor_v5_g"`。
- 对非 `center` 坐标系、非空 `particles`、非空 `keyframes`、`group` 图层、嵌套 `parentId`、未知动画、未知 easing、未知 blendMode、动画越过 `stage.duration` 等显式失败。
- 图片加载后校验纹理实际尺寸与 JSON `asset.width/height` 一致。

资源 manifest：

- 使用 `import.meta.glob("../assets/assets/*", { eager: true, query: "?url", import: "default" })` 建立 Vite URL manifest。
- manifest key 规范为 `assets/<filename>`，与 JSON 中 `asset.path` 精确匹配。
- JSON 引用缺失资源时直接抛错，不渲染 missing placeholder。

时间采样规则：

- 实现 `sampleLayerAnimationsAtTime()`、`sampleLayerAtTime()`、`sampleProjectAtTime()`。
- 支持 `move`、`fade`、`scale_up`、`scale_down`、`rotate`，并同步实现 `slide_in`、`slide_out`、`bounce_in`、`pulse`、`float`、`swing`。
- 有启用动画但当前时间不在任一动画覆盖范围内时，图层有效 opacity 为 `0`。
- `scale_up/scale_down` 保留基础 `scaleX/scaleY` 符号，支持负缩放镜像。

Pixi 渲染：

- 使用 Pixi Application，背景色来自 `project.stage.backgroundColor`。
- 按 `project.layers` 原始顺序 addChild，后面的图层绘制在前面图层之上。
- `seek()` 是唯一同步图层视觉状态的入口，播放、拖动时间轴、重播都走同一条采样路径。
- 渲染层设置中心坐标转换、scale、rotation、alpha、visible、blendMode。
- 在 stage 容器上维护不可见诊断数据：当前时间、可见图层数、canvas 像素采样数、非背景采样数和最大颜色差，用于浏览器验收证明 canvas 不是只创建未绘制。

Viewer UI：

- 首屏直接是 viewer。
- 控件包含 Play/Pause、Restart、Loop、时间文本、range 时间轴、项目名、图层数、资源数和动画类型列表。
- 桌面与 390px 窄屏均完成布局检查，窄屏无横向溢出节点。

## 支持范围

当前支持：

- V5G `V5G_0.x`
- `image` 图层和基础 `text` 图层
- `normal`、`add`、`screen`、`multiply`、`lighten`
- `linear`、`easeInQuad`、`easeOutQuad`、`easeInOutQuad`、`backOut`
- 当前样例用到的 `scale_up`、`scale_down`、`fade`、`rotate`、`move`
- 额外实现的 `slide_in`、`slide_out`、`bounce_in`、`pulse`、`float`、`swing`

明确不支持：

- `particles`
- 非空 `keyframes`
- `group` 图层
- 嵌套 `parentId`
- 未知资源、未知动画、未知 easing、未知 blendMode 的静默兜底

## 复制资源清单

资源复制目标：

- `apps/anieditorv5viewer/src/assets/project.json`
- `apps/anieditorv5viewer/src/assets/assets/epic_asset_image_mq6i4x4l_a.png`
- `apps/anieditorv5viewer/src/assets/assets/effect2_asset_image_mq6j09f0_k.png`
- `apps/anieditorv5viewer/src/assets/assets/effect1_asset_image_mq6m8cly_4.png`
- `apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqasjj80_3.png`

资源审计：

- `find apps/anieditorv5viewer/src/assets -maxdepth 3 -type f` 确认目标 JSON 和 4 张图片存在。
- `jq -r '.assets[].path' apps/anieditorv5viewer/src/assets/project.json` 输出的 4 个 `asset.path` 均有对应文件。

## 测试结果

依赖安装：

- `pnpm install`：通过。

模块级验证：

- `pnpm --filter anieditorv5viewer typecheck`：通过。
- `pnpm --filter anieditorv5viewer lint`：通过。
- `pnpm --filter anieditorv5viewer test`：通过，5 个测试文件，33 条测试。
- `pnpm --filter anieditorv5viewer build`：通过，Vite 产物包含 4 张导出图片。
- `pnpm --filter anieditorv5viewer format:check`：通过。

根级验证：

- `pnpm typecheck`：通过，17 个 package 成功。
- `pnpm lint`：通过，17 个 package 成功。
- `pnpm test`：通过，17 个 package 成功。
- `pnpm build`：通过，17 个 package 成功。
- `git diff --check`：通过。
- `pnpm format:check`：失败，判定为既有无关问题。

`pnpm format:check` 失败摘要：

- 新 app 单独执行 `pnpm --filter anieditorv5viewer format:check` 已通过。
- 根级 `format:check` 失败来自既有包的产物目录或历史格式问题，例如 `uiframeworksviewer`、`gengameconfig`、`game001`、`reelsviewer`、`symbolsviewer`、`@slotclientengine/uiframeworks`、`@slotclientengine/netcore` 等输出中的 `coverage/**`、`dist/**`、`devlogs/**` 或既有源码/测试格式警告。
- `git status --short --untracked-files=all apps/anieditorv5viewer` 展开的新 app 未跟踪文件只包含源码、测试、配置和复制资源；`dist/coverage/node_modules/.turbo` 由根 `.gitignore` 忽略。
- 这些失败不来自本任务新增 app，未修改相关既有包源码。

## 浏览器验收

dev server：

- 实际命令：`pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175`
- 实际 URL：`http://localhost:5175/`

桌面验收：

- 页面可打开，无空白页。
- DOM 显示项目名 `胜利测试`、`5 layers`、`4 assets`、动画类型列表、Play、Restart、Loop 和时间轴。
- Pixi canvas 已创建，尺寸约 `1246x580`。
- console error 日志为空。
- Play/Pause：点击 Play 后按钮变为 Pause，时间轴推进；点击 Pause 后按钮恢复 Play。
- Restart：点击后时间回到 `0.00 / 10.00`。
- Loop：可从 checked 切到 false，再切回 true。
- 拖动时间轴到 `0.6s`、`0.8s`、`4.0s`、`4.4s` 均能更新 readout。

canvas 像素/图层诊断：

- `0.60s`：`v5gVisibleLayers=3`，`v5gNonBackgroundSamples=7/49`，`v5gMaxPixelDelta=685`。
- `0.80s`：`v5gVisibleLayers=5`，`v5gNonBackgroundSamples=5/49`，`v5gMaxPixelDelta=686`。
- `4.00s`：`v5gVisibleLayers=5`，`v5gNonBackgroundSamples=7/49`，`v5gMaxPixelDelta=686`。
- `4.40s`：`v5gVisibleLayers=0`，`v5gNonBackgroundSamples=0/49`，符合当前样例淡出结束后的隐藏规则。
- 从 Restart 后点击 Play，约 `0.47s` 时 `v5gVisibleLayers=2`，`v5gNonBackgroundSamples=7/49`，证明从 0 秒开始播放后 canvas 有非背景像素。

窄屏验收：

- 使用 390x720 viewport 复查。
- canvas 尺寸约 `368x469`。
- 控制条尺寸约 `370x217`。
- overflow 检查结果为空数组，未发现横向溢出节点。

截图说明：

- in-app Browser 的 `Page.captureScreenshot` 在本页面连续超时，因此未保存截图文件。
- 已改用页面自身运行环境中的 WebGL canvas 像素采样诊断完成 sanity check，能证明关键时间点 canvas 非纯背景。

## 是否更新 agents.md

未更新 `agents.md`。

原因：本任务只新增 `apps/anieditorv5viewer` 普通 workspace app，并未改变仓库协作规则、目录规范或根级基础脚本。新增 `.prettierignore` 只作用于新 app，避免复制资源和生成产物影响该 app 的格式检查。

## 遇到的问题和处理

- `pnpm --filter anieditorv5viewer dev -- --host 0.0.0.0 --port 5175` 在当前 pnpm 参数转发下把 `--` 传给 Vite，且沙箱不允许监听端口；改用 `pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175` 并申请端口监听权限后成功。
- 初次模块测试中 `move baseY` 测试期望写错，按计划公式修正为 `50 + 20 - 5 = 65`。
- 新 app 初次 `format:check` 会扫描 `coverage/`、`dist/` 和复制资源；新增 `.prettierignore` 排除 `coverage`、`dist`、`node_modules`、`src/assets`，保持复制资源原样且格式检查稳定。
- Browser 截图接口超时；改为在 viewer 内部记录 canvas 像素采样诊断数据完成非背景像素验收。
- 390px 窄屏初次发现 range 控件造成 2px 横向溢出；调整移动端 `.timeline` 宽度后复查通过。

## 未完成项或后续建议

- 根级 `pnpm format:check` 的既有失败未在本任务中修复，建议后续单独清理各包 `coverage/dist/devlogs` 的 Prettier ignore 策略和既有格式问题。
- 后续如 V5G 导出开始包含 `particles`、非空 `keyframes`、`group` 或嵌套图层，应以新任务扩展运行时，不要在当前 viewer 中静默降级。

# anieditorv5runtime-cc bootstrap 任务报告

## 任务摘要

已按任务 30 新增 `packages/anieditorv5runtime-cc` workspace package，包名为 `@slotclientengine/anieditorv5runtime-cc`。

本次没有创建 `apps/anieditorv5viewer-cc`。实现重点是提供可独立测试的 V5G core 和 Cocos Creator 3.8.6 runtime adapter；真实 Cocos 项目仍应由 Cocos Creator 编辑器创建或打开后导入本 runtime。

## 新增/修改文件

新增：

- `packages/anieditorv5runtime-cc/package.json`
- `packages/anieditorv5runtime-cc/.prettierignore`
- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/eslint.config.cjs`
- `packages/anieditorv5runtime-cc/vitest.config.ts`
- `packages/anieditorv5runtime-cc/tsconfig.json`
- `packages/anieditorv5runtime-cc/tsconfig.build.json`
- `packages/anieditorv5runtime-cc/tsconfig.eslint.json`
- `packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts`
- `packages/anieditorv5runtime-cc/src/index.ts`
- `packages/anieditorv5runtime-cc/src/core/**`
- `packages/anieditorv5runtime-cc/src/cocos/**`
- `packages/anieditorv5runtime-cc/tests/fixtures/project.json`
- `packages/anieditorv5runtime-cc/tests/core/**`
- `packages/anieditorv5runtime-cc/tests/cocos/**`
- `tasks/30-anieditorv5runtime-cc-bootstrap-260616-104134.md`

修改：

- `pnpm-lock.yaml`：新增 `packages/anieditorv5runtime-cc` workspace importer。

未修改：

- 未修改 `apps/anieditorv5viewer/**`。
- 未更新 `agents.md`。

## 实现要点

V5G core：

- 迁移并独立化 V5G 类型、严格校验、动画采样、项目采样和坐标工具。
- `src/core` 不 import `cc`，不依赖 DOM、Pixi、Cocos 或浏览器全局。
- 支持当前样例用到的 `image` 图层、中心坐标、负 scale、透明度、可见性、旋转、`normal/add` blend mode 和 `scale_up/scale_down/fade/rotate/move` 动画。
- 同步支持 viewer 已有的 `slide_in/slide_out/bounce_in/pulse/float/swing`。
- 对 particles、非空 keyframes、group、嵌套 parentId、未知动画、未知 easing、未知 blend mode、非法颜色、动画越界等显式失败。

Cocos adapter：

- `src/cocos/player.ts` 只依赖 fake-friendly driver interface，不 runtime import `cc`。
- `src/cocos/cocos-node-driver.ts` 是首期唯一 runtime import `cc` 的源码文件。
- `src/index.ts` 不 runtime re-export 真实 Cocos driver；包根只导出 core 和不触发真实 `cc` import 的类型/播放器/driver 合同。
- `src/cocos/index.ts` 导出真实 Cocos driver 和 `createV5GCocosPlayer()`，该入口仅适合 Cocos Creator 环境。
- Cocos 坐标直接使用 V5G 中心坐标 `transform.x/y`，不套用 Pixi 左上角转换。
- `init()` 创建 runtime stage、背景层和 image layer；背景层使用 `project.stage.backgroundColor` 并在所有图层下方。
- `seek()` 是唯一同步视觉状态入口；`play()` 只切换状态；`update(deltaSeconds)` 由宿主 Cocos Component 显式调用。
- 缺失 `SpriteFrame` 会抛错，错误包含 `asset.id` 和 `asset.path`。
- 如果 driver 能读取 `SpriteFrame` 尺寸，会校验尺寸与 V5G asset 宽高一致；无法读取时不会伪造“已校验”。
- `normal/add` blend mode 映射到明确 blend factor；未确认的 `screen/multiply/lighten` 显式失败。

## README

`packages/anieditorv5runtime-cc/README.md` 已说明：

- 本包不是完整 Cocos Creator 项目。
- 为什么本轮不手写 `apps/anieditorv5viewer-cc`。
- 如何在 Cocos Creator 3.8.6 项目中通过 workspace package 或拷贝 `src/dist` 方式导入。
- 样例 `project.json` 和图片资源来源。
- 使用方需要显式提供 `asset.path/asset.id -> SpriteFrame` 映射。
- 最小 Cocos Component 示例，并在 `update(deltaTime)` 中调用 `player.update(deltaTime)`。
- runtime 不负责 Canvas/root 缩放适配。
- `cc-3.8.6-shim.d.ts` 只是 monorepo 编译辅助，真实项目以编辑器类型为准。
- fail-fast 策略和当前支持/不支持能力。

## 测试结果

依赖安装：

- `pnpm install`：通过，未下载新包，新增 workspace importer。

package 级验证：

- `pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc lint`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc test`：通过，7 个测试文件，36 条测试。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc build`：通过。
- `pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check`：通过。

根级验证：

- `pnpm typecheck`：通过，18 个 package 成功。
- `pnpm lint`：通过，18 个 package 成功。
- `pnpm test`：通过，18 个 package 成功。
- `pnpm build`：通过，18 个 package 成功。
- `git diff --check`：通过。
- `pnpm format:check`：失败，判定为既有无关格式问题。

`pnpm format:check` 失败摘要：

- package 级 `format:check` 已通过。
- 根级失败首个失败包是既有 `@slotclientengine/pixiani`，涉及 `src/ani/index.ts`、`src/core/index.ts`、`src/index.ts`、`src/layout.ts`、`tests/layout.test.ts`、`tsconfig.build.json`、`tsconfig.eslint.json`。
- 输出中还出现多个既有包的 `coverage/**` 格式警告，例如 `uiframeworksviewer`、`logiccore`、`reelsviewer`、`victoryani-demo`、`spine2victoryani-demo` 等。
- 失败不来自 `packages/anieditorv5runtime-cc`，本任务未修改无关包格式。

## Cocos Creator 3.8.6 编辑器验收

Cocos Creator 3.8.6 编辑器验收未执行，原因：当前执行环境没有可用的 Cocos Creator 3.8.6 编辑器会话，无法真实打开编辑器、导入资源、绑定 `SpriteFrame`、观察画面或确认真实 Sprite blend factor API。

已用 Vitest fake driver 覆盖可自动化合同：

- `init()` 按图层顺序创建 layer。
- `init()` 创建 stage 背景层，且背景层在图层下方。
- 缺失 asset 抛错。
- `seek()` 写入 position、scale、rotation、opacity、active、anchor 和 blend mode。
- `update(deltaSeconds)` 在 `play()` 后推进时间，并在 loop 开启时回绕。
- 关闭 loop 后停在 `stage.duration`。
- 负 scale 被保留。
- `destroy()` 只清理 runtime 创建节点，不删除调用方传入 root。

真实编辑器内仍需后续人工确认：

- Cocos 3.8.6 `SpriteFrame` 尺寸读取 API 的可用性。
- Cocos 3.8.6 `Sprite` 的 `srcBlendFactor/dstBlendFactor` 行为是否与 README 描述一致。
- 样例在 Canvas 场景中的视觉非空、图层顺序、负 scale 镜像、`add` blend mode 和 `4.4s` 后隐藏规则。

## 是否更新 agents.md

未更新 `agents.md`。

原因：本任务只新增普通 `packages/*` workspace package，没有新增 Cocos 项目目录规范、仓库级 Cocos 提交规则或根级脚本，也没有改变既有仓库协作规则。

## 偏离计划或实现决策

- 为了保证 ESM `tsc` 产物与仓库现有 package 风格一致，源码相对 import/export 使用 `.js` 后缀。
- `V5GCocosPlayer` 构造参数显式接收 driver；真实 Cocos 入口额外提供 `createV5GCocosPlayer()` 注入真实 driver。这样能保持 `player.ts` 可用 fake driver 测试，并把真实 `cc` import 隔离在 `cocos-node-driver.ts`。
- `src/cocos/index.ts` 会 runtime import 真实 Cocos driver；README 已说明该入口只在 Cocos Creator 环境运行。Node/Vitest 测试直接 import `player.ts` 和 fake driver，不执行真实 `cc` 入口。
- 初次测试中 `bounce_in` 和 `pulse` 期望按线性直觉写错；根据已有采样语义修正测试期望，没有为了测试修改生产语义。

## 二次检查

- 未创建 `apps/anieditorv5viewer-cc`。
- 未提交 Cocos `Library`、`Temp`、`local` 缓存目录。
- 未添加 npm 依赖 `cc`。
- `packages/anieditorv5runtime-cc` 没有从 `apps/anieditorv5viewer/src/**` import。
- 已执行 `pnpm install`，`pnpm-lock.yaml` 仅新增新 workspace importer。
- 真实 `cc` runtime import 仅出现在 `src/cocos/cocos-node-driver.ts`；`src/cocos/types.ts` 只有 type-only import；README 示例中的 `cc` import 不属于 package runtime。
- 包根入口没有 runtime re-export 真实 Cocos driver。
- Cocos runtime 未使用 Pixi 左上角坐标转换。
- 已实现并测试 stage 背景层和 `backgroundColor` 校验。
- 已暴露并测试 `update(deltaSeconds)`。
- 未对未知 blend mode、未知动画、缺失资源做隐藏兜底。
- 未为了测试引入生产代码特殊分支。

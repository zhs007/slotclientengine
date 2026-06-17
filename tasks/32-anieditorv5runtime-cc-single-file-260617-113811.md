# anieditorv5runtime-cc single file 执行报告

## 1. 任务结论

已按 `tasks/32-anieditorv5runtime-cc-single-file.md` 执行。

本轮完成：

- 新增可复制单文件 runtime：`packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- 新增 Cocos Component 示例：`packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- 将 `packages/anieditorv5runtime-cc/src/core` 同步到当前 viewer 的 V5G layer animation 语义。
- 模块化 runtime 和 standalone runtime 都支持 layer animation 粒子采样与 fake Cocos 粒子 Sprite 渲染。
- 保持 fail-fast：缺失资源、SpriteFrame 尺寸不匹配、未知 animation/easing/blend mode、未确认 Cocos blend mode 都直接抛错。
- 新增 standalone 边界扫描、typecheck、parity、player 测试。
- 同步 4 个当前导出 fixture，并验证唯一资源路径数量为 28。

## 2. 新增和修改文件

新增：

- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/src/core/particle-sampler.ts`
- `packages/anieditorv5runtime-cc/tests/fakes/cc.ts`
- `packages/anieditorv5runtime-cc/tests/fixtures/bigwin.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/megawin.json`
- `packages/anieditorv5runtime-cc/tests/fixtures/superwin.json`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts`
- `packages/anieditorv5runtime-cc/tsconfig.standalone.json`

修改：

- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/eslint.config.cjs`
- `packages/anieditorv5runtime-cc/package.json`
- `packages/anieditorv5runtime-cc/src/cocos/player.ts`
- `packages/anieditorv5runtime-cc/src/core/animation-sampler.ts`
- `packages/anieditorv5runtime-cc/src/core/index.ts`
- `packages/anieditorv5runtime-cc/src/core/project-sampler.ts`
- `packages/anieditorv5runtime-cc/src/core/types.ts`
- `packages/anieditorv5runtime-cc/src/core/validation.ts`
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts`
- `packages/anieditorv5runtime-cc/tests/core/animation-sampler.test.ts`
- `packages/anieditorv5runtime-cc/tests/core/project-sampler.test.ts`
- `packages/anieditorv5runtime-cc/tests/core/validation.test.ts`
- `packages/anieditorv5runtime-cc/tsconfig.eslint.json`
- `packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts`
- `packages/anieditorv5runtime-cc/vitest.config.ts`

## 3. 核心实现说明

standalone runtime：

- 只从 `"cc"` import Cocos Creator API。
- 不包含相对 import、workspace import、`dist`/`src` 路径依赖、Node builtin、Pixi、DOM 全局或 Cocos decorator Component。
- 只接收宿主传入的 `V5GProjectConfig` 对象和 `asset.path` / `asset.id` 到 `SpriteFrame` 的 resolver。
- 不读取、不导入、不加载、不解析 `project.json`，也不调用 `resources.load()`。
- 导出 V5G 类型、校验函数、采样函数、粒子采样函数、坐标/opacity 工具、Cocos blend mode 工具、`createCocosNodeDriver()`、`V5GCocosPlayer` 和 `createV5GCocosPlayer()`。

Cocos player：

- `init()` 创建 `V5G Stage`、`V5G Background`、`V5G Content`、`V5G Particles`。
- 普通 image layer 放入 content root，粒子 Sprite 放入 particle root，particle root 位于 content root 上方。
- layer animation 粒子激活时，普通 image node 使用 `renderImageDisplay=false` 隐藏，粒子使用同一 `SpriteFrame` 创建。
- 粒子 rotation 从 viewer 采样出的 radian 转为 Cocos degree。
- 每次 `seek()` 清理上一帧粒子节点，再绘制当前帧粒子。
- `destroy()` 只销毁 runtime 创建的 stage，不销毁调用方传入的 root。

## 4. V5G 合同同步

已同步 viewer 当前支持的 animation type：

```text
move
fade
scale_up
scale_down
scale_in
scale_out
pop
shake
blink
rotate
slide_in
slide_out
bounce_in
pulse
float
swing
particles
particle_twinkle
```

通用 V5G 校验允许 `screen` / `multiply` / `lighten` 作为 V5G blend mode；Cocos runtime 只确认支持 `normal` / `add`。`validateCocosV5GProject()` 仍显式拒绝未确认的 Cocos blend mode，例如：

```text
Unsupported Cocos V5G blendMode: screen
```

顶层 `project.particles` 仍显式失败；当前支持的是 layer animation 中的 `particles` / `particle_twinkle`。

## 5. Fixture 和资源一致性

已从当前导出同步：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
```

到：

```text
packages/anieditorv5runtime-cc/tests/fixtures/
```

测试已验证：

- 4 个 fixture 都能被 `assertV5GProject()` 解析。
- 4 个 fixture 都能通过通用 `validateV5GProject()`。
- 每个 `project.assets[].path` 都对应 `docs/anieditor5/export/<asset.path>` 真实存在。
- 4 个 fixture 合计唯一 `asset.path` 数量为 28。
- `bigwin.json` 含 `screen`，通用 V5G 校验通过，Cocos runtime 校验按计划显式失败。

## 6. 验证命令和结果

package 级验证：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

结果：

- 全部通过。
- `test` 结果：10 个 test files，52 个 tests 全部通过。

根级验证：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
pnpm format:check
```

结果：

- `pnpm typecheck`：通过，18 个 package 成功。
- `pnpm lint`：通过，18 个 package 成功。
- `pnpm test`：通过，18 个 package 成功。
- `pnpm build`：通过，18 个 package 成功。
- `git diff --check`：通过。
- `pnpm format:check`：失败。失败摘要：`@slotclientengine/anieditorv5runtime-cc` 已通过；根级失败来自既有无关 `coverage/**`、`dist/**` 和 `apps/uiframeworksviewer` 源文件格式问题，例如 `coverage/base.css`、`dist/assets/*.js`、`apps/uiframeworksviewer/src/demo-game.ts`、`apps/uiframeworksviewer/src/mock-client.ts` 等。本任务未修改这些包，未顺手格式化无关文件。

## 7. Cocos Creator 3.8.6 编辑器验收

Cocos Creator 3.8.6 编辑器验收未执行，原因：当前执行环境未接入并打开真实 Cocos Creator 3.8.6 编辑器项目，也没有可绑定 `.meta`、场景节点和 SpriteFrame 的宿主测试工程。

本轮已完成替代的自动化验收：

- fake `"cc"` 直接 import standalone runtime。
- fake `"cc"` 运行 standalone 的真实 Cocos node driver 逻辑。
- `init()` / `seek()` / `play()` / `update()` / `pause()` / `restart()` / `destroy()` 行为测试。
- 背景层、content root、particle root、图层顺序、负 scale、opacity、blend mode、缺失 SpriteFrame、SpriteFrame 尺寸不匹配、粒子节点生成和清理测试。

README 未宣称真实 Cocos Creator 3.8.6 编辑器验收已经通过。

## 8. AGENTS.md / agents.md 同步

未更新 `AGENTS.md` / `agents.md`。

原因：本任务只新增 package 内 runtime、测试、示例、文档和验证脚本，没有改变仓库协作规则、目录规范、基础脚本约定或执行代理约定。

## 9. 二次检查

已二次检查：

- standalone runtime 边界由 `scripts/check-standalone.mjs` 扫描，确认只允许 `"cc"` import。
- `standalone/anieditorv5runtime-cc.ts` 不包含相对 import、workspace import、Pixi、Node builtin、DOM global、decorated Component、`JsonAsset` 或 `resources.load()`。
- `standalone/V5GPreview.example.ts` 是宿主侧示例，不是 runtime 必需入口。
- package `tsconfig.eslint.json`、`tsconfig.standalone.json`、`vitest.config.ts`、`eslint.config.cjs` 已覆盖新增源码和测试。
- package `.prettierignore` 已能排除 `coverage`、`dist`、`node_modules`；package 级 `format:check` 已通过。
- 没有更新根协作规则文件。

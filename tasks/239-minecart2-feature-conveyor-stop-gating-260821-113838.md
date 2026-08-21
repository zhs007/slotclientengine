# 239 minecart2-feature-conveyor-stop-gating 执行报告

UTC：2026-08-21T11:38:38Z

## 最终实现

- Minecart2 symbol win 只播放 symbol `win` state，移除了字体金额 RenderObject 及
  `winCarousel.amountText` 配置；award Popup 金额未改动。
- feature bar 改为显式待初始化：第一次 spin 不伪造五个 `normal`，响应后以 `curFeature` 作为当前玩法，
  临时绑定 `curFeature + features[0..3]` 并播放 variant 对应 `Start2`，随后提交完整 `features`。
- 普通 spin 在请求前冻结上一轮 `features[0]`；本轮响应的 `curFeature` 和新 `features[0]` 只校验/进入
  下一轮数据，不覆盖当前玩法。
- 横屏使用 `conveyor-1/conveyor-3`，竖屏使用 `conveyor-2/conveyor-3-2`；非 normal 在 conveyor
  Start 完成后播放 pickup `Topick → Loop`，再进入 Car/中央 Feature 流程。
- `round-adapter` 在 `area.spin.land()` 前等待 feature gate。中央 `Feature` 开始后通过 operation host
  clock 至少等待最终确认的 0.5 秒；普通轮不再等待约 1 秒的 authored Feature 动画结束，初始化轮仍等待
  整个快速初始化流程收敛。取消、失败和 destroy 会拒绝 waiter 并清理临时 attachment/owned object。
- node、resource、reel、layer 和 variant event 均使用 task 228 的 canonical `gamelayout:/` 地址。

## Shared package 同步

- 按用户执行阶段补充要求，把 slotclientengine 当前 `packages/logiccore` 与 `packages/rendercore` 同步到
  `/Users/zerro/gitee.com/piximinecart2/packages`。logiccore 原本已完全一致，因此没有产生 tracked diff；
  rendercore 已同步源码、测试和 README，并新增缺失的 `render-object-motion` 源码/测试。
- rendercore 当前实现依赖 editorresource 的精确 `keys` 解析接口；外部旧版在 build 时出现 TS2353，故按
  直接依赖链同步 `packages/editorresource`，未在 rendercore 内增加旧接口兼容或游戏专属分支。
- 排除 `node_modules/dist/coverage/.DS_Store` 后，logiccore、editorresource、rendercore 三个目录与主仓
  对应 package 的递归 parity 检查均无差异。
- 浏览器暴露同步后 responsive viewport 在高度约束时启动失败。根因是投影除法让 constrained axis 比
  authored focus 少一个浮点 ULP；已先在主仓 `unbounded-focused-viewport.ts` 把投影尺寸钳制到 focus 最小
  尺寸，补充 unbounded/responsive 两层回归测试，再同步到外部 rendercore。

## 主要修改文件

主仓：

- `tasks/239-minecart2-feature-conveyor-stop-gating.md`
- `packages/rendercore/src/viewport/unbounded-focused-viewport.ts`
- `packages/rendercore/tests/viewport/{unbounded-focused-viewport,responsive-art-viewport}.test.ts`
- 本执行报告

piximinecart2：

- `apps/minecart2/src/{feature-bar-conveyor,round-adapter,config}.ts`
- `apps/minecart2/config/game-runtime.manifest.json`
- `apps/minecart2/tests/{feature-bar-conveyor,feature-bar-resource,source-boundary}.test.ts`
- `apps/minecart2/README.md`
- `packages/rendercore/**`
- `packages/editorresource/**`

## 验收结果

- Minecart2 任务定向测试：3 files、13 tests 全部通过。
- Minecart2 package 全量测试：5 files、19 tests 全部通过。
- Minecart2 改动文件 ESLint：通过。
- Minecart2 production build（包含 logiccore/editorresource/rendercore 直接构建链）：通过。
- logiccore 与 editorresource typecheck：通过；主仓 rendercore typecheck：通过。
- 主仓 logiccore 全量测试：17 files、117 tests 通过；editorresource 全量测试：2 files、38 tests 通过。
- 本次同步实际变更的 rendercore 测试：20 files、241 tests 全部通过。
- viewport 浮点 containment 回归测试：2 files、12 tests 全部通过。
- app/计划 Prettier check、双仓 `git diff --check`、shared package parity：通过。

## 已知基线问题

- `pnpm --filter minecart2 typecheck` 在任务文件自身错误修正后，仍因外部仓库既有
  `packages/bridgecore`、`packages/device-detector` 的 NodeNext 相对 import 缺 `.js` 扩展而失败；这些 package
  不在本次用户指定同步范围，且 Minecart2 production build 已通过。
- 主仓 rendercore 全量测试共 984 项，969 项通过、15 项失败。失败只出现在本次同步差异未涉及的
  `configured-round-adapter.test.ts`、`manifest-upgrade.test.ts`、`symbol/package.test.ts`，原因分别是旧空
  `nodes` fixture 与旧 manifest version 期望；本次变更的 20 个测试文件已单独全部通过。
- 外部 rendercore/editorresource 的包含测试 typecheck/全量测试还会引用 piximinecart2 未复制的主仓根级
  `test-utils`、`assets/gamecfg` 和 editor app；因此 shared 测试在具备完整夹具的主仓执行。

## 待人工验收

- 按用户要求未代替执行浏览器验收。需要在真实横屏、竖屏分别确认金额数字已消失、pickup 对应关系、
  首次 Start2/`curFeature` 流程、普通轮上一份 `features[0]`、中央 Feature 开始约 0.5 秒后允许落停，
  并复验先前触发错误的窗口尺寸不再出现 focusRect containment 启动失败。

# 247 Minecart2 bg-botrigger BonusGame 转场执行报告

## 最终实现

- Minecart2 round compiler 直接使用既有 `GameLogic.hasComponent(0, "bg-botrigger")`；触发时在 immutable
  `SlotOperationPlanV2` 最后追加 `game003:bonus-transition` presentation operation，payload 为 exact
  `{ modeId: "BonusGame" }`。
- operation顺序为 `slot:spin -> game003:wins? -> game003:award? -> game003:bonus-transition`，因此现有
  coordinator会先等待symbol win首轮及完整award celebration，再进入BonusGame转场。
- Minecart2 registry新增exact handler，严格校验kind/effect/payload后依次await
  `prepareGameModeTransition("BonusGame")` 与 `requestGameMode("BonusGame")`；prepare期间operation被abort时不再发起request。
- Popup、目标mode assets gate、trusted gesture video unlock、video播放、mode commit和失败清理由RenderCore
  Game Layout transaction继续拥有。浏览器验收暴露其既有视频转场收尾生命周期缺陷后，已先在主仓修复rendercore，
  再把完整`packages/rendercore`同步到piximinecart2；logiccore没有修改。
- README已记录业务component、operation顺序和shared runtime边界。

## 实际修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-compiler.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-compiler.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-adapter.test.ts（新增）
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/source-boundary.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
/Users/zerro/gitee.com/piximinecart2/packages/rendercore/**（从主仓完整同步）
/Users/zerro/.codex/worktrees/49ac/slotclientengine/packages/rendercore/src/scene-layout/package-runtime.ts
/Users/zerro/.codex/worktrees/49ac/slotclientengine/packages/rendercore/tests/scene-layout/package-runtime-video.test.ts
```

本任务未编辑production assets、配置、lockfile或生成物。
执行期间`assets/minecart2`发生了并发外部更新：开始时未跟踪的是`03de…webp`与`e64…zip`，最终变为
`3756…webp`与`cb72…zip`，`delivery.manifest.json`也在同一时点更新；未擅自恢复、删除或覆盖这些用户/外部改动。
最终只读复核新`cb72…zip`后，`BaseGame -> BonusGame`的prelude、`video3.mp4`、BonusGame chunk及共享
`minecart2` Symbols binding仍符合本任务合同。

## 验收结果

- 通过：

  ```bash
  pnpm --filter minecart2 exec vitest run tests/round-compiler.test.ts tests/round-adapter.test.ts tests/source-boundary.test.ts
  # 3 files, 19 tests passed

  pnpm --filter minecart2 exec vite build
  # production build passed

  node node_modules/eslint/bin/eslint.js <本任务5个TS文件>
  node node_modules/prettier/bin/prettier.cjs --check <本任务TS/README文件>
  git -C /Users/zerro/gitee.com/piximinecart2 diff --check
  git diff --check
  ```

- Minecart2全量TypeScript检查仍被任务前已有诊断阻塞：

  ```bash
  pnpm --filter minecart2 exec tsc -p tsconfig.json --noEmit
  ```

  当前错误位于既有`tests/feature-bar-conveyor.test.ts` fake（Promise resolver类型与缺少`getChildLayer`）以及
  `packages/bridgecore`、`packages/device-detector`的NodeNext relative import extension；本任务新增/修改文件没有诊断。
  production build和定向Vitest均已通过，因此没有扩大任务范围修复这些基线问题。

- 浏览器人工验收：按用户要求待用户完成。重点确认`bg-botrigger + win/award`时先完整结束award，之后依次显示
  BonusGame prelude、等待assets、播放video并稳定进入BonusGame；无trigger时不出现转场。

## 浏览器验收跟进

- 用户首次打开页面时在round开始前失败：`Unknown Game Layout runtime address:
  gamelayout:/resource/spine/feature`。调用点是既有feature bar初始化，不是本任务新增的BonusGame operation。
- 只读对比确认当前`assets/minecart2/chunks/initial-ac1b5c09.cb726e….zip`以及其源包
  `/Users/zerro/Downloads/minecart2/layout29.zip`都缺少`runtimeResources.feature`、对应on-demand allocation和
  `feature.json / specialfeature.atlas / specialfeature.png`闭包；Git中上一版`ddb461….zip`和
  `/Users/zerro/Downloads/minecart2/layout26.zip`均包含完整声明。
- 原始资源仍存在于`/Users/zerro/Downloads/minecart2/矿车功能特效/{Feature.json,SpecialFeature.atlas,
  SpecialFeature.png}`。修复应在Game Layout Editor导入最新`layout29.zip`后重新导入这组Spine资源，在资源页以
  exact程序键`feature`点击“设为程序资源”，重新正式导出并经`gamelayoutpkgcli --delivery-dir --quality 80`
  生成交付目录。不得在app吞掉unknown address，也不得用整个`layout26`覆盖`layout29`的其它美术更新。
- 在修复资源导出并替换delivery之前，页面无法进入首轮；当时task 247的浏览器转场验收被输入资源包阻塞。
- 用户随后以`initial-ac1b5c09.760e….zip`恢复了`feature`完整闭包，转场已进入video completion；此时暴露
  `completeActiveTransition()`先销毁player、再经committed geometry refresh调用其`applyViewport()`的共享生命周期错误。
- RenderCore现改为先完成最后一次committed geometry refresh，再销毁player。测试fake同步采用真实播放器的strict
  destroyed contract，确保旧顺序会稳定复现、新顺序完成后request resolve且mode稳定提交。
- 修复后验证：RenderCore video定向测试4/4、正式源码build tsconfig、修改文件ESLint、Minecart2定向测试19/19、
  Minecart2 production build和双仓RenderCore目录parity均通过。完整RenderCore测试型typecheck仍被piximinecart2未同步的
  仓库级fixture路径阻塞，正式源码`tsconfig.build.json --noEmit`无诊断。

## 计划偏差与剩余风险

- adapter测试通过app-internal handler seam验证prepare/request严格顺序、完整Promise等待、prepare/request失败传播、
  abort后不request和非法payload；award happens-after由compiler operation顺序与既有coordinator串行合同共同证明，
  未为private registry复制一套测试装配。
- 当前delivery替换尚未提交且执行期间发生过并发更新，浏览器复验必须使用最终manifest指向的`760e…` initial
  chunk，不能混用任务开始时或已经删除的旧chunk。
- BonusGame进入后的后续round及返回BaseGame不属于任务247。

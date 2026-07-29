# 134 gamelayouteditor VNI / Spine 动画图层执行报告

## 结论

任务 134 的实现与自动化验收已完成。Game Layout Editor 现在支持把 VNI runtime
export bundle 和 official Spine 4.3 资源分别导入统一资源库，再独立创建或重绑普通
动画图层，配置图层顺序、坐标、缩放、各横竖屏 variant 是否显示，以及循环或单次播放。

真实浏览器人工验收按用户要求由用户执行，本报告不把该项标记为已完成。

## 实现结果

- VNI bundle 只接受 `manifest.json` 声明且通过 vnicore 严格校验的 runtime profile；
  唯一 runtime 自动选择，多个 runtime 必须显式选择。
- VNI 和 Spine 导入只创建资源，不自动创建、绑定或替换图层；同一资源可绑定多个独立
  node。
- 普通 Spine 图层支持大小写精确的 animation 和 `loop:boolean`；VNI 图层支持完整
  timeline 的 `loop:boolean`。
- 普通图层继续复用 order、per-variant visibility、`x/y/scale` 和坐标原点切换。
- VNI 不可作为 adaptation 或 game-mode 背景；非 state-machine Spine 背景仍必须
  `loop:true`，现有 Spine/MP4 转场合同未改变。
- rendercore 为每个 VNI node 创建独立 manual-tick player，只在 node renderable 时
  update，并在 geometry 更新时保留 player，在销毁时释放 player 与 object URL。
- layout ZIP、CDN/package loader 和 gamelayoutpkgcli optimizer 均按 typed VNI
  project 收集、校验并重写精确传递资源闭包，不扫描任意 JSON。
- README、scene-layout manifest 文档和 scene-layout 领域规则已同步。

## 自动化验收

通过：

- `pnpm typecheck`：35/35 workspace tasks。
- `pnpm build`：35/35 workspace tasks。
- `pnpm format:check`：35/35 workspace tasks。
- `@slotclientengine/rendercore`：73 files、571 tests，branch coverage 80.03%。
- `gamelayouteditor`：21 files、158 tests。
- `gamelayoutpkgcli`：6 files、17 tests。
- rendercore、gamelayouteditor、gamelayoutpkgcli 定向 typecheck 与 lint。
- `pnpm install --frozen-lockfile`；lockfile importer 与 package manifest 一致。
- `git diff --check`。

整仓基线/环境失败：

- `pnpm lint` 被 `apps/symbolseditor/scripts/build-task131-symbols.ts` 和
  `build-task132-symbols.ts` 阻断：两个既有脚本未包含在该包
  `parserOptions.project` 指向的 TypeScript project 中。本任务目标包 lint 均通过。
- `pnpm test` 中本任务目标链路全部通过；`packages/netcore/tests/main-adv.test.ts`
  的 7 个既有网络测试分别在 10 秒超时，随后进程未自然退出，因此终止整仓命令。
  本任务未修改 netcore。

## 计划偏差

- VNI bundle 导入逻辑清晰地并入现有 `resource-commands.ts`，没有新增计划中可选的
  `imported-vni-resource.ts` 碎片模块。
- 为恢复 rendercore 的全局 branch coverage 门槛，补充了 VNI direct/mapped package、
  CDN、错误 profile、重复 project 去重、默认 player 和 origin fast-path 测试。
- 真实浏览器人工验收由用户执行；自动化 UI、ZIP 和 runtime 测试已完成。

## Git 与工作区

- 分支：`codex/task-134-gamelayouteditor-vni-spine-animation-layers`
- 基线 HEAD：`b79c5de35db64137560bfff67d8e85bfc93f1c9f`
- 当前改动未暂存、未提交。
- 未执行 reset、stash、clean 或其它破坏性操作。
- `pnpm-lock.yaml` 只为 `apps/gamelayouteditor` 新增
  `@slotclientengine/vnicore` workspace importer。

## 用户浏览器验收建议

1. 分别导入一个 VNI runtime bundle ZIP 和一套 official Spine 4.3
   skeleton/atlas/textures，确认只进入资源库。
2. 各创建一个普通图层，调整 order、横竖屏显示、`x/y/scale`，切换分辨率和坐标
   原点，确认位置不跳变。
3. 分别验证 VNI loop/once 和 Spine 指定 animation 的 loop/once；确认 once 不自动
   重播，背景仍不能关闭 loop。
4. 导出 ZIP、重新导入，再用 gamelayoutpkgcli 优化；确认 node id、播放配置、VNI
   profile 和图片内容保持，且无 missing/orphan。

# Task 227 Game Layout Editor 音频资产工作流执行报告

UTC：2026-08-19T04:59:27Z

## 最终实现

- 音频成为 `EditorLayoutResource` 的一等 `audio` kind，与其它资源共用扁平 filename-key、
  `project.assets` bytes ownership、批量 prepare/commit、替换、引用检查和删除 GC。
- 统一“导入资源 / ZIP”入口支持 MP3、OGG、WAV、M4A、AAC 与 WebM；导入时严格检查扩展名、
  signature 和显式 audio MIME。`.mp4` 继续只作为视频，音频使用 `.m4a`。
- 新导入音频保持未绑定，不自动创建 node、BGM、effect 或 programmatic allowlist。Audio 不进入
  scene Resource Picker，也不能绑定为普通图层、背景、转场或通用 `runtimeResources`。
- Layout inspector 为当前 exact mode 提供 Audio asset BGM 选择和 fade in/out；新 music binding 固定
  `loop: true`，清除或改绑后只回收已无 mode 引用的 music binding。
- Assets 行支持为同一 audio asset 添加一个或多个 strict local programmatic effect name，并通过
  production runtime 试听、停止或取消。默认 effect 参数沿用 audiocore editor 合同。
- Manifest projection 只写实际被 mode 引用的 music 和 root programmatic allowlist 引用的 effect；
  ZIP 重导入会从 typed source 恢复 audio resource、media type、exact 名字和 mode BGM。缺 bytes、
  dangling source 或 media type 不一致显式失败。
- Production ZIP 导出器补齐 audio media type 路由；BGM/effect 的 exact audio payload 进入
  content-addressed map/ZIP，未绑定 audio asset 留在 authoring workspace 但不进入交付闭包。
- Preview toolbar 新增“启用声音”，直接调用 Scene Layout package runtime `unlockAudio()`；会话解锁后
  preview rebuild 会解锁新 runtime，mode 选择、production transition 和 effect 仍只走公开 runtime。
- `gamelayoutpkgcli` 现有 typed collector、结构化 path/media-type rewrite、AAC-LC/M4A optimizer 和
  `audio:scene-layout` 分组已经兼容 editor 新产物，因此未增加第二套 CLI 实现；以既有端到端测试复验。
- 更新 Game Layout Editor README 与 Scene Layout / Editor artifact 长期规则。未修改 schema version、
  RenderCore runtime、CLI production code、production assets、root package 或 lockfile。

## 关键决策与偏差

- Task 223/225 已提供 Scene Layout v4 audio contract、runtime 和 CLI 后处理；本任务只重构 editor
  authoring/closure，并用回归测试证明复用链路，不重复升级 schema 或复制音频状态机。
- 原计划预计可能新增 RenderCore runtime 测试；本次没有修改 runtime production code，改为运行
  audiocore runtime 定向测试，并在 LayoutPreview 测试中覆盖公开 unlock API 和 rebuild 会话保持。
  真实场景切歌由用户按约定做浏览器验收。
- 全量编辑器测试暴露的是仓库 production fixture 缺 key：Crave 缺
  `symbol-state-textures.manifest.json`、Minecart2 缺 `gameconfig.json`。这两个失败与本任务音频改动无关，
  未修改生产美术 map 掩盖基线问题。
- worktree 初始缺 `node_modules`，使用 Node 24.14.0 与 frozen lockfile 恢复已有依赖；
  `pnpm-lock.yaml` 未变化。

## 自动化验收

- `pnpm --filter gamelayouteditor typecheck`：通过。
- `pnpm --filter gamelayouteditor lint`：通过。
- `pnpm --filter gamelayouteditor build`：通过；Vite 仅报告既有 dynamic-import/chunk-size warning。
- `pnpm --filter gamelayouteditor exec vitest run --exclude tests/production-reel-preview.test.ts`：
  24 files / 198 tests 通过。
- 新增 `audio-assets.test.ts`：覆盖未绑定导入、签名/MIME 原子失败、mode loop BGM、fade、程序名、
  删除保护、解绑 GC、canonical manifest、mapped ZIP payload、未绑定剪枝和 manifest round-trip。
- `layout-preview.test.ts`：新增显式声音解锁与 preview rebuild 保持；相关 17 tests 通过。
- `pnpm --filter @slotclientengine/audiocore exec vitest run tests/audio-runtime.test.ts tests/audio-editor.test.ts tests/audio-data.test.ts`：
  3 files / 8 tests 通过。
- `pnpm --filter gamelayoutpkgcli exec vitest run tests/package-flow.test.ts tests/asset-groups.test.ts tests/reference-rewriter.test.ts`：
  3 files / 18 tests 通过，覆盖 typed root audio 转码改写和独立 audio group。
- 未排除的编辑器全量 `vitest run`：24 files / 199 tests 通过，
  `production-reel-preview.test.ts` 2 tests 因上述缺失 production fixture key 失败。
- Prettier 已写入全部本任务文件；`git diff --check`：通过。

## 浏览器验收交接

用户负责真实浏览器验收，建议最小流程：

1. 在 Assets 一次导入 BGM 与 effect，确认二者仅出现为 Audio asset，未自动绑定或进入导出闭包。
2. 在 Layout 分别为两个 mode 选择不同 BGM，确认显示固定 loop，并可编辑 fade in/out；另一个 mode
   选择“无 BGM”。
3. 点击“启用声音”，先验证 initial BGM，再用 authoring mode 选择和 production transition 往返切换，
   确认异曲切换、同曲不重启、无 BGM 静音以及失败 transition 不提前切歌。
4. 在 Audio asset 行添加程序名，试听/停止后取消；确认非法名、重复占用名和删除被引用 asset 都明确失败。
5. 导出 ZIP 后重新打开，确认 audio resources、mode BGM、fade 和程序名保留；确认未绑定音频不在 map。
6. 将 ZIP 交给 `gamelayoutpkgcli`，用真实 FFmpeg/FFprobe 检查 M4A/AAC-LC 输出、typed 引用与
   `audio:scene-layout` group，并试听 BGM loop 接缝。

## 剩余风险

- 自动化使用最小合法 signature bytes 和 fake runtime，不能替代目标浏览器 codec、自动播放策略、
  音量、crossfade 听感与 AAC encoder padding 的真实听觉验收。
- production reel fixture 的两个缺 key 基线失败仍存在；其修复涉及任务范围外的 production asset map，
  应由对应资产任务处理。

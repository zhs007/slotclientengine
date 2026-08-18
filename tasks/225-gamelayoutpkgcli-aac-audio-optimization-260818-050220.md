# Task 225 gamelayoutpkgcli AAC 音频优化执行报告

UTC：2026-08-18T05:02:20Z

## 最终实现

- `gamelayoutpkgcli` 新增 typed audio asset collector，唯一遍历 Scene Layout v4、Symbol v3 与 Popup v7
  binding；同一路径的 BGM 优先使用 music 策略，manifest/assets map media type 冲突显式失败。
- 新增 FFmpeg/FFprobe runner：要求恰好一条纯 audio stream，非合规资源转为 M4A/AAC-LC；不传
  `-ac` / `-ar`，输出复验声道数与采样率保持。BGM 默认 128 kbps，mono effect 64 kbps，其它
  effect 96 kbps。
- 固定单一 AAC codec 后，每个 binding 必须恰好一个 source；合法但包含多格式 fallback 的输入显式
  失败，不猜首项也不把多个 authored source 静默合并成一个 media type。
- `.m4a` + `audio/mp4` + AAC-LC 且 probe 码率不超过目标 105% 的资源原样保留，避免重复运行 CLI
  造成二次有损；其余 WAV/MP3/OGG/AAC/WebM/M4A 输入由 exact typed reference 驱动转码。
- CLI 新增 `--ffmpeg`、`--ffprobe`、`--bgm-bitrate`、`--effect-mono-bitrate`、
  `--effect-stereo-bitrate`；码率只接受 8..512 整数 kbps。
- root、nested Symbol 与 Popup audio source 的 path 和 media type 在同一结构化 rewrite 中同步改为
  `.m4a` / `audio/mp4`；重新生成 content-addressed payload、assets map，并用 production parser 复验。
- 外置 `scene-layout-asset-groups` 新输出升为 v2，记录 AAC codec/container、三类码率、exact
  FFmpeg/FFprobe version、转换数量与音频输入输出 bytes；parser 继续显式支持历史 v1。音频仍只进入
  `audio:scene-layout`，不进入 `initialAssets`。
- 更新 CLI README 与 Scene Layout 长期优化规则；未修改 audiocore/domain schema、runtime、Editor、
  production assets、root package 或 lockfile。

## 关键决策与偏差

- 讨论中的“全部使用 AAC”落实为固定 production codec，而不是无条件重编码已经合规的 AAC-LC/M4A；
  这是避免累计有损并保证重复运行幂等的必要收紧。
- 本机 FFmpeg 9.0.1 对 128 kbps 请求的短测试音频报告 129936 bps，因此合规上限使用目标的 105%；
  codec/profile/container、声道与采样率仍严格匹配。
- 原计划文件范围中的 nested audio rewrite 测试并入既有 reference/package-flow 测试，没有新增独立
  nested collector 测试文件；核心 collector、optimizer 和 end-to-end package flow 均有直接覆盖。
- worktree 初始缺 `node_modules`，按 frozen lockfile 恢复 251 个已有依赖；没有改变 `pnpm-lock.yaml`。

## 自动化验收

- `pnpm --filter gamelayoutpkgcli typecheck`：通过。
- `pnpm --filter gamelayoutpkgcli lint`：通过。
- `pnpm --filter gamelayoutpkgcli test`：通过；最后增加 multi-source strict case 后再次完整 coverage run，
  最终为 7 files / 34 tests 通过。
- `pnpm --filter gamelayoutpkgcli build`：通过。
- `pnpm --filter gamelayoutpkgcli format:check`：通过。
- task/领域文档 Prettier check：通过。
- `git diff --check`：通过。
- 本机真实 codec smoke：FFmpeg/FFprobe 9.0.1 将 48 kHz stereo PCM WAV 转成 M4A，probe 为
  `codec_name=aac`、`profile=LC`、`channels=2`、`sample_rate=48000`；`cwebp` 1.6.0 可用。
- 相同 WAV、FFmpeg 版本与参数连续编码两次得到 byte-equal M4A，SHA-256 均为
  `af1135dd81db0a12bcc0d048b328ac2118c98bd24903be52fc23c9bdaae0546a`。

## 人工验收与剩余风险

- 仓库没有 production 音频素材，未验证真实 BGM loop 接缝、听感与实际压缩比例。需要用正式
  WAV/MP3/OGG/M4A package 在目标浏览器试听 BGM loop、Popup/Symbol effect，并对比 ZIP/音频体积。
- AAC encoder padding 可能让少数无缝循环素材产生接缝；CLI 不伪造 loop metadata 或静默改用其它 codec。
- 自动化验证了 FFmpeg transaction、strict failure、结构化 rewrite、重建与 rollback；真实目标浏览器
  decoder/听觉验收不能由 fake runner 或命令行 probe 替代。

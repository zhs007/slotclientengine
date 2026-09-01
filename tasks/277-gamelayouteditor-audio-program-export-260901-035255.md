# 277 Game Layout Editor audio 程序导出执行报告

## 结果

任务已实现。Game Layout Editor 的顶层 audio asset 现在可与其它 asset 一样绑定唯一程序键，并以
`{ kind: "audio", path, mediaType }` 进入 canonical v7 `runtimeResources` 和 production closure。游戏程序通过
`SceneLayoutPackageResource.loadRuntimeResource(key, "audio")` 取得 package-owned URL 与 exact media type。

音频行为边界未改变：Event dialog 仍是配置 music/effect、once/loop、bus 和 focus 的唯一入口；program audio
不创建 scene node、RenderObject、播放实例或 `gamelayout:/resource/audio/...` 地址。legacy audio catalog、mode BGM
和 `eventAudio.ignoreLegacyAudio=true` 的 canonical 合同保持不变。

## 实现摘要

- RenderCore 新增 strict audio runtime-resource spec、asset closure、eager/lazy URL prepare、exact kind 检查、Event URL 复用与
  destroy 撤销；运行地址和 RenderObject factory 显式排除 audio。
- Editor 移除 audio 程序绑定禁令，补齐 Assets 操作/状态提示、manifest/ZIP 导出重导、preview pruning 和
  legacy migration GC。同一 root 可同时由 Event 和一个程序键拥有，任一 owner 存在时 bytes 都不会被提前回收。
- package CLI 将 audio runtime root 纳入 runtime-resource group 和 typed reference rewrite。纯 program audio 不猜 music/effect
  role，legacy optimized ZIP 保留原 bytes；与 Event 共用时沿用已知 role 转 AAC，并把 runtime/Event path 与
  media type 一致改写。CDN delivery 继续作为 byte-preserving external media。
- Gameframeworks 导出新 public spec type；Editor、RenderCore、CLI README 及三份领域规则已同步。

## 验收

自动验收全部通过：

- 四目标 package 定向 typecheck：RenderCore、Game Layout Editor、Game Layout package CLI、Gameframeworks。
- RenderCore 定向测试：4 files / 32 tests passed。
- Game Layout Editor 定向测试：3 files / 36 tests passed。
- Game Layout package CLI 定向测试：5 files / 30 tests passed。
- `gamelayouteditor` production build passed。
- `git diff --check` passed。

未执行真实浏览器验收；用户已明确由其自行验收。建议按计划的 WAV/OGG/M4A、program-only、
Event + program 双 owner、导出重导和取消两种 owner 顺序进行。

## 环境与偏差

- UTC：2026-09-01T03:52:55Z；HEAD：`d0d7eb8c606368b7f6b7d5b54a81ea6f4c3d97c7`（detached HEAD）。
- 工作区初始只有本任务计划文件，未覆盖用户其它改动。
- 仓库当前 `pnpm-lock.yaml` 存在既有 missing-dependency 错误，`--frozen-lockfile` 无法安装。本次使用 Node 24.19.0
  和 `pnpm install --lockfile=false` 准备验收环境，未修改 package manifest 或 lockfile。
- 未新增依赖、未修改生成物/YAML，也未执行与任务无关的整仓验收。

## 剩余风险

真实浏览器对 AAC/WebM/M4A 的 codec 支持和 Object URL 失效行为仍需人工验收。外部 consumer 若要读取含
audio runtime kind 的新导出物，需同步升级到本次 RenderCore public contract。

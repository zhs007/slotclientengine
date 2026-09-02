# 282 Game Layout 程序音效播放执行报告

## 结果

任务已实现。Scene Layout package resource 现在把全部 audio `runtimeResources` 程序键与历史
`audio.programmaticEffects` 合并为 `programmaticAudioEffects`；程序键同时派生
`gamelayout:/audio/effect/<key>` endpoint。若程序键与任一聚合历史 effect route 冲突，package prepare 在 runtime 创建前显式失败。

`SceneLayoutPackageRuntime.playEffect(route, options?)` 与 audio-effect endpoint 共享
`SceneLayoutAudioEffectPlayOptions`：程序 audio 默认 once，历史 effect 省略 `loop` 时保持 authored playback，显式 boolean
按次覆盖。effective loop 可绑定 exact `endEvent`，也可由返回的 `AudioPlaybackHandle.stop()` 精确停止；
`stopEffect(route)` 继续停止该 route 的全部 pending/active voice。

## 实现摘要

- AudioCore 增加按次 loop override 与 package-owned deferred source seam。lazy source 受理后立即返回 pending handle；
  manual/route/destroy stop 后 late resolve 不起播，source/backend 失败落在同一 handle 的 `failed/error`。同 route 只去重 loop，
  once 与 loop 可按 voice policy 共存。
- RenderCore 从唯一 audio runtime-resource binding 编译 effect route，使用共享 lazy loader取得 package-owned URL，并由
  AudioCore 统一拥有 sound/voice。Scene Layout address manager 拥有 loop 的可选 Event subscription；等价重复调用复用 handle，
  live loop 的不同结束 Event 显式失败，terminal/destroy 时释放 listener。
- Game Layout Editor 仍只保存 `{ kind, path, mediaType }`，不恢复 legacy audio authoring表；Assets 详情现在显示 canonical
  audio-effect 地址、once/loop/endEvent 与 handle stop 提示。canonical v7 legacy audio catalog继续为空，
  `eventAudio.ignoreLegacyAudio=true`。
- package CLI 将 program-only audio 明确归为 effect role并执行既有 AAC策略；同 path 被 Event music使用时保持music优先，
  typed reference原子改写，delivery仍保持输入bytes/container。
- Gameframeworks re-export 新 options type；AudioCore、RenderCore、Gameframeworks、Editor、CLI README、两份长期文档与三份领域规则已同步。

## 验收

自动验收全部通过：

- 五目标定向 typecheck：AudioCore、RenderCore、Gameframeworks、Game Layout Editor、Game Layout package CLI。
- AudioCore 定向测试：1 file / 14 tests passed。
- RenderCore 定向测试：3 files / 46 tests passed。
- Game Layout Editor 定向测试：1 file / 6 tests passed。
- Game Layout package CLI 定向测试：3 files / 20 tests passed。
- Gameframeworks facade 导出测试：1 file / 3 tests passed。
- AudioCore、RenderCore、Gameframeworks public build passed。
- `git diff --check` passed。

测试覆盖 route union/collision、legacy与程序audio默认/override、同route once + loop、等价loop去重、冲突Event、
Event只停止exact handle、manual/route stop、lazy stop-before-resolve、deferred failure、Editor ZIP round-trip、legacy catalog不回填、
CLI effect bitrate与typed reference rewrite。

未执行真实浏览器/听觉验收；用户已明确由其自行验收。建议按计划验证默认once、loop、loop + Event、handle/route stop、
delivery lazy资源提前stop及真实codec/autoplay行为。

## 环境与偏差

- UTC：2026-09-01T07:28:48Z；HEAD：`2dd2c07125d7ab8d3e20b1d255ec2c6c69d1045b`（detached HEAD）。
- 使用 Node.js `v24.14.0`、pnpm `10.0.0`。
- 工作区初始只有本任务计划文件，未覆盖用户其它改动。
- 仓库当前 `pnpm-lock.yaml` 存在既有 missing-dependency 错误，`CI=true pnpm install --frozen-lockfile` 无法安装；
  本次按仓库约定代理使用 `CI=true pnpm install --lockfile=false` 准备验收环境，未修改 package manifest 或 lockfile。
- 计划建议新增独立 `program-audio-playback.test.ts`；实际复用现有 `package-runtime.test.ts`，以便使用真实 address manager、
  viewport Event 和既有 fake audio backend。另补跑了 Gameframeworks exports 定向测试。
- build/typecheck 仅出现既有 Vite `configLoader: native` / `__dirname` 预告警告，不影响验收结果。
- 未新增依赖、未修改schema版本、生成物、YAML、正式assets或生产游戏consumer，也未执行无关整仓验收。

## 剩余风险

fake backend不能替代浏览器真实audio解码、autoplay解锁、后台切换与听觉连续性。CDN external URL复用与lazy owner走同一
runtime-resource/deferred source链路，但仍需按用户负责的浏览器验收确认目标部署环境的CORS、codec与Event实际时序。

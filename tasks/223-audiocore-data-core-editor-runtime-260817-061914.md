# 223 audiocore-data-core-editor-runtime 执行报告

UTC：2026-08-17T06:19:14Z

## 最终实现

- 新增 `@slotclientengine/audiocore`，按 `data → core → editor` 分层；锁定 `@pixi/sound` 6.0.1。data 提供 strict audio v1 parser/reference rewrite，core 提供 host-clock cue、once/loop、voice bound、BGM crossfade/focus、mute/volume/unlock 与 owner-scoped destroy，editor 提供共享导入、effect draft 和试听包装。
- Popup 升级为 v7，Symbol 升级为 v3，Scene Layout 升级为 v4。旧版本由默认 loader 迁移为空音频合同；未知字段、资源、route、target 和未来版本继续显式失败。
- Popup/Symbol 只保存 local effect name 和语义 cue；Scene Layout 组合时按 binding id 生成 `<binding>.<local>` route。程序播放/停止只接受 `programmaticEffects` allowlist。
- Scene Layout mode 拥有 optional loop BGM；成功 mode commit 后才切换，相同 BGM 不重启，不同 BGM 线性渐隐/渐现。音频在浏览器 unlock 前不自动启动。
- Game Layout、Popup、Symbols 三个 Editor 接入相同 effect 配置与 production audio runtime。Game Layout 支持按 mode 选择 BGM、程序 effect 试听/停止；Symbols 保持全 symbol 画面预览并增加 preview-only 单发声 symbol 选择。
- `gamelayoutpkgcli` 结构化改写 root/nested audio reference，输出独立 `audio:scene-layout` group，并从 `initialAssets` 排除全部实际引用音频。
- `gameframeworks` 暴露音频 handle/type；game002v2、game003v2 在 spin trusted gesture 解锁音频，并将 framework mute 状态传给 Scene Layout runtime。
- 更新长期规则、三个 Editor/RenderCore README 与 `docs/audiocore.md`。外部 Crave 游戏未直接修改，手动步骤写入 `docs/crave/task-223-external-audio-migration.md`；仓库 `assets/crave` 未改动。
- 后续按验收反馈调整 authoring：Popup 的每个 tier/segment、Symbols 的每个 Symbol/state 均在状态内部维护多条独立音效卡片；项目级页面不再承担 effect/cue 绑定。Symbols preview 与 game runtime 同步改为播放同状态全部 cues。

## 关键决策与计划偏差

- npm 官方页面显示 `@pixi/sound` 当前 latest 为 6.0.1，且 v6 对应 PixiJS v8，因此使用精确版本 6.0.1。
- “不等待 loading”实现为 typed audio group 不进入 `initialAssets`，不声称所有浏览器/格式一定 network streaming；WebAudio 仍可能完整下载并解码。
- 用户澄清 Crave 是仓库外游戏源码后，交付改为外部迁移文档，没有修改同名仓库资产目录。
- 为保证 autoplay 合同，BGM 直到真实 `unlockAudio()` 成功后才开始；加载/解码错误由下一次 runtime update 显式抛出。

## 自动化验收

- `@slotclientengine/audiocore`：typecheck、lint、4 个 test files / 9 tests、benchmark 通过；benchmark 1,000,000 次最小 hot-path 循环约 1.14 ms（仅用于回归基线，不是设备性能承诺）。
- `rendercore`：typecheck 通过；定向 Scene Layout manifest/runtime、Popup 与 Symbol 合同 4 files / 137 tests 通过，其中 package runtime 为 15 tests。
- `popupeditor`：typecheck、lint；2 files / 21 tests 通过。
- `gamelayouteditor`：typecheck、lint；3 files / 42 tests 通过。
- `gamelayoutpkgcli`：typecheck、lint；audio group/reference rewrite 2 files / 12 tests 通过。
- `symbolseditor`：typecheck、lint；30 个不依赖缺失 production fixture 的测试通过。另 9 个既有测试因仓库 `assets/crave` 缺少 `h1.webp`、`cn_1.json`、`symbol-state-textures.manifest.json` 等 fixture 失败，均在读取 fixture 时失败，未进入本任务代码。
- `gameframeworks`、`game002v2`、`game003v2` 直接 TypeScript consumer 检查通过。
- Popup、Symbols、Game Layout、CLI 的格式检查和 `git diff --check` 在收尾执行。

已知基线检查：`rendercore` 全 package lint 仍报告既有私有字段 `#catalog` 只写未读；本任务未新增或修改该字段，没有扩大范围清理。

## 人工验收

按用户要求，浏览器听觉、Network、Memory 与真实 autoplay 手势验收留给用户。重点检查：

1. mode BGM optional/loop/crossfade，同曲不重启，Splash 留空时无 BGM；
2. Popup/Symbol delay、loop stop、duck/pause 恢复和 Symbols 单发声选择；
3. 首屏 loading 不请求/解码音频，destroy 后无残余声音、Object URL 或晚到播放。

## 剩余风险

- 仓库没有 production 音频素材，本次自动化使用 fake backend/最小签名 bytes，真实浏览器 decoder、Safari autoplay 与长音频内存需要上述人工验收。
- 外部 Crave 源码不在当前 workspace，迁移文档需要用户在外部项目手动执行。

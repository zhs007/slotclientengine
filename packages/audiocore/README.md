# @slotclientengine/audiocore

音频能力按职责拆成三个显式入口：

- `@slotclientengine/audiocore/data`：versioned BGM/effect/cue 数据、严格解析、引用收集/改写和 Game Layout route 编译。
- `@slotclientengine/audiocore/core`：game runtime；使用宿主 ticker 驱动延迟、渐变和 focus，不创建 Pixi Application、RAF 或全局 alias。
- `@slotclientengine/audiocore/editor`：统一音效字段、导入识别和复用 core 的试听 session。

Popup/Symbol package 只保存 local effect name。Game Layout 绑定 package 后才把 binding path 与 local name 编译为全局 route，例如 `award.coin`。游戏只通过编译后的 `playEffect(route)` / `stopEffect(route)` 使用音效。

BGM 对每个 mode 都是可选的；已配置的 BGM 始终 loop，切 mode 使用绑定声明的渐隐/渐现。音频不加入 splash/loading 进度 gate，是否按需准备由对应 mode/animation owner 决定。

通用 `AudioEventTrackBindingV1` 只声明现有 audio asset、`music | effect` 音量分类、`once | loop`、voice policy 与 once focus；触发 event 和 loop 结束 event 由 Scene Layout 等 owner 保存。`playTrack()` / `stopTrack()` 不产生新的业务 lifecycle event。

once focus 可以同时降低 BGM 与一种音效范围（`same-audio` 或 `all`）。每个 active owner 持有独立 lease，owner 自身排除，重叠 lease 取最小 target gain；结束、停止和 destroy 后重新计算，不覆盖玩家设置的 music/effect volume。music 与 effect 始终走各自独立 volume bus。

`AudioRuntime.observeMusic()` 只在 loop instance 成功启动后发布 `started`，在 fade-out 到零并 stop 后发布
`stopped`；Scene Layout 将该实例生命周期映射为 `gamelayout:/audio/music/...` 与 mode BGM event 地址。

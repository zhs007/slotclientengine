# Audio runtime and authoring

`@slotclientengine/audiocore` 为游戏音乐和音效提供三层入口：

- `@slotclientengine/audiocore/data`：严格、可版本化的数据合同和资源引用改写。
- `@slotclientengine/audiocore/core`：由宿主 ticker 驱动的高性能 runtime，以及 `@pixi/sound` backend。
- `@slotclientengine/audiocore/editor`：三个编辑器共用的导入、配置和试听包装。

core 不创建 ticker、RAF、canvas 或全局 sound registry。宿主逐帧调用 `update(deltaSeconds)`，并在真实用户手势中调用 `unlockAudio()`。每个 runtime 只销毁自己创建的声音、pending cue 和 Object URL，不调用全局 `removeAll()`，也不关闭共享 AudioContext。

## 数据与命名

BGM 和 effect 是两套配置。Scene Layout v4 根音频目录同时保存 music asset、Layout 自有 effect 与 `programmaticEffects` allowlist；每个 mode 可不配置 BGM。已配置的 BGM 恒 loop，并用该 mode 的 `fadeOutSeconds`、`fadeInSeconds` 在成功 mode commit 后 crossfade。Splash 一般不配 BGM，但 schema 不禁止。

Scene Layout v5 另外使用 AudioCore 的通用 event track。track 只描述 audio asset、`music | effect` 分类、`once | loop` 播放、voice policy 与 once focus，不拥有 Scene Layout event。Scene Layout 把 canonical 开始 event 和 loop 结束 event 绑定到 track；旧 v1–v4 会升级为空 binding 且 `ignoreLegacyAudio: false`。

once focus 可独立降低 BGM，并在同 audio 与全部音效中选择一个范围；两类可同时启用，target gain 为 `0..1`。runtime 用 per-voice lease 组合，owner 自身不降低，重叠取最小 gain，lease 释放后恢复当前总线音量。`music` 与 `effect` 只是两条独立玩家音量总线；AudioCore 不据此猜测切歌或互斥播放。

Popup v7 与 Symbol v3 只保存 package-local effect name 和 cue。例如 Popup 内配置 `coin`，当它在 Scene Layout 中以 `award` 绑定时，才生成 `award.coin`。nested editor 不保存或猜测全局前缀。代码只可通过 Scene Layout runtime 播放 allowlist 中的全局 route：

```ts
await runtime.unlockAudio();
const handle = runtime.playEffect("award.coin");
runtime.stopEffect("award.coin");
```

`stopEffect()` 会同时取消相同 route 的未触发延迟和 active loop。loop route 重复启动不会叠加第二个 active generation。

## Cue 与 BGM focus

cue 的 `offsetSeconds` 相对 Popup tier/segment 或 Symbol state 的语义起点。计时只使用宿主 `update()`，不创建永久 `setTimeout`。重播会建立新 generation；状态切换、rollback、stop 和 destroy 会让旧 generation 失效。

effect 可配置：

- `keep`：不改变 BGM。
- `duck`：effect 真正开始后降低 BGM；多个 duck 取最低增益，最后一个释放后恢复。
- `pause`：effect 期间暂停 BGM，优先级高于 duck，释放后恢复。

延迟等待期间不获取 focus；播放完成、stop、error、cancel 或 destroy 都必须释放。

## 前后台生命周期

AudioCore backend 把窗口焦点、页面可见性和 page lifecycle 合成为唯一的
`active | suspended` 状态。进入 `suspended` 时，runtime 立即停止 pending、正在启动和
active 的 `once` 播放；后台期间新建的 `once` handle 直接以 `stopped` 完成，回前台也不补播。
`loop` effect 与 BGM 保留现有实例和最后一份有效请求，只设置 paused；如果 owner 在后台期间
显式 stop、更换 BGM 或 destroy，恢复时不得重建旧实例。

后台期间 `update(deltaSeconds)` 不推进 cue delay、focus lease 或 BGM crossfade。回到
`active` 后只从原进度继续；浏览器 activity pause 与 effect 的 BGM `pause` focus 是两个独立
条件，必须都释放才允许 BGM unpause。

Pixi backend 在仍有已 prepare 的 owned sound 时显式关闭 `@pixi/sound` 的全局 auto-pause，
并在最后一个 owner destroy 后恢复进入前的值，避免 Pixi 全局恢复与 AudioCore lifecycle
重复控制。app、Scene Layout 和具体游戏不得再直接监听 visibility/focus 来批量 resume 音频。

## 编辑器与交付

- Game Layout Editor：导入/试听 BGM 与 Layout effect，为 mode 选择 optional BGM，维护程序 effect allowlist。
- Popup Editor：在每个 award tier 或 start/loop/end segment 内配置零到多条 local effect；进入状态时全部 cue 按各自延迟触发。
- Symbols Editor：在每个 Symbol 的每个 state 内配置零到多条独立 local effect；画面仍预览全部 symbol，但通过项目页单选下拉框决定唯一发声 symbol，该选择不导出。

生产 ZIP 保留所有实际引用的音频和 nested package exact closure。`gamelayoutpkgcli` 把音频放入独立 `audio:scene-layout` group，并排除在 `initialAssets` 之外，因此不阻塞 splash loading。这里的“按需”不等于所有格式或浏览器都采用 network streaming；`@pixi/sound` 的 WebAudio 路径仍可能下载并解码完整文件。

## 错误与兼容

旧 Popup v1–v6、Symbol v1–v2 和 Scene Layout v1–v3 会被默认 loader 严格校验后升级为空音频合同。未知未来版本、非法媒体签名、缺失引用、重复 route、未知 cue target 或不在 allowlist 的程序 route 必须显式失败，不使用首项默认值、路径猜测或静默降级。

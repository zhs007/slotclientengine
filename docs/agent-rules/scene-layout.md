# Scene layout rules

适用于 `apps/gamelayouteditor`、`packages/rendercore/scene-layout` 及 production layout package consumer。

## Editor ownership

- gamelayouteditor 是 browser-only editing UI，拥有 draft、preview controls、filename-key workspace、受限 ZIP import/export 和 dependency binding。
- editor 保持 `base: "./"`，可部署到任意静态 CDN 子路径，不依赖 server/API/WebSocket/数据库/登录态/持久化存储。
- preview 复用 uiframeworks frame viewport 和 rendercore production scene runtime；preview zoom 不进入 manifest，canvas 拖动不修改 layout config。

## Mode、variant 与稳定节点

- editor 拥有通用 game mode draft，以及 mode 到独立 per-variant background、symbols package 和 award popup 的显式 binding。
- 新 mode 的 background 默认未绑定；每个 variant 明确选择，不继承另一 mode 的 editable node。
- background node id 按 mode/variant 稳定生成，不从资源名产生 `-2/-3` identity。
- 相同 logical resource 跨 mode 仍使用独立 node/placement；图片复用已加载 texture，稳定 Spine player 在 mode 切换时保留，不释放/重建。
- stable Spine background 只使用显式 single loop。未来稳定背景 kind 也遵守 exact-resource 和 stable-node 合同。

## Symbols binding 与 preview

- mode binding 显式拥有 package id、reelSet 和 renderMode。
- symbols package `cellSize` 必须等于共享 main grid cell size，reel count 等于 columns，公开轮带只含 display symbols；失败不修改 grid 或 auto-fit。
- preview 从绑定 package 的公开 reel set 按列选择合法 stop 并连续读取 rows。production 使用 Web Crypto，测试可注入随机源，禁止 `Math.random()`。
- resize、variant、zoom、普通 relayout 和相同 binding 的 mode 切换不得重新抽样。
- sampled/server scene、otherScene preview、服务器真实轮带和随机数不写入 layout ZIP。

## Directed transition

- transition 是独立有向边，只支持 strict Spine overlay 或 video-blackout union。
- editor 只自动准备当前 stable source 到所选 target 的一条直接边。
- 缺显式边时不得瞬切、反向复用、自动寻路或回退旧 node state machine。
- Spine/MP4 使用统一 state-switch action 和中文阶段提示。
- audible `play()` 必须在真实 trusted click 调用栈内同步触发。

## Rendercore production runtime

- rendercore 拥有 strict gameModes、plural symbolPackages、directed transition schema、exact dependency closure 和 production API。
- transition overlay 使用固定顶层 `scene-transition-overlay`；video blackout 是 viewport-space runtime object，不是 CSS overlay。
- runtime 在切换前准备完整 target scene；只在 exact Spine event occurrence 或 video media-time `fadeStart` 边界原子切换 background、reel 和 displayed mode。
- video 不使用 wall-clock fade，不自动静音，也不在 `play()` 拒绝时 fallback。
- once/ended settle、iOS gesture-safe prepare、trusted-click synchronous play 和当前 mode popup lifecycle 属于 rendercore。
- shared code 不硬编码 BaseGame/FreeGame/BonusGame、BG/FG、animation/event 名或业务字段。

## Resource lifecycle

- owned MP4、Spine、image、symbols 和 popup dependencies 都进入 exact closure；runtime 复用精确 bytes。
- 相同 symbols binding 的 mode 切换默认保留 reel、scene 和 player；只有显式 `recreateReel` 才重建。
- background visibility、target scene commit、active standard/grid-cell reel prepare/swap 和 popup lifecycle 原子完成。
- 底层 named-node state machine 可供独立 consumer 使用，但不得成为 `requestGameMode()` 的隐藏入口或 fallback。
- app/editor 不复制 event drain、official Spine player、image-string、background visibility、reel placement 或 transition state machine。

## Popup placement

- 每个 active variant 只配置 popup root 相对 viewport center 的 `x/y/scale`。
- popup package 最终 vendor 到 layout ZIP；内部 layer、tier、坐标和资源保持 popup owner 自包含。
- production app 直接消费 editor 导出的 mapped folder 时，构建期必须从根 manifest
  与 `assets.map.json` 生成精确 physical Vite import map，并校验 path/hash/size/orphan；
  禁止宽泛 glob、运行时猜路径或另存业务资源表。
- path/hash/size/orphan 和 generated parity 属于导出或构建 checker；runtime 只按
  `assets.map.json` 把 filename key 解析为 payload bytes，不重复计算 byteLength/hash，
  也不扫描 physical orphan。缺少实际引用、manifest/schema、资源解码和运行能力错误仍须失败。
- 只需要 layout/background/popup、而 reel 由游戏业务 target 驱动时，使用 rendercore
  presentation surface；surface 仍拥有 mode-aware background visibility、popup placement
  和 destroy，app 只注入业务触发并组合公开 container。

# @slotclientengine/game-ui-leo

Task 121 的独立 Leo 游戏内 UI。它实现 `SlotGameUiFactory`，每次 `create()` 都创建独立的共享 frame host、React root 和 snapshot external store。

UI 只消费 `SlotGameStateSnapshot` 并调用 `SlotGameUiCommands`。它不拥有 live session、round、presentation、collect、balance reconciliation 或 game adapter。

`createLeoSlotGameUiFactory({ labels })` 可接收显式、typed 的文案子集；未提供字段继续使用 Task 121 静态文案。factory 不接收 platform snapshot 或任意远程对象，translation key 到 label 的白名单映射由 game app adapter 负责。

## 资产白名单

以下文件从 `test` 分支 `packages/ui-leo-frameworks/src/assets` 按原始 bytes 精确复制，仅供首版 HUD 使用：

- `font/Anton-Regular.woff2`
- `font/NotoSansR.woff2`
- `uiimg/addbet.png` → `controls/addbet.png`
- `uiimg/removbet.png` → `controls/removbet.png`
- `uiimg/image-play.png` → `controls/image-play.png`
- `uiimg/image-autoplay.png` → `controls/image-autoplay.png`
- `uiimg/image-fastplays.png` → `controls/image-fastplays.png`
- `uiimg/image-fasplays-off.png` → `controls/image-fasplays-off.png`
- `uiimg/image-background-music.png` → `controls/image-background-music.png`
- `uiimg/image-background-music-off.png` → `controls/image-background-music-off.png`

没有复制 loading、Wildsheep、modal、buy-free、hover 或未引用资产。

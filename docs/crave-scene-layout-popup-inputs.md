# Crave Scene Layout Popup 文字与 ImgNumber 接入

本文只说明 Crave 如何使用 RenderCore 接口。RenderCore 不负责导入、替换或验证 Crave 的 Gamelayout assets；最终 Popup binding、节点名字和 glyph 资源由实际 Gamelayout 包提供。

当前 `congratulations-popup.zip` 的 Popup 是普通 `type="spine"`，不是五档 `award-celebration`。它适合作为 `FreeGame -> BaseGame` transition 的 `preludePopup`：Popup 完整走完 start/loop/end 后，Scene Layout 才继续回 BaseGame 的 transition。

## 推荐：为本次转场传入字符串

在离开 FreeGame 前，由 Crave 完成翻译和金额格式化，再把最终 string 随 mode request 传入：

```ts
await runtime.requestGameMode("BaseGame", {
  preludePopupStrings: [
    {
      kind: "text",
      name: "overlay-1000",
      text: translate("congratulations"),
    },
    {
      kind: "image-string",
      name: "imgnumber-0",
      text: formatFreeGameWin(freeGameWinRaw),
    },
  ],
});
```

`kind` 和 `name` 必须与最终 nested Popup manifest 完全一致。上面的两个 name 来自当前 v5 示例资源；资源重新导出后，应以新 manifest 为准，不要在 RenderCore 中保存另一份节点表。

`requestGameMode()` 返回的 Promise 会等待 Popup 和后续 transition 全部完成。本次传入的字符串只在这个 prelude 生命周期有效；Popup 结束、失败、取消或 runtime 销毁后，RenderCore 会恢复调用前的 handle 状态，因此下一轮不会沿用上轮金额。

金额计算、币种、小数位和翻译均属于 Crave。RenderCore 接收 formatter 已生成的最终 string；ImgNumber 缺少该 string 所需 glyph 时会直接失败，不使用字体或空白 fallback。

如果目标使用 video transition，仍先按现有 trusted-gesture 合同准备媒体；本轮字符串只在真正请求时传入：

```ts
await runtime.prepareGameModeTransition("BaseGame");

const transition = runtime.requestGameMode("BaseGame", {
  preludePopupStrings: popupStrings,
});

// Popup complete 后，继续由真实用户手势调用现有 video 启动入口。
await transition;
```

## 播放前或播放中直接修改

需要 persistent override，或确实要在 Popup 已显示后更新时，继续使用既有 exact-name handle：

```ts
const popup = runtime.getSpinePopup("congratulations");

popup.getTextNode("overlay-1000").setText(translate("congratulations"));
popup
  .getImageStringNode("imgnumber-0")
  .setText(formatFreeGameWin(freeGameWinRaw));
```

直接 `setText()` 会跨重复播放保持，直到调用 `resetText()` 或再次设置：

```ts
popup.getTextNode("overlay-1000").resetText();
popup.getImageStringNode("imgnumber-0").resetText();
```

不要在同一节点、同一轮中混用 request-scoped input 和期望长期保留的 direct override。若两者同时使用，本轮结束时会恢复到 `requestGameMode()` 调用前的状态。

使用 presentation-only surface 时，调用方式相同；通过 `surface.requestGameMode(modeId, { preludePopupStrings })` 发起转场，通过 `surface.getSpinePopupPlayer(id)` 取得直接 handle。

## 宿主职责

- 宿主继续逐帧调用 `runtime.update(deltaSeconds)`，否则 Popup/transition Promise 不会推进。
- 继续使用 `bindPopupInput()` 或统一 primary interaction，把 canvas/keyboard 输入交给 RenderCore；不要在 Crave 复制 start/loop/end 判断。
- Crave 只决定目标 mode、翻译、金额 formatter 和调用顺序，不直接操作 Popup Container、字体 Text 或 ImgNumber renderer。
- unknown node、kind 不匹配、非法单行文字或缺 glyph 时让本轮调用失败并走既有错误路径，不重试其它节点或默认值。

## Crave 侧验收

建议按实际 package 名运行 typecheck/test，并由用户在浏览器检查：

1. FreeGame 画面上先显示 Popup，完整结束后才切回 BaseGame。
2. 翻译文字和最终赢分正确，连续两轮不同金额不会串值。
3. 播放中 direct handle 更新立即可见，reset 恢复 Popup manifest 默认值。
4. 错误 name 或缺 glyph 时 Popup 不闪现、mode 不切换，下一次合法请求仍可执行。
5. 点击、键盘、横竖屏 placement、取消和 runtime destroy 后无残留。

浏览器验收由用户完成；RenderCore 自动化只证明接口、转场顺序和字符串 scope 生命周期。

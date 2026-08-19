# Crave：Task 228 Game Layout Runtime Address 接入

Crave 的 Game Layout 已经明确配置两条 Spine transition，并把 `Start` 作为各自的 `switchEvent`。程序应直接
绑定这两个 editor-authored owner 地址，不再按 Spine 文件名、animation 名或全局 event name 猜测来源：

```ts
const BASE_TO_FREE_START =
  "gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/Start";
const FREE_TO_BASE_START =
  "gamelayout:/transition/FreeGame/BaseGame/effect/spine/event/Start";

const disposeEnter = runtime.addresses.bind(BASE_TO_FREE_START, () => {
  // 此处 BaseGame -> FreeGame 的 target scene 已提交。
  onEnterFreeGameStart();
});

const disposeLeave = runtime.addresses.bind(FREE_TO_BASE_START, () => {
  // 此处 FreeGame -> BaseGame 的 target scene 已提交。
  onLeaveFreeGameStart();
});
```

这两个 occurrence 来自 package runtime 已经消费的 official Spine update result，不会安装第二个 Spine
listener。Runtime 继续验证 configured event 必须恰好出现一次：缺失或重复仍使 transition 显式失败。

Popup 临时数值改为先定位 exact string，再把 typed input 交给原有 mode request transaction：

```ts
const totalWin = runtime.addresses.resolve(
  "gamelayout:/popup/<binding-id>/string/image-string/imgnumber-0",
  "popup-string",
);
if (totalWin.kind !== "popup-string") throw new Error("kind mismatch");

await runtime.requestGameMode("BaseGame", {
  preludePopupStrings: [totalWin.input(Logic.getTotalWin().toString())],
});
```

请把 `<binding-id>` 替换为 Game Layout Editor 中该 transition 实际选择的 Popup binding id。不要把 Popup
package filename、Spine resource 或 layer index 当作 binding id。

接入时建议先打印一次可枚举 catalog，核对实际导出的对象：

```ts
for (const item of runtime.addresses.list()) {
  console.debug(item.kind, item.address, item.detail);
}
```

如果地址不在 catalog 中，应回到 Game Layout/Popup Editor 检查对象是否已命名、绑定并进入 production
closure；不要在程序里添加 alias 或 filename fallback。未绑定 audio asset 同样不会出现在 catalog。

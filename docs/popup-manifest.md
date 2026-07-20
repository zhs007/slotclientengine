# Popup package v1

`popup.manifest.json` 是获奖庆祝弹窗的唯一 production 合同。独立 `<id>-popup.zip` 最终由 Game Layout Editor 原样 vendor 到 `dependencies/popups/<id>/`。

## 坐标、档位与输入

- popup 中心为 `(0, 0)`，向右/向下为正；`designViewport` 只恢复编辑边框，不触发 fit/contain/cover。
- layout 为每个 active variant 保存相对 viewport center 的 `x/y/scale`。
- 游戏只提交 safe integer `betAmountRaw` 和 `winAmountRaw`；preview 的 bet、win、zoom、guides 不进入 manifest。
- 档位固定为 `base -> standard -> bigwin -> superwin -> megawin`。`base` 截止 `1×bet`，`standard` 截止 bigwin threshold，后三档 threshold multiplier 显式且严格递增。边界相等时进入对应档，runtime 用 BigInt 比较。
- 每档必须有非空 `layers`，且必须恰好包含一个 `image-string + win-amount` 图层。金额不参与 `start/loop/end` 可见性：整场只维持一个 renderer/runtime，跨档只更新文本、transform，必要时在同一实例上切换 image-string resource。
- 每档严格按唯一的 `order` 升序叠放，数值越小越靠下。跨档时单一金额 renderer 会移动到新档容器内对应的 child index，不会固定在全部 VNI 之上。
- VNI 显式保存 `loopStartTime/loopEndTime/keepParticlesAlive`；Spine 显式保存大小写精确且互不相同的 start/loop/end animation。

## 合同骨架

```json
{
  "version": 1,
  "kind": "popup",
  "id": "game003-win-celebration",
  "type": "award-celebration",
  "designViewport": { "width": 1080, "height": 1920 },
  "amountFormat": {
    "rawScale": 100,
    "fractionDigits": 2,
    "useGrouping": true,
    "groupSeparator": ",",
    "decimalSeparator": ".",
    "prefix": "$",
    "suffix": "",
    "rounding": "floor"
  },
  "resources": {
    "amount": {
      "kind": "image-string",
      "manifest": "dependencies/image-strings/amount/image-string.manifest.json"
    }
  },
  "awardCelebration": {
    "base": { "countDurationSeconds": 1.5, "layers": [] },
    "standard": { "countDurationSeconds": 3, "layers": [] },
    "celebrationTiers": [
      {
        "id": "bigwin",
        "thresholdMultiplier": 15,
        "countDurationSeconds": 2.9,
        "layers": []
      },
      {
        "id": "superwin",
        "thresholdMultiplier": 25,
        "countDurationSeconds": 2.9,
        "layers": []
      },
      {
        "id": "megawin",
        "thresholdMultiplier": 50,
        "countDurationSeconds": 2.9,
        "layers": []
      }
    ]
  }
}
```

骨架中的空 `layers` 是说明结构的无效占位，不能作为 fixture 或导出物。合法 image-string layer 必须包含 `id/kind/order/resource/binding/anchor/transform`，不接受 `visibleSegments`；image 图层才使用 `visibleSegments`；VNI/Spine 使用各自 playback。

## 资源、ZIP 与 runtime

owned payload 固定为 `assets/<64位 lowercase sha256>.<canonical-extension>`。VNI project 和 Spine atlas 在叶子路径确定后结构化改写，再对 canonical bytes 求 hash；standalone image-string 保持自包含。parser 递归拒绝 unknown key，ZIP 必须与传递闭包精确相等，并拒绝 traversal、case-fold collision、missing 和 orphan。

```ts
const resource = await createPopupPackageResource({ files });
const player = createAwardCelebrationPlayer({ resource });
await player.init();
player.start({ betAmountRaw: 100, winAmountRaw: 6000 });
player.update(deltaSeconds);
player.requestAdvance();
```

Popup package 本身不拥有游戏模式，也不声明 BaseGame/FreeGame。scene-layout 负责通用
mode -> popup binding 与 viewport-center root placement；Popup Editor 继续独占 popup 内部
tier、layer、金额格式、坐标和资源编辑。

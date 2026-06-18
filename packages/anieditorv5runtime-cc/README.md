# @slotclientengine/anieditorv5runtime-cc

V5G 动画导出的 Cocos Creator 3.8.6 runtime 包。

本包不是完整 Cocos Creator 项目，也不能替代编辑器创建项目。本轮没有新增 `apps/anieditorv5viewer-cc`，原因是 Cocos Creator 项目的场景、资源导入、`.meta`、Library 缓存、构建目标和 `cc` 模块解析都依赖编辑器。请先用 Cocos Creator 3.8.6 创建或打开真实项目，再导入本 runtime。

## 支持范围

当前支持：

- V5G `V5G_0.x`
- `editor.name === "victory_editor_v5_g"`
- `engineTarget.name === "cocos_creator"`
- `engineTarget.version === "3.8.6"`
- `stage.coordinate === "center"`
- `image` 图层
- 中心坐标：Cocos 节点位置直接使用 `transform.x/y`，不做 Pixi 的左上角坐标转换
- 负 `scaleX/scaleY` 镜像
- `opacity`、`visible`、`rotation`、锚点
- 已知 V5G blend mode 字段：`normal`、`add`、`screen`、`multiply`、`lighten` 会被解析和接受；Cocos runtime 不修改 Sprite blend 参数，实际统一按 Cocos 默认 normal 透明混合渲染
- `scale_up`、`scale_down`、`fade`、`rotate`、`move`
- `slide_in`、`slide_out`、`bounce_in`、`pulse`、`float`、`swing`
- `scale_in`、`scale_out`、`pop`、`shake`、`blink`
- 图层动画 `particles`、`particle_twinkle`：复用当前图层的 `SpriteFrame` 创建粒子 Sprite，粒子层位于普通内容层上方
- 由宿主 Cocos Component 在 `update(deltaTime)` 中显式驱动播放

明确不支持：

- `text` 图层
- 顶层 `project.particles`
- 非空 `keyframes`
- `group` 图层
- 嵌套 `parentId`
- 未知资源、未知动画、未知 easing、未知 blend mode 的静默兜底

遇到未支持能力会直接抛错。runtime 不创建 missing placeholder，不自动猜测资源路径。未知 V5G blend mode 仍会在通用校验失败；已知但未适配 Cocos 的 blend mode 会保留配置值但按默认 normal 渲染。

## 单文件复制导入

推荐 Cocos Creator 项目优先使用单文件 runtime，而不是直接依赖 pnpm workspace package。Cocos Creator 对 pnpm symlink、package `exports`、monorepo 构建产物和源码内 `.js` 后缀相对 import 的处理可能与 Node/Vite 不一致；单文件复制可以把运行时边界收敛到一个只依赖内置 `"cc"` 模块的 TypeScript 文件。

复制路径示例：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
-> CocosProject/assets/scripts/vendor/anieditorv5runtime-cc.ts
```

宿主业务 Component 通过相对路径导入：

```ts
import {
  assertV5GProject,
  createV5GCocosPlayer,
  validateCocosV5GProject,
  type V5GCocosAssetResolver,
  type V5GCocosPlayer,
} from "./vendor/anieditorv5runtime-cc";
```

样例数据来源：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/megawin.json
docs/anieditor5/export/superwin.json
docs/anieditor5/export/assets/*
```

runtime 只接收已经得到的 `V5GProjectConfig` 对象，不读取、导入、加载或解析 `project.json`。JSON 绑定、`JsonAsset` 读取、资源导入、Canvas/root 缩放和屏幕适配都属于宿主 Cocos 项目职责。runtime 只创建 `project.stage.width x project.stage.height` 的中心坐标内容。

宿主项目必须显式绑定 `asset.id -> SpriteFrame`。`getSpriteFrame(assetPath, assetId)` 返回 `null` 会直接抛错，错误会包含 asset id 和 path；如果能从 `SpriteFrame` 读取原始尺寸，runtime 会校验它与 JSON `asset.width/height` 一致。不要依赖 `SpriteFrame.name` 猜测资源。

可复制 Component 示例见：

```text
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

该示例 Component 不是 runtime 的必需入口；它展示了宿主侧如何用 `JsonAsset` 准备 project 对象、用 `assetIds: string[]` + `spriteFrames: SpriteFrame[]` 显式绑定资源、在 `update(deltaTime)` 中调用 `player.update(deltaTime)`，并在 `onDestroy()` 中调用 `player.destroy()`。

本仓库当前没有执行真实 Cocos Creator 3.8.6 编辑器导入验收；已完成的是 monorepo 内 TypeScript、Vitest fake `cc`、standalone 边界扫描和构建验收。真实编辑器内的 `.meta`、场景绑定、资源导入结果仍需在宿主 Cocos 项目中人工确认。

## 播放控制和事件

`play()`、`pause()`、`restart()`、`seek(time)`、`setLoop(loop)` 和 `update(deltaTime)` 继续可用。`pause(); play();` 会恢复当前未完成的 range；`restart()` 会清空 range 并回到从 0 秒开始的全时长播放语义。

播放 0 到 4 秒，结束后停止：

```ts
player.playRange({
  range: { unit: "time", start: 0, end: 4 },
  loop: false,
});
```

播放第 30 到第 60 帧并循环：

```ts
player.playRange({
  range: { unit: "frame", start: 30, end: 60, fps: 60 },
  loop: true,
});
```

帧 API 必须显式传入 `fps`，runtime 不默认 60fps，也不会从 Cocos 的 `update(deltaTime)` 频率猜测。

注册时间点 marker：

```ts
const disposeMarker = player.addPlaybackEvent({
  id: "intro-pop",
  at: { unit: "time", at: 1.25 },
  once: true,
  listener(event) {
    // event.time 是 marker 时间；event.currentTime 是本次 update 推进到的时间。
  },
});
```

注册帧 marker：

```ts
player.addPlaybackEvent({
  id: "frame-45",
  at: { unit: "frame", at: 45, fps: 60 },
  listener(event) {
    // loopIndex 从 0 开始，循环 range 每跨过一圈递增。
  },
});
```

监听当前非循环播放任务完成：

```ts
const disposeComplete = player.onPlaybackComplete((event) => {
  // event.startTime / event.endTime 对应本次 playRange 或全时长播放边界。
});
```

marker 和 complete 都由宿主继续调用 `player.update(deltaTime)` 同步驱动，不使用 `setTimeout`、Promise、Cocos tween 或异步计时器。手动 `seek(...)`、`init()` 和 `restart()` 不会触发 marker；单次大 `deltaTime` 跨过多个 marker 时，会按时间从小到大同步触发。callback 抛错不会被 runtime 吞掉，会从当前 public method 继续抛出。

`destroy()` 会销毁 runtime 创建的节点、停止播放、清空当前 range、清空所有 marker 和 complete listener，避免宿主 Component 销毁后遗留 callback。

## Package 导入

如果某个环境确认可以正确解析 pnpm workspace 和 package `exports`，仍可从 package 入口导入模块化版本：

```ts
import {
  createV5GCocosPlayer,
  type V5GCocosAssetResolver,
} from "@slotclientengine/anieditorv5runtime-cc/cocos";
```

这条路径面向能解析 package 的工程化环境；面向普通 Cocos Creator 项目交付时，优先复制 `standalone/anieditorv5runtime-cc.ts`。

## 背景层和 blend mode

runtime 会在 stage 下创建 `V5G Background`，使用 Cocos `Graphics` 画 `project.stage.backgroundColor` 对应的纯色矩形，背景层始终在所有 V5G 图层下方。

Cocos adapter 当前不会读取或写入 Sprite 的 blend factor / material / effect 配置。无论导出图层写的是 `normal`、`add`、`screen`、`multiply` 还是 `lighten`，runtime 都保持 Cocos Sprite 默认混合状态，因此实际按 normal 透明混合渲染。

后续如果要恢复 `add`、`screen` 等真实混合效果，需要先在真实 Cocos Creator 3.8.6 项目里补充并验收 Material/Effect adapter；在此之前不要依赖 Sprite blend factor API。

## `cc` 类型 shim

`types/cc-3.8.6-shim.d.ts` 只用于 monorepo 内 `tsc` 和 Vitest 编译，内容是最小类型补丁，不代表完整 Cocos API。真实 Cocos 项目以 Cocos Creator 3.8.6 编辑器提供的 `cc` 类型为准。

Vitest 单元测试使用 fake driver 测 `V5GCocosPlayer`，不直接执行真实 `cocos-node-driver.ts`。

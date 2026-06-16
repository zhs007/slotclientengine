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
- `normal`、`add` blend mode
- `scale_up`、`scale_down`、`fade`、`rotate`、`move`
- `slide_in`、`slide_out`、`bounce_in`、`pulse`、`float`、`swing`
- 由宿主 Cocos Component 在 `update(deltaTime)` 中显式驱动播放

明确不支持：

- `text` 图层
- `particles`
- 非空 `keyframes`
- `group` 图层
- 嵌套 `parentId`
- 未确认的 `screen`、`multiply`、`lighten` Cocos blend mode
- 未知资源、未知动画、未知 easing、未知 blend mode 的静默兜底

遇到未支持能力会直接抛错。runtime 不创建 missing placeholder，不把未知 blend mode 当成 `normal`，不自动猜测资源路径。

## 导入 Cocos Creator 3.8.6 项目测试

样例数据来源：

```text
docs/anieditor5/export/project.json
docs/anieditor5/export/assets/*
```

导入方式二选一：

1. 如果 Cocos Creator 能解析 pnpm workspace / npm 包，从包入口导入：

```ts
import {
  createV5GCocosPlayer,
  type V5GCocosAssetResolver,
} from "@slotclientengine/anieditorv5runtime-cc/cocos";
```

2. 如果编辑器无法解析 pnpm workspace symlink，把 `packages/anieditorv5runtime-cc/src` 或构建后的 `packages/anieditorv5runtime-cc/dist` 拷贝进 Cocos 项目的 `assets/scripts/vendor/anieditorv5runtime-cc`，再按相对路径导入。

宿主项目需要把每个 V5G `asset.path` / `asset.id` 显式映射到 Cocos `SpriteFrame`。runtime 不自动使用 `resources` 路径。

最小 Component 示例：

```ts
import { _decorator, Component, Node, SpriteFrame } from "cc";
import {
  createV5GCocosPlayer,
  type V5GCocosAssetResolver,
  type V5GCocosPlayer,
} from "@slotclientengine/anieditorv5runtime-cc/cocos";
import project from "./project.json";

const { ccclass, property } = _decorator;

@ccclass("V5GPreview")
export class V5GPreview extends Component {
  @property(Node)
  root: Node | null = null;

  @property([SpriteFrame])
  spriteFrames: SpriteFrame[] = [];

  private player: V5GCocosPlayer | null = null;

  start(): void {
    if (!this.root) throw new Error("V5GPreview.root is required.");

    const assetMap = new Map<string, SpriteFrame>();
    for (const frame of this.spriteFrames) {
      assetMap.set(frame.name, frame);
    }

    const assets: V5GCocosAssetResolver = {
      getSpriteFrame(assetPath, assetId) {
        return assetMap.get(assetPath) ?? assetMap.get(assetId) ?? null;
      },
    };

    this.player = createV5GCocosPlayer({
      root: this.root,
      project,
      assets,
      loop: true,
    });
    this.player.init();
    this.player.play();
  }

  update(deltaTime: number): void {
    this.player?.update(deltaTime);
  }

  onDestroy(): void {
    this.player?.destroy();
  }
}
```

宿主 Cocos 项目负责 Canvas/root 缩放和屏幕适配。本 runtime 只创建 `project.stage.width x project.stage.height` 的中心坐标内容，不自动猜测适配策略。

## 背景层和 blend mode

runtime 会在 stage 下创建 `V5G Background`，使用 Cocos `Graphics` 画 `project.stage.backgroundColor` 对应的纯色矩形，背景层始终在所有 V5G 图层下方。

`normal` 和 `add` 使用 Sprite 的 blend factor 配置：

- `normal`: `SRC_ALPHA` / `ONE_MINUS_SRC_ALPHA`
- `add`: `SRC_ALPHA` / `ONE`

如果真实 Cocos Creator 3.8.6 项目里 Sprite blend factor API 不可用，adapter 会抛错。需要在编辑器内确认后再扩展，不要把未确认模式静默降级。

## `cc` 类型 shim

`types/cc-3.8.6-shim.d.ts` 只用于 monorepo 内 `tsc` 和 Vitest 编译，内容是最小类型补丁，不代表完整 Cocos API。真实 Cocos 项目以 Cocos Creator 3.8.6 编辑器提供的 `cc` 类型为准。

Vitest 单元测试使用 fake driver 测 `V5GCocosPlayer`，不直接执行真实 `cocos-node-driver.ts`。

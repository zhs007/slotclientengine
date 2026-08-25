# fate-thread-demo

一个独立可运行的 PixiJS 命运丝线技术 Demo：6 个可拖拽锚点、一条连续的无物理引擎软绳，以及三层 ribbon mesh 组成的金色流光。

## 运行

```bash
pnpm --filter fate-thread-demo dev
pnpm --filter fate-thread-demo test
pnpm --filter fate-thread-demo typecheck
pnpm --filter fate-thread-demo build
```

## 实现结构

- `src/physics/fate-thread-simulation.ts`：Verlet 积分、距离约束、重力、风扰动和拖拽锚点。
- `src/render/fate-thread-mesh.ts`：把粒子链的中心点扩成两侧顶点，构建三角带；累计弧长生成 UV，通过滚动 UV 实现流光。
- `src/scene/fate-thread-scene.ts`：6 个交互节点、背景和演示编排。

物理层不依赖 Pixi，可以独立测试，也可以被其他 renderer 使用。

## 美术资源建议

正式项目不建议让美术交一张覆盖整条路径的长直线图。推荐提供：

1. 一张横向无缝的小段丝线纹理，中心是实体纤维，两侧透明，建议 128×32 或 256×64；
2. 可选的独立 glow / noise mask，用于高光、能量脉冲或局部粗细变化；
3. 纹理横向必须可以 repeat，纵向保留足够透明边缘，避免 glow 被裁掉。

Demo 为了零外部资源运行，用 Canvas 生成了同样结构的 core 与 glow 纹理。替换时只需要修改 `createProceduralThreadTextures()` 的纹理来源，物理与 mesh 拓扑不变。

## 接入 Spine 手部

把“手”视为 pin anchor，不让物理解算反向修改 Spine。每帧在物理解算前读取手部 bone 或 slot 的世界坐标，转换到丝线容器的 local 坐标，再调用：

```ts
simulation.setAnchor(anchorIndex, localHandPosition);
simulation.step(deltaSeconds, elapsedSeconds);
```

坐标转换必须经过实际 display-object 层级，例如先取 Spine 手部点的 global 坐标，再用丝线容器 `toLocal()`；不要假设 Spine local 坐标与丝线 local 坐标相同。手快速移动时，相邻自由粒子会自然产生滞后和回摆；如果要更夸张，可按手部速度额外给自由粒子一个 impulse。

## 当前边界

- 这是视觉软绳，不处理自碰撞、打结、切断或与角色身体碰撞。
- 6 个节点都是固定锚点，拖动后停留在新位置；每两个锚点之间有 12 个约束段。
- 若后续需要切绳子，只需移除命中的距离约束并把连续 mesh 拆成两条 ribbon，不需要引入完整物理引擎。

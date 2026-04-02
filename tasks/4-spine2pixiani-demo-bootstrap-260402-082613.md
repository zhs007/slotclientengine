# spine2pixiani-demo 初始化任务报告

## 1. 实际实现范围

本次已新增可运行应用 `apps/spine2pixiani-demo`，完成以下内容：

- 基于 `vite + vitest + eslint + typescript` 初始化独立 workspace 应用。
- 从 `packages/pixiani` 复制最小 `core` 与 `layout` 能力到应用内。
- 将 `cabin.atlas`、`cabin.png`、`cabin.json` 复制到应用目录。
- 实现 atlas 解析器与基于 canvas 的旋转子图还原逻辑。
- 实现 Spine JSON 到 demo 内部数据模型的适配。
- 实现支持 `translate / rotate / scale / attachment / color` 的时间轴采样器。
- 实现 `CabinScene` 与 `CabinAnimationEntity`，可播放 `cabin` 与 `cabin_s`。
- 实现页面调试 UI，支持动画切换、重播和循环开关。
- 补充 atlas、适配、采样和动画切换的单元测试。

## 2. 未覆盖的数据类型

当前资源未实际使用以下能力，因此本次未实现：

- draw order 动画
- clipping、mesh、path、event 等 Spine 其他轨道类型
- 更完整的 blend 模式和通用 Spine schema 兼容层

本实现只覆盖 `cabin.json` 当前确实出现的数据子集。

## 3. 验证命令

建议在仓库根目录执行：

```bash
pnpm install
pnpm --filter spine2pixiani-demo lint
pnpm --filter spine2pixiani-demo test
pnpm --filter spine2pixiani-demo typecheck
pnpm --filter spine2pixiani-demo build
pnpm --filter spine2pixiani-demo dev
```

## 4. 已知边界与遗留问题

- atlas 贴图采用浏览器 canvas 在运行时还原，适合 demo，但还不是最优生产方案。
- 内部数据模型是面向当前资源裁剪后的结构，不是通用 Spine Runtime。
- 目前未做像素级视觉对比，只做了数据层和切换行为验证。
- 若后续引入更多 Spine 资源，需要先重新统计时间轴类型，再按需扩展采样器。
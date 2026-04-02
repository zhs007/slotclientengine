# spine2pixiani-demo

`spine2pixiani-demo` 是一个可运行的 Vite 应用，用来验证如何把 `assets/spine2pixiani/` 里的 Spine 资源翻译为“不依赖 Spine 运行时”的 Pixi/Pixiani 手写播放实现。

## 项目目标

- 直接加载 `cabin.atlas` 与 `cabin.png`。
- 读取 `cabin-spine.json`，转换为当前 demo 使用的内部数据结构。
- 支持 `cabin` 与 `cabin_s` 两个动画的循环播放与切换。
- 页面提供下拉框、重播按钮和循环开关。

## 当前支持的数据子集

- bone timelines: `translate`、`rotate`、`scale`
- slot timelines: `attachment`、`color`
- curve: `linear`、`stepped`、4 点 bezier
- atlas fields: `rotate`、`xy`、`size`、`orig`、`offset`、`index`

当前资源没有使用 draw order 动画，因此本 demo 没有实现 draw order 采样。

## 运行方式

建议在仓库根目录执行：

```bash
pnpm install
pnpm --filter spine2pixiani-demo dev
pnpm --filter spine2pixiani-demo test
pnpm --filter spine2pixiani-demo typecheck
pnpm --filter spine2pixiani-demo build
```

## 目录说明

- `src/runtime`: atlas 解析、Spine 适配、时间轴采样与显示层辅助
- `src/ani/cabin`: cabin 场景构建与动画实体
- `src/data`: 原始 Spine JSON 与转换后的内部模型入口
- `tests`: atlas、适配、采样和动画切换回归测试

## 资源来源

- atlas/image: `assets/spine2pixiani/cabin.atlas`, `assets/spine2pixiani/cabin.png`
- raw json: `assets/spine2pixiani/cabin.json`

这些资源在初始化时复制到应用目录，保持 demo 自包含。
# @slotclientengine/pixiani

`@slotclientengine/pixiani` 是 `slotclientengine` monorepo 内部使用的动画基础包，提供 `PixiJS + GSAP` 的稳定动画内核、动画承载目录约定和本地预览壳。

它不是现成动画合集，也不是独立演示项目。它的主职责是为后续 Agent 或开发者持续产出动画实体提供统一地基。

## 包定位

- `src/core` 是稳定基础设施层，负责生命周期、池化和统一回收。
- `src/ani` 是动画产出层，后续真实动画实体写在这里。
- `src/main.ts` 是本包本地预览入口，用于开发和调试，不参与正式库导出。
- `src/index.ts` 是正式库入口，供仓库内其他包或应用直接引用。

## 对外导出

- 包根入口：导出 `core`、布局工具和 `ani` 聚合入口。
- `@slotclientengine/pixiani/core`：导出 `VisualEntity`、`ObjectPool`、`EntityManager`。
- `@slotclientengine/pixiani/layout`：导出 `computeCanvasLayout` 等通用布局辅助。
- `@slotclientengine/pixiani/ani`：作为动画实体聚合入口，初始化阶段默认为空。

## 目录约定

- `src/core`
  - 稳定动画内核。
  - `VisualEntity<TConfig>`：统一生命周期与 timeline 清理。
  - `ObjectPool<TConfig, TEntity>`：统一实例复用，稳定 `init/reset` 语义。
  - `EntityManager`：统一更新、结束检测、父节点移除和对象池回收。
- `src/ani`
  - 后续动画实体实现目录。
  - 当前仅保留 `.keepme` 与聚合入口，避免空目录在版本控制中丢失。
- `src/main.ts`
  - 本地预览壳。
  - 初始化 Pixi 应用、默认三层容器和共享更新循环。
- `tests/core`
  - 基础设施测试。
- `tests/ani`
  - 动画实体测试目录。
  - 结构应与 `src/ani` 对应。

## 开发约束

- 新动画实体放在 `src/ani`，不要直接把业务动画塞进 `core`。
- 每个新增动画实体都应有对应测试，放在 `tests/ani`。
- 实体需要继承 `VisualEntity`，并遵循 `init -> update -> finished -> reset` 的统一生命周期。
- 对象回收应通过 `EntityManager` 和 `ObjectPool` 协作完成，不要让实体自行销毁。
- `src/main.ts` 只做调试接线，不承担正式导出职责。

## 常用命令

以下命令建议在仓库根目录执行：

```bash
pnpm --filter @slotclientengine/pixiani dev
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

说明：

- `dev` 启动的是本包预览壳。
- `build` 生成正式库产物到 `dist/`。
- 如果手动执行 `vite build`，预览产物会输出到 `dist-preview/`，避免和正式库产物混淆。

## 依赖安装

仓库使用 `pnpm` 和根级 `turbo` 管理任务。若依赖安装失败，可先设置代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 当前初始化状态

- 已建立正式包名和标准 workspace 脚本。
- 已新增正式库入口 `src/index.ts`。
- 已把 `src/ani`、`tests/ani` 整理为可持续扩展的占位目录。
- 当前没有预置示例动画，后续动画文件应按真实任务继续补入。

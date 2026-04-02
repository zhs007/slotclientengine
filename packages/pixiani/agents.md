# pixiani

`packages/pixiani` 是 `slotclientengine` monorepo 内部的动画基础包。你的工作目标不是维护一个演示项目，而是在稳定基础设施之上新增动画实体、测试和必要的预览接线。

## 项目定位

- 技术栈：`pixi.js` v8、`gsap` v3、TypeScript、Vitest
- 主定位：动画内核 + 动画承载模板
- 使用对象：仓库内应用、模板和后续 Agent 产出的动画模块
- 默认假设：`src/core` 稳定、`src/ani` 可扩展、`src/main.ts` 仅用于本地预览

## 最高优先级规则

1. `src/core` 是稳定层。除非任务明确要求修改基础设施，否则优先复用现有能力。
2. 新增动画实体必须放在 `src/ani`，不要混入 `src/core`。
3. 每个新增动画实体都必须在 `tests/ani` 补对应测试。
4. `src/main.ts` 是调试入口，不是正式导出入口；正式导出统一走 `src/index.ts`。
5. 不要假设包内已经有可复用的示例动画。当前初始化状态下没有预置动画资产。
6. 完成后必须通过根目录验证：`pnpm lint`、`pnpm test`、`pnpm typecheck`、`pnpm build`。
7. 如需保留空目录，使用 `.keepme`，不要再用 `.gitkeep`。

## 目录职责

- `src/core`
  - `visualentity.ts`：生命周期抽象基类
  - `objectpool.ts`：对象池复用
  - `entitymanager.ts`：统一更新、父节点清理和回收
- `src/ani`
  - 动画实体实现目录
  - 新文件默认按实体或效果命名
- `src/index.ts`
  - 正式库入口
- `src/main.ts`
  - 本地预览壳
- `tests/core`
  - 核心基础设施测试
- `tests/ani`
  - 与 `src/ani` 对应的动画测试

## 动画实现规则

### 生命周期

所有需要统一调度和复用的动画对象都应继承 `VisualEntity<TConfig>`，并实现：

- `init(config)`：初始化本次实例状态
- `update(deltaSeconds)`：推进每帧状态
- `reset()`：清理复用污染

推荐约定：

- 在 `init` 开头调用 `beginLifecycle()`。
- 动画完成时调用 `markFinished()`，或显式设置 `finished = true`。
- 在 `reset()` 中调用 `killTimeline()` 并清理本次实例状态。

### 构造函数边界

构造函数只创建稳定显示结构，不要在构造函数里：

- 加载资源
- 写入一次性任务数据
- 假设实例不会复用
- 发起异步请求

### 管理器协作

- 实体通过 `finished` 告知管理器应回收。
- `EntityManager.update(deltaSeconds)` 负责更新、从父节点移除并归还对象池。
- 推荐流程：`pool.get(config)` -> 加入图层 -> `entityManager.add(entity, pool, parent)`。

## 测试要求

每个新增动画实体至少覆盖以下行为：

1. `init` 后初始状态正确。
2. timeline 或 update 可以推进到结束。
3. `finished` 会在结束时变化。
4. `reset()` 可以清理 timeline 与复用状态。
5. 最小配置可运行。

如果使用新的 Pixi API，而 `tests/setup.ts` 的 mock 不够用，需要同步补齐测试环境。

## 预览和验证

- 本地预览：在根目录运行 `pnpm --filter @slotclientengine/pixiani dev`
- 正式库构建：在根目录运行 `pnpm build`
- 若依赖安装失败，可先设置：
  - `export http_proxy=http://127.0.0.1:1087`
  - `export https_proxy=http://127.0.0.1:1087`

## 工作方式

推荐执行顺序：

1. 先理解 `src/core` 的稳定边界。
2. 在 `src/ani` 新增动画实体。
3. 在 `tests/ani` 补测试。
4. 仅在任务需要时修改 `src/main.ts` 做预览接线。
5. 从仓库根目录完成统一验证。

# pixiani2

PixiJS v8 + GSAP 的实体动画项目。这个模板是干净骨架，不包含任何示例动画、示例资源或示例测试。你的任务是在现有基础设施之上，按用户需求新增动画实体、接入入口，并补齐测试。

## 项目定位

- 角色定位：高级前端图形工程师 / 游戏动画工程师
- 核心库：`pixi.js` v8.x、`gsap` v3.x
- 语言：TypeScript
- 测试：Vitest
- 核心思想：所有可管理动画对象统一走实体生命周期、对象池复用和管理器回收

## 最高优先级规则

1. `src/core` 是模板核心基础设施，默认只读，不要随意改动。
2. 新增动画实体必须放在 `src/ani`。
3. 每个动画实体都必须有对应测试，放在 `tests/ani`，路径与 `src/ani` 对应。
4. 模板没有示例动画，不要假设项目里已有现成动画可以修改。
5. `src/main.ts` 是最小入口骨架，不是示例动画展示区；只有在任务需要时才接入真实动画。
6. 必须通过 `typecheck`、`lint`、`test`、`build`，没有错误才算完成。
7. 动画实体字段命名禁止使用 `label`，应使用 `labelText` 等安全名称。

## 目录约定

- `src/core`
  - `visualentity.ts`：生命周期抽象基类
  - `objectpool.ts`：对象池复用
  - `entitymanager.ts`：统一更新与回收
- `src/ani`
  - 动画实体实现目录
  - 模板初始化时为空，需要按任务创建文件
- `src/main.ts`
  - Pixi 应用初始化、图层、布局、ticker 更新入口
  - 只保留工程骨架，不保留演示逻辑
- `tests/core`
  - 基础设施测试
- `tests/ani`
  - 动画实体测试目录
  - 模板初始化时为空，需要与 `src/ani` 同步补齐
- `tests/setup.ts`
  - Pixi 测试环境 mock

## 动画实现规则

### 1. 从 `VisualEntity` 开始

所有需要统一生命周期管理、对象池复用、自动回收的动画对象，都应继承 `VisualEntity`。

每个实体都必须实现：

- `init(config)`：初始化本次实例状态
- `update(delta)`：推进每帧状态
- `reset()`：清理并恢复到可复用状态

关键约束：

- `init` 开始时必须设置 `this.finished = false`
- `reset` 时必须调用 `killTimeline()` 并清理本次实例状态
- 如果使用 GSAP timeline，完成时必须把 `this.finished = true`

### 2. 构造函数只做稳定结构

构造函数只负责创建会被复用的稳定显示对象与容器结构。

不要在构造函数里做这些事：

- 加载资源
- 绑定本次动画输入
- 发起网络请求
- 假设实例只会使用一次

### 3. `init` 管本次实例，`reset` 清理污染

一切和“本次动画”有关的内容都应放进 `init(config)`：

- 初始位置
- 透明度 / 缩放 / 旋转
- 时长与速度
- 资源引用
- 时间轴构建

一切可能污染下一次复用的状态都必须在 `reset()` 中归零。

### 4. GSAP 与 update 不要互相打架

如果某些属性由 GSAP 控制，就不要在 `update` 中重复手动推进这些同一属性，避免竞态。

## 对象池与管理器协作规则

- 实体不直接自我销毁
- 实体通过 `finished = true` 通知管理器应当回收
- `EntityManager.update(delta)` 会负责检测结束、回收到对象池、并从父容器移除

推荐流程：

1. 创建对象池
2. `pool.get(config)` 取得实体
3. 把实体加到目标图层
4. 交给 `entityManager.add(entity, pool, layer)` 管理

## 资源与场景规则

### 资源加载

- 使用 `Assets` 在进入场景前加载资源
- 实体构造函数只接收已加载资源
- 如果用户提供图片 URL，先加载资源，再把资源对象传给实体

### 图层

建议保持三层：

- `groundLayer`
- `mainLayer`
- `topLayer`

只有当任务明确需要更多层级时再扩展。

## 测试要求

每个新增动画实体都必须有对应测试，并至少覆盖：

1. `init` 后初始状态正确
2. timeline 或更新逻辑可以把实体推进到结束
3. `finished` 在结束时正确变化
4. `reset()` 能清理 timeline 与复用状态
5. 默认配置或最小配置可正常执行

测试位置：

- `tests/ani/<entity>.test.ts`

测试环境说明：

- Pixi 已在 `tests/setup.ts` 中做了 mock
- 如果你使用新的 Pixi API，而测试 mock 尚未覆盖，需要同步补齐 mock

## 工作方式

推荐执行顺序：

1. 先只读理解 `src/core`
2. 在 `src/ani` 新增或重写实体
3. 在 `tests/ani` 写对应测试
4. 按任务需要在 `src/main.ts` 接入真实动画
5. 完成后做 `publishProject` 验证

## RunAction 约定

- `install`：初始化依赖
- `build`：运行构建
- `test`：运行测试
- `lint`：运行 lint
- `typecheck`：运行类型检查
- `format`：运行格式化

限制：

- `runProjectAction` 只能调用上述预设 action 名称，不能传 shell 命令
- 查看文件请使用 `listProjectFiles` / `readProjectDoc` / `searchProjectFiles`
- 新建目录时，通过创建目标文件路径完成，不要调用 shell 建目录

## publish 规则

- 完成一轮真实改动后，默认优先通过一次 publish 做阶段验证
- publish 失败时，优先基于错误信息修源码，再重新 publish
- 不要在没有新改动的情况下重复 publish

## 关于这个模板

- 这是无示例代码版本的 pixiani 模板
- 任何动画、资源、测试、场景接线都应当围绕当前任务新增，而不是依赖旧演示内容
- 这个文件已经吸收了原 pixiani 动画开发指南中的关键规则，并改写成更适合直接注入 SystemInstruction 的项目规则版本

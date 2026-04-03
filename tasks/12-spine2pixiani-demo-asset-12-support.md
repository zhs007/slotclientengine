# spine2pixiani-demo 接入 12 号动画资源任务计划

## 1. 任务目标

为 `apps/spine2pixiani-demo` 增加一组新的 Spine 资源支持，目标资源组为：

- `assets/spine2pixiani/12.json`
- `assets/spine2pixiani/12.atlas`
- `assets/spine2pixiani/12.png`

本次不是简单复制资源文件，而是要让 demo 真正具备播放这组资源所需的最小运行能力，并继续保持“不依赖 Spine 运行时”的实现路线。

本计划基于当前仓库实际代码结构编写，可直接执行，不依赖额外口头上下文。

## 2. 当前实现现状

结合仓库现状，可确认 `apps/spine2pixiani-demo` 目前是围绕 `cabin` 单组资源实现的：

- `src/main.ts`
  - 直接引入 `cabinAnimationData`、`cabinAnimationNames`、`cabinAtlasText`、`cabin.png`。
  - 启动时只加载一套 atlas 和一套动画数据。
  - UI 下拉框只承载当前这一组资源中的动画名，不支持资源组切换。
- `src/data/cabin-animation-data.ts`
  - 直接把 `cabin-spine.json` 适配成内部 `SpineModel`。
  - 没有“多资源组注册表”或“按资源组加载”的抽象。
- `src/ani/cabin/*`
  - 场景实体、播放实体命名和目录结构都绑定在 `cabin` 语义上。
  - 当前虽然内部很多逻辑已经是基于通用 `SpineModel`，但外层接线仍是单资源写死。
- `src/runtime/spine-adapter.ts`
  - 已支持：
    - bone timeline: `translate`、`rotate`、`scale`
    - slot timeline: `attachment`、`color`
  - 尚未支持：
    - bone timeline: `shear`
    - animation timeline: `drawOrder`
- `src/runtime/timeline-sampler.ts`
  - 当前采样结果中的 `drawOrder` 固定返回 `model.slotOrder`。
  - 说明 demo 还没有真正实现逐帧 draw order 采样。
- `README.md`
  - 明确写着“当前资源没有使用 draw order 动画，因此本 demo 没有实现 draw order 采样”。

## 3. 已确认的 12 号资源差异

基于 `assets/spine2pixiani/12.json` 的结构，可确认这组资源相较 `cabin.json` 存在以下新增要求：

- 动画名称共 8 个：
  - `bonus1`
  - `bonus2`
  - `bonus3`
  - `bonus4`
  - `bonus5`
  - `fg1`
  - `fg2`
  - `fg3`
- 骨骼数约 154，slot 数约 125，规模明显大于当前 `cabin` 资源。
- 使用了 `drawOrder` timeline。
- 使用了 `shear` bone timeline。
- slot timeline 仍以 `attachment`、`color` 为主。

结论：

- 如果不补 `drawOrder`，这组资源的前后遮挡关系无法可靠还原。
- 如果不补 `shear`，这组资源的骨骼姿态会出现明显偏差，不能认为“已支持 12 号动画”。
- 如果不把 demo 从“单资源组硬编码”改成“至少支持 cabin 与 12 两组资源切换”，后续继续加资源会重复返工。

## 4. 默认约束与执行原则

为保证任务可直接落地，执行时默认采用以下原则：

- 继续坚持“不引入 Spine 官方运行时”。
- 优先在 `apps/spine2pixiani-demo` 内完成本次能力扩展，不把 demo 特有逻辑下沉到共享包，除非确有必要。
- 本次目标是“支持当前 12 号资源真实用到的数据子集”，不是做完整 Spine Schema 覆盖。
- 若为降低耦合，需要把 `ani/cabin` 中的通用逻辑重命名或上提到更中性的目录，可以执行。
- 允许新增“资源组描述模块 / 注册表模块 / 选择器 UI”，前提是职责明确。
- 若依赖下载失败，可先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

## 5. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `apps/spine2pixiani-demo` 能加载并播放 `12` 资源组。
- 页面上能选择资源组，并在切换资源组后正确刷新动画列表。
- `12` 资源组至少能播放其 JSON 中声明的全部动画名。
- `drawOrder` timeline 已在适配层与采样层打通，播放时能反映逐帧层级变化。
- `shear` timeline 已被正确适配和采样，且最终渲染姿态与资源预期基本一致。
- `cabin` 原有播放能力不回归。
- atlas 与贴图加载能同时覆盖 `cabin` 与 `12` 两组资源。
- 至少补充一组自动化测试，覆盖：
  - `drawOrder` 适配/采样
  - `shear` 适配/采样
  - 多资源组切换后的动画列表与播放入口
- `README.md` 已更新，说明当前支持的资源组、能力边界、运行方式与验收步骤。
- 任务完成后新增中文任务报告到 `tasks/`：
  - 文件名：`12-spine2pixiani-demo-asset-12-support-[utctime].md`
  - `utctime` 使用 UTC 时间，格式为 `年月日时分秒`，例如 `260403-101530`
- 若本次只修改 demo 代码、测试、README、任务文档，则无需更新根级 `agents.md`；若影响仓库协作规则、目录规范或基础脚本，则必须同步更新。

## 6. 实施范围

本计划默认涉及以下路径：

- `apps/spine2pixiani-demo/src/main.ts`
- `apps/spine2pixiani-demo/src/styles.css`
- `apps/spine2pixiani-demo/src/data/**`
- `apps/spine2pixiani-demo/src/runtime/spine-types.ts`
- `apps/spine2pixiani-demo/src/runtime/spine-adapter.ts`
- `apps/spine2pixiani-demo/src/runtime/timeline-sampler.ts`
- `apps/spine2pixiani-demo/src/runtime/transform.ts`
- `apps/spine2pixiani-demo/src/runtime/display-factory.ts`
- `apps/spine2pixiani-demo/src/ani/**`
- `apps/spine2pixiani-demo/src/ui/**`
- `apps/spine2pixiani-demo/tests/**`
- `apps/spine2pixiani-demo/README.md`
- `tasks/12-spine2pixiani-demo-asset-12-support.md`
- 最终任务报告 `tasks/12-spine2pixiani-demo-asset-12-support-[utctime].md`

本次默认也会读取并复制以下资源：

- `assets/spine2pixiani/12.json`
- `assets/spine2pixiani/12.atlas`
- `assets/spine2pixiani/12.png`

## 7. 推荐实现方向

### 7.1 先把单资源组实现整理成“资源组驱动”

建议新增一层资源组描述，例如：

- 资源组 id：`cabin`
- 资源组 id：`12`

每个资源组至少包含：

- 展示名
- Spine JSON 数据入口
- atlas 文本入口
- atlas 图片 URL
- 默认动画名
- 动画名列表

建议把这层抽象放在 `src/data/` 下，例如：

- `src/data/animation-bundles.ts`
- `src/data/cabin/*`
- `src/data/asset-12/*`

目的：

- 让 `main.ts` 不再硬编码 `cabin`。
- 后续新增第 3 组资源时不需要再次重写启动逻辑。

### 7.2 运行时能力补齐顺序

本次执行顺序建议固定为：

1. 先补 `spine-types.ts` 的数据结构。
2. 再补 `spine-adapter.ts` 的原始数据适配。
3. 再补 `timeline-sampler.ts` 的逐帧采样。
4. 最后再接 UI 与资源切换。

原因：

- `12` 资源当前的主要风险不是 UI，而是运行时能力缺口。
- 如果先做资源切换而不补能力，页面能切换但画面不对，排查成本会更高。

### 7.3 命名与目录建议

当前 `ani/cabin` 目录名会给后续扩展带来误导，建议二选一：

- 方案 A：保留 `ani/cabin`，但把其中通用类重命名为更中性的名称。
- 方案 B：新增更中性的目录，例如 `ani/spine-model` 或 `ani/demo-scene`，逐步承接公共逻辑。

默认推荐方案 B，因为本次已经不是 `cabin` 专属逻辑。

## 8. 具体实施步骤

### 步骤 1：整理 12 号资源并建立数据入口

执行内容：

- 将 `assets/spine2pixiani/12.json` 复制到 demo 的 `src/data/` 下，并按现有自包含策略纳入应用目录。
- 将 `assets/spine2pixiani/12.atlas` 与 `12.png` 复制到 demo 的 `src/assets/` 下。
- 新增与 `cabin-animation-data.ts` 对应的 `12` 资源数据入口模块。
- 明确该资源组的默认动画名，建议使用第一个主动画，例如 `bonus1`，并在代码中写死为 bundle 配置，而不是散落在 UI 逻辑里。

交付标准：

- demo 代码内已存在 `12` 资源组的 JSON / atlas / image 入口。
- 动画名列表可以从内部模型稳定读取。

### 步骤 2：扩展内部 Spine 数据类型

执行内容：

- 在 `src/runtime/spine-types.ts` 中补齐 `12` 资源所需的最小类型：
  - raw bone timeline 增加 `shear`
  - 内部 bone animation 增加 `shear`
  - raw animation 增加 `drawOrder`
  - 内部 animation 增加 `drawOrder` keyframes
- 明确 draw order 的内部表达方式，建议使用“在某时间点给出 slot 名顺序数组”或“slot 偏移列表展开后的最终顺序数组”两种方式之一。
- 只支持当前 `12.json` 实际使用的数据形态，不额外扩展未使用字段。

交付标准：

- 类型定义足以无歧义表达 `12.json` 中的 `shear` 与 `drawOrder`。
- 不需要在后续实现中使用大量 `any` 或类型断言兜底。

### 步骤 3：在适配层支持 shear 与 drawOrder

执行内容：

- 在 `src/runtime/spine-adapter.ts` 中：
  - 适配 bone 的 `shear` 时间轴。
  - 读取 animation 的 `drawOrder` 数据。
  - 计算动画时长时，把 `drawOrder` 时间点也计入 duration。
- 若 `12.json` 的 `drawOrder` 使用 Spine 常见 offset 结构，需在适配层展开成运行时更易消费的最终顺序。
- 保持 `cabin` 无 `drawOrder` 时的兼容行为，不要求资源补数据。

交付标准：

- `adaptSpineData()` 输出的 `SpineModel` 已完整包含 `12` 所需的新增 timeline 数据。
- 对 `cabin` 和 `12` 两组资源都能成功适配。

### 步骤 4：在采样层真正支持逐帧 drawOrder 与 shear

执行内容：

- 在 `src/runtime/timeline-sampler.ts` 中：
  - 为骨骼采样新增 `shearX/shearY` 或等价表示。
  - 为动画姿态采样新增真实 `drawOrder` 输出，不再固定返回 `model.slotOrder`。
- 如现有 `transform.ts` 的世界变换合成尚未包含 shear，需要同步扩展矩阵合成公式。
- 对没有 shear 或 draw order 的旧资源，保持当前结果不变。

交付标准：

- `sampleAnimationPose()` 在 `12` 资源上能返回真实 draw order。
- shear 生效后，世界变换与 attachment 姿态不会因坐标系处理错误而明显扭曲。

### 步骤 5：让渲染层按采样后的 drawOrder 真正出图

执行内容：

- 检查 `cabin-scene.ts` 当前 slot sprite 的创建与更新方式。
- 若当前只是按初始 slot 顺序 addChild，需要改为按 `pose.drawOrder` 控制绘制顺序。
- 推荐方案：
  - 为 slot layer 开启 `sortableChildren`
  - 每帧根据 `pose.drawOrder` 给 sprite 设置稳定 `zIndex`
- 需要定义兜底规则：
  - 优先使用当前采样出的 draw order
  - 若缺失则退回 `model.slotOrder`
  - 同序号冲突时用初始 slot 索引兜底，保证排序稳定

交付标准：

- `12` 动画播放时，前后遮挡切换与资源预期一致。
- `cabin` 原本表现不退化。

### 步骤 6：把主流程改造成“资源组切换 + 动画切换”

执行内容：

- 更新 `src/main.ts`，将初始化逻辑改为先选择资源组，再选择该资源组下的动画。
- 当前界面至少需要新增一个资源组选择控件。
- 切换资源组时，需要完整更新：
  - atlas 纹理
  - `SpineModel`
  - 动画列表
  - 当前播放实体
  - 调试树数据
  - 默认选中动画
- 切换过程中不能残留上一个资源组的 bone 节点、slot sprite、选择高亮或事件监听。

交付标准：

- 页面能在 `cabin` 与 `12` 间切换。
- 切换资源组后，动画下拉框只展示当前组的动画。
- 默认动画、重播、循环、调试树、节点选择仍然可用。

### 步骤 7：视图与调试层兼容大资源组

执行内容：

- 校准 `12` 资源的初始缩放与舞台定位，避免一加载就超出画布或过小不可见。
- 若当前初始缩放完全依赖 `skeleton.width/height`，需要实际验证 `12` 资源是否仍适用。
- 检查调试树在 154 bones / 125 slots 下的可读性：
  - 至少保证可渲染、可滚动、可点选。
- 如有必要，增加资源组名称展示或当前动画信息展示，降低调试混淆。

交付标准：

- `12` 资源首次加载后肉眼可见且可交互。
- 调试树不会因为节点量变大而直接不可用。

### 步骤 8：补充自动化测试

执行内容：

- 更新或新增 `tests/runtime/spine-adapter.test.ts`，至少覆盖：
  - `12` 资源被适配出 8 个动画名
  - `shear` timeline 已读入
  - `drawOrder` timeline 已读入
- 更新或新增 `tests/runtime/timeline-sampler.test.ts`，至少覆盖：
  - 指定时间点采样到的 draw order 不等于默认 slot 顺序
  - 指定骨骼的 shear 采样结果符合预期
- 更新或新增动画实体 / 场景测试，至少覆盖：
  - 切换到 `12` 后能正常播放默认动画
  - 切换资源组后动画时间会重置
  - 渲染顺序由 `drawOrder` 驱动，而不是创建顺序驱动

交付标准：

- 有自动化测试证明本次是“能力补齐”，不是只改 UI。

### 步骤 9：更新 README 与输出任务报告

执行内容：

- 更新 `apps/spine2pixiani-demo/README.md`，补充：
  - 当前支持的资源组：`cabin`、`12`
  - 当前已支持的数据子集增加 `drawOrder`、`shear`
  - 若仍有未支持 Spine 特性，明确写出边界
  - 资源组切换与动画切换操作说明
  - 推荐启动、测试、构建命令
- 实现完成后，在 `tasks/` 下新增中文任务报告：
  - 文件名：`12-spine2pixiani-demo-asset-12-support-[utctime].md`
  - `utctime` 使用 UTC 时间，格式示例：`260403-101530`
- 报告至少包含：
  - 任务目标
  - 实际改动
  - 测试结果
  - 遗留问题
  - 是否更新 `agents.md`

交付标准：

- 新接手同事只看 README 和任务报告，就能理解本轮实现边界与验证方式。

## 9. 手工验收清单

执行完成后按以下步骤验收：

1. 运行 `pnpm --filter spine2pixiani-demo dev`，确认页面可打开。
2. 默认进入 `cabin` 或既定默认资源组时，确认原有动画仍可正常播放。
3. 切换到 `12` 资源组，确认动画下拉框切换为 `bonus1` 到 `fg3` 对应列表。
4. 播放 `bonus1`，确认画面可见，且不会因为缺图或 attachment 映射错误出现大面积空白。
5. 在 `12` 资源组中切换 2 到 3 个不同动画，确认不会崩溃、黑屏或残留上一个动画状态。
6. 观察存在遮挡变化的片段，确认前后层级会随时间变化，而不是固定死。
7. 对照关键骨骼动作，确认 shear 生效后没有明显姿态畸变。
8. 切回 `cabin`，确认旧资源仍可正常播放，说明没有回归。
9. 运行 `pnpm --filter spine2pixiani-demo test`，确认测试通过。
10. 运行 `pnpm --filter spine2pixiani-demo typecheck`，确认类型检查通过。
11. 如有必要，运行 `pnpm --filter spine2pixiani-demo build`，确认构建通过。

## 10. 推荐执行命令

建议执行顺序如下：

1. `pnpm --filter spine2pixiani-demo test`
2. `pnpm --filter spine2pixiani-demo typecheck`
3. `pnpm --filter spine2pixiani-demo dev`
4. `pnpm --filter spine2pixiani-demo build`

若本地尚未装依赖，可先执行：

```bash
pnpm install
```

若依赖下载失败，可先执行代理配置后重试：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
pnpm install
```

## 11. 风险与决策边界

- 风险 1：只做资源切换，不补运行时能力
  - 规避方式：必须先实现 `shear` 与 `drawOrder`，再接 12 资源。
- 风险 2：在适配层保留过多原始 Spine 结构，导致运行时逻辑变复杂
  - 规避方式：在 `spine-adapter.ts` 内把 `drawOrder` 尽量展开为更直接的内部结构。
- 风险 3：draw order 只在采样层返回，但渲染层没有真正使用
  - 规避方式：把“渲染层排序接线”单列为独立步骤和测试点。
- 风险 4：shear 数学处理接错坐标系，导致镜像骨骼或子 attachment 姿态异常
  - 规避方式：优先在纯函数层补测试，再手工验画面。
- 风险 5：切换资源组时残留旧场景事件监听或选中状态
  - 规避方式：切换资源组时重建实体并显式清理旧状态。
- 风险 6：`12` 资源体量更大，初始缩放或调试树体验变差
  - 规避方式：把首屏可见性与调试树可用性纳入手工验收，不默认认为旧参数通用。

## 12. agents.md 是否需要更新

按当前任务判断，本次默认只影响：

- demo 应用代码
- demo 测试
- demo README
- `tasks/` 下的计划与报告

因此默认不需要更新根级 `agents.md`。

只有在实际执行中出现以下情况时，才需要同步更新：

- 修改仓库协作规则
- 调整 `tasks/` 目录规范
- 变更根级基础脚本或通用执行约定

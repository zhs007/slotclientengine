# 任务 115 执行报告：VNI_0.095 CardCarousel3D

- 执行时间：2026-07-21（报告后缀为 UTC `260721-093325`）
- 执行仓库：`/Users/zerro/github.com/slotclientengine`
- 分支 / 基线：`main` / `6b9861cad13b2dc3c47729309696a48111ef9d0c`
- 结果：代码验收通过；最终浏览器人工验收按要求留给用户执行。

## 工作区与边界

执行前主工作区包含用户尚未提交的 VNI editor 改动，以及未跟踪的任务计划文件。以下五个 editor 文件在执行前后 SHA-256 完全一致，本任务没有修改：

| 文件 | SHA-256 |
| --- | --- |
| `docs/anieditor5/src/animation_presets.ts` | `4dcccfd60431b9e8f29c9d7ec5fe572889f5a72e32bdb8fa79e8b0ba374c4c1a` |
| `docs/anieditor5/src/constants.ts` | `0b4fdb8c5cd26592d95b6a526f859f5e0e57c5eadd4512453e65420fda6ebc25` |
| `docs/anieditor5/src/main.ts` | `e72060f259756ab45c64ceb5a81c617ad85176861840799088e9c753ec2fa176` |
| `docs/anieditor5/src/pixi_stage.ts` | `256cc346fa5bf41757b16c79292d8cfe55a41e3fb82163c1b19146c45a4a32bb` |
| `docs/anieditor5/src/types.ts` | `fc2b63610581f1becc3dde3cfb7207a4564ae3bce2c0c90fb273e45a07fa0db7` |

计划提及的 Codex worktree `/Users/zerro/.codex/worktrees/177b/slotclientengine` 仍位于同一基线，且仅有同一任务计划文件未跟踪。本次实现只写入主工作区，没有覆盖或清理任何用户改动。

实现边界严格限定为 VNI core、Pixi runtime、viewer、测试与文档：没有实现 Cocos controller、Cocos asset array、compatibility adapter，也没有把 editor preview 的逐帧对象创建方式复制到 runtime。

## 交付内容

### Editor → Core → Pixi → Viewer 合同

| 层 | 所有权与行为 |
| --- | --- |
| Editor export | 接收 `VNI_0.095`、`card_carousel_3d`、33 个显式数值参数、phase、`hideBack`、`keepOriginal`；本任务不修改 editor。 |
| VNI core | 严格验证合同；预计算时长、角度、reveal rank、fast/stop 起止状态；纯采样五阶段，复用输出 buffer，并给出稳定深度顺序。 |
| Pixi runtime | 使用固定 card container / slice sprite pool；按 texture/frame/slice 缓存 texture view；更新几何、颜色、alpha 与 draw order；销毁 view 而不销毁共享 source。 |
| Viewer | 走生产 `VNIPlayer`；展示 phase/card/texture/slice 摘要；提供 image/sequence 合成 ZIP 回归夹具；缩放只改变 stageRoot，不再缩小 renderer/clip viewport。 |

### 严格解析与验证

- 新增正式 effect type：`card_carousel_3d`。
- 33 个数值参数全部要求显式存在且为 finite number；整数、枚举、范围和相互依赖分别校验。
- phase 仅允许 `full_demo | intro | idle | fast | stop | hold`。
- `hideBack`、`keepOriginal` 必须为 boolean；`targetIndex < cardCount`。
- 仅允许 image/sequence layer；其它 layer type 显式失败。
- duration 按 editor 合同派生，钳制到 `0.05..3600s` 并以 `0.05s` 对齐，不静默补默认值。
- `keepOriginal=false` 时 source opacity 为 0；为 true 时保留 `baseOpacity * sourceOpacity`。

### 五阶段采样与纹理合同

- 实现 intro、idle、fast、stop、hold 以及 full_demo 的分段采样，与 editor 的角度、透视、倾斜、alpha、背面、缩放、停靠弹出/发光公式保持一致。
- image 使用单一 source texture；sequence 使用完整 frame asset 列表，card 到 texture 采用稳定 modulo 映射。
- 竖切片按 texture frame 生成，不依赖 source 原始尺寸相同；不同尺寸 sequence frame 有专项测试。
- draw order 使用预分配的 `Int16Array` 和稳定插入排序；采样路径不创建临时 Map、Array、Container 或 Texture。

### Pixi pool/cache 生命周期

- card container 与 slice sprite 在 prepare 后固定创建并跨帧复用。
- slice texture view 以 texture identity、frame、slice count、slice index 缓存。
- 多个 CardCarousel effect 使用独立 root，稳定挂在 source layer 的 sibling 层级。
- prepare/init 失败会 rollback；restart、seek、loop、segmented playback 和 destroy 均复用统一清理路径。
- destroy 只销毁切片 view，保持共享 texture source 可用。

### Viewer 缩放修复

- 缩放档位改为 `0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4`，最小缩放为 10%。
- Pixi renderer、canvas layer 与 VNI clip viewport 始终维持完整预览区尺寸。
- 新增 `VNIPlayer.setViewportScale()` / `getViewportScale()`，缩放只作用于以 viewport 中心为锚点的 `stageRoot`。
- 修复旧实现把 renderer/viewport 一起缩小，导致截图中只剩横向裁剪条的问题。

## 自动验收证据

### 专项测试

- VNI core：16 个测试文件，219 个测试全部通过；新增严格 validation、五阶段边界、image/sequence modulo、不同 frame size 和 source opacity 覆盖。
- Pixi 300 帧压力回归：7 个 card container、21 个 slice sprite、6 个 slice texture view 全程身份与数量稳定；销毁后 view 被释放，共享 source 未被销毁。
- Viewer：2 个测试文件，28 个测试全部通过；覆盖 10% 最小缩放、完整 viewport 不随缩放变化、CardCarousel 摘要及 image/sequence 合成 ZIP。
- Rendercore：66 个测试文件，461 个测试全部通过。

Viewer 的 ZIP fixture 是代码生成的 synthetic contract fixture，用于可重复自动测试；它不冒充真实 editor export。最终人工验收应再使用 editor 实际导出的 VNI_0.095 ZIP。

### 执行命令

以下命令全部通过：

```text
pnpm --dir packages/vnicore typecheck
pnpm --dir packages/vnicore lint
pnpm --dir packages/vnicore test
pnpm --dir packages/vnicore build
pnpm --dir packages/vnicore examples:typecheck
pnpm --dir packages/vnicore format:check

pnpm --dir apps/anieditorv5viewer typecheck
pnpm --dir apps/anieditorv5viewer lint
pnpm --dir apps/anieditorv5viewer test
pnpm --dir apps/anieditorv5viewer build
pnpm --dir apps/anieditorv5viewer format:check

pnpm --dir packages/rendercore typecheck
pnpm --dir packages/rendercore test
pnpm --dir packages/rendercore build

pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check

git diff --check
```

根级 Turbo 五项验收最终均为 `27 successful, 27 total`。构建仅出现已有的 Vite 大 chunk 提示和 Node loader deprecation 提示，没有失败。第一次格式化命令因非交互环境未设置 `CI=true`，pnpm 拒绝清理/reinstall `node_modules`；以 `CI=true` 重跑后通过，不属于产品或代码失败。

## 待用户执行的浏览器验收

1. 启动 `apps/anieditorv5viewer`，导入 editor 实际导出的 VNI_0.095 CardCarousel3D ZIP。
2. 依次检查 intro → idle → fast → stop → hold，以及 full_demo 的阶段衔接、最终 target 卡片 pop/glow。
3. 对 sequence 素材确认多张 texture 按 card index modulo 分配，切片没有缝、错位或尺寸漂移。
4. 将缩放从 100% 切到 10%，确认完整舞台仍以 viewport 中心缩小显示，裁剪区没有变成截图中的横条；再检查 400% 放大。
5. 检查 seek、restart、loop、segmented playback 后无残影、重复节点或纹理泄漏。

浏览器人工验收未由 Codex 执行，符合用户要求。

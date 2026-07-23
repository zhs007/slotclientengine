# 任务 126 执行报告

## 结论

任务 126 的代码、standalone、示例、文档、自动化测试和仓库门禁均已完成并通过。

按任务约定，真实 Cocos Creator 3.8.6 Web Desktop/browser 的视觉与 profiler 验收留给用户执行，因此当前状态为：

- 自动化与静态验收：通过。
- 真实 Creator/browser 视觉验收：待用户确认。
- 不把 fake Cocos、TypeScript 编译或单元测试冒充真实 GPU/浏览器验收。

执行基线为 `main` 的 `33089be621bbbb61d318e53e7c5681faa026ead6`，与执行前 `origin/main` 一致；未新建或切换分支。

## 输入样例核对

- `/Users/zerro/Downloads/bamboo4 (pixi).zip`
  - SHA-256：`8ba263e5823209c65bd23d0500b29f24364dbaeedb2db584d7a67a2285dcb44e`
  - 任务 125 Pixi 对照样例。
- `/Users/zerro/Downloads/bamboo4 (2).zip`
  - SHA-256：`d0be56873bb57dff3937aa583cec5c177508a65bbf136245484cdbfe5c35bdd5`
  - Cocos 3.8.6 `legacy_alpha` 样例。
  - 使用真实标识：
    - layer：`layer_sequence_mrupvsr0_7`
    - animation：`anim_module_mrupw05e_8`
    - `cardCount=13`
    - authored target：`0`
    - intro：`0..1.5s`
    - continuous hold：`1.5s`
    - ending：`3..9.6s`

外部 ZIP 和美术没有复制进仓库。

## 实现内容

### Core

- 新增与任务 125 数学语义一致的 cyclic selection 计算：
  - 连续旋转相位；
  - 动态目标 carrier 对齐；
  - resolve 采样；
  - 可见性与安全替换判断。
- CardCarousel3D 支持受控 motion sample，保留原 authored/legacy 播放路径。

### Cocos manual transport

- 新增可等待、可取消、可销毁的 manual playback session。
- 提供 `playRange()`、timeline hold、`advanceFor()`、capability 查询和 cyclic controller。
- manual session 与 legacy `play()`、`playRange()`、`seek()`、`restart()` 等 transport 写操作互斥并显式失败。
- ending range 保留 runtime animation state；range completion 继续遵守 particle drain。
- session/player destroy 会取消 operation/transaction、清除 motion override、恢复 authored carrier，并保持宿主 Node ownership。

### 复杂 Node capture 与 carrier replacement

- public visual contract 使用宿主 Node、显式 `width/height/revision`。
- 默认 Cocos driver 使用一次性 clone + Canvas + orthographic Camera + transparent RenderTexture 捕获完整子树。
- 捕获过程不 reparent、修改或 destroy 宿主 Node。
- capture cache 按 Node identity、尺寸、revision 复用，并使用引用计数释放 SpriteFrame/RenderTexture。
- initial 13 项先全部 prepare，再原子更新。
- replacement 先捕获，再等待实际 card sample 显示 carrier 隐藏；只在 render/update 边界原子提交。
- 禁止可见换图、临时 alpha 掩盖、扩展第 14 个 carrier、重排 carrier identity 或修改 authored target。
- 捕获或替换失败会 rollback；取消和 destroy 会释放未提交资源。

### Standalone 与示例

- standalone 由模块源码重新生成，没有手改生成文件。
- checker 已覆盖新增 public exports。
- standalone 与模块版新增 cyclic/core/manual player parity 测试。
- `V5GPreview.example.ts` 使用真实 Bamboo layer/animation 标识，展示：
  - 13 个宿主复杂 Node；
  - initial prepare；
  - intro；
  - timeline hold；
  - continuous phase；
  - 已存在 `bamboo-card-07` 分支；
  - 新 server-result Node replacement 分支；
  - commit、release hold、resolve、ending；
  - `try/finally` 主动销毁 session。
- README 同步说明完整流程、资源 ownership、capture 边界和限制。

### 长期约束

- `agents.md` 已追加任务 126 的 Cocos manual staged transport、一次性复杂 Node capture、安全 replacement 和禁止逐帧 capture 约束。
- `AGENTS.md` 与 `agents.md` 在当前大小写不敏感工作区为同一内容，`cmp` 通过。

## 自动化验收

### 目标包

最终 standalone 重新生成后执行：

```text
standalone:build         PASS
standalone:check         PASS
typecheck:standalone     PASS
typecheck                PASS
lint                     PASS
test                     PASS
build                    PASS
format:check             PASS
git diff --check         PASS
```

Vitest：

- 19 个 test files 全部通过。
- 212 个 tests 全部通过。
- coverage：statements `65.29%`、branches `58.87%`、functions `83.16%`、lines `66.65%`。

关键压力与回归：

- continuous/resolve 各 300 帧采样通过。
- 初始 3 个 Node capture 后持续 300 帧不新增 capture。
- 20 轮 replacement：20 次 capture、20 次 release，carrier/slice pool 保持有界。
- 捕获失败、非法尺寸、重复 key/node、未知 key、不可替换 carrier、transaction cancel、session/player destroy、transport 冲突均有显式失败或回滚测试。
- fake Cocos 完整子树捕获覆盖 Sprite、Label 和 nested child，并验证宿主 parent/transform/validity 不变、release 幂等。

### vnicore 非回归

```text
typecheck   PASS
test        PASS（17 files / 230 tests）
build       PASS
```

coverage：statements `90.61%`、branches `81.09%`、functions `96.65%`、lines `91.81%`。

`packages/vnicore`、`docs/anieditor5`、`apps/anieditorv5viewer` 无任务 126 改动。

### 整仓门禁

使用 Node.js `v24.14.0`、pnpm `10.0.0`，依次执行：

```text
CI=true pnpm typecheck       PASS（34/34）
CI=true pnpm lint            PASS（34/34）
CI=true pnpm test            PASS（34/34）
CI=true pnpm build           PASS（34/34）
CI=true pnpm format:check    PASS（34/34）
```

首次整仓 typecheck 暴露本地 `node_modules` 不完整；随后以 frozen lockfile 恢复现有依赖并重跑全部门禁。未修改 `package.json`、`pnpm-lock.yaml` 或依赖版本。

## 交付物

- standalone 源码：
  - `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
  - `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- 本地交付 ZIP：
  - `packages/anieditorv5runtime-cc/standalone.zip`
  - 只含上述两个 standalone 文件。
  - 大小：`82387 bytes`
  - SHA-256：`17a41f95ac35108d74a4f69ddbcf5cbdf47868c3061e2f8b4d1b1d7291758302`
  - ZIP 受仓库 `*.zip` ignore 规则管理，不进入 Git diff。

## 待用户执行的真实 Creator/browser 验收

1. 在 Cocos Creator `3.8.6` 中导入 standalone runtime/example，并使用 `bamboo4 (2).zip` 的 `runtime_100/project.json` 与对应 atlas/texture。
2. 给示例配置 root、project、atlas 和恰好 13 个真实复杂 Card Content Root Node，开启 `manualBambooPreview`。
3. 不配置 replacement Node，确认 existing `bamboo-card-07` 路径：
   - intro 为 `0..1.5s`；
   - hold 期间 authored timeline 固定但 carousel 连续运动；
   - resolve 无跳帧并在 authored target carrier `0` 对齐；
   - ending 为 `3..9.6s`。
4. 配置新的 replacement Node，再确认新结果只在隐藏 carrier 安全提交；不能看到可见换图、alpha 闪烁或第 14 个 carrier。
5. 构建 Web Desktop 并在目标浏览器检查透明背景、UV 朝向、Alpha/Mask、Label、nested child；如实际卡片包含 Spine 或自定义材质，也需逐项确认捕获结果。
6. 用 Creator/browser profiler 重复运行：
   - steady-state 每帧不得新增 Camera、RenderTexture、SpriteFrame 或切片 view；
   - capture 只发生在 initial/replacement prepare；
   - session/player destroy 后无 capture root、camera、RenderTexture 泄漏；
   - 13 个宿主 Node 始终有效、parent/transform 不变。

真实 Creator/browser 验收通过后，任务 126 才可标记为最终视觉验收完成。

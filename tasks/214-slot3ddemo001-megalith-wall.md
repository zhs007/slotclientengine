# 214 slot3ddemo001-megalith-wall 任务计划

状态：已完成。执行报告：`tasks/214-slot3ddemo001-megalith-wall-260815-084930.md`。

## 1. 目标与完成定义

### 目标

新增 `apps/slot3ddemo001` 前端视觉 PoC，使用 Three.js 加载两份现有巨石 GLB，按本地随机
5×3 scene 让 symbol 保持固定正面、纯垂直从上方落下，并按底排到顶排的顺序自然形成一堵
正对摄像机的巨石墙。PixiJS 只提供透明 UI 层和重新落石入口。

### 完成定义

- [x] 浏览器进入页面后加载两份 GLB，并用统一包围盒合同修正中心、底部接触点和等比缩放。
- [x] 每轮生成只含两种 symbol code 的随机 5×3 scene；巨石无自转、无传统 spin。
- [x] 底排先落、中排其次、顶排最后，同排有固定节奏错峰，全部落稳后形成完整正面墙体。
- [x] 固定正面透视摄像机随 viewport 自适应，横竖屏都能完整看到墙体和地基。
- [x] Three.js 负责 scene、camera、symbol、灯光、阴影和下落；PixiJS 负责状态文字与 DROP AGAIN。
- [x] 重播会清理上一轮墙体与 transient animation，不重复加载或上传模型资源。
- [x] 提供纯函数测试、目标 app typecheck/lint/test/build，并完成人工浏览器视觉检查。

## 2. 范围

### 包含

- `apps/slot3ddemo001` 独立 Vite + TypeScript app。
- 下载目录两份 GLB 作为 demo 静态资源；资源由明确 URL 引用，不扫描目录或猜路径。
- Three.js `Scene`、`PerspectiveCamera`、GLTF loader、灯光、阴影、symbol clone 与下落时间线。
- PixiJS 透明 overlay、状态提示和重播按钮。
- 本地随机 scene 与确定的 bottom-to-top landing cadence。

### 不包含

- 不接服务器、`gameframeworks`、`logiccore`、`netcore`、下注、collect 或正式 round compiler。
- 不实现 reel、spin、symbol 自转、碎裂、中奖线、金额、音效或正式 loading UI。
- 不修改现有 `rendercore`、游戏 app、资源 manifest、YAML 或生成物。
- 不在本任务执行减面、KTX2、LOD 或 production 资源优化；原始 55–63 MB GLB 仅用于视觉验证。

## 3. 执行基线

```text
UTC: 2026-08-15T08:15:02Z
HEAD: 5292fae8cbb1f8d31decd7eb9ee6a8450792cd25
branch: detached HEAD
git status --short --untracked-files=all: clean
shell Node: unavailable until `nvm use 24`
shell pnpm: 11.19.0 before entering Node 24 environment
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md` 和 `img2threejs` skill；`apps/**` 下无补充
  `AGENTS.md`。
- 两份 GLB 均为一个 node、一个 mesh、一个 primitive、一个 PBR material、50,000 triangles，
  无 skin、无 animation；两者 bounds 接近但 center Y 不同，因此 runtime 必须按 bounds 规范化。
- 每份 GLB 内含三张 4096×4096 RGB PNG，当前文件大小约 63.4 MB 与 54.6 MB；这是 PoC 风险，
  不作为 production 交付基线。
- workspace 当前没有 `three` 依赖；`pixi.js` 既有版本为 `^8.1.6`。

## 4. 技术决策

1. **墙体使用 5×3 离散 scene。** scene 数据按 `[column][row]` 保存，`row=0` 是底排；随机值
   只允许两个显式 symbol code，未知 code 显式失败。
2. **symbol 只做固定朝向垂直位移。** 下落期间不修改 rotation；每个 clone 共享已加载的
   geometry、material 和 texture，重播只销毁 instance root，不销毁共享模板资源。
3. **规范化以视觉接触为合同。** 模板 mesh 先平移到 X 中心、Y 底部和 Z 正面基准，再按 cell
   的目标宽高做 uniform scale；禁止非等比缩放。
4. **摄像机严格正对墙体。** 使用窄 FOV 透视相机，optical axis 垂直墙面；resize 时根据墙体
   宽高和 viewport aspect 计算最小安全距离，不提供 orbit/control。
5. **底排到顶排形成墙。** timeline 是纯数据，落石采用重力感 ease-in；同排 cadence 和跨排
   cadence 由 app 常量集中拥有，不按 symbol code 分支。
6. **两 canvas 分层。** Three canvas 是主画面；Pixi canvas 透明覆盖并独立处理 pointer。两者使用
   同一 host 尺寸和 capped DPR，destroy 时释放 renderer、ticker、listener 和 UI。

## 5. 文件范围

### 预计新增

```text
apps/slot3ddemo001/**
tasks/214-slot3ddemo001-megalith-wall.md
tasks/214-slot3ddemo001-megalith-wall-<utctime>.md
```

### 预计修改

```text
pnpm-lock.yaml
```

### 原则上不应修改

```text
packages/**
apps/game002v2/**
apps/game003v2/**
assets/**
docs/agent-rules/**
```

## 6. 实施步骤

1. 创建 app scaffold、package scripts、Three/Pixi 依赖和两份明确命名的 GLB 静态资源。
2. 实现随机 scene、timeline 和摄像机 framing 纯函数，并添加边界测试。
3. 实现 GLB 一次加载、bounds 规范化、共享 clone、墙体 scene 和下落 lifecycle。
4. 实现 Three/Pixi 双 canvas bootstrap、响应式 resize、状态提示和 DROP AGAIN。
5. 执行定向测试与 build，启动真实浏览器检查模型朝向、墙体构图、落下顺序和重播。
6. 修正视觉/生命周期问题，运行 L3 验收并生成简洁执行报告。

## 7. 测试与验收

### 验收级别

`L3`：新增 Three.js 依赖会修改 workspace lockfile。先运行 app 定向命令；通过后运行根级
typecheck、lint、test、build、format check，并以 `git diff --check` 收尾。

### 执行会话必须运行

```bash
pnpm --filter slot3ddemo001 typecheck
pnpm --filter slot3ddemo001 lint
pnpm --filter slot3ddemo001 test
pnpm --filter slot3ddemo001 build
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm format:check
git diff --check
```

### 人工验收

- 浏览器确认两种 GLB 均正面朝向摄像机、没有自转，且中心/底部对齐。
- 确认底排、中排、顶排顺序形成完整墙体，resize 后不裁切。
- 连续点击 DROP AGAIN，确认上一轮不会残留，控制台无错误。

## 8. 风险与后续

- 原始 4K PNG 令初始下载和纹理显存过高；PoC 通过后必须单独规划 2K/KTX2、LOD 和真机预算。
- GLB metadata 只有 merged mesh，无法支持局部裂纹、碎裂或部件级中奖动画。
- Quick Look 未能生成模型预览；真实 Three.js 浏览器渲染是本任务的视觉验收权威。
- 本地随机 scene 不证明服务器 scene、round compiler 或 collect 流程，后续接入必须另立任务。

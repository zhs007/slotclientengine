# 任务 214 执行报告

## 结论

`apps/slot3ddemo001` 第一版前端视觉 PoC 已完成。页面使用 Three.js 渲染正对摄像机的 5×3
巨石墙，两种本地随机 symbol 按底排、中排、顶排顺序从天上纯垂直落下；没有 reel spin，
也没有 symbol 自转。PixiJS 作为透明 UI 层提供状态、随机 scene 数据和 `DROP AGAIN` 重播入口。

本版没有接服务器、`logiccore`、`netcore` 或正式中奖流程，符合“先测前端效果”的范围。

## 实现

- 两份下载目录 GLB 已复制为 `public/models/megalith-a.glb` 与 `megalith-b.glb`，通过显式 URL
  加载一次；每轮只 clone scene root，复用 geometry、material 和 texture。
- GLB 实例按 `Box3` 统一 X 中心、Y 底部接触点、Z 正面基准和等比 cell 缩放，消除两份模型
  原始尺寸与中心差异。
- scene 数据合同为 `[column][row]`，`row=0` 是底排；只接受 `megalith-a`、`megalith-b`，
  未知 code 显式失败。
- 下落 timeline 是纯数据。巨石固定朝向，只改变 Y；采用加速坠落与轻微落地回弹，同排错峰，
  并严格按底排到顶排形成完整墙体。
- Three.js 拥有透视摄像机、scene、灯光、阴影、背墙、地基和落地闪光；PixiJS 拥有透明 HUD、
  状态文字、scene 矩阵和重播按钮。
- 摄像机按 viewport aspect 重新计算安全距离；Three/Pixi DPR 均封顶为 1.5，窄屏 HUD 单独避让。
- 重播先移除上一轮 15 个 instance 和 transient impact light，再生成新随机 scene；共享模板资源
  直到 app destroy 才释放。

## 实际文件

新增：

```text
apps/slot3ddemo001/**
tasks/214-slot3ddemo001-megalith-wall.md
tasks/214-slot3ddemo001-megalith-wall-260815-084930.md
```

修改：

```text
pnpm-lock.yaml
```

现有 `packages/**`、其它 game app、资源 manifest、YAML 和生成物均未修改。

## 模型检查与风险

- 两份模型各为 1 node / 1 mesh / 1 primitive / 1 material、50,000 triangles，无 skin、无动画。
- `megalith-a.glb` 约 63 MB，SHA-256：
  `4190e89175436e4ef6188aa717dd912816e01b8ad6e1b3fa311488ab4f43cba5`。
- `megalith-b.glb` 约 55 MB，SHA-256：
  `24098460a748444f4ee33176fe1f5915ae44a2a6d5a45be4ad31db789fdd4dc7`。
- 两份 GLB 仅保留为本地忽略资源，不进入 Git；仓库提交模型目录占位和 README 固定路径说明。
- 每份模型内有三张 4096×4096 PNG。约 118 MB 的初始传输与高纹理显存只适合 PoC；正式版应
  另立任务做 2K/KTX2 纹理、mesh simplification/LOD 和真机 GPU/加载预算。
- 当前 50k triangles/模型因 clone 后同一时刻显示 15 个 instance，后续建议先制作 10k–20k 的
  主版本和约 3k–6k 的远景 LOD；减面时锁定正面轮廓、符号图案和大裂纹，再烘焙 normal/AO。

## 自动验收

- `pnpm --filter slot3ddemo001 typecheck`：通过。
- `pnpm --filter slot3ddemo001 lint`：通过。
- `pnpm --filter slot3ddemo001 test`：通过，1 file / 7 tests。
- `pnpm --filter slot3ddemo001 build`：通过；主 JS 约 919 kB，存在 PoC 可接受的 500 kB chunk warning。
- `pnpm build`：通过，37/37 workspace tasks，耗时 5m39s。
- `pnpm format:check`：通过，37/37 workspace tasks。
- `git diff --check`：通过。

因 lockfile 变化按 L3 运行的整仓既有检查中，下列失败与本 app 无依赖或文件交集，本任务未修改：

- `pnpm typecheck`：`packages/uiframeworks/tests/test-helpers.ts:36` 的 fake `GameLogic` 缺少三个
  现有接口方法。
- `pnpm lint`：`apps/game002v2/src/round-adapter.ts:216` 的 `_error` 未使用。
- `pnpm test`：22/23 tasks 成功，`@slotclientengine/rendercore` 有两个既有 symbol child-layer
  深比较断言失败；`slot3ddemo001` 本身 7/7 tests 通过。

## 浏览器验收

- 640×480：完整 5×3 墙体、地基、标题、scene 矩阵和按钮均在画面内，摄像机正对墙面。
- 480×640：墙体完整且居中，窄屏 HUD 已避开标题区域。
- 点击 `DROP AGAIN` 后状态切换为 `THE WALL IS FALLING`，新随机巨石从底排开始坠落；代码与
  画面均确认没有自转。
- 重播后旧墙体无残留，浏览器控制台最终无 error。

本地预览地址为 `http://127.0.0.1:5173/`；当前开发服务器会话保持运行，便于继续查看。

## 力度与紧密墙体复修

根据首次视觉反馈，补做以下调整：

- 下落高度从 8.5 提升到 13，单块时长从 0.92 秒压缩到 0.58 秒；巨石进入可见区域后以更高
  的末速度撞击，排间空拍缩短，仍严格保持底排到顶排。
- 每块落地向 3D 摄像机和整个 stage 注入同源衰减冲击：约 3–8 px 的屏幕位移、轻微景深方向
  推动，连续落石可叠加但有能量上限；Pixi HUD 与 Three 画面同步震动。
- 新增程序化尘土粒子和跟随落点的暖色冲击闪光；每轮重播及 destroy 都显式回收 geometry、
  material 和 texture。
- cell 从 2.18×2.08 收紧为 1.93×1.85，小于规范化模型 2.05×1.97 的占位尺寸；横纵约 6%
  轻微咬合，完整态不再透出背景空隙。
- 新增 gapless layout 与 camera impact 纯函数测试；定向 typecheck、lint、10 tests、build、
  `git diff --check` 重新通过。浏览器在第 4 块底排撞击时确认高速入场、屏幕震动和尘土存在，
  完成态为贴紧墙体，控制台无 error。
- 后续按材质反馈将两份 GLB 的 `MeshStandardMaterial.normalScale` 统一压到原始默认强度的 42%，
  保留 normal map 和几何轮廓，但降低侧光下过度锐利的凹凸感；定向 typecheck、lint、11 tests、
  build 及浏览器完成态复验通过，控制台无 error。

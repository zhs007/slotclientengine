# anieditorv5viewer update 任务报告

## 任务结论

已完成 `apps/anieditorv5viewer` 更新：

- 内置 `project`、`bigwin`、`megawin`、`superwin` 4 个 V5G 导出项目。
- UI 支持项目选择，切换项目时销毁旧 `V5GPlayer`、清空 stage mount、重新初始化新项目并重置 timeline。
- 同步新版 layer animation 类型、严格校验和叠加采样语义。
- 新增 `particles` / `particle_twinkle` 粒子采样与 Pixi 渲染路径。
- 保持未知资源、未知动画、未知 easing、未知 blend mode、非法 JSON 结构显式失败。
- 已按用户最新要求跳过浏览器冒烟验收，由用户自行处理。

## 新增 / 修改 / 删除文件

新增：

- `apps/anieditorv5viewer/src/config/bundled-projects.ts`
- `apps/anieditorv5viewer/src/runtime/particle-sampler.ts`
- `apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts`
- `apps/anieditorv5viewer/src/assets/projects/bigwin.json`
- `apps/anieditorv5viewer/src/assets/projects/megawin.json`
- `apps/anieditorv5viewer/src/assets/projects/superwin.json`
- `apps/anieditorv5viewer/src/assets/assets/*` 新增导出资源，目录当前共 28 张 PNG。

修改：

- `apps/anieditorv5viewer/README.md`
- `apps/anieditorv5viewer/src/main.ts`
- `apps/anieditorv5viewer/src/runtime/animation-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/layer-instance.ts`
- `apps/anieditorv5viewer/src/runtime/project-sampler.ts`
- `apps/anieditorv5viewer/src/runtime/v5g-player.ts`
- `apps/anieditorv5viewer/src/runtime/validation.ts`
- `apps/anieditorv5viewer/src/styles.css`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `apps/anieditorv5viewer/src/v5g/types.ts`
- `apps/anieditorv5viewer/tests/runtime/animation-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts`
- `apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts`
- `apps/anieditorv5viewer/tests/runtime/validation.test.ts`
- `apps/anieditorv5viewer/src/assets/project.json`

删除：

- `apps/anieditorv5viewer/src/config/bundled-project.ts`

未修改：

- `docs/anieditor5/src/**` 是本任务开始前已有输入改动，本次仅参考其导出播放语义，没有继续编辑。
- `AGENTS.md` / `agents.md` 未更新，因为本任务没有改变仓库级协作规则、目录规范或根级脚本。

## 资源同步结果

内置 JSON：

- `apps/anieditorv5viewer/src/assets/project.json`
- `apps/anieditorv5viewer/src/assets/projects/bigwin.json`
- `apps/anieditorv5viewer/src/assets/projects/megawin.json`
- `apps/anieditorv5viewer/src/assets/projects/superwin.json`

资源校验：

- 4 个 JSON 合计引用 28 个唯一 `asset.path`。
- `apps/anieditorv5viewer/src/assets/assets` 当前有 28 张 PNG。
- viewer 资源文件列表与 `docs/anieditor5/export/assets` 一致。
- 本地 PNG header 尺寸与 JSON `asset.width/height` 全部一致。
- 浏览器运行时仍保留 `V5GPlayer.loadTexture()` 的 Pixi 纹理尺寸校验。

项目摘要：

| id | name | schemaVersion | duration | layers | assets | animations |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `project` | `胜利测试` | `V5G_0.0014` | 10 | 5 | 4 | `fade`, `move`, `rotate`, `scale_down`, `scale_up` |
| `bigwin` | `bigwin` | `V5G_0.0043` | 5 | 9 | 9 | `fade`, `particle_twinkle`, `particles`, `pulse`, `rotate`, `scale_up`, `shake`, `slide_in` |
| `megawin` | `megawin` | `V5G_0.0014` | 10 | 10 | 9 | `fade`, `move`, `particle_twinkle`, `particles`, `pulse`, `rotate`, `scale_up`, `shake`, `slide_in` |
| `superwin` | `superwin` | `V5G_0.0051` | 5 | 9 | 9 | `fade`, `move`, `particle_twinkle`, `particles`, `pulse`, `rotate`, `scale_up`, `shake`, `slide_in` |

## 动画和粒子实现说明

新增支持动画类型：

- `scale_in`
- `scale_out`
- `pop`
- `shake`
- `blink`
- `particles`
- `particle_twinkle`

采样语义：

- `move`、`slide_in`、`slide_out`、`rotate`、`float`、`swing`、`shake` 在当前 result 上叠加。
- `scale_up`、`scale_down` 按 `Math.abs(baseScale) || 1` 得到比例后乘到当前 result，保留负 scale 镜像符号。
- `scale_in`、`scale_out`、`pop`、`pulse` 以倍率乘到当前 result。
- 普通动画结束边界仍按 `time >= start + duration` 采样为 `progress = 1`。
- 粒子动画 active 判断使用 `time >= start && time < end`，结束瞬间不再生成粒子。

粒子渲染：

- 新增纯逻辑模块 `runtime/particle-sampler.ts`，覆盖 seed 稳定性、数量 clamp、twinkle batch 和 active 边界。
- `V5GPlayer` 新增 `particleRoot`，每次 `seek()` 清理旧粒子并重绘。
- active 粒子期间普通 image display 隐藏，粒子 sprite 负责显示，避免静态原图叠一份。
- 粒子 emitter 使用 sampled layer transform/opacity，粒子 blend mode 使用原 layer blend mode。

## Fail-fast 边界

继续显式失败：

- 非 `V5G_0.x` schemaVersion。
- 非 `victory_editor_v5_g` editor。
- 非 `center` coordinate。
- 顶层 `project.particles` 非空。
- 非空 layer keyframes。
- group layer。
- 非空 parentId。
- 未知 layer type、asset type、animation type、easing、blend mode。
- 缺失资源或 manifest 未覆盖 `asset.path`。
- `asset.width/height` 与加载纹理尺寸不一致。
- 必需数字参数缺失、非 finite number 或字符串数字。
- 可选 boolean 参数出现时不是 boolean。

## 测试和构建结果

app 级：

- `pnpm --filter anieditorv5viewer typecheck`：通过。
- `pnpm --filter anieditorv5viewer lint`：通过。
- `pnpm --filter anieditorv5viewer test`：通过，6 个测试文件，49 个测试。
- `pnpm --filter anieditorv5viewer build`：通过。
- `pnpm --filter anieditorv5viewer format:check`：通过。

根级：

- `pnpm typecheck`：通过，18/18 tasks successful。
- `pnpm lint`：通过，18/18 tasks successful。
- `pnpm test`：通过，18/18 tasks successful。
- `pnpm build`：通过，18/18 tasks successful。
- `git diff --check`：通过。
- `pnpm format:check`：失败，失败点不在本任务改动范围：
  - `apps/gameclientcli/src/gameplay-stats.ts`
  - `apps/gameclientcli/tests/fixtures/logic-gmi.ts`
  - `apps/gameclientcli/tests/gameplay-stats.test.ts`
  - 多个包的 `coverage/**` 输出文件也被 Prettier 扫到并报警。
  - `git diff -- apps/gameclientcli/...` 为空，确认这些不是本任务改动。
  - `anieditorv5viewer` app 级 `format:check` 已通过。

资源校验命令：

- 4 个 JSON 的 `asset.path` 全部存在。
- 28 个唯一资源全部存在。
- 28 张 PNG 尺寸与 JSON `asset.width/height` 全部一致。
- viewer 资源列表与 `docs/anieditor5/export/assets` 完全一致。

## 浏览器冒烟结果

按任务计划曾启动：

- 沙箱内 `pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175` 因 `listen EPERM: operation not permitted 0.0.0.0:5175` 失败。
- 提权后同命令启动成功，实际 URL 为 `http://localhost:5175/`。
- 用户随后明确要求“不需要你做浏览器验收，那个我来处理”，因此已停止 dev server，没有继续执行浏览器操作。

未收集浏览器 canvas 诊断数据：

- `data-v5g-project-id`
- `data-v5g-non-background-samples`
- 粒子时段视觉确认
- 窄屏 viewport 确认

这些浏览器验收项按用户最新要求交由用户处理。

## 偏离计划的实现决策

- 浏览器冒烟验收未执行：按用户最新明确要求取消。
- 粒子纯采样输出 Pixi 坐标系偏移，`V5GPlayer` 先将 sampled emitter 从 editor center 坐标转为 Pixi 坐标，再叠加粒子偏移；这样保持与 `docs/anieditor5/src/pixi_stage.ts` 的下落方向一致。
- 未更新 `AGENTS.md` / `agents.md`：本任务没有改变仓库级规则。

## 二次检查结论

- 4 个 JSON 已内置，并由 `bundledProjects` 清单统一管理。
- 所有 JSON `asset.path` 已解析到 `apps/anieditorv5viewer/src/assets/assets/*`。
- PNG 尺寸本地校验通过，Pixi runtime 尺寸校验保留。
- `screen` blend mode 仍支持。
- `particles` / `particle_twinkle` 按 layer animation 处理，顶层 `project.particles` 仍显式失败。
- 未放松未知动画、未知资源、未知 easing、未知 blend mode 的失败边界。
- active 粒子期间普通 image display 被隐藏。
- 项目切换会销毁旧 player、清空 mount、重置 timeline。
- README 已从单 `project.json` 更新为 4 项目说明。
- `data-v5g-project-id` 已加入 player 诊断；浏览器数据按用户要求未采集。
- dev server 已停止。

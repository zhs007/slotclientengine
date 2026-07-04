# game003 Spine symbol refresh 任务报告

## 1. 结论

本次按 `tasks/82-game003-spine-symbol-refresh.md` 完成 `game003-s1` Spine symbol 接入刷新。

- 本次处理 Spine symbol：`WL,H1,H2,H3,H4,H5,CL,SC`。
- 本次明确暂不处理的新 JSON 资源：`BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN`。
- 未新增第三方依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 未变化。
- 未引入第二套 Spine 官方 runtime；`spine=3.8.99` 通过 `packages/rendercore` 内部受限 Spine 3.8 adapter 支持，app 和 viewer 不直接依赖 Spine runtime。
- 非浏览器验收已完成；后续根据浏览器截图反馈，已追加修复 `rotate:true` atlas region 方向、`H1` weighted mesh 渲染和 `H1` clipping 裁剪问题，并用 `symbolsviewer` 浏览器预览复核 `H1/H2/CL/SC` 方向正常。`game003` 最终完整浏览器验收仍按用户要求留给用户执行。
- 资源复扫确认：当前本地 `H1.json` 含 1 个 `type:"clipping"` attachment，`end=h1`；当前本地 `CL.json` 不含 clipping attachment，只有 6 个 region。若美术期望 `CL` 也裁剪，需要重新导入带 clipping attachment 的 `CL.json`，runtime 已按 skeleton 实际数据支持。

## 2. 资源盘点

最终盘点命令确认：

```text
manifest symbols: WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC
spine jsons: BN.json,CL.json,CN.json,ES.json,H1.json,H2.json,H3.json,H4.json,H5.json,MP2.json,RS.json,Reel_NearWin.json,SC.json,UP.json,UPCN.json,WL.json
intersection: CL,H1,H2,H3,H4,H5,SC,WL
new/out-of-scope: BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN
```

各 Spine JSON 仍为 `spine=3.8.99`。`H2,H3,H4,H5` 只有 `Idle,Win`，没有 `Start/start`；因此它们的 `appear` 不写伪 `static` / `builtin`。

## 3. Manifest 状态结果

- `WL.normal=Idle`，`WL.appear=start`，`WL.win=Win`。
- `H1.normal=Idle`，`H1.appear=Start`，`H1.win=Win`。
- `H2,H3,H4,H5.normal=Idle`，`win=Win`，`appear` 不声明，由 rendercore Spine normal fallback 显示自身 normal，并按 once 状态完成。
- `CL,SC.normal=Idle`，`appear=Start`，`win=Win`。
- `L1-L5.win` 继续使用 VNI，`CO` 保持原合同。
- 每个 game003-s1 可展示 symbol 的 manifest `scale` 仍显式为 `1`。

## 4. 修改范围

- `packages/rendercore`：新增内部 `spine38-runtime.ts`，manifest 校验改用 Spine 3.8 合同校验；`SpineSymbolAni` 自动按 skeleton 版本选择 3.8 adapter 或官方 4.x player；新增 `SpineNormalFallbackAni` 支持缺状态退回自身 normal。
- `packages/rendercore` 后续修正：Spine atlas `rotate:true` 映射到 Pixi rotated texture 的正确方向；支持 Spine 3.8 weighted mesh attachment 和 clipping attachment，避免 `H1` mesh 被当成普通矩形 Sprite 渲染，并按 `Main -> end:h1` 多边形裁剪。
- `assets/game003-s1/symbol-state-textures.manifest.json`：接入 `CL/SC` Spine 状态，移除 `H2-H5.appear` 的伪 static。
- `apps/game003/config/game-static.yaml` 和 generated TS：Spine skeleton glob 更新为 `assets/game003-s1/{WL,H1,H2,H3,H4,H5,CL,SC}.json`，并同步 loading resources。
- `apps/symbolsviewer`：game003-s1 Spine skeleton glob 同步加入 `CL,SC`，测试覆盖 H2-H5 fallback 和 CL/SC Spine 状态。
- `apps/game003/scripts/verify-static-dist.mjs`：release check 覆盖 8 个 Spine JSON、`Symbol.atlas`、`Symbol.png`，并校验 source manifest 合同和 out-of-scope 边界。
- 文档与规则：同步更新 `apps/game003/README.md`、`apps/symbolsviewer/README.md`、`packages/rendercore/README.md`、`agents.md`。

## 5. 验收命令

已通过：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter game003 test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter buildgamestatic format:check
CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter game003 format:check
git diff --check
```

最终测试规模：

- rendercore：30 个 test files，187 个 tests 通过。
- buildgamestatic：4 个 test files，24 个 tests 通过。
- symbolsviewer：2 个 test files，15 个 tests 通过。
- game003：25 个 test files，115 个 tests 通过。

环境重试记录：

- 非 CI 的 `pnpm --filter game003 generate:static-config` 曾触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，按计划改用 `CI=true` 后通过。
- 非 CI 的 format check 同样触发 pnpm 非 TTY purge 问题，按计划改用 `CI=true` 后进入正常 Prettier 校验；定点格式化后全部通过。
- `release:check` 的 Vite 大 chunk warning 仍是 warning，命令退出码为 0，`game003 static dist check passed`。

浏览器反馈修正记录：

- 用户截图确认 `H2/CL/SC` 方向反、`H1` 显示错位。
- 根因：这些主体图对应的 atlas region 为 `rotate:true`，原 adapter 使用了错误的 Pixi rotate 方向；`H1` 还额外使用 Spine weighted `mesh` attachment 和 `clipping` attachment，不能按普通 Sprite 渲染，也不能跳过 clipping。
- 处理：修正 rotated texture 方向，新增 mesh geometry 渲染与 clipping mask 支持及测试覆盖。
- 复核：`symbolsviewer` 本地预览中 `H1/H2/CL/SC` 方向正常；`CL/SC` 在 disabled 灰态截图中方向也正常。
- 裁剪复扫：`H1.json` 当前附件类型为 `region=7, mesh=1, clipping=1`，clipping attachment 为 `Main`，`end=h1`，`vertexCount=4`；`CL.json` 当前附件类型为 `region=6`，没有 `type:"clipping"`。

## 6. 边界 grep

仓库根目录当前没有 `README.md`，第一条 grep 按现有路径执行：

```bash
rg -n 'assets/game003-s1/\*.json|game003-s1/\{WL,H1,H2,H3,H4,H5\}\.json|(H2|H3|H4|H5).*(static|builtin|静态)|(static|builtin|静态).*(H2|H3|H4|H5)' apps packages assets agents.md
```

结果：无命中。

第二条 grep 按任务原范围执行：

```bash
rg -n '\b(BN|CN|ES|MP2|RS|Reel_NearWin|UP|UPCN)\b' apps/game003 apps/symbolsviewer assets/game003-s1/symbol-state-textures.manifest.json
```

结果：无命中。为避免测试 fixture 和 release 防护列表污染该 grep，相关测试/脚本改为运行时拼出 symbol code；生产 display set、YAML、generated、manifest 仍无 out-of-scope symbol。

## 7. 第二遍遗漏检查

- 资源范围已重新盘点，最终处理集合与报告一致。
- Spine 3.8.99 不再触发 `Invalid timeline type for a slot`；rendercore 测试覆盖真实 game003 Spine 资源、exact animation name、atlas page/region 和 player once 完成。
- Rotated atlas region 已浏览器复核，`H2/CL/SC` 不再反向；`H1` weighted mesh 与 clipping mask 已通过 rendercore 测试覆盖，mesh mask 只持续到 `end=h1`，不会污染后续 `h1_k` slot，并在 symbolsviewer 浏览器预览中正常显示。
- YAML skeleton glob 没有使用宽泛 `*.json`。
- generated TS 由命令生成，`check:static-config` 通过。
- `release:check` 已校验 8 个 Spine JSON、`Symbol.atlas`、`Symbol.png` 的 dist 内容。
- `H2-H5.appear` 没有恢复成 static/builtin；fallback 只对 normal Spine resource 且 once 缺状态生效。
- `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 没有进入 game003 主转轮 display set、YAML spine glob、loading 主转轮 spine skeleton 组或 symbolsviewer game003-s1 display set。
- `agents.md` 已同步更新，后续新增或调整 Spine symbol 动画必须同步 manifest、YAML/loading/generated、symbolsviewer、runtime resolver 和测试。

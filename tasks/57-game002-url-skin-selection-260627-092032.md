# game002 skin=1 执行报告

## 1. 任务概述

本次在任务 57 原有 `skin=2`、`skin=3` 的 URL 皮肤选择基础上，追加支持 `skin=1`：

- `apps/game002` 的 `skin` query 参数现在只接受 `1`、`2`、`3`。
- `skin=1` 复用 `assets/gamecfg002/gameconfig.json`。
- `skin=1` 使用 `assets/game002-s1/bg.jpg` 和 `assets/symbols001`。
- `assets/symbols001` 已生成 `normal`、`spinBlur`、`disabled` PNG 和 `symbol-state-textures.manifest.json`。
- `BN` 作为 skin=1 显式透明空图标接入，不作为通用静默缺图兜底。
- 浏览器验收按用户要求不执行，由用户处理。

## 2. 资源处理

新增或确认的资源：

```text
assets/game002-s1/bg.jpg
assets/symbols001/WL.png
assets/symbols001/H1.png
assets/symbols001/H2.png
assets/symbols001/L1.png
assets/symbols001/L2.png
assets/symbols001/L3.png
assets/symbols001/L4.png
assets/symbols001/CN.png
assets/symbols001/BN.png
assets/symbols001/*.spinBlur.png
assets/symbols001/*.disabled.png
assets/symbols001/symbol-state-textures.manifest.json
```

生成命令：

```bash
env CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols001 --output-dir assets/symbols001 --symbols WL,H1,H2,L1,L2,L3,L4,CN,BN
```

资源校验结果：

- `assets/game002-s1/bg.jpg` 为 `2000 x 2000`。
- `assets/symbols001` 的 PNG 均为 `200 x 200 RGBA`。
- manifest 版本为 `1`，状态为 `spinBlur,disabled`。
- manifest 覆盖 `WL,H1,H2,L1,L2,L3,L4,CN,BN`。
- `BN.png` alpha 全透明。

## 3. 代码改动

主要改动：

- `apps/game002/src/skin-id.ts`：支持 `skin=1`，非法 skin 错误信息同步更新。
- `apps/game002/src/skin-config.ts`：新增 skin1 配置，静态收集 `symbols001`、`symbols001` manifest 和 `game002-s1/bg.jpg`。
- `apps/game002/src/game-layout.ts`：新增 skin1 独立棋盘布局，避免沿用 skin2/3 坐标。
- `apps/game002/src/game-demo.ts`、`apps/game002/src/game-adapter.ts`、`apps/game002/src/main.ts`：把 skin 级 `gridLayout` 传入 runtime、viewport 和 frame policy。
- `apps/game002/scripts/verify-static-dist.mjs`：静态包校验扩展到三套皮肤；仅允许 skin1 的 `BN` 透明 PNG 以内联方式存在，并要求能追踪到 `../../../assets/symbols001/BN*.png` 源路径。
- `apps/game002/README.md`：补充 skin1 URL、资源、BN 边界、布局和发布校验说明。
- `agents.md`：补充透明 BN 只能作为显式配置入口，不能静默吞缺图错误的长期协作规则。
- `tasks/57-game002-url-skin-selection.md`：追加 2026-06-27 的 skin1 范围说明。

skin1 布局：

```text
stage: 2000 x 2000
board frame: x=620, y=465, width=750, height=1200
grid: 6 columns x 9 visible rows
cell: 125 x 133.333333
```

这次按用户修正处理：下方格子不是装饰，布局包含完整底部行。

## 4. 测试和验证

已执行：

```bash
env CI=true pnpm --filter game002 test
env CI=true pnpm --filter game002 lint
env CI=true pnpm --filter game002 typecheck
env CI=true pnpm --filter game002 format:check
env CI=true pnpm --filter game002 release:check
git diff --check
```

结果：

- `test` 通过：10 个测试文件，68 个测试通过。
- `lint` 通过。
- `typecheck` 通过。
- `format:check` 通过。
- `release:check` 通过，dist 同时包含 skin1/skin2/skin3 背景与必要 symbol；skin1 `BN` 以内联 data URI 形式通过源路径绑定校验。
- `git diff --check` 通过。

未执行：

- 浏览器验收未执行。用户已明确表示浏览器验收由用户处理。

## 5. 注意事项

- 当前工作区已有与本任务无关的 `packages/anieditorv5runtime-cc` 修改，本次未回滚、未整理这些改动。
- `assets/symbols001/.DS_Store` 存在但被 git ignore，本次未删除。
- 若未来服务端对 skin1 下发 `WM`、`CM`、`CO`、`AF`，当前实现会按缺贴图显式失败；需要先补齐 `symbols001` 资源、manifest、测试和 README 后再放开。

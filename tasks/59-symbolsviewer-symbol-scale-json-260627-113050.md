# 任务 59 执行报告：symbolsviewer symbol scale json

## 结论

已完成任务 59。四套 `symbol-state-textures.manifest.json` 已显式写入每个 symbol 的 `scale`；`apps/symbolsviewer` 和 `apps/game002` 均改为从 manifest 读取 scale，不再把 consumer 内的手写 scale 表作为数据源。

浏览器验收：用户已明确表示“浏览器验收我来处理”，本次未启动 dev server，也未执行浏览器自动/手工验收。

## 修改文件清单

- `packages/rendercore/scripts/generate-symbol-state-textures.mjs`
- `packages/rendercore/tests/symbol/state-texture-generator.test.ts`
- `packages/rendercore/tests/symbol/texture-variants.test.ts`
- `packages/rendercore/README.md`
- `assets/symbols/symbol-state-textures.manifest.json`
- `assets/symbols001/symbol-state-textures.manifest.json`
- `assets/symbols002/symbol-state-textures.manifest.json`
- `assets/symbols002/WL.disabled.png`
- `assets/symbols003/symbol-state-textures.manifest.json`
- `apps/symbolsviewer/src/symbol-assets.ts`
- `apps/symbolsviewer/src/symbol-set-config.ts`
- `apps/symbolsviewer/src/main.ts`
- `apps/symbolsviewer/src/symbol-animation-config.ts`
- `apps/symbolsviewer/tests/symbol-assets.test.ts`
- `apps/symbolsviewer/tests/symbol-set-config.test.ts`
- `apps/symbolsviewer/README.md`
- `apps/game002/src/assets.ts`
- `apps/game002/src/skin-config.ts`
- `apps/game002/src/game-adapter.ts`
- `apps/game002/src/symbol-animation-config.ts`
- `apps/game002/tests/assets.test.ts`
- `apps/game002/tests/game-demo.test.ts`
- `apps/game002/tests/game-adapter.test.ts`
- `apps/game002/scripts/verify-static-dist.mjs`
- `apps/game002/README.md`
- `agents.md`
- `tasks/59-symbolsviewer-symbol-scale-json-260627-113050.md`

`assets/symbols002/WL.disabled.png` 是状态图生成器重建出的派生图；普通原图未被覆盖。

## manifest 最终 scale

`assets/symbols`：全部 `scale=1`

```text
S00,S0,S1,S5,S10,SC,RS,X2,X5,X10
```

`assets/symbols001`：全部 `scale=0.8`

```text
WL,H1,H2,L1,L2,L3,L4,CN,BN
```

`assets/symbols002`：全部 `scale=1`

```text
WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

`assets/symbols003`：全部 `scale=1`

```text
WL,H1,H2,L1,L2,L3,L4,CN,CO
```

## 关键实现

- `generate-symbol-state-textures.mjs` 新增 `--scale`，默认 `1`，并对 `0`、负数、`NaN`、空字符串和非数字字符串 fail-fast。
- manifest parser 允许 `normal`、`spinBlur`、`disabled`、`scale`，未知字段 fail-fast；`scale` 缺省解析为 `1`，但仓库配置创建时要求显式声明。
- `symbolsviewer` 新增 `symbols001` set，顺序为 `symbols,symbols001,symbols002,symbols003`；`BN` 是显式透明 display symbol，不是缺图 fallback。
- `game002` 的 `Game002SkinConfig.symbolScales` 从当前 skin manifest 生成，adapter 创建 runtime 时传入当前 skin 的 scale。
- `release:check` 增加 manifest scale 审计：`symbols001=0.8`，`symbols002/symbols003=1`。
- 已更新 `agents.md`，固化 game002 系列 symbol scale 必须随 manifest 维护的协作规则。

## 执行命令和结果

- `git status --short --untracked-files=all`：执行前仅有 `?? tasks/59-symbolsviewer-symbol-scale-json.md`。
- `git diff --stat`：执行前无 tracked diff。
- manifest 盘点命令：确认四套 manifest 起初都缺 `scale`。
- `pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures ... --scale 1`：首次触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。
- `CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures ... --scale 1`：通过。
- `CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols001 --output-dir assets/symbols001 --symbols WL,H1,H2,L1,L2,L3,L4,CN,BN --scale 0.8`：通过。
- `CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF --scale 1`：通过。
- `CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols003 --output-dir assets/symbols003 --symbols WL,H1,H2,L1,L2,L3,L4,CN,CO --scale 1`：通过。
- manifest scale 校验 node 命令：`symbol manifest scales ok`。
- `pnpm exec prettier --write ...`：首次触发同一 pnpm 非 TTY 问题。
- `CI=true pnpm exec prettier --write ...`：通过。
- `CI=true pnpm --filter @slotclientengine/rendercore test`：首次失败，原因是旧 `texture-variants.test.ts` expected 未包含 `scale: 1`；已修正测试合同。
- `CI=true pnpm --filter @slotclientengine/rendercore test`：通过，20 files / 110 tests。
- `CI=true pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `CI=true pnpm --filter @slotclientengine/rendercore lint`：通过。
- `CI=true pnpm --filter symbolsviewer test`：通过，2 files / 21 tests。
- `CI=true pnpm --filter symbolsviewer typecheck`：通过。
- `CI=true pnpm --filter symbolsviewer lint`：通过。
- `CI=true pnpm --filter symbolsviewer build`：通过。
- `CI=true pnpm --filter game002 test`：通过，10 files / 70 tests。
- `CI=true pnpm --filter game002 typecheck`：通过。
- `CI=true pnpm --filter game002 lint`：通过。
- `CI=true pnpm --filter game002 release:check`：通过，`game002 static dist check passed.`。
- `git diff --check`：通过。
- 最终 manifest scale 复核 node 命令：`symbol manifest scales ok`。

## 浏览器验收

未执行。原因：用户明确表示浏览器验收由用户处理。本次交付不冒充浏览器验收通过，剩余浏览器风险是 viewer 实际 PC 横屏切换和连续状态播放需要用户手工确认。

## 工作区状态说明

执行前存在未跟踪计划文件：

```text
?? tasks/59-symbolsviewer-symbol-scale-json.md
```

该文件是本次执行合同，未回滚、未删除。执行后新增本报告文件。未发现其它与本任务无关的 tracked 改动。

## 二次遗漏检查

- [x] `tasks/59-symbolsviewer-symbol-scale-json.md` 是当前计划文件。
- [x] 四套 symbol manifest 中每个 symbol 都有显式 `scale`。
- [x] `assets/symbols001` 每个 symbol 的 `scale` 是 `0.8`。
- [x] `assets/symbols`、`assets/symbols002`、`assets/symbols003` 的 `scale` 是 `1`。
- [x] 生成器支持 `--scale`，默认值为 `1`，非法值 fail-fast。
- [x] `symbolsviewer` scale 来源是 manifest JSON，不是手写 TS 表。
- [x] `symbolsviewer` 已注册 `symbols001`，scale 是 `0.8`。
- [x] `game002` `skin=1` runtime 使用 manifest scale `0.8`，测试已遍历实际 `RenderSymbol` 断言 scale。
- [x] `skin=2` / `skin=3` 保持 `scale=1`。
- [x] `BN` 没有变成通用 fallback。
- [x] 缺图、缺 manifest、非法 scale、未知字段、缺显式 scale 均有 fail-fast 测试或 release 审计覆盖。
- [x] README 和 `agents.md` 已同步新的 scale 数据源规则。
- [x] 所有自动化验收命令已执行并记录。
- [x] 已写 UTC 中文任务报告。

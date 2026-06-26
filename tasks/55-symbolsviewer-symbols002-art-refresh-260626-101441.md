# symbolsviewer symbols002 art refresh 任务报告

## 1. 基本信息

- 任务计划：`tasks/55-symbolsviewer-symbols002-art-refresh.md`
- 报告文件：`tasks/55-symbolsviewer-symbols002-art-refresh-260626-101441.md`
- UTC 时间：`260626-101441`
- 执行范围：更新 `assets/symbols002` 派生状态图、`symbolsviewer` 第二套缩放合同、测试和 README。

## 2. 修改文件

- `apps/symbolsviewer/src/symbol-set-config.ts`
- `apps/symbolsviewer/tests/symbol-set-config.test.ts`
- `apps/symbolsviewer/README.md`
- `assets/symbols002/*.spinBlur.png`
- `assets/symbols002/*.disabled.png`
- `tasks/55-symbolsviewer-symbols002-art-refresh.md`
- `tasks/55-symbolsviewer-symbols002-art-refresh-260626-101441.md`

`assets/gamecfg002/gameconfig.json` 已按计划重新生成，生成后内容与当前版本一致，因此没有产生 diff。`assets/symbols002/symbol-state-textures.manifest.json` 也重新生成并保持内容一致，没有产生 diff。

## 3. 资源生成结果

`assets/symbols002` 的普通图、`spinBlur` 和 `disabled` 派生图最终均为：

```text
200 x 200, 8-bit/color RGBA, non-interlaced
```

`assets/symbols002/symbol-state-textures.manifest.json` 检查结果：

```text
version: 1
states: spinBlur,disabled
symbols: WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
```

`assets/gamecfg002/gameconfig.json` 检查结果：

```text
symbolCodes: WL=0,H1=1,H2=2,L1=3,L2=4,L3=5,L4=6,WM=7,CN=8,CM=9,CO=10,AF=11,BN=12
reels: reels-001
paytable entries: 13
```

## 4. 代码和文档结果

- `symbols002` 的逐 symbol scale 从 `0.4` 改为 `1`，即 100%。
- `apps/symbolsviewer/tests/symbol-set-config.test.ts` 已同步断言 `symbols002.symbolScales` 全部为 `1`。
- `apps/symbolsviewer/README.md` 已把第二套资源说明从旧的 `500 x 500` / 40% 更新为 `200 x 200` / 100%。
- 未接入 `assets/symbols003`，也未新增 `symbols003` set。
- 未新增 fallback、placeholder 或静默降级逻辑。

## 5. 验证命令

首次直接运行状态图生成命令时，pnpm 在非 TTY 环境中触发依赖目录清理确认并失败：

```text
ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

随后使用 `CI=true` 重新运行，结果成功。

已执行并通过：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
CI=true pnpm --filter gengameconfig dev -- --paytable assets/gamecfg002/paytables.xlsx --reel assets/gamecfg002/reels-001.xlsx --out assets/gamecfg002/gameconfig.json
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer build
git diff --check
```

补充检查：

```bash
file assets/symbols002/*.png
node -e 'const m=require("./assets/symbols002/symbol-state-textures.manifest.json"); console.log(m.version); console.log(m.states.join(",")); console.log(Object.keys(m.symbols).join(","));'
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels).join(",")); console.log(Object.keys(cfg.paytable).length);'
rg -n 'symbols003|0\.4|40%|500 x 500' apps/symbolsviewer/src apps/symbolsviewer/tests apps/symbolsviewer/README.md
```

最后一个搜索仅剩 `durationSeconds` 和 `maxAlpha: 0.4`，属于动画时长/透明度配置，不是旧的缩放合同。

## 6. 浏览器验收

已启动 dev server：

```text
http://127.0.0.1:5173/
```

页面初始 DOM 已确认顶部 `Set` selector 包含：

```text
symbols
symbols002
```

用户明确说明“浏览器验收我来做”，因此 Codex 未继续执行完整浏览器视觉验收。完整检查项包括切换到 `symbols002` 后 12 个 symbol 可见、`BN` 不显示、100% 缩放、`spinBlur` / `disabled` 使用新派生图、连续切换无旧 Pixi 对象残留。

## 7. agents.md 同步判断

本任务只更新 `symbols002` 资源生成物、`symbolsviewer` 配置、测试和 README，未新增长期协作规则、目录规范或基础脚本约定，因此无需更新 `agents.md`。

## 8. 风险和后续

- `assets/symbols003` 仍是后续任务范围，本任务没有接入。
- 浏览器完整视觉验收由用户执行；若验收发现 100% 后布局拥挤，应调整 viewer 布局参数或行列计算，不应把 `symbols002` scale 改回 `0.4`。

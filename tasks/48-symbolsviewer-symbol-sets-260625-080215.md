# symbolsviewer symbol sets 任务报告

## 1. 任务摘要

本次按 `tasks/48-symbolsviewer-symbol-sets.md` 执行，完成 `apps/symbolsviewer` 双 symbol set 展示能力：

- 第一套继续使用 `assets/symbols` + `assets/gamecfg/game2.json`。
- 第二套新增使用 `assets/symbols002` + `assets/gamecfg002/gameconfig.json`。
- 第二套 `gameconfig.json` 由 `gengameconfig` 从 `assets/gamecfg002/paytables.xlsx` 和 `assets/gamecfg002/reels-001.xlsx` 生成，保持 `gengameconfig` 原生输出，未使用 Prettier 或手工格式化重排。
- 第二套生成了 `spinBlur` / `disabled` 状态 PNG 和 `symbol-state-textures.manifest.json`。
- `symbolsviewer` 新增 symbol set selector，切换时重建 catalog、Pixi symbols、labels 和状态面板，不保留上一套对象。
- `rendercore` 新增 `underlayLayer` 与 `singleSpriteUnderlayScale` 动画，满足第二套 `appear` 为主图后方半透明副本放大消退，而不是缩放主图。

## 2. 生成资源清单

第二套 runtime game config：

```text
assets/gamecfg002/gameconfig.json
```

第二套状态 manifest：

```text
assets/symbols002/symbol-state-textures.manifest.json
```

第二套状态 PNG 共 24 张：

```text
assets/symbols002/AF.disabled.png
assets/symbols002/AF.spinBlur.png
assets/symbols002/CM.disabled.png
assets/symbols002/CM.spinBlur.png
assets/symbols002/CN.disabled.png
assets/symbols002/CN.spinBlur.png
assets/symbols002/CO.disabled.png
assets/symbols002/CO.spinBlur.png
assets/symbols002/H1.disabled.png
assets/symbols002/H1.spinBlur.png
assets/symbols002/H2.disabled.png
assets/symbols002/H2.spinBlur.png
assets/symbols002/L1.disabled.png
assets/symbols002/L1.spinBlur.png
assets/symbols002/L2.disabled.png
assets/symbols002/L2.spinBlur.png
assets/symbols002/L3.disabled.png
assets/symbols002/L3.spinBlur.png
assets/symbols002/L4.disabled.png
assets/symbols002/L4.spinBlur.png
assets/symbols002/WL.disabled.png
assets/symbols002/WL.spinBlur.png
assets/symbols002/WM.disabled.png
assets/symbols002/WM.spinBlur.png
```

manifest 验收结果：

- `version = 1`。
- `states = ["spinBlur", "disabled"]`。
- `settings.spinBlur.kind = "verticalBoxBlur"`。
- `settings.disabled.kind = "grayscale"`。
- `symbols` 包含 `WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`。
- 不包含 `BN`。
- 不包含生成时间戳。

## 3. 主要修改文件

```text
apps/gengameconfig/src/excel.ts
apps/gengameconfig/tests/paytable.test.ts
apps/gengameconfig/tests/reels.test.ts
apps/symbolsviewer/README.md
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-animation-config.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/named-animations.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/tests/symbol/ani.test.ts
packages/rendercore/tests/symbol/animation-resolver.test.ts
packages/rendercore/tests/symbol/named-animations.test.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
```

`tasks/48-symbolsviewer-symbol-sets.md` 保留用户补充的验收约束：`gameconfig.json` 保持 `gengameconfig` 原生输出，不再用 Prettier 或手工格式化改写。

## 4. 最终 symbol set 列表

第一套 `symbols`：

- displayable：`S00,S0,S1,S5,S10,SC,RS,X2,X5,X10`
- paytable 缺图 ignored：`BN`
- asset 孤儿 ignored：`CO,SX`
- layered normal：`SC,RS,X2,X5,X10`

第二套 `symbols002`：

- displayable：`WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF`
- paytable 缺图 ignored：`BN`
- asset 孤儿 ignored：空
- `symbolCodes.BN === 12`
- reels key 包含 `reels-001`

## 5. appear 动画说明

`rendercore` 为 `RenderSymbol` 新增 `underlayLayer`，显示顺序为：

```text
underlayLayer -> baseLayer -> stateSprite -> overlayLayer
```

新增 named animation：

```text
singleSpriteUnderlayScale
```

第二套所有 displayable symbol 的 `appear` 均显式使用该动画：

- 仅支持单图 symbol，layered symbol 使用时 fail-fast。
- reset 时在 `underlayLayer` 创建一张普通状态 texture 的副本。
- 主普通图保持可见，主图 scale 不被该动画改变。
- 副本 alpha 最高 `0.4`，scale 最高 `1.6`，播放中放大并消退。
- complete 后清空 `underlayLayer`。

## 6. 命令和结果

环境确认：

```text
node --version -> v24.14.0
pnpm --version -> 10.0.0
```

资源生成：

```text
pnpm --filter gengameconfig dev -- --paytable assets/gamecfg002/paytables.xlsx --reel assets/gamecfg002/reels-001.xlsx --out assets/gamecfg002/gameconfig.json
结果：通过，paytable symbols: 13，reels: reels-001

pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols002 --output-dir assets/symbols002 --symbols WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
结果：通过，生成 24 张状态 PNG 和 1 个 manifest
```

聚焦验收：

```text
pnpm --filter @slotclientengine/rendercore test -> 通过，16 files / 91 tests
pnpm --filter symbolsviewer test -> 通过，2 files / 14 tests
pnpm --filter @slotclientengine/rendercore typecheck -> 通过
pnpm --filter symbolsviewer typecheck -> 通过
pnpm --filter @slotclientengine/rendercore lint -> 通过
pnpm --filter symbolsviewer lint -> 通过
pnpm --filter @slotclientengine/rendercore build -> 通过
pnpm --filter symbolsviewer build -> 通过
```

根级回归：

```text
pnpm typecheck -> 通过，21/21 tasks
pnpm test -> 通过，21/21 tasks
pnpm build -> 通过，21/21 tasks
```

格式和 diff：

```text
pnpm format:check -> 已执行，但仓库既有非本任务范围失败，主要来自 coverage/dist 生成物和 apps/uiframeworksviewer 既有格式问题
pnpm exec prettier --check <本任务改动的源码/测试/README/任务文件，排除 gengameconfig 原生输出 gameconfig.json> -> 通过
git diff --check -> 通过
```

说明：`assets/gamecfg002/gameconfig.json` 按任务要求保持 `gengameconfig` 原生 JSON 输出，因此未纳入 Prettier 重排。

## 7. 手动验收结果

启动命令：

```text
pnpm --filter symbolsviewer dev -- --host 127.0.0.1
```

说明：沙箱内直接监听 Vite 端口出现 `listen EPERM 0.0.0.0:5173`，改为批准后的 `127.0.0.1` 本地监听进行浏览器验收。验收完成后已停止 dev server。

浏览器视口：

```text
1280 x 720
```

截图证据：

```text
/tmp/symbolsviewer-symbols.png
/tmp/symbolsviewer-symbols002-1280.png
/tmp/symbolsviewer-symbols002-appear.png
/tmp/symbolsviewer-symbols002-spinblur.png
/tmp/symbolsviewer-symbols002-disabled.png
```

手动验收结论：

- 默认进入页面选择 `symbols`。
- 第一套 canvas 非空，展示 10 个 displayable symbol。
- 第一套 `SC,RS,X2,X5,X10` layered normal 仍正常。
- 切换 `symbols002` 后 canvas 非空，展示 12 个 displayable symbol。
- 第二套 `BN` 不展示，也没有占位图。
- 第二套 12 个图标在 1280 x 720 视口下为 6 x 2 排列，图标和 label 不重叠。
- 第二套 `appear` 播放时状态面板显示 12 个 `appear -> appear`，主图保持大小，后方副本半透明放大消退。
- 第二套 `spinBlur` 使用纵向模糊状态图。
- 第二套 `disabled` 使用灰度状态图。
- `symbols -> symbols002 -> symbols` 连续切换超过 3 次后，没有旧 symbol 或旧状态面板残留。
- 浏览器 console 无错误。

## 8. agents.md 和 pnpm-lock

`agents.md` 未更新。

判断理由：本次新增的是 `apps/symbolsviewer` 局部的两套资源显式配置、README 说明和测试约束，没有新增仓库级长期协作规则、目录规范或基础脚本约定。多套资源的当前约定已写入 `apps/symbolsviewer/README.md` 与任务报告。

`pnpm-lock.yaml` 未修改。

判断理由：本任务未新增 npm 依赖，未执行 `pnpm install`，复用了现有 `rendercore` 的 `sharp` 生成能力。

## 9. 第二遍遗漏检查

资源：

- `assets/symbols002` 原始 PNG 保留。
- 第二套 24 张状态 PNG 全部存在。
- 第二套 manifest 存在、稳定、无时间戳。
- manifest 不包含 `BN`。
- `git status --short --untracked-files=all` 未显示 `.DS_Store`。

JSON / schema：

- `assets/gamecfg002/gameconfig.json` 由 `gengameconfig` 生成。
- 第二套 generated gameconfig 已通过 `logiccore.createGameConfig(...)` 测试。
- 没有构造假 reels 绕过 `logiccore`。

viewer：

- selector 可切换 `symbols` 和 `symbols002`。
- 切换时会销毁旧 `RenderSymbol`、清理 label、重置序列和状态面板。
- 第二套 12 个图标布局不重叠。
- 控制按钮和状态面板仍正常。

动画：

- 第二套 `appear` 是半透明副本放大，不是缩放主图。
- 第二套 `win` 仍走默认闪光。
- `spinBlur` / `disabled` 使用生成状态图。
- 第一套特殊动画测试未回归。

测试：

- `rendercore` 覆盖 underlay layer、reset 清理、参数校验、layered fail-fast 和 named animation resolver。
- `symbolsviewer` 覆盖第二套 gameconfig、manifest、catalog、displayable / ignored 列表和 selector 配置 fail-fast。
- 状态图生成脚本覆盖 inputDir-local composites、无 composites 的单图生成，以及显式 composites 缺失 fail-fast。

工作区注意：

- 当前 `git status --short --untracked-files=all` 仍显示 `assets/game002/bg.jpg` 为未跟踪文件，该文件不属于 48 任务范围，本次未修改、未处理。

## 10. 已知风险和后续建议

- 根级 `pnpm format:check` 当前仍受非本任务范围的既有格式问题影响，建议另开任务清理 `apps/uiframeworksviewer` 格式问题并让各包 format check 排除 `coverage` / `dist` 生成物。
- 未来如果 `assets/symbols002` 出现 layered symbol，应另开任务补充 `symbol-composites.json` 和对应 manifest/layer 校验，不应在 viewer 里临时兜底。

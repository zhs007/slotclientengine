# symbolsviewer symbols003 gamecfg002 任务报告

## 1. 实现摘要

已按 `tasks/56-symbolsviewer-symbols003-gamecfg002.md` 执行，完成 `apps/symbolsviewer` 第三套 symbol set 接入：

- 新增 `symbols003` selector 选项。
- `symbols003` 复用 `assets/gamecfg002/gameconfig.json`，未新增 `assets/gamecfg003`。
- `symbols003` 使用自己的 PNG glob 和自己的状态贴图 manifest。
- 为 `assets/symbols003` 生成 `spinBlur` / `disabled` 派生图片和 `symbol-state-textures.manifest.json`。
- `symbols003.appear` 复用 `singleSpriteUnderlayScale(maxScale: 1.6, maxAlpha: 0.4)`，主图不缩放，后方半透明副本放大消退。
- `symbols003.win` 使用默认单图扫光效果。
- 保持 fail-fast：没有给 `WM`、`CM`、`AF`、`BN` 加 placeholder、第二套图片借用或隐藏 fallback。

## 2. 资产盘点

普通图：

```text
assets/symbols003/CN.png
assets/symbols003/CO.png
assets/symbols003/H1.png
assets/symbols003/H2.png
assets/symbols003/L1.png
assets/symbols003/L2.png
assets/symbols003/L3.png
assets/symbols003/L4.png
assets/symbols003/WL.png
```

派生图：

```text
assets/symbols003/CN.disabled.png
assets/symbols003/CN.spinBlur.png
assets/symbols003/CO.disabled.png
assets/symbols003/CO.spinBlur.png
assets/symbols003/H1.disabled.png
assets/symbols003/H1.spinBlur.png
assets/symbols003/H2.disabled.png
assets/symbols003/H2.spinBlur.png
assets/symbols003/L1.disabled.png
assets/symbols003/L1.spinBlur.png
assets/symbols003/L2.disabled.png
assets/symbols003/L2.spinBlur.png
assets/symbols003/L3.disabled.png
assets/symbols003/L3.spinBlur.png
assets/symbols003/L4.disabled.png
assets/symbols003/L4.spinBlur.png
assets/symbols003/WL.disabled.png
assets/symbols003/WL.spinBlur.png
```

manifest：

```text
assets/symbols003/symbol-state-textures.manifest.json
```

manifest 验证结果：

```text
version: 1
states: spinBlur,disabled
symbols: WL,H1,H2,L1,L2,L3,L4,CN,CO
```

图片尺寸验证：

```text
assets/symbols003/*.png 均为 180 x 180 RGBA
```

当前缺图项：

```text
WM, CM, AF, BN
```

这些 symbol 在 `gamecfg002` paytable 中存在，但当前 `assets/symbols003` 没有普通图，因此不展示、不占位、不 fallback。

## 3. gamecfg002 验证

本任务未重新生成 `assets/gamecfg002/gameconfig.json`。验证结果：

```text
WL=0,H1=1,H2=2,L1=3,L2=4,L3=5,L4=6,WM=7,CN=8,CM=9,CO=10,AF=11,BN=12
reels-001
```

`createGameConfig(...)` 消费 `assets/gamecfg002/gameconfig.json` 成功，输出同样的 symbol code 和 reel 名称。

## 4. 代码改动清单

- `apps/symbolsviewer/src/symbol-set-config.ts`
  - 新增 `symbols003` manifest import。
  - 新增 `symbols003` PNG glob。
  - `SymbolSetId` 扩展为 `symbols | symbols002 | symbols003`。
  - 新增第三套显式 `symbolScales = 1` 配置。
  - `symbols003.rawGameConfig` 复用 `rawSymbols002GameConfig`。

- `apps/symbolsviewer/src/symbol-animation-config.ts`
  - 新增 `SYMBOLS003_ANIMATION_PROFILES`。
  - 当前覆盖 `WL,H1,H2,L1,L2,L3,L4,CN,CO`。

- `apps/symbolsviewer/tests/symbol-set-config.test.ts`
  - 覆盖三套 selector 顺序。
  - 覆盖 `symbols003` scale map、gameconfig 解析、catalog validation、缺图项和自有状态贴图。

- `apps/symbolsviewer/tests/symbol-assets.test.ts`
  - 覆盖 `SYMBOLS003_ANIMATION_PROFILES` 的 appear underlay 放大合同。

- `apps/symbolsviewer/README.md`
  - 增加第三套资源来源、生成命令、缺图项、特殊动画和验收说明。

- `tasks/56-symbolsviewer-symbols003-gamecfg002.md`
  - 本任务执行前创建的自包含任务计划。

## 5. 执行命令和结果

状态图生成：

```bash
/Users/zerro/.nvm/versions/node/v24.14.0/bin/pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/symbols003 --output-dir assets/symbols003 --symbols WL,H1,H2,L1,L2,L3,L4,CN,CO
```

结果：通过。

资源和 config 验证：

```bash
file assets/symbols003/*.png
node -e 'const m=require("./assets/symbols003/symbol-state-textures.manifest.json"); console.log(m.version, m.states.join(","), Object.keys(m.symbols).join(","));'
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes||{}).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels||{}).join(","));'
node -e 'const {createGameConfig}=require("./packages/logiccore/dist/index.js"); const cfg=createGameConfig(require("./assets/gamecfg002/gameconfig.json")); console.log(["WL","H1","H2","L1","L2","L3","L4","WM","CN","CM","CO","AF","BN"].map((s)=>`${s}=${cfg.getSymbolCode(s)}`).join(",")); console.log(cfg.getReelNames().join(","));'
```

结果：通过。

模块验收：

```bash
/Users/zerro/.nvm/versions/node/v24.14.0/bin/pnpm --filter symbolsviewer test
/Users/zerro/.nvm/versions/node/v24.14.0/bin/pnpm --filter symbolsviewer lint
/Users/zerro/.nvm/versions/node/v24.14.0/bin/pnpm --filter symbolsviewer typecheck
/Users/zerro/.nvm/versions/node/v24.14.0/bin/pnpm --filter symbolsviewer build
```

结果：

```text
test: 2 files passed, 17 tests passed
lint: passed
typecheck: passed
build: passed
```

最终空白检查：

```bash
git diff --check
```

结果：通过。

补充说明：默认 Codex runtime 的 `pnpm` 是 `11.7.0`，首次执行时触发非交互依赖检查并报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。后续改用仓库匹配的用户本机 pnpm `10.0.0`，正式命令均通过。

## 6. 浏览器验收

dev server：

```text
http://127.0.0.1:5174/
```

启动说明：

- 沙箱内首次监听 `127.0.0.1:5173` 被 `EPERM` 拦截。
- 使用提权方式启动本地 dev server 后，Vite 自动切换到 `5174`。

浏览器验收结果：

- selector 选项为 `symbols, symbols002, symbols003`。
- 默认 set 是 `symbols`。
- 切到 `symbols003` 后：
  - `Displayable 9`
  - symbol 列表为 `WL,H1,H2,L1,L2,L3,L4,CN,CO`
  - `WM,CM,AF,BN` 不显示。
- 暂停后逐步切换状态：
  - `normal` 正常显示普通图。
  - `spinBlur` 状态面板显示 `requested spinBlur -> resolved normal`，画面使用模糊状态贴图。
  - `disabled` 状态面板显示 `requested disabled -> resolved normal`，画面使用灰度状态贴图。
- 连续执行 `symbols -> symbols002 -> symbols003 -> symbols` 三轮，三套 set 的 displayable 数量和 symbol 列表正确，没有旧 set 残留。
- 浏览器 console error：`[]`。

截图：

```text
/private/tmp/symbolsviewer-symbols003-260626.png
/private/tmp/symbolsviewer-symbols003-1280x1100-260626.png
```

第二张截图使用临时 `1280 x 1100` 视口确认 9 个第三套图标和 label 全部可见，验收后已重置浏览器视口。

## 7. agents.md 判断

本任务没有新增长期协作规则、目录规范或基础脚本约定，只是新增第三套 symbolsviewer 资源、配置、测试和 README；因此无需更新根目录 `agents.md`。

## 8. 最终工作区摘要

截至写入本报告前，工作区改动为：

```text
M apps/symbolsviewer/README.md
M apps/symbolsviewer/src/symbol-animation-config.ts
M apps/symbolsviewer/src/symbol-set-config.ts
M apps/symbolsviewer/tests/symbol-assets.test.ts
M apps/symbolsviewer/tests/symbol-set-config.test.ts
?? assets/symbols003/*.disabled.png
?? assets/symbols003/*.spinBlur.png
?? assets/symbols003/symbol-state-textures.manifest.json
?? tasks/56-symbolsviewer-symbols003-gamecfg002.md
?? tasks/56-symbolsviewer-symbols003-gamecfg002-260626-103446.md
```

# 19 logiccore gameconfig reels 执行报告

## 实现摘要

- 完善 `packages/logiccore`，新增任务 18 gameconfig JSON 的严格解析、reels 查询、scene 反查停止 y、旋转起始 y 计算。
- 新增 Node-only 子入口 `@slotclientengine/logiccore/node`，提供 `loadGameConfigFromJsonFile(filePath)`。
- 修复 `apps/gengameconfig` reels 表解析：`line` 列只作人工阅读，第二行开始的数据不参与校验；reels 数据范围只由 `R1...Rn` 列决定。
- 使用 `assets/gamecfg/paytable2.xlsx` 和 `assets/gamecfg/reels01.xlsx` 生成真实测试 fixture。

## 文件列表

新增：

- `packages/logiccore/src/game-config.ts`
- `packages/logiccore/src/reels.ts`
- `packages/logiccore/src/node.ts`
- `packages/logiccore/scripts/test-exports.mjs`
- `packages/logiccore/tests/fixtures/gameconfig-reels01.json`
- `packages/logiccore/tests/game-config.test.ts`
- `packages/logiccore/tests/reels.test.ts`
- `packages/logiccore/tests/node.test.ts`
- `tasks/19-logiccore-gameconfig-reels-260610-061529.md`

修改：

- `apps/gengameconfig/src/reels.ts`
- `apps/gengameconfig/tests/reels.test.ts`
- `apps/gengameconfig/README.md`
- `packages/logiccore/src/types.ts`
- `packages/logiccore/src/validation.ts`
- `packages/logiccore/src/index.ts`
- `packages/logiccore/package.json`
- `packages/logiccore/eslint.config.cjs`
- `packages/logiccore/README.md`

任务输入资产：

- `assets/gamecfg/paytable2.xlsx`
- `assets/gamecfg/reels01.xlsx`

## 公开 API

- 顶层 browser-safe 入口 `@slotclientengine/logiccore` 新增：
  - `createGameConfig(config)`
  - `LogicGameConfigModel`
  - `LogicReelsModel`
  - gameconfig/reels/stopY/spinStart 相关类型
- Node-only 子入口 `@slotclientengine/logiccore/node` 新增：
  - `loadGameConfigFromJsonFile(filePath)`
- 顶层入口未导出 `loadGameConfigFromJsonFile`。

## JSON 加载方式

- 浏览器、Vite app、Node 已持有 JSON object 时使用：
  - `import { createGameConfig } from '@slotclientengine/logiccore'`
- Node 读取 JSON 文件时使用：
  - `import { loadGameConfigFromJsonFile } from '@slotclientengine/logiccore/node'`

## 测试数据来源

- 已执行：

```bash
pnpm --filter gengameconfig dev -- --paytable assets/gamecfg/paytable2.xlsx --reel assets/gamecfg/reels01.xlsx --out packages/logiccore/tests/fixtures/gameconfig-reels01.json
```

- 生成成功，输出 reels key 为 `reels01`。
- `packages/logiccore/tests/fixtures/gameconfig-reels01.json` 由上述两个 Excel 生成，没有手写替代。
- GMI 使用任务 16 既有 fixture：`packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json`。

## gengameconfig 修改

- `line` 表头仍要求存在，保持 Excel 结构兼容。
- 第二行开始的 `line` 数据不校验空值、类型、公式或连续性。
- `R1...Rn` 全空的数据行会被忽略，不终止任何一轴。
- 单个 R 列进入尾部空白后再次出现 symbol 仍会失败。
- 已更新 `apps/gengameconfig/tests/reels.test.ts` 和 `apps/gengameconfig/README.md`。

## 导出方案

保持单一 CommonJS 构建，最终 `exports`：

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "require": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./node": {
    "types": "./dist/node.d.ts",
    "require": "./dist/node.js",
    "default": "./dist/node.js"
  }
}
```

`test:exports` 通过：

- Node CommonJS require 顶层入口：通过。
- Node import 顶层入口：通过。
- Node CommonJS require `./node` 子入口：通过。
- Node import `./node` 子入口：通过。
- Vite/browser bundler 使用真实包名 named import：通过。
- 构建后顶层入口未包含 `node:fs`、`node:path`、`node:crypto`、`node:fs/promises`。

## reels 规则

- `reels.get(x, y)` 要求 `x` 合法、`y` 为整数。
- `y` 可越界，内部使用：

```ts
normalized = ((y % length) + length) % length;
```

- `normalizeY(x, y)` 支持 finite number，返回 `[0, getLength(x))`，不取整。

## 停止坐标

坐标定义：

```ts
scene[x][visibleY] === reels.get(x, stopYCoordinates[x] + visibleY)
```

真实 fixture 结果：

- `reels.findStopYCandidates(2, scene[2]) === [4, 34]`
- `getStopYCoordinates({ reelsName: 'reels01', sceneName: 'step0.scene0', scene }) === [1, 1, 4, 0, 27]`
- 多候选取第一个候选，即最小 y。
- 未使用 `logic.getRandomNumbers()` 或隐藏数据消歧。

## 旋转起始坐标

- `travel = speedSymbolsPerSecond * durationMs / 1000`
- `direction` 默认为 `forward`。
- `forward`: `startY = normalizeY(x, finalY - travel)`
- `backward`: `startY = normalizeY(x, finalY + travel)`
- `travel` 允许非整数，不做 round/floor/ceil。

## 测试用例摘要

- `createGameConfig` 真实 fixture 解析、查询、不可变性。
- paytable/symbolCodes/reels 严格契约错误。
- `reels.get` 正负越界 normalize、非法 x、非整数 y。
- `findStopYCandidates` 多候选、无候选失败。
- 真实 GMI scene 停止坐标和逐格验证。
- scene 宽度不匹配、空列、无匹配失败。
- forward/backward/长距离/非整数 travel 起始坐标。
- Node 文件加载成功、文件不存在、路径不是文件、JSON 语法非法、契约非法。
- `gengameconfig` line 列忽略和整行 R 空白忽略。

## 验收命令

全部执行并通过：

```bash
pnpm --filter gengameconfig test
pnpm --filter gengameconfig lint
pnpm --filter gengameconfig typecheck
pnpm --filter gengameconfig build
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm --filter @slotclientengine/logiccore test:exports
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

## agents.md

未更新 `agents.md`。本任务只修改包内库能力、CLI 输入列语义、README、测试和 package export，没有改变仓库级协作规则、目录规范或基础脚本。

## ignored 产物

- 已清理本轮验收生成的：
  - `packages/logiccore/dist/`
  - `packages/logiccore/coverage/`
  - `packages/logiccore/.turbo/`
  - `apps/gengameconfig/dist/`
  - `apps/gengameconfig/coverage/`
  - `apps/gengameconfig/.turbo/`
- 清理后 dry-run 仅剩既有 ignored 依赖目录：
  - `packages/logiccore/node_modules/`
  - `apps/gengameconfig/node_modules/`
- 未清理 `node_modules/`，避免误删既有依赖。

## 未执行项

计划要求的实现、fixture 生成、导出 smoke、package 验收、根级验收、diff 检查和 ignored 产物检查均已执行；无未执行项。

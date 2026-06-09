# logiccore 初始化任务报告

## 任务背景

本任务新增内部核心库 `packages/logiccore`，用于把服务端一次 spin 返回的完整 `gamemoduleinfo` 协议数据解析为前端可直接查询的 `GameLogic` 对象。同时支持调用方已经拆出 `gmi` 的场景，通过 `createGameLogicFromGmi(gmi, meta)` 创建同等逻辑对象。

本任务强调严格解析和 fail-fast：关键协议字段缺失、类型错误、scene 结构异常、组件索引越界等问题都会显式抛错，不复用 `packages/netcore/src/utils.ts` 中无效 scene 返回空数组的宽松行为。

## 实际完成项

- 新增 workspace package：`packages/logiccore`。
- 包名：`@slotclientengine/logiccore`。
- 新增 CommonJS 构建配置、TypeScript 配置、ESLint 配置、Vitest coverage 配置。
- 新增核心源码：
  - `src/errors.ts`
  - `src/types.ts`
  - `src/validation.ts`
  - `src/scene.ts`
  - `src/parser.ts`
  - `src/component.ts`
  - `src/game-logic.ts`
  - `src/index.ts`
- 新增中文 README：`packages/logiccore/README.md`。
- 新增测试 fixture：
  - `tests/fixtures/gamemoduleinfo-basic.json`
  - `tests/fixtures/gamemoduleinfo-multistep.json`
- 新增测试：
  - `tests/errors.test.ts`
  - `tests/scene.test.ts`
  - `tests/parser.test.ts`
  - `tests/component.test.ts`
  - `tests/game-logic.test.ts`
- 执行 `pnpm install`，`pnpm-lock.yaml` 新增 `packages/logiccore` importer。

## 最终 API 说明

包入口 `src/index.ts` 导出：

```ts
export {
  createGameLogic,
  createGameLogicFromGmi,
  GameLogicModel,
  GameLogicStepModel,
} from './game-logic';
export { LogicCoreError, LogicParseError } from './errors';
export * from './types';
```

主要使用方式：

```ts
const logic = createGameLogic(gameModuleInfoMessage);

const logicFromGmi = createGameLogicFromGmi(gameModuleInfoMessage.gmi, {
  bet: gameModuleInfoMessage.bet,
  lines: gameModuleInfoMessage.lines,
  totalwin: gameModuleInfoMessage.totalwin,
  gameid: gameModuleInfoMessage.gameid,
});
```

`GameLogic` 可读取默认 scene、randomNumbers、bet、lines、totalwin、step、step scene、step win result、component、component scenes/results，以及原始 message/gmi/step/clientData。

## 解析和错误策略

- `createGameLogic()` 校验完整 message：`msgid`、`gmi`、`defaultScene`、`replyPlay`、`randomNumbers`、`replyPlay.results`、`bet`、`lines`、`totalwin`。
- `createGameLogicFromGmi()` 校验 `gmi + meta`，其中 `meta.bet`、`meta.lines`、`meta.totalwin` 必填。
- scene 转换保持 x 优先，不转置，不把非法输入转换为空数组。
- `gmi.replyPlay.results` 只作为 step 数组。
- `step.clientData.results` 只作为当前 step 内的中奖结算 result 数组。
- win result 保留全部协议字段，仅对 `pos`、可选 `coinWin`、可选 `cashWin` 做必要校验。
- 越界读取 step/scene/result 抛 `RangeError`。
- 解析错误和组件映射错误抛 `LogicParseError`。
- 返回的 scene、result、component、raw message、raw gmi、raw step、raw clientData 都通过冻结快照保护，调用方修改返回值不会污染内部状态。

## component 使用索引映射说明

- `hasComponent(name)` 只根据当前 step 的 `historyComponents` 判断触发。
- `getComponent(name)` 读取当前 step 的 `curGameModParam.mapComponents[name]`。
- 如果组件已触发但 `mapComponents` 缺同名 key，读取组件接口会抛 `LogicParseError`。
- 如果组件有明文 `basicComponentData`，会校验：
  - `usedScenes` 是非负整数数组。
  - `usedResults` 是非负整数数组。
  - `usedScenes` 只映射当前 step 的 `clientData.scenes`。
  - `usedResults` 只映射当前 step 的 `clientData.results`。
- 如果组件没有明文 `basicComponentData`，例如 protobuf Any 编码数据：
  - `hasComponent(name)` 仍可返回 `true`。
  - `getComponent(name)` 返回 `hasBasicComponentData: false`。
  - `getComponentScenes(name)` 返回空数组。
  - `getComponentResults(name)` 返回空数组。
  - 原始组件数据保留在 `raw`。

## 覆盖率结果

`pnpm --filter @slotclientengine/logiccore test` 结果：

- Test Files：5 passed
- Tests：22 passed
- Statements：97.34%
- Branches：82.97%
- Functions：98.83%
- Lines：97.28%

覆盖率满足本任务不低于 80% 的要求。

## 执行过的验证命令与结果

全部通过：

```bash
pnpm install
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

说明：

- `pnpm install` 未下载新包，仅复用现有缓存并为新 package 写入 lockfile importer。
- 根级 `pnpm build` 通过；输出中仍有已有 demo package 的 Vite chunk size warning，不影响本任务验收。
- 复查时重新执行过 `logiccore` 局部四项命令，确认清理忽略产物后仍可正常 lint、test、typecheck、build。

## 遇到的问题和处理方式

- 未遇到依赖下载失败，未使用代理命令。
- 为了让新包被 pnpm workspace 正确识别，执行 `pnpm install` 后更新了 `pnpm-lock.yaml`。
- component 详细索引校验放在组件读取路径执行，这样 `hasComponent(name)` 可以保持只读 `historyComponents` 的语义；缺失 map 或 usedScenes/usedResults 越界会在读取组件或组件映射数据时显式抛错。
- 复查发现 `packages/logiccore` 是新建未跟踪目录时，`dist/`、`coverage/`、`.turbo/`、`node_modules/` 这类已被 `.gitignore` 忽略的验收产物会和源码目录一起显示为未跟踪目录。已清理这些生成产物，只保留源码、测试、配置和 README。

## 二次审计结论

已按任务要求完成二次审计，结论如下：

- 未发现把缺失关键字段静默转换成空数组、0 或空对象的兜底逻辑。
- 未复用 `netcore` 的 `transformSceneData()` 宽松行为。
- `gmi.replyPlay.results` 只按 step 处理。
- `clientData.results` 只按 win result 处理。
- scene 解析按 `values[index].values` 保持 x 优先，没有转置。
- component 触发判断只看 `historyComponents`。
- `usedScenes` 和 `usedResults` 只映射当前 step 的 scene/result。
- win result 使用深冻结快照保留全部字段。
- protobuf Any 组件保留 raw，不伪造 `basicComponentData`。
- raw message、raw gmi、raw step、raw clientData 均保留并防止外部修改污染内部状态。
- README 与当前 API、命令、错误策略一致。
- 覆盖率超过 80%。
- 未发现空目录，不需要新增 `.keepme`。
- 已确认最终 `packages/logiccore` 下不保留 `dist/`、`coverage/`、`.turbo/`、`node_modules/` 等生成产物。

## agents.md 更新情况

未更新根级 `agents.md`。

原因：本任务只新增 `packages/logiccore`、其 README、测试、配置和任务报告，没有改变仓库级协作规则、目录规范、基础脚本、依赖安装规则或工具链选择。

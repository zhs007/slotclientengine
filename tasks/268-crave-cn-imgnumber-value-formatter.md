# 268 crave-cn-imgnumber-value-formatter 任务计划

## 1. 目标与完成定义

### 目标

在 Engine 的 RenderCore 增加 symbol 内置 `valuePresentation.text.type: "image-string"` 的同步文字 formatter。
游戏把 raw presentation `val` 传给 formatter 并得到最终 ImgNumber string；raw `val` 继续负责 tier 选择、
occurrence value 和 reel flow，不因显示格式改变。

### 完成定义

- [ ] `createSceneLayoutPackageRuntime()` 可按 symbol 注册 formatter，供 CN 一类内置 ImgNumber 使用。
- [ ] settled/landing SymbolPlayer、lightweight rolling visual、package registry 和 standalone presenter 使用同一转换合同。
- [ ] 未注册时保持现有 `String(rawValue)` 行为；现有命名 `imageStringNodes` 的 `symbolValueTextBindings` 不变。
- [ ] unknown symbol、无 image-string value presentation、非函数、formatter 异常、空字符串和缺 glyph 显式失败。
- [ ] RenderCore README、稳定领域规则、定向测试、L2 验收和 UTC 执行报告完成。
- [ ] 只提交 Engine 仓库分支；不修改 pixicrave。

## 2. 范围

### 包含

- RenderCore public formatter map 与 Scene Layout package runtime 接线。
- raw value 选 tier 后、ImgNumber 创建或 `setText()` 前的最终 string 转换。
- package/generic reel registry、rolling visual、SymbolPlayer value controller、standalone presenter 的一致接线。
- formatter 注册期与运行期 strict validation、原子失败测试和使用文档。

### 不包含

- 不修改 `/Users/zerro/gitee.com/pixicrave`、游戏业务 formatter、server `otherScene`、round adapter 或本地轮带。
- 不修改 symbol/image-string manifest schema、资源、tier threshold、生成器或 lockfile。
- 不把 CN、slot `coin`、除数 10、前缀、舍入或 locale 规则硬编码进 Engine。
- 不替换现有命名 node 的 `symbolValueTextBindings`，不增加 fallback 或自动猜测 node。

## 3. 制定计划时的基线

```text
UTC: 2026-08-28T10:31:59Z
HEAD: 9e346606f105a6672e01c02583bcda3c1cbc8aed
branch: detached HEAD（执行分支：codex/task-268-cn-value-text-formatter）
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/game002.md
docs/agent-rules/shared-game-runtime.md
packages/rendercore/README.md
packages/rendercore/src/{scene-layout,reel,symbol,symbol-value-presentation}/...
packages/rendercore/tests/{reel,symbol-value-presentation}/...
```

基线结论：

- `symbolValueTextBindings` 只绑定 manifest 的 exact named `imageStringNodes`；CN 的 `coin` 属于
  `valuePresentation.text` tier binding，不是 named node，现有 API 无法接入。
- intrinsic value display 与 lightweight rolling visual 都直接使用 `String(value)`。
- tier resolver 已以 raw positive safe integer 工作；本任务只需在选 tier 后改变显示 string。
- formatter 是 app-owned runtime 业务规则，不能进入 manifest 或 shared package 业务表。
- 用户在执行阶段明确覆盖原计划：只改 Engine，提交分支，并说明游戏如何使用。

## 4. 需求解释与技术决策

### 需求解释

1. `val` 原样进入 Engine，先按现有 `maxExclusive` 选择 value tier。
2. 最终创建或更新 intrinsic ImgNumber 时，调用该 symbol 的 formatter，使用返回 string 渲染。
3. rolling 与 settled 必须一致，否则停轮边界会出现数字跳变。
4. 游戏使用方式应与 WL 一类 formatter 接近，但字段按两种 ImgNumber ownership 明确区分。

### 关键决策

1. 新增 `SymbolValueTextFormatterMap`，Scene Layout 顶层字段命名为 `symbolValueTextFormatters`。
2. package/reel/presenter 低层字段统一为 `valueTextFormatters`；现有 `*TextBindings` 保留给 named node。
3. formatter 仅允许 image-string value presentation；font/image 保持原合同，避免模糊转换语义。
4. 注册时用 manifest `defaultValues` 预检 formatter/glyph closure；每次实际 mutation 前仍校验真实 raw value。
5. formatter string 同时参与 exact special-value image 匹配，否则走严格 glyph closure。

## 5. 职责与合同

- **app**：提供 `symbol -> (rawValue) => string` 业务 formatter。
- **RenderCore**：校验绑定目标、用 raw value 选 tier、格式化最终 string、校验 tier glyph/special closure并原子提交。
- **manifest**：继续唯一拥有 tier、ImgNumber dependency、glyph 和 special image；不保存函数或业务除数。
- **失败策略**：任何 formatter/binding/text closure 错误都在当前画面值修改前抛错，不回退 `String(value)`。
- **兼容**：省略新字段时行为不变；命名 node bindings 与 intrinsic formatter 可同时存在并共享同一 raw value transaction。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol-value-presentation/value-text-formatter.ts
tasks/268-crave-cn-imgnumber-value-formatter-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/core/index.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/symbol-value-presentation/{types,value-display,symbol-player-value-controller,create-symbol-value-presenter}.ts
packages/rendercore/src/reel/{types,symbol-registry,rolling-value-visual}.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/tests/reel/symbol-registry.test.ts
packages/rendercore/tests/symbol-value-presentation/{symbol-player-value-controller,symbol-value-presenter}.test.ts
packages/rendercore/README.md
docs/agent-rules/shared-game-runtime.md
```

### 原则上不应修改

```text
/Users/zerro/gitee.com/pixicrave
apps/
assets/
packages/rendercore/src/symbol/manifest.ts
pnpm-lock.yaml
```

## 7. 实施步骤

1. 新增 formatter map type 与 strict normalize/format helper。
2. 接入 SymbolPlayer controller 和稳定 ImgNumber display，保持 raw value/tier 与 formatted text 分离。
3. 接入 lightweight rolling、package/generic registry、Scene Layout runtime 与 standalone presenter。
4. 添加 raw tier 不变、formatted text 生效、validate/set 单次转换及失败不部分提交测试。
5. 更新 README/领域规则，执行 L2 定向验收并生成报告。

## 8. 测试与验收

### 验收级别

`L2`：修改 RenderCore public API，且 Scene Layout/package/reel 是直接消费者；不需要整仓 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec prettier --check <本任务文件>
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol-value-presentation/symbol-player-value-controller.test.ts tests/symbol-value-presentation/symbol-value-presenter.test.ts tests/reel/symbol-registry.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
git diff --check
```

### 人工验收

Engine 仓库没有 pixicrave 真实资源，本任务不冒充游戏视觉验收。consumer 接入后应确认 CN rolling、landing 与
settled 都以同一字符串显示，同时 raw value 仍命中原档位。

### 独立验收建议

建议：public contract 跨越 Scene Layout/package/reel，重点复验 raw tier 与 formatted text 分离、rolling/settled 一致、
formatter 失败不部分提交。

## 9. 环境与依赖

- 使用仓库 Node 24 与 pnpm；缺依赖时运行 `CI=true pnpm install --frozen-lockfile`。
- 不新增依赖、不修改 lockfile。

## 10. 生成物、文档与规则

- 无 YAML、schema 或生成文件变化。
- 更新 RenderCore README 的 API/示例和 shared runtime 的稳定 ownership 规则。

## 11. 执行报告

执行完成后创建：

```text
tasks/268-crave-cn-imgnumber-value-formatter-<utctime>.md
```

简要记录最终实现、计划偏差、验收结果、未做的真实游戏视觉验收和剩余风险。

## 12. 风险、假设与待确认

### 风险

- 游戏 formatter 返回的 string 必须落在每档 ImgNumber glyph/special exact closure 内。
- Engine 测试只能证明通用链路，不能替代 pixicrave 真实资源视觉验收。

### 假设

- consumer 会提供纯同步 formatter，例如 `CN: (val) => String(val / 10)`。
- raw CN value 已符合现有 positive safe integer 与 tier closure；Engine 不替 consumer 换算业务单位。

### 待确认

无。使用示例随提交交付，pixicrave 接线由用户按需完成。

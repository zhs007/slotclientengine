# 180 gameframeworks-api-ownership-boundary 任务计划

## 1. 目标与完成定义

### 目标

收紧 `@slotclientengine/gameframeworks` 的 public API ownership：它继续拥有游戏壳层、UI/live session
组合、spin/collect lifecycle、server result 到 `GameLogic` 的组合和 production scene-layout template，
但不再作为 `logiccore` 或 `rendercore` public symbol 的机械转导出 barrel。

实际定义 round data、game config、component/result 类型或编译 operation plan 的 game app，
改为显式依赖并从 `@slotclientengine/logiccore` 导入这些合同；渲染能力继续从
`@slotclientengine/rendercore` 及其 public subpath 导入。游戏仍不直接依赖 `netcore`
或 `uiframeworks`。

### 完成定义

- [ ] `gameframeworks` 根入口不再转导出 `logiccore` 的 `createGameConfig`、operation compiler/
      validator/freezer、`GameLogic`/scene/result/operation types，也不再转导出 `rendercore`
      的 scene-layout package surface 或 Spine popup surface。
- [ ] game001、game002、game003 和 gameframeworksviewer 对上述 logic contract 改为直接
      `@slotclientengine/logiccore` import，并在各自 `package.json`/lockfile importer 声明真实依赖。
- [ ] `createSlotGameFramework`、`SlotGameAdapter`、framework state/UI/live types、
      `SlotGameLiveSession`、`createSlotGameLogicResult`、round context、component helper、static-config
      和 scene-layout template 组合 API 保持现有行为。
- [ ] `gameframeworks` 仍可在内部依赖 `logiccore`、`netcore`、`rendercore`和 `uiframeworks`；
      本任务不通过复制类型或改名 alias 伪装解耦。
- [ ] 游戏不新增 `@slotclientengine/netcore`/`uiframeworks` import，live session、loading
      `99%/100%` 边界、round/presentation 行为、资源和生成物保持不变。
- [ ] 完成 L3 整仓验收，并生成任务 180 UTC 中文执行报告。

## 2. 范围

### 包含

- 删除 `packages/gameframeworks/src/index.ts` 中对 `logiccore`/`rendercore` 的纯透传
  value/type exports，以及 `src/types.ts` 对 `logiccore` type 的二次 export。
- 按 symbol owner 拆分 game001/game002/game003/gameframeworksviewer 的 import declaration；
  framework-owned symbol 仍从 `gameframeworks` 导入。
- 更新四个 direct consumer 的 workspace dependency、prepare 脚本、source-boundary 测试和
  `pnpm-lock.yaml` importer。
- 更新 `gameframeworks` export 测试、README、consumer README，以及根/领域稳定依赖规则。
- 保留 framework 自己的 public declaration 对 `GameLogic`、`SceneMatrix`、`GameLogicMeta`
  等 owner type 的引用；consumer 需要显式命名这些类型时从 `logiccore` 导入。

### 不包含

- 不让游戏直接创建 `SlotcraftClient`、调用低层 network command，也不把
  `netcore`/`uiframeworks` 改为 game app direct dependency。
- 不为已删除的转导出保留 deprecated alias、compatibility subpath、重复 type declaration
  或只换名的 wrapper；当前 package 全为 private workspace package，直接 consumer 原子迁移。
- 不把 `component-helpers.ts`、`logic-result.ts`、`round-context.ts` 或
  `scene-layout-template` 移到其它 package；它们是本地验证/组合 API，不是 identity-preserving
  转导出。
- 不改动 `logiccore`、`rendercore`、`netcore` 实现、operation IR、server 解析、
  render lifecycle、游戏业务配置、动画时序、manifest、YAML、资源或生成器。
- 不重构 `gameframeworks/scene-layout-template` 的独立 bundle entry，不迁移
  gameviewer/buildgamestatic/game-ui-leo 中已经正确的 framework-owned API import。

## 3. 制定计划时的基线

```text
UTC: 2026-08-06T10:01:58Z
HEAD: d89fcf33d4e1e07debfe187d0479c7ddb1f13ed3
branch: (detached HEAD)
git status --short --untracked-files=all: <clean>
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/shared-game-runtime.md`、`game002.md`、`game003.md`、`loading-ui.md`；
  目标 package/app 下没有更深 `AGENTS.md`。
- `packages/gameframeworks/src/index.ts` 直接转出 5 个 logic value API、operation plan type
  surface、3 个 scene-layout runtime value API 及其类型、Spine popup API；`src/types.ts`
  另将 `GameLogic`/scene/result/config 类型原样 export。
- `createSlotGameFramework()`/`SlotGameLiveSession` 确实组合 `netcore`，
  `createSlotGameLogicResult()` 确实组合 server result、user info 与 `logiccore`；这些
  是 framework-owned 行为，不是转导出。当前没有将 `netcore` raw symbol 从
  `gameframeworks` 根入口直接转出。
- game001 直接使用 `createGameConfig`/`LogicGameConfig`/`LogicReels`/scene/logic types；
  game002 还直接使用 operation compiler/validator/freezer/profile/IR types；game003 使用
  game config 与 scene/logic types；gameframeworksviewer 使用 `GameLogic` type。它们都是
  `logiccore` 合同的实际 consumer，但 package metadata 和 boundary test 刻意隐藏了该依赖。
- game001/game002/game003/gameframeworksviewer 的 Vite config 已有 exact `logiccore` source alias；
  本任务不需要新增 alias，但 direct dependency 的 prepare/build 声明必须与 import 对齐。
- game001/game002 的 source-boundary 测试递归禁止 `logiccore`，game003、
  gameframeworksviewer 和 `packages/gameframeworks/tests/source-boundary.test.ts` 也显式断言
  consumer 不得声明它；这些是需要更正的旧形式边界，不是要保留的行为。
- `AGENTS.md`、`shared-game-runtime.md`、`packages/gameframeworks/README.md` 和
  `apps/game001/README.md` 把“不直接 import logiccore”写成了稳定规则，必须与
  新 ownership 同步，不得只改源码让文档继续误导。

## 4. 需求解释与技术决策

### 需求解释

- “游戏直接 import logiccore”只适用于游戏真正定义或消费的纯 logic contract，
  不代表游戏可越过 framework 调用 live transport、collect 或 UI state。
- “删除机械转导出”按 symbol ownership 判定，而不是禁止 `gameframeworks`
  内部 import 其依赖。framework 的 public method 仍可返回 `GameLogic`，其 `.d.ts`
  也可指向 owner package。
- 本任务是有意的 workspace breaking cleanup；因所有当前 package 都是 private 且
  direct consumer 可在同一任务迁移，不保留会继续模糊 ownership 的过渡 alias。

### 关键决策

1. **按能力 owner 导入，不以单一 dependency 数量伪装隔离**
   - logic parser/model/config/profile/operation IR/compiler 归 `logiccore`，reel/symbol/popup/
     scene-layout runtime 归 `rendercore`，framework lifecycle/live/UI 组合归 `gameframeworks`。
   - 同一文件同时消费 framework 和 logic symbol 时使用两条显式 import，不从
     framework namespace 取底层 symbol。

2. **删除纯透传，保留真正组合 API**
   - 删除 `index.ts` 的 external-package `export ... from` 透传和 `types.ts` 的 logic
     export block；内部 type import 保留以实现 framework 自身合同。
   - 保留 `createSlotGameLogicResult`、component-by-name helper 和 scene-layout template，因为它们
     包含 framework error/validation/orchestration 语义；本任务不借机重分 package 职责。

3. **不为迁移复制 owner type**
   - `SlotGameAdapter.playSpin(logic)`、`SlotGameFramework.spin()`、`SlotGameLogicResult.logic`
     等继续使用唯一 `logiccore.GameLogic` identity。
   - 不创建 `FrameworkGameLogic`、structural copy、conditional alias 或新 subpath 回避 direct
     dependency，否则只是重复当前问题。

4. **依赖声明与 source boundary 同步改为职责约束**
   - 四个 consumer 的 dependencies 显式加入现有 workspace `logiccore`，prepare 阶段
     显式 build direct dependency，并由 pnpm 同步 lockfile importer。
   - boundary test 不再追求“只有一个 facade dependency”，而是断言 logic symbol 来自
     `logiccore`、framework symbol 来自 `gameframeworks`，且 game app 仍无
     `netcore`/`uiframeworks` direct import/dependency。

5. **scene-layout template 保持独立组合边界**
   - gameviewer 继续从 `gameframeworks/scene-layout-template` 消费 template config/readiness/
     launch API；这些 API 同时组合 logic、render 和 live framework，不属于纯透传。
   - 不因 root bundle 当前共用实现而扩大为新的 Vite multi-entry 重构。

## 5. 职责与合同

- **logiccore**：拥有 `GameLogic`/step/component/scene/result/game-config/reels、round profile、
  immutable `SlotOperationPlanV1` 及 compiler/finalizer/validator。game app 作为业务 profile、
  resolver 和 operation program 的 owner，可直接消费这些 public contract。
- **rendercore**：拥有 reel/symbol/popup/scene-layout runtime 和 presentation transaction；
  `gameframeworks` 不为它提供第二个公开 barrel。
- **gameframeworks**：拥有 DOM/UI frame 组合、live session、framework state/lifecycle、
  server result 规范化入口、app adapter contract 和 production template orchestration；可在内部使用
  owner package，但不声称拥有其 raw API。
- **game app/viewer**：按实际消费声明 direct dependency；业务 symbol/component/amount
  仍留在 app，不因 import 调整移入 shared package。
- **public compatibility**：移除 passthrough export 是显式 breaking change；全部仓内 direct
  consumer 同步迁移，未知旧 symbol 从 `gameframeworks` 导入必须在 build/typecheck 失败，
  不静默 fallback。
- **失败策略**：不改动任何 runtime error 或 validation 行为；本任务的错误边界
  是编译/导出检查，不在运行时增加 alias 或 symbol lookup fallback。

## 6. 文件范围

### 预计新增

```text
tasks/180-gameframeworks-api-ownership-boundary-<utctime>.md
```

仅在执行和验收后新增 UTC 报告；不新增 production module/package。

### 预计修改

```text
AGENTS.md
docs/agent-rules/shared-game-runtime.md
packages/gameframeworks/src/{index,types}.ts
packages/gameframeworks/tests/{exports,source-boundary}.test.ts
packages/gameframeworks/README.md
packages/logiccore/README.md
apps/game001/{package.json,README.md,src/**,tests/**}
apps/game002/{package.json,README.md,src/**,tests/**}
apps/game003/{package.json,README.md,src/**,tests/**}
apps/gameframeworksviewer/{package.json,README.md,src/**,tests/**}
pnpm-lock.yaml
```

`src/**`/`tests/**` 只允许调整 import declaration、直接相关 type annotation 和 ownership
assertion，不得借 glob 修改业务逻辑。若 Prettier 因 import 拆分仅重排相邻语句，
在 diff 中保持最小。

### 原则上不应修改

```text
packages/{logiccore,rendercore,netcore,uiframeworks}/src/**
packages/gameframeworks/src/{framework,session,logic-result,round-context,component-helpers}.ts
packages/game-ui-leo/**
apps/{gameviewer,gameviewer2,buildgamestatic}/**
assets/**
docs/agent-rules/{game002,game003,loading-ui}.md
```

若执行需要改变 logic/render/network 行为、添加外部依赖、迁移 template bundle、
修改生成物/资源或把 `netcore` 暴露给游戏，属于重大范围扩张，必须停止说明。

## 7. 实施步骤

1. **确认执行基线与 symbol inventory**
   - 重核 HEAD/status、根与 shared runtime 规则、`gameframeworks` 根入口及四个
     direct consumer；使用定向搜索列出所有从 framework 导入的 owner symbol。
   - 若发现未在基线中的 direct consumer，只将其纳入同一机械 import/dependency
     migration；如果需要改行为或新 package boundary，停止并说明。

2. **收紧 gameframeworks public export**
   - 从 `src/index.ts` 删除 direct logiccore/rendercore/popup passthrough，从 `src/types.ts`
     删除 logiccore type export block，但保留 framework interface 所需的 internal imports。
   - 更新 export/source-boundary 测试：正向断言 framework-owned 入口仍可用，静态断言
     不再有 external owner 的 raw re-export，不再把 `createGameConfig` 当成 framework export。

3. **迁移 direct consumers 到 logiccore owner**
   - game001 迁移 game config/reels/scene/logic types；game002 迁移 GameLogic/component/scene/result/
     round profile/operation compiler 和 IR types；game003 迁移 game config/scene/logic types；viewer
     迁移 `GameLogic` type。
   - framework factory/adapter/state/live/helper imports 保留原 package；对混合 import 拆分为
     exact owner imports，不改函数体、数据流、mock 行为或测试 fixture 内容。

4. **同步 metadata、lockfile 和 boundary tests**
   - 四个 consumer `package.json` 加入 `@slotclientengine/logiccore: workspace:*`，
     prepare 脚本显式 build logiccore；使用 pnpm 更新 lockfile importer，不手改 lockfile。
   - 改写 boundary test 使其允许/要求 logiccore，同时继续禁止 netcore/uiframeworks、
     保持 game002/game003 业务词不进 shared package、保持 loading entry 轻量化。

5. **同步文档与稳定规则**
   - 更新 `gameframeworks` README 的 facade 定义和 export 示例，删除“从 framework
     导入 logiccore API”的旧指导；`logiccore` README 明确 app-facing direct contract。
   - 更新四个 consumer README 的 package/ownership 说明；更新根 `AGENTS.md` 和
     `shared-game-runtime.md`，固定“允许 direct logiccore/rendercore，禁止 direct
     netcore/uiframeworks”的长期边界。

6. **验收、残留搜索与报告**
   - 在重型验收前搜索残留的 `gameframeworks` logic/render passthrough 及旧文案，
     检查 lockfile 只增加预期 workspace link。
   - 按第 8 节运行 L3 命令；失败先在直接 package/consumer 最小化复现，
     不为通过测试恢复 alias。完成后生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- export test 同时证明 framework-owned API 仍存在和 passthrough 已消失；不只依赖某个
  consumer 恰好未使用被删 symbol。
- source-boundary test 检查 package ownership，不再将 dependency 数量当成架构目标。
- consumer 现有 round、scene、framework flow、loading、destroy 和 presentation tests 保持原断言；
  不为纯 import 调整重写 fixture 或放宽 strict validation。
- 本任务不修改生成输入；build/test 若运行现有 generator，其输出必须无差异。

### 验收级别

`L3`。本任务删除跨 package public API，迁移多个 direct consumer，并因新增现有
workspace direct dependency 而更新 `pnpm-lock.yaml` importer；符合根规则的整仓验收条件。
不运行视觉/profiler 验收，因为不改变 runtime 行为、资源或布局。

package metadata 修改后先使用 Node 24/pnpm 10 执行 `pnpm install --lockfile-only`
同步 lockfile；这是生成步骤，不代替下列验收。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

整仓命令已覆盖 `logiccore`、`gameframeworks`、四个 direct consumer 和其直接依赖链；
不再叠加重复的 package 全量命令。验收后如只修改报告，仅重跑
`pnpm format:check` 和 `git diff --check`。

### 人工验收

不需要。本任务是 package ownership/import/export 重构，不改视觉、交互、网络协议或资源。

### 独立验收建议

`建议`：涉及跨 package public contract 的 breaking removal，但不涉及 credential、server
数据边界、resource ownership/schema/ZIP/release。独立验收重点是证明无残留 passthrough
且关键 consumer 可编译：

```bash
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter game002 typecheck
git diff --check
```

## 9. 环境与依赖

- 使用根要求的 Node 24 和 pnpm 10。当前 shell 无 `node`，执行会话在运行
  pnpm/Node 命令前必须先执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增外部依赖；四个 consumer 只将已存在的 workspace `logiccore`
  声明为 direct dependency，并由 pnpm 更新 lockfile，不切换 npm/yarn。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后
  才设置代理并重试原命令。本任务的 workspace link 同步本身不应需要新下载。
- 如果当时 lockfile 已被其它任务修改，必须保留并只叠加四个预期 importer，
  不整体重解析、回退或清理无关变化。

## 10. 生成物、文档与规则

- `pnpm-lock.yaml` 是本任务唯一预期的工具生成文件，必须由 pnpm 同步；
  不修改或手改任何 game static/resource generated TypeScript。
- `packages/gameframeworks/README.md` 记录 framework-owned 入口和 direct owner import；
  `packages/logiccore/README.md` 记录 game app 的正式 direct-consumer 地位；consumer README
  只同步依赖/导入边界，不复制 logic API 清单。
- 这次改动是稳定、跨任务职责边界，因此最小更新根 `AGENTS.md` 和
  `docs/agent-rules/shared-game-runtime.md`；game002/game003/loading 业务与生命周期不变，
  不修改对应领域规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/180-gameframeworks-api-ownership-boundary-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终删除的 passthrough 和迁移的 consumer/文件；
2. 实际 package/lockfile/rule 变化与计划偏差；
3. L3 验收命令及结果；
4. 独立验收状态；
5. 残留风险和未完成项。

不收集无关 coverage 统计、历史提交矩阵或 profiler 证据。

## 12. 风险、假设与待确认

### 风险

- `gameframeworks` public declaration 仍会引用 `logiccore` type；这是合法的合同依赖，
  但 export test 不得误写成“源码/.d.ts 完全不出现 logiccore”。
- import 拆分横跨多个 test/fixture；遗漏只会在删除 export 后暴露为编译错误，
  必须用整仓 typecheck/build 和残留搜索共同闭合。
- workspace lockfile 可同时存在其它任务变化；执行不得因为本任务只需四个 link
  就覆盖或重置用户修改。
- 不保留 deprecated alias 意味着仓外未知 consumer 会编译失败；当前 package
  的 `private: true` 和本任务的原子 workspace migration 是接受该 breaking change 的前提。

### 假设

- 用户已确认的方向是：隐藏 `netcore` 合理，隐藏实际由游戏消费的
  `logiccore` 不合理；任务 180 将该讨论结论作为实施合同。
- game001、game002、game003 和 gameframeworksviewer 是当前根入口 logic passthrough
  的全部直接 consumer；执行时仍需重跑定向搜索以防 HEAD 变化。

### 待确认

无。

## 13. 完成清单

- [ ] `gameframeworks` 只暴露 framework-owned 或真正组合 API，无 logic/render 纯透传。
- [ ] 所有当前 direct consumer 按 owner import 并声明完整 workspace dependency。
- [ ] 游戏仍无 direct netcore/uiframeworks dependency，loading/live/round/render 行为未变。
- [ ] package metadata、pnpm lockfile importer、tests、README、根规则和 shared 领域规则已同步。
- [ ] 无 deprecated alias、复制 type、compatibility subpath、残留旧 import 或旧 ownership 文案。
- [ ] 指定 L3 自动化验收已通过，独立验收状态已如实记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的四份领域规则和本计划；
2. 核对 Git 基线与工作区，保留用户已有/无关修改；
3. 重跑 symbol/consumer inventory 后按 owner 原子迁移，不重新制定 alias 方案；
4. 只用 pnpm 同步 lockfile，不手改生成物；
5. 小幅适配当前实现时在报告记录，重大范围扩张时先停止说明；
6. 运行第 8 节 L3 验收，失败先最小化复现并区分任务引入/既有问题；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。

# 155 gamelayout-single-package-runtime 任务计划

## 1. 目标与完成定义

### 目标

把 Game Layout package 收敛为后续游戏默认的唯一运行时美术包：背景、Symbols、Popup、
transition 和不直接显示但由游戏程序按键读取的资源都在同一个 mapped package 中；首次
准备只加载运行必需闭包，程序资源通过公开 typed API 按需加载。同步提供稳定的 package
图层和 authored node 访问接口，并让 game002 首先消费该合同，使用 Downloads 中的新
`crave-layout.zip` 后彻底删除 `assets/game002-s3`。

### 完成定义

- [ ] 后续游戏只需一个 Game Layout mapped package 作为运行时美术来源；无需额外
  Symbols、Popup、背景、Nearwin 目录或外置 asset-groups 才能解析和运行 package。
- [ ] package control、eager closure 与 `runtimeResources` 明确分层；未请求的程序 root
  不发生网络读取、decode、Object URL 或 player prepare。
- [ ] `loadRuntimeResource(key, kind)` 按 manifest 程序键加载 exact typed closure、复用
  已加载共享 leaf、合并并发请求并缓存成功结果；unknown key/kind、缺文件、hash/size、
  decode 或 Spine 校验失败均显式失败且不留下半提交资源。
- [ ] package runtime 和 presentation surface 可通过统一 `getLayer()` 获取稳定组合图层，
  并通过 exact `getNode(id)` 获取 manifest authored node；未知或当前模式不提供的目标失败。
- [ ] game002 从 package 取得布局、背景、Symbols、Popup 和 Nearwin1/2；不再从
  `assets/game002-s3` import、glob、读取或打包任何资源。
- [ ] `assets/game002-s3` 的 146 个 tracked 文件全部删除，目录不存在；Nearwin3 保留在
  Game Layout package 中但 game002 不请求，以证明未使用程序资源不会被加载。
- [ ] Downloads 输入经 production optimizer/checker 生成正式 mapped `assets/crave`，同步
  generated Vite URL map、release check、文档、规则和 UTC 中文执行报告。

## 2. 范围

### 包含

- rendercore Scene Layout mapped package 的 lazy asset source、eager closure、程序资源 typed
  loader/cache/lifecycle，以及 URL、内存文件和 ZIP source 的一致语义。
- Scene Layout package runtime/presentation surface 的稳定 layer 与 authored node API。
- reel effect manifest 从物理文件路径绑定迁移为 Game Layout 程序键绑定。
- gamelayoutpkgcli 的 runtime-resource 分组语义、WebP rewrite、正式 ZIP 和外置优化证据。
- gameframeworks 对新默认 Game Layout package API 的 facade/re-export。
- game002 loading 0%–99%/99%/100% 接线、skin/layout/effect/popup consumer、测试、release
  checker 和文档。
- 用 `/Users/zerro/Downloads/crave/crave-layout.zip` 更新 `assets/crave`，并删除
  `assets/game002-s3`。

### 不包含

- 不把 server round、credential、token、服务器轮带、本轮 scene 或 randomNumbers 写入
  Game Layout package。
- 不要求一个 package 取代游戏代码、业务 component resolver 或版本化玩法配置；
  `reel-presentation.manifest.json` 是 app-owned 配置，但其中美术只按 package 程序键引用。
- 不把 game003 旧 skin1、app-owned minecart/bg-bar 资源迁入 Minecart2；只保证新增共享
  API 对现有 game003 consumer 编译/行为兼容。
- 不增加 raw path/basename lookup、任意 JSON 字符串扫描、宽泛 glob、fallback、静默 alias
  或未声明 orphan 访问。
- 不把 package 内稳定 Symbols identity `game002-s3` 当成目录依赖而顺手重命名；本任务删除
  的是仓库目录及其运行时引用，manifest identity 仍由 owner 管理。
- 不覆盖或修改 Downloads 原 ZIP，不手改 content-addressed payload、map、optimizer 输出或
  generated TypeScript。

## 3. 制定计划时的基线

```text
UTC: 2026-08-03T10:15:18Z
HEAD: 5367b5727d11763e3da49603c8f466f22c5aa369
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/game002.md`、`game003.md`、`shared-game-runtime.md`、
  `loading-ui.md`、`scene-layout.md`、`editor-artifacts.md`；相关目录没有更深层规则。
- Downloads 输入 `/Users/zerro/Downloads/crave/crave-layout.zip`：9,868,988 bytes，SHA-256
  `143350212a44be3a5995cf9c01d2357f8ec6955274d9221a6fef75a59101564e`；其中
  `layout.manifest.json` 为 `0246671d263d2347fcc827a746ed5b81e4fcf74e2b0ba31ae9595daa51865435`，
  `assets.map.json` 为 `16989a8b2bb41cb5dc3c54c2971ed52e297e75a831acca37021fc0cb108e6188`；
  ZIP 完整性无错误，map 有 139 个 logical files。
- 输入 manifest 已声明 `runtimeResources.nearwin1|nearwin2|nearwin3`，均为 official Spine；
  exact shared leaf 是 `symbol.atlas` 和 `symbol.png`。两者 bytes 与旧目录
  `Symbol.atlas/Symbol.png` SHA-256 一致；三个 Nearwin skeleton bytes 与旧目录不同，执行时
  以 ZIP、map 和 official Spine validation 为权威，不混用旧 skeleton。
- 当前 `assets/crave` 没有 `runtimeResources`，map 有 136 个 logical files；game002 的
  loading 会把 generated physical URL 表全部变成首屏资源，因此当前并不存在按需加载。
- 当前 `SceneLayoutResource.runtimeResources` 在 package prepare 时全部物化；同步 require
  只能读已全量准备的值，CLI 又把程序资源整体并入 shared/initial，和 lazy 目标冲突。
- `SceneLayoutRuntime` 已有 exact `getNode(id)` 和 attach API；package runtime 另有多个
  专用 presentation getter，但 presentation surface 只暴露三个 container property，尚无
  一致的 layer/node contract。
- `assets/game002-s3` 有 146 个 tracked 文件；loading/skin/background/win-amount/layout、
  release checker 和测试仍引用 effect、reel manifest、背景和旧金额资源。Scene Layout
  surface 已拥有背景和 popup，后两套 app-owned module 是重复入口。

## 4. 需求解释与技术决策

### 需求解释

- “一个 gamelayout 包有全部 assets”指生产游戏的全部运行时美术及其 typed dependency
  closure 都由 package manifest/map 拥有；程序代码不再携带第二个美术目录。
- “实际没有加载”按浏览器/runtime 行为定义：URL 出现在构建产物和 source index 中不等于
  已加载；只有 fetch/read、decode、Object URL、Pixi texture 或 player prepare 才算加载。
- Nearwin 是 program-only Spine root，不应因出现在 package 就进入首次 eager closure；但其
  atlas/texture 若已由 Symbols eager closure 加载，按需加载 Nearwin 时必须复用这些 bytes/URL。
- “具体图层”同时包含稳定组合层和 authored node：组合层解决宿主 z-order，node id 解决
  精确挂点；禁止 consumer 用 child index、label 搜索或内部 display tree 猜图层。

### 关键决策

1. **package source 与 prepared resource 分离。** 新增只读 asset source/index owner：先取得
   control 和 eager transitive closure再构造 resource；全部 physical URL 可构建但不自动 fetch。
2. **程序资源默认 lazy。** `runtimeResources` 不再进入 shared/initial eager closure；按 key
   的异步 loader 解析 manifest spec、加载缺失 leaf、严格校验、原子缓存。相同 key 的并发
   调用共享一次 prepare，package destroy 中止未完成加载并统一释放成功资源。
3. **一个 package，不依赖外置 group。** runtime 从根/nested manifest 和 map 计算 closure；
   CLI asset-groups 只作优化/审计交付物，不是运行时必需输入。
4. **稳定 layer API。** 统一 id 为 `layout | reel | transition | popup`；`layout` 包含 authored
   nodes，`transition` 包含 Spine overlay 与 video blackout 的正确组合，`reel` 在
   presentation-only/app-owned reel 模式下显式 unavailable。`getNode(id)` 继续大小写精确。
5. **返回值是 borrowed presentation。** layer/node Container 由 package runtime 拥有；
   consumer 不 destroy/reparent。附加业务显示对象继续用 `attachChild/attachRelative` 返回的
   detach handle，避免破坏 package z-order 和 lifecycle。
6. **reel manifest 只保存程序键。** 将 game002 reel manifest 迁到
   `apps/game002/config/reel-presentation.manifest.json` 并升级严格版本；effect spec 只写
   `nearwin1/nearwin2` 程序键、animation/loop/transform/timing，不再写 skeleton/atlas/texture
   路径。rendercore resolver 通过注入的 typed loader 取得 official Spine resource。
7. **game002 在 99% 显式准备 effects。** 首屏 package eager load不请求 Nearwin；99% finalize
   调用新 loader 准备 Nearwin1/2 与 reel effect pool，100% 后复用同一 package owner 创建
   surface/runtime。Nearwin3 全程保持未请求。
8. **输入先优化再 vendor。** 使用 Downloads ZIP，经更新后的 gamelayoutpkgcli quality 80
   生成 verified optimized ZIP/asset-groups，再完整替换 `assets/crave` 并生成 Vite URL map；
   atlas logical page name保持，typed texture filename 可结构化改写为 WebP。

## 5. 职责与合同

- **Game Layout manifest/map**：唯一美术资源表，拥有 nodes、modes、Symbols、Popup、
  transition、runtime program roots 和 exact filename-key -> physical mapping。
- **rendercore asset source**：拥有 control、resolution、fetch/read、hash/size、dedupe、cache、
  rollback、abort 和 destroy；不认识 Nearwin 业务。
- **rendercore resource/runtime**：拥有 typed resource prepare、layer/node lookup、presentation
  z-order 和 borrowed ownership；未知 key/kind/layer/node 显式失败。
- **gamelayoutpkgcli**：拥有 WebP rewrite、content addressing、全包复验和 versioned groups；
  程序 root 独立成 `runtime:<key>`，shared leaf 可重叠但不反向拉 sibling，纯程序 root 不进 initial。
- **gameframeworks**：作为后续游戏 facade 公开单 package source/resource/runtime 类型和
  factory，不复制 rendercore loader。
- **game002**：拥有 effect key、timing、anticipation 业务和加载边界；不读取 package raw path，
  不直接操作 package display tree。
- **失败与生命周期**：control/manifest/map 先验失败不创建 runtime；lazy prepare 失败只回滚
  本次新建对象；已提交共享资源不被失败请求销毁；destroy 幂等并使 late completion 失效。
- **禁止行为**：不保留第二份 asset table，不按 basename/首项/大小写猜 key，不因共享 leaf
  反向加载 Nearwin sibling，不用 placeholder、静默降级或重复 fetch 掩盖错误。

## 6. 文件范围

### 预计新增

```text
apps/game002/config/reel-presentation.manifest.json
packages/rendercore/src/scene-layout/package-asset-source.ts
packages/rendercore/tests/scene-layout/package-asset-source.test.ts
tasks/artifacts/155/crave-layout-task155.optimized.zip
tasks/artifacts/155/crave-layout-task155.assets-groups.json
tasks/155-gamelayout-single-package-runtime-<utctime>.md
```

### 预计修改

```text
AGENTS.md
assets/crave/**
packages/rendercore/src/scene-layout/{types,manifest,resource,package-resource,production-zip}.ts
packages/rendercore/src/scene-layout/{runtime,package-runtime,presentation-surface,index}.ts
packages/rendercore/src/reel/{manifest,grid-cell-effect-resource,index}.ts
packages/rendercore/tests/{scene-layout,reel}/**
packages/rendercore/README.md
packages/gameframeworks/src/{index,scene-layout-template/index}.ts
packages/gameframeworks/tests/scene-layout-template.test.ts
apps/gamelayoutpkgcli/src/{types,asset-groups,reference-rewriter}.ts
apps/gamelayoutpkgcli/tests/**
apps/gamelayoutpkgcli/README.md
apps/gamelayouteditor/README.md
apps/game002/src/generated/crave-layout-resources.generated.ts
apps/game002/src/{loading-resources,game-entry,skin-config,scene-layout-skin}.ts
apps/game002/src/{game-layout,game-demo,game-adapter}.ts
apps/game002/tests/**
apps/game002/scripts/verify-static-dist.mjs
apps/game002/{README.md,docs/animation-flow-and-timing.md}
docs/scene-layout-manifest.md
docs/agent-rules/{game002,shared-game-runtime,scene-layout,editor-artifacts}.md
```

### 预计删除

```text
assets/game002-s3/**
apps/game002/src/background-config.ts
apps/game002/src/win-amount-config.ts
apps/game002/tests/win-amount-config.test.ts
```

### 原则上不应修改

```text
assets/minecart2/**
assets/game003-s1/**
apps/game003/src/**
packages/{logiccore,netcore,uiframeworks,gameloading*}/**
pnpm-lock.yaml
```

若 lazy source 需要明显改变 Scene Layout manifest version、外置 credential、根工具链或
game003 业务流程，必须先说明并重新确认，不能事后扩写计划。

## 7. 实施步骤

1. **确认执行基线与输入**
   - 重查 HEAD/status、规则、Downloads ZIP bytes/hash、runtimeResources、map closure 和
     `assets/game002-s3` 实际 consumer；保留任何新出现的用户无关修改。
   - 用 production inspector 和 official Spine validator验证输入，不从旧目录补缺失资源。

2. **建立 lazy package asset source**
   - 在 rendercore 实现 mapped URL、resolved files、ZIP 三类 source 的共同 index/loader；
     URL source 只先取 control 和 eager closure，内存/ZIP 即使 bytes 已存在也延迟 typed prepare。
   - 以 map entry 校验每次读取的 path/hash/size，缓存 logical bytes/typed resource，合并相同
     key 的并发请求，并覆盖 abort/destroy/late completion。
   - build/export 继续完整复验 missing/orphan；runtime 不为证明 orphan 而预取全部 bytes。

3. **把 runtimeResources 改成按键加载**
   - package resource 增加 async `loadRuntimeResource(key, kind)` 和只读 loaded-state 查询；
     sync require 只允许已提交资源，未加载与不存在使用不同错误。
   - 五类 typed resource 都覆盖 lazy prepare；共享 leaf、nested assets、Object URL 与 Pixi
     decode 遵守同一 owner/cache。
   - CLI 分组升级为 versioned program-key group：每个 runtime root 独立，initial 排除纯程序
     root，共享 leaf按真实 eager ownership复用；optimizer 后重新验证 key、closure 和 map。

4. **统一图层和 node API**
   - package runtime 增加 exact `getLayer("layout|reel|transition|popup")`，surface 转发可用层和
     `getNode(id)`；复用真实 container，不创建平行 display tree。
   - transition layer 同时覆盖 Spine/video 正确 z-order；presentation-only 的 reel、unknown id、
     init 前和 destroy 后访问显式失败。
   - 测试 borrowed identity、mode switch 后稳定 identity、attach/detach、resize、popup、transition
     和 destroy，不允许 consumer child-index lookup。

5. **迁移 reel effect 合同与 gameframeworks facade**
   - reel manifest 改为程序键 binding；effect resource resolver 接收中性 async typed loader，
     继续校验 official 4.3、exact animation、duration、loop、pool capacity。
   - gameframeworks 公开单 package factory/types，并让 ZIP template 保持单输入合同；URL/mapped
     production consumer 可获得真正 byte-lazy 行为，ZIP 已下载场景只承诺 prepare-lazy。

6. **接入 game002 并移除重复资源入口**
   - game002 loading 用 generated physical URL index 创建 package source，不再把全部 URL 和
     Nearwin extension逐项加入首屏 resources；99% 通过 key 加载 Nearwin1/2。
   - skin config 从 package manifest取得 art size、focus、reel geometry、Symbols、Popup 和
     runtime Spine；布局 API 显式接收这些值，不再从旧背景 manifest 静态导入。
   - 删除 app-owned背景和临时 win-amount resource module；继续用 scene-layout surface popup，
     viewport update不触碰 popup内部 layout。
   - release/source-boundary 测试断言 eager/lazy closure、Nearwin3 未请求、无旧路径且共享
     atlas/texture 不重复 fetch。

7. **生成正式 Crave 交付物并删除目录**
   - 用 Downloads ZIP 生成 task155 optimized ZIP 和 asset-groups；独立复验 ZIP、manifest、map、
     runtime key、shared leaf、initial/program groups、hash/size/path/orphan。
   - 从 verified optimized ZIP 完整替换 `assets/crave`、移除旧 orphan、重新生成并 check
     game002 Vite URL map。
   - 在所有 consumer 迁移且定向测试通过后删除 `assets/game002-s3` 全目录；搜索路径引用，
     不删除 package 内稳定 Symbols identity。

8. **文档、规则与收尾**
   - README/manifest 文档说明单包、lazy program resource、layer/node、URL 与 ZIP 行为差异；
     更新最小根/领域长期规则和 game002 资源来源。
   - 运行 L2 验收、检查 diff，记录输入/输出 bytes/hash、加载闭包证据和未完成人工验收，
     生成 UTC 中文报告。

## 8. 测试与验收

### 测试原则

- source 测试用可计数 fetch/read fake 证明“没有调用”而不是仅检查数组；Nearwin1/2/3 与
  shared atlas/texture 必须能分别观察请求次数。
- 覆盖正常 lazy load、已 eager shared leaf、并发同 key、顺序多 key、unknown/wrong kind、
  missing/hash/size/decode/Spine failure、abort、destroy 和 retry 边界。
- layer 测试断言 container identity/z-order/availability 和 borrowed lifecycle，不通过 label
  搜索或手造 container 冒充 public contract。
- 覆盖 mapped URL、resolved files、ZIP；ZIP bytes 已在内存时只验证 typed prepare/decode 延迟。
- game002 覆盖 99% effect prepare、100% 复用、fatal cleanup、Nearwin真实 once completion、
  BG/FG transition、popup 和现有 round trace；不为删除目录降低 production strictness。

### 验收级别

`L2`。任务修改 rendercore/gameframeworks public API、异步 resource ownership、CLI versioned
group、正式 production ZIP/mapped assets 和 game002 直接 consumer；范围可由这些 package/app
及 game003 typecheck 界定，不改根工具链或 lockfile，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter gamelayoutpkgcli build && pnpm --filter gamelayoutpkgcli start -- --input /Users/zerro/Downloads/crave/crave-layout.zip --output tasks/artifacts/155/crave-layout-task155.optimized.zip --assets-json tasks/artifacts/155/crave-layout-task155.assets-groups.json --quality 80
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayoutpkgcli --filter game002 --filter game003 typecheck
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gamelayoutpkgcli --filter game002 test
pnpm --filter game002 check:resources && pnpm --filter game002 release:check
test ! -e assets/game002-s3 && ! rg -n 'assets/game002-s3|game002-s3/' apps packages docs/agent-rules --glob '!**/dist/**'
git diff --check
```

失败时先单 package/单测试最小化；不立即扩大到整仓，不为通过旧路径断言恢复兼容入口。

### 人工验收

1. 在真实浏览器 Network 面板确认 package eager prepare 不请求 Nearwin skeleton；game002 99%
   显式请求 Nearwin1/2，Nearwin3 始终未请求，共享 atlas/texture不重复下载。
2. 在 BaseGame/FreeGame、resize 和 popup 流程检查 `layout/transition/popup` z-order；用公开
   layer/node API 挂载并 detach 一个测试对象，确认无需 child index/label 搜索。
3. 运行真实 live initial spin 与 anticipation cascade，确认 Nearwin1/2 official Loop、landing
   cadence、mask、BG/FG transition、BigWin 和 destroy 与现状一致。

### 独立验收建议

`必须`。本任务涉及跨包 public contract、正式 ZIP、lazy async transaction、resource ownership
和 destroy。独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gamelayoutpkgcli test
pnpm --filter game002 release:check
```

并独立用一次可计数真实 HTTP 请求确认 Nearwin3 未加载、共享 leaf 只加载一次。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 没有 Node 时执行
  `source /Users/zerro/.nvm/nvm.sh` 后运行 `nvm use 24`。
- 依赖缺失才运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败才设置仓库模板中的本地代理并重试；本任务输入是本地 ZIP，不需下载。
- 使用现有 `cwebp`；缺失时报告，不伪造结果。预期不新增依赖、不改 lockfile，否则先说明。

## 10. 生成物、文档与规则

- Downloads ZIP 是只读输入；optimizer 生成 task155 optimized ZIP 和外置 asset-groups，
  `assets/crave` 只从 verified optimized ZIP 完整更新。
- `assets.map.json`、content-addressed payload、asset-groups 和 generated Vite URL map 均由正式
  exporter/optimizer/generator产生并运行 checker，禁止手改。
- 外置 asset-groups 是优化证据和可选调度信息，不是运行 game package 的第二个必需文件。
- 更新根 `AGENTS.md` 的“后续游戏单 Game Layout 美术包”长期默认；shared/scene/editor 规则
  记录 lazy key、layer/node、closure/lifecycle；game002 规则移除旧目录合同。
- 精确 task155 asset 清单、hash、请求次数和验收证据只写任务报告，不追加根规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建 `tasks/155-gamelayout-single-package-runtime-<utctime>.md`，UTC 使用
`date -u +%y%m%d-%H%M%S`。报告记录实现/文件、偏差、输入输出 hash、命令结果、lazy 请求
证据、人工验收和风险，不收集无关 coverage 或完整历史矩阵。

## 12. 风险、假设与待确认

### 风险

- lazy source 改变首屏请求时序；如果 effect 在 99% 未完成 prepare 就进入 runtime，会在首次
  anticipation 才暴露错误，因此 game002 必须把所需 key 的显式准备作为 99% gate。
- 共享 atlas/texture 同时由 Symbols eager root 和 Nearwin program root拥有；错误的反向 closure、
  refcount 或 rollback 会造成重复请求、提前释放或 sibling skeleton 误加载。
- layer API 若直接暴露可销毁 container，consumer 误 reparent/destroy 会破坏 runtime；文档、类型
  和 attach API 必须明确 borrowed ownership，测试 destroy 后访问。
- optimizer 的 WebP 改写必须保持 atlas logical page 和 runtime program key；真实透明边缘、
  Nearwin视觉和 transition/video z-order 仍需浏览器人工验收。

### 假设

- Downloads ZIP 是本任务的权威 Layout 输入，三个 Nearwin root 的 `Loop` 和 Spine 4.3 能通过
  当前 official validator；若素材本身非法则停止并报告，不回退旧目录。
- `runtimeResources` 表示程序按键资源，默认不属于首屏 eager closure；若同一 root 同时被 node、
  Symbols、Popup 或 transition 正向引用，则其实际共享 leaf仍可因该 eager owner提前加载。
- game002 只需要 Nearwin1/2；Nearwin3 作为 package-owned 未使用资源保留且不加载。

### 待确认

无。单包边界、lazy 定义、layer/node API、game002 effect key 和输入 ZIP 均已有仓库证据；执行中
若发现新业务 asset 仍在旧目录被真实使用，应先报告而不是删除后增加 fallback。

## 13. 完成清单

- [ ] 单 Game Layout 美术包、lazy program resource 和 layer/node public contract 已满足。
- [ ] game002 全部 production visual consumer 已迁移，`assets/game002-s3` 已删除且无路径引用。
- [ ] Downloads ZIP 已优化、复验并完整更新 `assets/crave`；generated/map/orphan parity 同步。
- [ ] Nearwin1/2 按 key 加载、Nearwin3 未加载、共享 leaf 去重和失败 rollback 已覆盖。
- [ ] game002 现有 loading、round、anticipation、transition、popup 和 destroy 行为保持。
- [ ] public API、async ownership、文档和规则已同步。
- [ ] 指定 L2 自动化通过，人工验收状态单独记录，UTC 中文报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的六份领域规则和本计划；
2. 核对 Git、Downloads ZIP/hash、当前 mapped roots 和旧目录 consumer；
3. 按计划实现，不重新制定另一套 eager/raw-path 方案；
4. 小幅适配当前实现时在报告记录；
5. manifest version、public loader/layer contract、依赖或文件范围明显扩大时先停止说明；
6. 只运行计划规定的 L2 验收，真实浏览器/live 结果不得由 fake runtime 代替；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。

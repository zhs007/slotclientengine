# 164 game002-game003-trusted-art-assets 任务计划

## 1. 目标与完成定义

### 目标

让 `apps/game002` 的 `assets/crave` 和 `apps/game003` 的 `assets/minecart2`
以美术在正式 asset 目录中最终交付的实际 files/bytes 为权威。当
`assets.map.json` 中的 `sha256`/`byteLength` 与这些 bytes 不一致时，两个
game app 的生成、loading/runtime prepare 和 release check 不得因 hash/size drift
拒绝启动或发布；美术也可以在目录中保留额外、暂未引用的文件，不必
为每次内容替换重新导出整包。只对游戏实际引用的路径保留运行所必需的
路径安全、存在性、manifest 语义和解析/渲染能力检查。

### 完成定义

- [ ] game002 的 eager mapped assets 和 lazy `runtimeResources`（包括截图中
      `af.json` 同类资源）在实际 bytes 与 map `sha256`/`byteLength` 不一致时
      仍按 logical key 成功 prepare，不再报 `failed hash/size validation`。
- [ ] game003 的 Minecart2 mapped package 保持同样行为，并有回归锁定其
      当前已有的 runtime 非重复校验合同。
- [ ] game002/game003 的 Vite resource generator、`check:resources` 和
      `release:check` 不再将实际 payload 与 map hash/size 比对；两个 app 只打包
      实际引用的 mapped physical files，不用 glob 猜测额外资源。
- [ ] game002/game003 的 trusted-art consumer 只要求实际被 layout/nested
      manifest/runtime-resource 引用的 logical key 能安全路由到存在的文件，
      并能通过对应 Spine/VNI/image/image-string/media parser/decoder；未引用的
      map entry、缺失的未引用 entry 和目录中额外文件不阻断。
- [ ] map 中用于编辑器完整性的 `sha256`/`byteLength` 及其与 physical path
      的 content-addressed 关系不再是两个 game app 的启动/构建 gate；实际引用路径
      仍必须是 `assets/` 下安全的 canonical relative path。
- [ ] 最终 dist 包含两款游戏实际引用的当前美术 bytes，不强制包含未引用
      文件。
- [ ] Game Layout Editor 导入、`gamelayoutpkgcli` 优化输入、editor package
      导出和其他 consumer 的 map hash/size/orphan 完整性校验不放宽。
- [ ] L2 定向验收通过；执行会话不改写美术 payload 或
      `assets.map.json`。

## 2. 范围

### 包含

- rendercore mapped scene-layout runtime 解析中 eager/lazy logical file 装配的
  hash/size 边界统一。
- scene-layout runtime 和 Vite resource generator 的显式“信任当前美术目录”模式，
  只由 game002/game003 opt in；它不对未引用文件施加 exact/orphan gate。
- game002/game003 static dist checker 移除对 map hash/byteLength 的内容比对和
  整个美术目录的 orphan/exact-closure 限制，只证明实际引用文件进入 dist。
- rendercore 定向回归、两个 game package 的集成/发布验收、README 与
  最小范围领域规则同步。

### 不包含

- 不修改 `assets/crave/**`、`assets/minecart2/**`、资源分组 JSON 或 generated
  Vite URL 表的当前内容；本任务不接收新美术包。
- 不要求美术删除或同步 `assets.map.json` 的 `sha256`/`byteLength`；
  不变更 editor 导入/导出使用的 `editor-assets` v1 schema。
- 不放宽 `validateEditorAssetsMapPackage()`、Game Layout Editor 导入、
  Symbols/Popup/Image String editor 物化、`gamelayoutpkgcli` 或生产 ZIP 的交付完整性校验。
- 不忽略“实际引用”文件的缺失、不安全路径、坏 JSON/图片/Spine/VNI、
  未知 kind 或缺 animation/resource 等无法运行的错误；未引用文件不做限制。
- 不增加 filename/hash/path 猜测、首项默认、fallback、资源 alias 或
  placeholder，不修改 round flow、渲染时序、server 数据或 public reel 边界。
- 不修改 lockfile、根工具链，不运行整仓 L3 验收。

## 3. 制定计划时的基线

```text
UTC: 2026-08-05T03:53:46Z
HEAD: 41279e7c78894b5d0f8d8866e8985e0e36ca2f26
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/game002.md`、`game003.md`、`shared-game-runtime.md`、
  `loading-ui.md` 和直接相关的 `scene-layout.md` production package 规则；
  相关 app/rendercore 目录没有更深层 `AGENTS.md`。
- game002/game003 都由
  `packages/rendercore/scripts/generate-scene-layout-vite-resources.mjs` 从 map 生成精确
  Vite imports；该脚本目前会读取每个 physical payload，同时比对
  `byteLength` 和 SHA-256，并把目录中未被 map 列出的文件视为 unexpected。
- `createSceneLayoutPackageResource()` 的普通 mapped path 通过
  `resolveEditorAssetsMapPackage()` 只按 map path 取 bytes，已不比对 hash/size；
  game003 `prepareGame003SkinConfig()` 使用该路径。
- game002 使用 `lazyRuntimeResources: true` 并通过
  `loadCraveRuntimeResourceBytes()` 按需读取 Nearwin 等程序资源。
  `resolveSceneLayoutPackageFiles()` 的 partial eager branch 和
  `createVerifiedMappedLogicalLoader()` 目前都重新计算 SHA-256 并比对
  byte length；截图的 `Mapped scene layout asset "af.json" failed hash/size
validation` 正来自这一 shared runtime 分支。
- `apps/game002/scripts/verify-static-dist.mjs` 会比对 Crave source payload 与 map
  byteLength；`apps/game003/scripts/verify-static-dist.mjs` 会比对 Minecart2 source
  payload 的 map hash/size。两者也都会验证 map 指向的 source bytes 有进入
  dist；game002 使用 byte equality，game003 当前用二次 hash 集合。
- `editorresource.resolveEditorAssetsMapPackage()` 的注释和
  `scene-layout.md` 已规定 runtime 不重复计算 hash/size；当前 lazy
  scene-layout runtime 与此合同不一致。另一方面，现行领域规则仍要求
  production app 的构建 checker 比对 hash/size，需按本任务对两个 app
  建立明确例外并保留 editor/export 边界。

## 4. 需求解释与技术决策

### 需求解释

- “不要 assets 的 hash 和 size 检查”解释为：不将当前 physical file
  bytes 与 map 的 `sha256`/`byteLength` 做内容一致性比对，也不用这两个
  metadata 反向限制 game app 可接受的 physical path。
- “美术会自己修改 assets 包，不能做过多限制”表示 `assets/crave` 和
  `assets/minecart2` 是可由美术直接维护的 production source：可原路径替换
  bytes，也可保留额外/未引用文件；这些变化不要求重新跑 editor exporter
  或更新 integrity metadata。
- 仍需检查的只是游戏能否实际运行：被 manifest/runtime logical key 引用的
  path 必须安全、文件必须存在，并通过对应 typed parser/decoder；dist 必须
  包含这些实际使用的最终 bytes。
- 这是 game002/game003 对直接 vendor 美术目录的明确 policy；不推广到
  editor 导入/导出、优化 ZIP 或其他 mapped package consumer。

### 关键决策

1. **runtime 通过明确 policy 只做必需路由与语义校验。** 为 shared
   scene-layout package loader 增加中性 `trusted-art` mapped policy（精确名称在实施
   时固定），由 game002/game003 显式传入。该 policy 以 logical key→safe
   physical path 作为运行路由，忽略 integrity-only metadata、未引用 map entry 和
   unmapped extra files；默认/editor/ZIP policy 不变，app 不复制 resolver。
2. **build 通过显式 opt-in 表达同一美术 policy。** 为 Vite resource generator
   增加命名明确的 CLI option（如 `--trust-art-directory`），只在
   game002/game003 generate/check scripts 中传入。opt-in 时跳过 hash/size、
   content-addressed path relation 和 unexpected/orphan file gate；导入实际可用的 mapped
   physical files。默认模式保留现有完整性检查。
3. **release 以实际 bytes 证明交付。** game002 保留已有 source-to-dist
   byte equality，只删除 source-to-map size 比对；game003 将基于 hash 的
   source-to-dist 查找改为 byte equality。这保证最终美术 bytes 进入 dist，又不
   把 map digest 当成内容权威。
4. **trusted-art 只保留运行所需形状。** game app 只解析 map identity/files 和
   logical key 对应的 safe `assets/` relative path；`sha256`/`byteLength`/content-addressed
   filename relation 即使过时也不阻断。实际引用的资源内容仍须通过其对应
   parser/decoder/runtime capability 校验。
5. **不修改 editor integrity API。** `validateEditorAssetsMapPackage()` 仍校验
   hash/size/orphan；`resolveEditorAssetsMapPackage()` 仍是 runtime resolver。不为本任务
   增加全局开关或 fallback。

## 5. 职责与合同

- **美术目录**：`assets/crave` 和 `assets/minecart2` 中实际被游戏引用的
  files/bytes 是最终运行/发布内容；美术可以替换内容、维护路由或留下
  未引用文件，不被 editor integrity metadata 反向限制。
- **rendercore runtime**：在 trusted-art policy 下按 safe map path 解析 eager/lazy
  bytes，只对实际引用闭包执行 nested manifest 和渲染能力检查，忽略额外
  entries/files 且不重算 map 完整性。
- **build/release**：生成器列出当前 map 中存在的 safe physical files；app checker
  检查实际引用路径可用、generated parity 和最终 bytes 进入 dist，不以未引用
  entry/file 或 map hash/size 阻断。
- **editor/export**：继续拥有完整 hash/size/media/orphan 校验、content-addressed
  产生与优化 ZIP 合同；本任务不改变它们。
- **失败策略**：实际引用 key 没有 safe path、引用 payload 缺失、解码失败、
  未知 resource kind/key 或能力缺失仍在 mutation 前显式失败；未引用内容不参与。
- **禁止行为**：不用 hash 搜索替代文件，不忽略 map path，不扫描 glob
  猜资源，不提供旧 bytes fallback，不在 app 复制 shared resolver。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/scene-layout/vite-resource-generator.test.ts
tasks/164-game002-game003-trusted-art-assets-<utctime>.md
```

### 预计修改

```text
packages/rendercore/scripts/generate-scene-layout-vite-resources.mjs
packages/rendercore/src/scene-layout/package-resource.ts
packages/rendercore/tests/scene-layout/package-resource.test.ts
apps/game002/package.json
apps/game002/scripts/verify-static-dist.mjs
apps/game002/README.md
apps/game002/src/skin-config.ts
apps/game003/package.json
apps/game003/scripts/verify-static-dist.mjs
apps/game003/README.md
apps/game003/src/skin-config.ts
docs/agent-rules/{game002,game003,scene-layout}.md
```

### 原则上不应修改

```text
assets/crave/**
assets/minecart2/**
assets/{crave,minecart2}.assets-groups.json
apps/game002/src/generated/**
apps/game003/src/generated/**
apps/gamelayouteditor/**
apps/gamelayoutpkgcli/**
packages/editorresource/**
packages/browserartifactio/**
packages/rendercore/src/{popup,symbol,image-string}/**
pnpm-lock.yaml
AGENTS.md
```

generator source formatting 若稳定输出不变，不应重写两个 generated TS。
若实施时发现必须改 editor/export 的 `editor-assets` schema/validator 或正式
美术 bytes，属于重大范围扩张，必须停止并说明。

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD/status、当前 map/generator/package scripts 和领域规则。
   - 用定向 fixture 复现 game002 lazy mapped asset 的 hash/size drift 报错，并确认
     game003 eager path 当前已不重复校验；不改写正式资源来造测试。

2. **增加 scene-layout trusted-art runtime policy**
   - 在 `package-resource.ts` 为 mapped resource options 增加 strict typed policy，不修改默认/
     editor/ZIP 行为；game002/game003 `skin-config.ts` 显式选择 trusted-art。
   - trusted-art map view 只取 logical key 与 safe canonical `assets/` path，不因
     `sha256`/`byteLength` 格式、实值或 content-addressed path relation 拒绝。partial
     eager 和 lazy logical loader 不做 bytes hash/size 对比。
   - eager/lazy package 组装只对 manifest 实际引用的 logical closure 要求存在且
     语义有效；未引用 map entry、缺失的未引用 entry 和 unmapped extra files 忽略。
   - 保留 lazy typed kind、各类资源 parser/decoder、prepare/rollback/destroy；不在 app
     复制 resolver 或资源表。

3. **为两个 game 接入显式 build policy**
   - 为 `generate-scene-layout-vite-resources.mjs` 增加 strict CLI boolean option；
     默认仍读 bytes 并比对 map hash/size，opt-in 时跳过两项内容对比。
   - opt-in 只要求 logical key 的 physical path 是 safe `assets/` relative path；忽略
     hash/size/content-addressed relation、不存在的未引用 entry 和未在 map 中的额外文件。
     默认模式保留现有 exact checks，两种模式都继续 `--check` generated parity。
   - game002/game003 的 generate 和 check scripts 都显式传入该 option；其他
     调用方默认行为不变。

4. **调整 app release checker**
   - game002 删除 Crave payload 的 map hash/size/content-addressed 形状限制和目录
     exact/orphan 限制；仍确认实际被 generated/runtime 引用的 source bytes 进入 dist。
   - game003 删除 Minecart2 payload 对 map `byteLength` 和 `sha256` 的比对；
     将 source/dist 包含性从 `createHash()` 集合改为对最终 source bytes 的 exact
     equality，再删除无用 crypto import/helper。
   - game003 同样不再限制未引用的 map entry/file；对 layout/map 控制文件、
     实际引用资源、敏感字符串和 dist chunk 边界的现有验收保持。

5. **添加回归并更新合同**
   - rendercore mapped fixture 用仍可语义解析、但 bytes/hash/size 与 map 不一致
     的 eager 和 lazy/deferred assets 证明两条 runtime path 都成功；另保留缺
     logical key/payload、坏内容和错 kind 的 strict failure。
   - generator 回归覆盖默认模式仍拒绝 hash/size/orphan drift；game opt-in
     模式接受这些 drift 和 extra files，但仍拒绝不安全路径，并保持 generated
     output parity。
   - README 记录美术 bytes 权威、替换 workflow 和仍保留的检查；
     `game002.md`、`game003.md`、`scene-layout.md` 同步这个稳定的
     app opt-in/runtime 边界，不写逐文件 hash 或一次性证据。

6. **定向验收与报告**
   - 运行 rendercore 定向 typecheck/test，两个 game 的 typecheck/test、
     resource check 和 release check，以及 `git diff --check`。
   - 检查 diff 未修改正式 art/map/generated payload，搜索 app/runtime/release
     中残留的 map hash/size 对比点；编写 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 使用小型 mapped fixture 改变有效内容或 map metadata，不修改两个正式
  asset 目录来构造 hash/size drift。
- 必须同时证明 eager 与 lazy/deferred runtime，generator default 与两款游戏
  opt-in，避免只修截图单一分支。
- 返回 bytes 仍须通过实际 typed parser/decoder；不用关闭解码或吞错来冒充
  成功。
- 被实际引用的缺失文件、不安全 path、坏 JSON/媒体、unknown key/kind 仍须
  显式失败；未引用或额外文件必须被忽略，不为过时 editor integrity 断言
  保留 game production gate。
- release checker 仍以实际 source bytes 确认 dist 内容，不把“不检查 map
  hash/size”扩大为“不验收资源交付”。

### 验收级别

`L2`。任务修改 rendercore 共享 mapped runtime 和 generator，并同步直接
consumer game002/game003 的正式构建/发布边界；范围可由这三个 package
界定，不改 workspace/lockfile，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-resource.test.ts tests/scene-layout/vite-resource-generator.test.ts
pnpm --filter game002 --filter game003 typecheck
pnpm --filter game002 --filter game003 test
pnpm --filter game002 release:check && pnpm --filter game003 release:check
git diff --check
```

`release:check` 已包含两个 app 的 generated resource `--check` 与 build，因此不再
单独重复列出 `check:resources`。失败时先缩小到单个 package/测试/资源键，
不扩大到整仓。

### 人工验收

1. 在不改 `assets.map.json` 的前提下，用一份经确认格式有效但
   hash/size 已 drift 的 Crave 美术交付启动 game002，确认 loading 99%
   可完成且不再出现截图中的 validation error。
2. 同样启动 game003，确认 Minecart2 layout、Symbols、Spine/VNI、主转轮与
   popup 使用当前 physical files 正常显示。
3. 两款游戏各执行一次 normal spin 与 destroy/re-enter，确认没有因 lazy
   asset prepare 留下空白节点、半提交 player 或泄漏。

如果执行会话没有用户的实际 drift 美术交付或不启动浏览器，报告必须将人工
验收标记为待用户完成，不用 fixture/typecheck 写成视觉通过。

### 独立验收建议

`必须`。本任务有意改变正式美术的 integrity gate，涉及 shared runtime、
lazy resource ownership 和两个 release checker。独立复验重点是“hash/size/extra
file drift 允许，但实际引用缺失/坏内容仍失败”：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-resource.test.ts tests/scene-layout/vite-resource-generator.test.ts
pnpm --filter game002 release:check && pnpm --filter game003 release:check
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 没有 Node 时执行
  `source /Users/zerro/.nvm/nvm.sh` 和 `nvm use 24`。
- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`。
- 不新增依赖，不修改 `pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 两个 generated Vite URL 文件仍只由
  `generate-scene-layout-vite-resources.mjs` 生成；本任务的生成逻辑不改
  source list/order，所以预期 `--check` 直接通过且不改 generated files。
- 两个 app README 记录 directory-authoritative workflow：美术可直接替换/
  增加文件，只对实际引用 path 保留安全、存在性和 decoder 检查。
- `docs/agent-rules/game002.md` 与 `game003.md` 记录两款游戏的稳定例外；
  `scene-layout.md` 将 runtime 不重复校验与 build consumer 显式 opt-in 的边界
  写清。不修改根 `AGENTS.md`。
- 本任务执行会话不代替美术修改 generated TS、asset-groups 或 asset payload。

## 11. 执行报告

执行完成后使用 `date -u +%y%m%d-%H%M%S` 创建
`tasks/164-game002-game003-trusted-art-assets-<utctime>.md`。

报告简要记录最终修改、runtime/build/release 边界、测试与命令结果、
未完成的真实浏览器验收、计划偏差和剩余风险。不采集无关 coverage/
整仓统计，不将本任务执行中的一次性 hash 写入长期规则。

## 12. 风险、假设与待确认

### 风险

- game002/game003 不再检测 vendor 目录中的非预期内容替换或额外文件；
  这是“美术可自行修改且当前交付为准”的直接取舍，必须依靠 source review、
  实际引用资源 decoder 和浏览器验收确认交付内容。
- lazy runtime 放弃 digest/length gate 后，必须确保 parser/prepare 失败仍正确
  rollback，不得留下半提交 Spine/VNI/player。
- 用 byte equality 验证 dist 会读取最终资源内容；这是 release-only checker，
  不进入浏览器 runtime，也不与 map metadata 比较。

### 假设

- 美术会继续用 layout/nested manifest/logical key 声明游戏真正要使用的
  资源；仅缓解交付目录的 integrity/exactness 限制，不要求 runtime 猜测哪个
  未声明文件应被显示。
- game002/game003 仍以当前 mapped folder 而不是 ZIP、远程 CDN 或旧资源目录
  作为 production source。

### 待确认

无。

## 13. 完成清单

- [ ] game002/game003 对 map hash/size drift 的 runtime/build/release gate 已按计划移除。
- [ ] 实际美术 bytes 仍被精确路由、解码并进入 dist。
- [ ] 实际引用资源的 missing/unsafe-path/kind/decoder strict failure 仍由测试保护；
      未引用 entry/file 不阻断。
- [ ] editor/export/optimizer 完整性校验和其他 consumer 默认行为未被放宽。
- [ ] public API、资源 ownership、rollback/destroy 边界与生成物符合计划。
- [ ] L2 自动验收通过，人工验收与自动验收已明确区分。
- [ ] 未修改正式 art/map/generated files 或 lockfile。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则和本计划。
2. 核对 Git 基线、工作区与两个正式美术目录，保留用户无关修改。
3. 按计划实现，不重新制定另一套方案，不修改美术 bytes/map 来让旧
   integrity check 通过。
4. 小幅适配当前实现时在报告记录；若需改 editor/export schema/validator
   或扩大 consumer，先停止说明。
5. 只运行计划规定的 L2 定向验收；失败先最小化复现。
6. 完成后生成 UTC 中文执行报告，明确待用户完成的真实浏览器验收。
7. 除非用户明确要求，不 commit、不 push、不创建 PR。

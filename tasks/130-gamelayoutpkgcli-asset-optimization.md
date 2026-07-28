# 130 gamelayoutpkgcli asset optimization 任务计划

## 1. 目标与完成定义

### 目标

新增本地 Node CLI `apps/gamelayoutpkgcli`，消费 Game Layout Editor 导出的
production ZIP，在不改变 layout 业务语义的前提下：

1. 使用本机 `cwebp` 把 PNG/JPEG 图片转换为 WebP，重建所有受影响的 typed
   引用、`assets.map.json` 和 content-addressed payload；
2. 按 `gameModes.initialMode`、各 mode、Symbols package、award-celebration
   Popup 和有向 transition 生成资源归属及相对 initial 的差量记录；
3. 输出一个优化后的 ZIP 和一个同目录、但不进入 ZIP 的 JSON 记录，为后续合图和
   loading 优化提供稳定输入。

### 完成定义

- [x] 用户可通过一个本地命令输入当前 filename-key Scene Layout v1 ZIP，得到
      `<input-stem>.optimized.zip` 和 `<input-stem>.assets-groups.json`。
- [x] PNG/JPG/JPEG logical asset 经 `cwebp` 转为 `.webp`；已有 WebP 和所有非图片
      payload 保持原 bytes，CLI 不修改输入 ZIP。
- [x] 输出 ZIP 仍只有 `layout.manifest.json`、`assets.map.json` 和精确
      `assets/<sha256>.<ext>` payload，且能通过现有 scene-layout、Symbols、Popup、
      ImgNumber、VNI 与 assets-map 严格校验。
- [x] 所有图片引用只通过 schema-aware rewrite 更新；Spine atlas page logical name、
      node/package/mode/resource id、VNI asset id 与 `originalName` 不因格式转换改变。
- [x] 分组使用 manifest 中的实际 mode id 和 `initialMode`，不硬编码
      BaseGame/FreeGame/BG/FG；`from -> to` transition 归属 `from` mode。
- [x] JSON 同时记录完整语义闭包和 `requiredAssets - initialAssets` 差量；非 initial
      mode 不重复列入 initial 已加载的文件，但完整归属信息不丢失。
- [x] cwebp、输入、重写、校验、写盘任一步失败时显式报错，不留下半成品 ZIP/JSON
      或临时文件。
- [x] README、领域规则、测试和 UTC 中文执行报告同步完成。

## 2. 范围

### 包含

- 新建 `apps/gamelayoutpkgcli` 的 CLI、严格参数解析、package inspector、图片转换、
  typed reference rewrite、资源分组、确定性 ZIP/JSON 输出和原子写盘。
- 只接受当前 `gamelayouteditor` 导出的 filename-key Scene Layout v1 包：
  根 manifest、根 assets map、完整 SHA-256 content-addressed payload。
- 输入必须有非空 `gameModes`、合法 `initialMode` 和 modes；缺少大状态机时无法可靠分组，
  第一版显式失败，不猜一个隐式 BaseGame。
- 覆盖 layout image/Spine/video/image-string、Symbols package 及其 symbol
  manifest/ImgNumber/VNI/Spine 闭包、Popup package 及其 ImgNumber/VNI/Spine 闭包。
- 使用现有 `@slotclientengine/browserartifactio`、`editorresource`、`rendercore` 和
  `vnicore/core` 的 parser、collector、hash、ZIP 与 VNI rewrite 能力。
- 新增正式 versioned asset-groups JSON 合同及其 parser/validator。
- 在根 `AGENTS.md` 增加新 app 的规则路由，并在最小范围领域规则记录稳定职责。

### 不包含

- 不修改 `gamelayouteditor` 的导出 UI、ZIP schema 或编辑工作流。
- 不拆成多个 ZIP，不把 asset-groups JSON 放入 ZIP，也不修改游戏 runtime/loading。
- 不实现合图、texture atlas、按组物理拆包、CDN 上传、发布或远程服务。
- 不压缩 MP4、Spine/VNI/manifest JSON、atlas 或音频；不修改图片尺寸。
- 不把同一个 Spine skeleton/atlas/texture 按 animation/state 做不可验证的字节级切割。
- 不支持 legacy direct-path layout ZIP、包裹目录、Finder metadata、混合路径合同或
  自动迁移；应要求先由当前 editor 重新导出。
- 不猜测 mode 语义，不按文件名推断 base/free/symbol/bigwin，不自动重命名冲突 key。
- 不新增 npm 图片编码库；`cwebp` 是显式本机前置条件。

## 3. 制定计划时的基线

```text
UTC: 2026-07-28T05:10:30Z
HEAD: 621a696bdf2717c61934c644078f02cf2d3187ce
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：根 `AGENTS.md`、`tasks/templates/task-plan.md`、
`docs/agent-rules/scene-layout.md`、`docs/agent-rules/editor-artifacts.md`。

当前实现结论：

- `apps/gamelayoutpkgcli` 尚不存在；`pnpm-workspace.yaml` 已覆盖 `apps/*`，无需新增
  workspace glob。
- `apps/gamelayouteditor/src/io/exported-layout-zip.ts::exportLayoutZip()` 已把 layout、
  Symbols、Popup、ImgNumber、VNI 的精确闭包扁平化为 filename key，并输出
  `layout.manifest.json`、`assets.map.json`、SHA-256 payload。
- `packages/editorresource/src/assets-map.ts` 已拥有 assets-map v1 parser、完整
  SHA-256/byteLength/orphan 校验和序列化；CLI 输入边界必须调用严格 validator。
- `packages/rendercore/src/scene-layout/production-zip.ts` 已有 bounded/canonical ZIP
  检查；`package-resource.ts::collectSceneLayoutPackagePaths()` 能验证 layout 及嵌套
  package 的 exact closure。
- `SceneLayoutGameModes` 已定义 `initialMode`、modes 和有向 transitions；mode 显式
  绑定 background nodes、Symbols package 和 award popup。非 mode background 的
  普通节点属于共享 scene；复用资源必须按 logical asset key 集合去重。
- `collectSymbolPackageEntryPaths()`、`collectPopupPackagePaths()`、
  `collectImageStringAssetPaths()` 和 VNI `assets[].path` 已能导出各 owner 的传递闭包。
- `rewriteVNIProjectAssetPaths()` 只改 schema-declared `asset.path` 并保留 VNI id、
  尺寸和 `originalName`；`browserartifactio` 已提供 bounded unzip/deterministic zip。
- `assets/crave/layout.manifest.json` 是当前真实样例：initialMode 是 `BaseGame`，
  `BaseGame -> FreeGame` 和反向 transition 复用同一 Spine closure，验证了分组不能
  假设每条边拥有独占文件。

## 4. 需求解释与技术决策

### 需求解释

- “initial 是基础”解释为：`initialAssets` 是进入 initial mode 所需的共享 scene、
  initial 背景、initial 绑定 Symbols，以及所有 `from === initialMode` 的转场资源。
  award-celebration Popup 保持独立事件组，不因绑定 initial mode 被强塞入首屏基础组。
- 每个非 initial group 的 `incrementalAssets` 都只减去 `initialAssets`，不在
  FreeGame、Bonus 等兄弟组之间建立隐含先后关系。
- 每个 group 另保留未减法的 `requiredAssets`。这样 FreeGame 的实际增量不会重复
  BaseGame 已加载文件，后续合图仍能知道共享资源也属于 FreeGame 的完整语义闭包。
- transition 是独立 group，并带 `ownerMode/from/to`；加载归属遵循源状态：
  BaseGame -> FreeGame 属于 BaseGame，FreeGame -> BaseGame 属于 FreeGame。
- Symbols 与 award popup 分别以 package binding id 建组，并记录 `usedByModes`；
  mode 名、package id 和 Popup id 原样保留，不从资源文件名派生标签。

### CLI 合同

```bash
gamelayoutpkg --input game-layout.zip [--output out.zip] [--assets-json groups.json] [--quality 80] [--cwebp /path/to/cwebp]
```

- `--input` 必填；其他路径默认与输入同目录。所有 flag 禁止重复，未知 flag、缺值、
  input/output/json 路径相同、目标已存在均失败。
- `--quality` 默认 `80`，接受 `0..100` 的有限数；`--cwebp` 默认从 `PATH` 查找
  `cwebp`。第一版不增加 lossless、resize、metadata 或隐藏 encoder fallback。
- 启动时以无 shell 的 `execFile`/`spawn` 参数数组执行 `cwebp -version`；每个唯一
  source digest 只编码一次，调用使用固定参数 `-quiet -q <quality> -o <out> <in>`。
- PNG/JPG/JPEG 转换为 WebP；已有 `.webp` 不二次有损编码。输出必须有合法
  RIFF/WEBP signature，cwebp 非零退出、无输出或非法输出均失败。
- 转换后的 logical key 把最后扩展名改成 `.webp`。若多个不同 source key 映射到同一
  target key，显式失败；不得添加 `-2/-3`、覆盖或静默合并 identity。相同 bytes 的
  不同 logical key 可继续共享同一 content-addressed payload。

### ZIP 重写决策

- 先完整验证 input ZIP、assets map hash/size/orphan 和所有 typed package closure，
  再进行任何输出写入。
- 建立唯一 `old filename key -> new filename key/bytes` 映射，按 schema 结构化改写：
  - layout image path、Spine texture map value、transition video/Spine refs；
  - image-string glyph path；
  - Symbols package entrypoints/resources、symbol normal/state/animation/value refs；
  - Popup resource refs；
  - VNI `assets[].path`。
- JSON 只改 owner schema 声明的路径字段，Spine skeleton JSON、game config 和未知
  普通 JSON 不做字符串替换。Spine atlas page 是逻辑名，保持原文；layout/Popup 的
  texture map 和 Symbols 的 typed texture ref 指向新的 WebP key。
- 每个改写后的 JSON 重新走 owner parser；随后重新计算每个 logical key 的 SHA-256、
  mediaType、byteLength 和 `assets/<digest>.<canonical-ext>`，重建 assets map。
- 输出 ZIP 按路径排序、固定 ZIP 参数生成；同一输入、同一 cwebp 版本和参数产生相同
  bytes。输出中不保留旧 PNG/JPEG payload、orphan 或 asset-groups JSON。

### asset-groups JSON v1

顶层固定包含 `version, kind, layoutId, initialMode, optimization,
controlFiles, assets, initialAssets, groups`。

- `kind` 固定为 `scene-layout-asset-groups`；未知字段、未知 group kind、重复 group id、
  不存在的 asset key、未排序/重复数组、非法 mode/package 引用均失败。
- `optimization` 记录 codec、quality、cwebp version、输入/输出总 bytes 和转换数量，
  不写绝对路径或时间戳。
- `controlFiles` 固定记录 `layout.manifest.json`、`assets.map.json`，二者不伪装成
  content asset。
- `assets` 以优化后的 logical key 建索引，记录 physical path、mediaType、sha256、
  byteLength、sourceKey、sourceByteLength 和是否转换；不复制 payload。
- `groups` 使用稳定 id，并包含 `requiredAssets`、`incrementalAssets`：
  - `shared`：从未作为任一 mode background 的公共 node 闭包；
  - `mode:<modeId>`：公共 node + 该 mode 所有 variant background node 闭包；
  - `transition:<from>-><to>`：该有向边 overlay 的完整闭包和 `ownerMode=from`；
  - `symbols:<packageId>`：package manifest、game config、symbol manifest、图片、
    Spine、VNI、ImgNumber 的精确闭包及 `usedByModes`；
  - `award-celebration:<popupId>`：popup manifest 及其图片、Spine、VNI、ImgNumber
    精确闭包及 `usedByModes`。
- `initialAssets` 为 shared、initial mode、initial mode Symbols 和 initial mode
  outgoing transition 的并集；Popup 不进入该并集。所有数组按英文 code-point
  稳定排序。
- `incrementalAssets = requiredAssets - initialAssets`。group 的 full memberships
  允许重叠；所有 optimized asset 必须至少被一个 group 覆盖，否则输出失败。

## 5. 职责与合同

- **CLI orchestration**：`gamelayoutpkgcli` 拥有文件系统、cwebp process、临时目录、
  参数、原子写盘和用户输出；不把这些 Node 能力加入 browser editor/shared runtime。
- **Schema ownership**：CLI 调用 rendercore/editorresource/vnicore 的 public strict
  parser 与 collector；tool-specific rewrite 使用 exhaustive typed visitor，禁止
  通用递归替换所有同名字符串或维护第二份业务资源表。
- **输入生命周期**：读取和验证完成后在内存中构造 immutable transform plan；
  cwebp 只读私有临时输入并写私有临时输出。
- **提交边界**：ZIP/JSON 都在目标目录写临时文件，二者生成并复验后才 rename；第二次
  rename 失败时回滚本次已提交文件，保证最终是“两者都有或两者都没有”。
- **失败策略**：非法 ZIP/path/hash/size/orphan/version/schema/ref、缺资源、key
  collision、缺 cwebp、encoder 失败、WebP signature 错、输出存在或复验失败均显式
  失败，并包含 logical key/owner/transition 等可定位上下文。
- **禁止行为**：不硬编码游戏名/模式名，不猜路径/类型，不用 shell command string，
  不 fallback 到原图，不静默跳过图片，不修改输入，不在 ZIP 内保存分组 JSON。

## 6. 文件范围

### 预计新增

```text
apps/gamelayoutpkgcli/README.md
apps/gamelayoutpkgcli/package.json
apps/gamelayoutpkgcli/{.prettierignore,eslint.config.cjs,tsconfig.json,tsconfig.eslint.json,vitest.config.ts}
apps/gamelayoutpkgcli/src/index.ts
apps/gamelayoutpkgcli/src/cli.ts
apps/gamelayoutpkgcli/src/types.ts
apps/gamelayoutpkgcli/src/{package-reader,image-optimizer,reference-rewriter,asset-groups,package-writer}.ts
apps/gamelayoutpkgcli/tests/{cli,image-optimizer,reference-rewriter,asset-groups,package-flow}.test.ts
```

### 预计修改

`pnpm-lock.yaml`、`AGENTS.md`、`docs/agent-rules/scene-layout.md`、
`docs/agent-rules/editor-artifacts.md`。

只有现有 package 缺少完成 strict transform 所必需的 public parser/collector 时，才最小
扩展对应 `packages/rendercore` 或 `packages/vnicore/core` export 和直接测试；不能复制
内部 validator，也不能为了方便把 CLI process/filesystem 职责下沉到 shared runtime。

### 原则上不应修改

```text
apps/gamelayouteditor/**
apps/game002/**, apps/game003/**
packages/logiccore/**, packages/gameframeworks/**
assets/**
```

## 7. 实施步骤

1. **确认执行基线**
   - 重读计划/规则、核对 HEAD/status、public API，并用当前 fixture 复核 filename-key
     closure；schema 重大变化时停止说明。

2. **搭建 CLI 与输入 transaction**
   - 新建 package/bin/参数 parser；实现 bounded ZIP、control file、assets-map hash 和
     full closure 校验，以及 temp owner、目标预检和双文件原子 commit/rollback。

3. **实现 cwebp 优化 plan**
   - 按 mediaType/扩展筛选，缓存同 digest 转换；用可注入、无 shell runner 调 cwebp。
   - 建立 old/new key map、拒绝 collision，并验证 WebP signature/非空结果。

4. **结构化改写并重建 ZIP**
   - exhaustive rewrite typed refs，保持 atlas page/id/animation/state/尺寸；重建 map、
     deduplicated payload 和 ZIP，再以所有 owner parser/full closure 复验后 commit。

5. **生成资源分组 JSON**
   - 从优化后的 typed graph 构造各组 full closure，计算 initial/incremental，校验
     source-owner、全集覆盖与排序；用 v1 parser round-trip 并确认 JSON 不在 ZIP。

6. **测试、文档与规则**
   - 单测参数、cwebp failure/cleanup、rewrite、collision、group graph 和 deterministic
     flow；fixture 使用任意 mode id，证明无 BG/FG 硬编码。
   - README 记录 cwebp 前置、命令、输出、质量/有损语义、失败与 JSON 字段。
   - 根规则增加新 app 路由；领域规则只增加 CLI 消费正式 ZIP、source transition
     ownership、JSON ZIP 外置和 schema-aware rewrite 的稳定约束。
   - 完成 L3 验收并生成任务 130 UTC 中文执行报告。

## 8. 测试与验收

### 测试重点

- ZIP/path traversal、wrapper/Finder metadata、legacy/mixed path、坏 JSON、未知字段、
  assets map hash/size/path/orphan、缺 nested asset 和非法版本全部失败。
- cwebp 缺失、version 失败、非零退出、空/非 WebP 输出、target collision、目标已存在
  和第二文件 commit 失败均不留半成品；参数含空格时仍按 argv 原样传递。
- PNG/JPEG refs 在 layout、Spine texture map、image-string、Symbols、Popup、VNI
  全部变成 WebP；atlas page 和 VNI `originalName` 保持不变，existing WebP 不重编码。
- 两个 logical key 共享 source digest 时只执行一次 cwebp，但 assets map 仍保留两个
  logical identity；同名 `.png/.jpg -> .webp` collision 失败。
- `initialMode` 不是 BaseGame 仍正确；initial outgoing edge 属 initial，reverse edge
  属 source non-initial；共享 Spine closure 的 FG delta 为空而 requiredAssets 仍完整。
- Symbols/Popup 多 mode 复用、VNI/ImgNumber transitive assets、普通共享 node、多个
  variant background 都有正确 membership；所有 asset 恰好进入全集覆盖。
- 同 fixture、同 fake/real encoder bytes 运行两次 ZIP/JSON byte-equal，ZIP 内没有
  `*.assets-groups.json` 和旧 orphan payload。

### 验收级别

`L3`。原因是新增 workspace app 会更新 `pnpm-lock.yaml` importer，并交付正式 ZIP 和
versioned JSON；按根规则锁文件变化触发整仓验收。若执行时确认 lockfile 无变化，也仍
至少按 L2 验证 app、现有 package consumer 和正式产物，不得降到只跑单测。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

失败时先以 `pnpm --filter gamelayoutpkgcli <script>` 最小化复现；不得为通过测试放宽
strict production contract。

### 真实 CLI 人工验收

- 确认 `cwebp -version` 可用；把当前合法 gamelayout package 复制到临时目录执行
  CLI，避免写入 `assets/` 或覆盖美术源包。
- 解压 optimized ZIP，抽查 PNG/JPEG 已成为 WebP、manifest/VNI typed ref 已更新、
  atlas page 未变化、map hash/size/path 一致、JSON 不在 ZIP。
- 对照 manifest 检查 initial、FreeGame、Symbols、bigwin Popup、正反 transition 的
  required/incremental 列表，并记录输入/输出体积。

### 独立验收建议

`必须`。风险包括正式 ZIP/JSON、外部 executable、hash/path rewrite 和双文件 transaction。
独立复验 `pnpm --filter gamelayoutpkgcli test`、
`pnpm --filter gamelayoutpkgcli typecheck`、`pnpm --filter gamelayoutpkgcli build`，
并用一份真实美术 ZIP 人工核对 WebP 视觉质量与分组语义。

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24；缺少时执行
  `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 使用 pnpm；依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`。
- 新 app 只声明必要 workspace dependencies 和根已有测试/检查工具；不得新增 sharp、
  imagemagick 或第二套 ZIP/hash 库。执行 `pnpm install` 只为同步新 importer，并审查
  `pnpm-lock.yaml` 没有意外外部依赖升级。
- `cwebp` 不由 pnpm 安装。README 必须写明支持通过 `--cwebp` 指定路径；只有实际
  命令缺失/失败后报错，不猜 Homebrew 或系统安装目录。
- 只有依赖下载实际失败后才设置代理并重试原命令。

## 10. 生成物、文档与规则

- optimized ZIP 和 asset-groups JSON 是 CLI 运行产物，不提交 fixture 的真实美术输出。
- JSON/manifest/assets map 使用稳定两空格缩进、末尾换行和稳定排序；不含时间戳、
  absolute path、temp path 或随机 id。
- README 是 CLI 使用与 JSON v1 字段说明；精确业务资源清单留在生成 JSON，不写入规则。
- `AGENTS.md` 只增加新 app 的领域规则路由；`scene-layout.md` /
  `editor-artifacts.md` 只记录跨任务长期合同，不复制本计划步骤。
- 本任务不修改 YAML，也没有手改生成 TypeScript。

## 11. 执行报告

规划时不生成报告。执行后以 `date -u +%y%m%d-%H%M%S` 创建
`tasks/130-gamelayoutpkgcli-asset-optimization-<utctime>.md`。

报告简要记录最终文件、cwebp 版本/参数、关键决策和偏差、实际验收命令、真实 fixture
体积结果、未完成人工视觉验收及剩余风险。

## 12. 风险、假设与待确认

### 风险

- 默认 quality 80 是有损转换；透明边缘、细字和粒子贴图必须以真实美术包视觉抽查，
  体积更小不等于质量可接受。
- 不同 cwebp 版本可能产生不同 bytes/hash；JSON 记录版本，确定性只承诺同版本同参数。
- 大包当前采用内存中 bounded ZIP + 顺序转换，峰值内存仍受现有 500 MiB 解压上限影响；
  第一版不引入 streaming archive 重构。
- 当前 runtime 会准备完整 package；本任务 JSON 只记录未来可用分组，不会自动降低现有
  首次运行加载量。
- 同一 Spine/VNI 资源被多 mode 复用时只能按文件闭包共享，不能安全切到单 animation。

### 假设

- 输入由当前 gamelayouteditor production export 产生，所有 logical filename key
  已是扁平、大小写敏感并可由现有 owner parser 完整验证。
- 本机 `cwebp` 支持 PNG/JPEG 输入和 WebP 输出，且用户接受默认 quality 80；可用
  `--quality` 显式调整。
- award-celebration 是事件资源，保持独立组而不默认阻塞 initial；后续 loading 任务可
  根据该 JSON 决定实际 gate。

### 待确认

无。默认质量、命名、分组和失败边界已在本计划中明确；如执行前用户改变这些产品合同，
应先更新需求而不是在实现中加入隐藏兼容分支。

## 13. 完成清单

- [x] CLI 参数、cwebp、输入/输出 transaction 与不覆盖策略符合计划。
- [x] 所有 typed refs、hash、mediaType、byteLength、physical paths 已重建并复验。
- [x] initial/source-transition/delta 和 Symbols/Popup/VNI/ImgNumber 分组正确。
- [x] ZIP 不含分组 JSON、旧图片或 orphan；输入和失败路径不被修改。
- [x] public API、schema、职责和资源生命周期符合计划。
- [x] tests、README、lockfile 和最小规则已同步。
- [x] L3 自动验收和真实 cwebp 人工验收已记录。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`scene-layout.md`、`editor-artifacts.md`；
2. 核对 Git 基线、工作区、当前 manifest/public collector API 和 cwebp 版本；
3. 按计划实现，不另建资源表、不修改 editor/runtime、不重新制定另一套方案；
4. 小幅适配当前实现时写入报告，明显扩大 public API/文件范围时先停止说明；
5. 只在临时目录运行真实包优化，不覆盖 `assets/` 和用户源 ZIP；
6. 完成规定验收、人工抽查和 UTC 报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。

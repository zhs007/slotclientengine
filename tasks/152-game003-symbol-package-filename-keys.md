# 152 game003-symbol-package-filename-keys 任务计划

## 1. 目标与完成定义

### 目标

确认 `/Users/zerro/Downloads/game003-s1-symbols (1).zip` 在最新
Symbols Editor 中显示 hash 文件名的根因，并从仓库中 game003 skin 1 的
权威 game config、symbol manifest 和精确资源闭包重新生成一份可由当前
Symbols Editor 正确打开、编辑、预览和往返导出的正式 ZIP。

### 完成定义

- [ ] 诊断结论保持可复验：问题来自输入包已丢失 logical filename
      identity，不是当前 Symbols Editor 将正常文件名改成 hash。
- [ ] 生成 `tasks/artifacts/152/game003-s1-symbols.zip`；manifest 和
      `assets.map.json` 使用大小写精确的 logical filename key，只有 payload path
      使用 `assets/<sha256>.<ext>`。
- [ ] 新包保留 62 个 logical resource identity；允许相同 bytes 共享 57 个
      physical payload，但不合并 L1–L5 normal image 与 5 个 VNI asset key。
- [ ] package id 为 `game003-s1`，`cellSize` 与 game003 权威静态配置一致为
      `165 x 130`，14 个 display symbol 和现有 image/Spine/VNI/state/priority 结构不变。
- [ ] 生成器可确定性重跑并支持 `--check`；导出、重新导入、再导出的
      logical key、manifest 语义、payload bytes 和精确闭包一致。
- [ ] 真实浏览器中打开新包后，资源库和 picker 显示 `WL.png`、
      `Symbol.atlas`、`L1-wins.json` 等原 logical filename，且图片、Spine 和 VNI
      预览可用。

## 2. 范围

### 包含

- 对用户 ZIP、其前置 hash-flat ZIP 和仓库 production source 的精确对比。
- 在 `apps/symbolseditor` 增加 task 152 确定性生成/检查入口。
- 通过 rendercore 的 symbol package owner 收集 manifest direct/indirect closure，通过
  Symbols Editor 正式 import/export 路径生成 mapped ZIP。
- 增加“相同 bytes 不合并 logical key”的 Symbols ZIP 回归测试。
- 交付 task 152 ZIP、生成器校验证据和简洁执行报告。

### 不包含

- 不修改 game003 runtime、轮带、动画、资源 bytes、manifest 业务绑定或
  `gameconfig.json`。
- 不从 SHA-256、symbol code、文件内容或仓库同 bytes 文件猜测通用文件名。
- 不在 Symbols Editor 全局禁止“合法但恰好长得像 hash”的用户文件名，
  不增加静默 alias/fallback。
- 不把 `/Users/zerro/Downloads` 中任何原 ZIP 原地覆盖、移动或删除。
- 不修改 shared package public API、schema、root toolchain 或 lockfile；若执行时发现
  现有 public API 不足，先说明缺口并重新界定范围。

## 3. 制定计划时的基线

```text
UTC: 2026-08-03T05:22:07Z
HEAD: 34512b00220aa99b8133748ff841d73f107d3034
branch: detached HEAD（main 指向同一 HEAD）
git status --short --untracked-files=all: 无输出，工作区干净
```

已读取规则：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
tasks/templates/task-plan.md
```

已确认基线：

- 用户输入 `/Users/zerro/Downloads/game003-s1-symbols (1).zip`：
  - 4,495,375 bytes，SHA-256
    `92d8b592751d579fc96d78620c47b32261193f57e3650d9c3884d2e76a1586db`；
  - 顶层有 `assets.map.json`，其 57 个 `files` key 全是
    `<64-char-sha256>.<ext>`；
  - `symbols.package.json.resources` 也是同样的 57 个 hash key，
    `symbol-state-textures.manifest.json` 直接引用 `./<hash>.<ext>`；
  - `cellSize` 为 `172 x 130`，与 production 转轮单格配置不一致。
- 前置 `/Users/zerro/Downloads/game003-s1-symbols.zip`：
  - SHA-256
    `b89adc1ead2d75facb09bd041a74005c92934c8be455c26b0586bbfa213cf714`；
  - 无 `assets.map.json`，manifest/resources 直接引用
    `assets/<sha256>.<ext>`，属于丢失 filename identity 的 legacy hash-flat 包；
  - `cellSize` 为正确的 `165 x 130`。
- 从以上结构可定向推断：`(1).zip` 经当前 exporter 把前置包的 physical
  basename 当作仅剩的 logical key 后导出；编辑器没有可用的原文件名可恢复。
- 权威 production source：
  - `assets/game003-s1/symbol-state-textures.manifest.json` 保留 `WL.png`、
    `Symbol.atlas`、`L1-wins.json` 等 exact logical refs；
  - `assets/game003-s1/**` 保留 Spine/VNI 直接和间接资源的原 filename；
  - `assets/gamecfg003/gameconfig.json` 是 package game config 输入；
  - `apps/game003/config/game-static.yaml` 的
    `skins."1".art.reelAreaInMainReelBackground` 声明 `cellWidth=165`、
    `cellHeight=130`。
- 正确 closure 有 62 个 logical key：42 张 normal/spinBlur/disabled 图、8 份
  Spine skeleton、1 份 atlas、1 张 Spine texture、5 份 VNI project 和 5 个 VNI
  image key。后 5 张图与 L1–L5 normal bytes 相同，可共享 physical payload，但
  logical identity 不得合并。
- `/Users/zerro/Downloads/101-game003-s1-symbolseditor.zip` 保留 62 个 legacy logical
  resource 和 `165 x 130` cell，可用于诊断对照；正式生成不依赖 Downloads
  文件，而依赖仓库权威 source。
- `apps/symbolseditor/src/io/symbol-package-zip.ts#importSymbolPackageZip` 会严格解析
  package/map 并将已有 logical key 建立为 editor asset record；它不应对 hash key
  做 basename/content guess。
- `packages/rendercore/src/symbol/materialize-package.ts#materializeMappedSymbolPackageContents`
  可从拥有原 logical path 的 source 生成 filename-key map 和 content-addressed payload；
  如果输入本身只剩 hash basename，该 API 也无法逆向恢复业务文件名。
- `apps/symbolseditor/tests/zip-io.test.ts` 已覆盖 logical basename 往返和 mapped
  payload，但没有直接覆盖“两个 logical key 的 bytes 相同仍保留两个 key”。

## 4. 需求解释与技术决策

### 需求解释

- “文件名都是 hash”指 editor 资源库、picker 和状态绑定所看到的 logical
  filename key，不是 ZIP 内 `assets/<sha256>.*` physical payload 路径。
- physical payload 使用 hash 是当前正式格式；错误在于 hash 同时进入
  `assets.map.json.files` 的 key 和 inner manifest refs。
- 因为原包丢失了 filename identity，正确处理是从权威 source 重建新包，
  而不是在 importer 中增加不可验证的恢复算法。

### 关键决策

1. **判定为包问题，不改 Symbols Editor production importer。** 现有 importer
   对包中明确声明的 key 忠实导入；为 hash-looking key 做特例会误伤合法
   filename，也违反不猜路径/不静默 alias 的合同。
2. **从 production source 重建，不修补错包。** 用 rendercore owner 从 symbol
   manifest 收集 exact closure，保留 nested VNI asset 的原 basename；不以 digest
   反查仓库文件。
3. **logical identity 与 physical dedupe 分层验证。** 62 个 map key 是业务身份；
   57 个 unique payload path 是内容去重结果。检查器同时保护两者，不将二者混为
   一张表。
4. **cellSize 来自已校验的 game003 静态配置。** task builder 复用
   `apps/buildgamestatic/src/yaml-loader.ts#loadGameStaticYamlConfig` 读取 skin 1 reel area，
   不在新脚本再硬编 `165 x 130`。该复用仅属构建期 task 工具，不给
   symbolseditor browser app 增加 game003/buildgamestatic dependency。
5. **交付可重建 artifact，不只交付一个手工 ZIP。** 生成器两次构建 bytes
   必须相等，`--check` 必须比对仓库 artifact 与当前 source，以防日后
   manifest/资源改动后继续分发旧包。

## 5. 职责与合同

- **Symbols Editor task builder**：组合已校验的 game003 source，调用正式
  symbol package/import/export API，输出确定性 ZIP 和 `--check` 结果。
- **rendercore symbol owner**：解析 symbol manifest/package，收集 image/Spine/VNI exact
  closure，验证 animation、atlas page、VNI refs、display set 和 package 资源完整性。
- **editorresource/browserartifactio**：保持 filename-key map、完整 SHA-256、physical
  payload path、ZIP bounded/deterministic 合同；本任务不改其 API。
- **buildgamestatic YAML loader**：只提供 game003 已有权威配置的严格读取；不拥有
  Symbols ZIP 生成。
- **失败策略**：缺 direct/indirect resource、filename collision/alias、map/hash/size/path/orphan
  错误、cell 配置不一致、display symbol 错配、round-trip 漂移或 artifact 过期均显式
  失败，不输出半包。
- **禁止行为**：不猜 filename，不根据相同 bytes 合并 logical key，不维护手写
  62 项资源清单，不手改 `assets.map.json`/manifest/ZIP，不在错误时降级。

## 6. 文件范围

### 预计新增

```text
apps/symbolseditor/scripts/build-task152-game003-symbols.ts
tasks/artifacts/152/game003-s1-symbols.zip
tasks/152-game003-symbol-package-filename-keys-<utctime>.md
```

### 预计修改

```text
apps/symbolseditor/package.json
apps/symbolseditor/tests/zip-io.test.ts
```

### 原则上不应修改

```text
apps/symbolseditor/src/**
apps/buildgamestatic/src/**
apps/game003/**
assets/game003-s1/**
assets/gamecfg003/**
packages/{browserartifactio,editorresource,rendercore}/**
pnpm-lock.yaml
/Users/zerro/Downloads/**
```

若执行时需要修改 production importer、shared public API/schema、game003 权威资源或
lockfile，说明新证据和直接影响后先重新规划，不用扩大文件列表事后合理化。

## 7. 实施步骤

1. **确认执行基线和输入权威性**
   - 重核 HEAD、工作区、领域规则、YAML 生成物 checker 状态和三个仓库 source
     入口。
   - 只将 Downloads ZIP 作为诊断证据，复核其 SHA-256、map key 数、resources、
     refs 和 cellSize；生成输入不依赖它们。

2. **建立 task 152 确定性 builder**
   - 严格读取 `game-static.yaml`，确认 game id/skin 1/symbol manifest/game config 路径和
     reel-area cell size；未知 skin/kind/缺字段立即失败。
   - 读取 production symbol manifest 和 asset root，使用
     `collectSymbolManifestResourcePaths` 派生 exact closure，不手写文件列表。
   - 构造经 `parseSymbolPackageManifest` 验证的 source package snapshot，再调用
     `materializeMappedSymbolPackageContents`/Symbols Editor 正式 export 路径生成 ZIP。
   - 同一进程连续生成两次并比较 exact bytes；默认写入 task artifact，
     `--check` 只读生成并比对，不修改文件。

3. **增加 artifact 语义检查**
   - 解包后严格验证 map/hash/byteLength/mediaType/path/missing/orphan 和 exact control files。
   - 确认 logical key set 精确等于 production closure 按 filename-key 合同扁平化的集合，
     包含 62 个 key，且 manifest/package 所有 refs 都可达。
   - 分别断言 62 个 logical keys 与 57 个 unique physical payload paths，并确认 5 组
     same-bytes key 各自保留。
   - 确认 package id/cellSize/display set/state definitions、render priority、Spine exact animation/
     atlas page 和 VNI range/indirect closure 与 source 一致。

4. **执行 editor round-trip 与回归保护**
   - 使用 `importSymbolPackageZip(..., { loadTextures: false })` 重新导入 artifact，检查
     asset library 和所有 symbol typed draft；再导出并比对 canonical semantic snapshot。
   - 在 `zip-io.test.ts` 构造两个 logical key 指向相同 bytes 的最小 symbol/VNI
     fixture，确认 map 保留两个 key、只复用 physical path，重导后 typed refs 不合并。
   - 不添加“hash-looking key 自动拒绝/改名”测试；该行为不属于通用合同。

5. **生成交付物并人工验收**
   - 运行 task builder 生成仓库 artifact，立即运行 `--check`，记录 ZIP bytes/
     SHA-256、logical/physical count 和 source HEAD。
   - 在最新 Symbols Editor 真实浏览器中单独打开该 ZIP，核对 filename 显示、
     14 symbols 、normal/spinBlur/disabled 以及 Spine/VNI 预览。
   - 用 UI 再导出一次并使用 checker 复验；不把 headless 创建 resource 当成真实
     WebGL/Pixi/Spine/VNI 视觉验收。

6. **收尾**
   - 对预计文件运行定向格式、类型、测试、artifact checker 和 diff 检查。
   - 不更新根/Editor 领域规则：现有 filename-key 职责已明确，本任务是纠正一次
     错误交付包。
   - 生成 UTC 执行报告，记录新 ZIP 的精确路径/hash、自动化结果和人工验收状态。

## 8. 测试与验收

### 测试原则

- 正常路径覆盖 source -> exact closure -> mapped ZIP -> editor import -> re-export。
- 边界覆盖 same bytes/different logical keys、nested VNI asset flattening、Spine shared
  atlas/texture、稀疏 appear state 和 render priority。
- strict failure 覆盖 missing/orphan/corrupt payload、logical alias/collision、cell source 缺失、
  artifact 过期和 round-trip 漂移。
- 不为诊断中的错误输入包增加 filename 恢复 fallback。

### 验收级别

`L2`。代码改动只在 symbolseditor task builder/测试范围，不改 shared public API；
但产出会作为 editor/layout/runtime consumer 输入的正式 Symbols ZIP，因此需要比 L1
多一层 artifact exact-closure、确定性和独立复验。不运行根级全仓门禁。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor build:task152
pnpm --filter symbolseditor build:task152 -- --check
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/zip-io.test.ts
pnpm exec prettier --check apps/symbolseditor/scripts/build-task152-game003-symbols.ts apps/symbolseditor/tests/zip-io.test.ts apps/symbolseditor/package.json tasks/152-game003-symbol-package-filename-keys.md
git diff --check
```

若 builder 首次显示权威 source 已变更，先确认是合法 production 更新还是旧 artifact
漂移，不通过改期望数量或忽略 checker 让命令通过。

### 人工验收

- 启动 `pnpm --filter symbolseditor dev`，单独打开
  `tasks/artifacts/152/game003-s1-symbols.zip`。
- 确认项目为 `game003-s1`、cell `165 x 130`、14 个 display symbol，资源库/
  picker 展示 logical filename 而非 64 位 hash key。
- 切换 normal/spinBlur/disabled/appear/win，复核 image、official Spine 和 L1–L5 VNI
  真实预览；H2–H5 缺 appear 仍是合法稀疏状态，不应被补齐。
- 从 UI 导出新 ZIP，用 task checker 确认 62 logical keys/57 physical payloads 和
  manifest 语义不变。

### 独立验收建议

**建议**。本任务不涉及 credential、服务器数据或 shared public contract，但涉及正式
ZIP、logical/physical identity 分层和 Spine/VNI exact closure。独立复验聚焦：

```bash
pnpm --filter symbolseditor build:task152 -- --check
pnpm --filter symbolseditor exec vitest run tests/zip-io.test.ts
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm，不切换 npm/yarn。
- shell 没有 Node 24 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 复用已有 browserartifactio/editorresource/rendercore/symbolseditor/buildgamestatic 工具链，
  不新增依赖，不修改 `pnpm-lock.yaml`。
- 任务只读 Downloads 诊断样本和仓库 production source；唯一新写入的二进制交付物位于
  `tasks/artifacts/152/`。

## 10. 生成物、文档与规则

- `tasks/artifacts/152/game003-s1-symbols.zip` 只由 task 152 builder 生成，禁止手改
  ZIP entry、`assets.map.json`、`symbols.package.json` 或 symbol manifest。
- builder `--check` 是该 artifact 的 parity checker；它必须在交付前通过。
- 本任务不修改 YAML 或 generated TypeScript；如执行基线已存在 game003
  source/generated 漂移，先按生成物规则处理，不把漂移写入 Symbols ZIP。
- 不更新 `AGENTS.md` 或 `docs/agent-rules/editor-artifacts.md`；现有规则已精确覆盖
  本任务的 filename-key 不变量。
- 只在 builder 的使用方式成为长期对外 workflow 时更新 Symbols Editor README；
  一次性 task 命令和精确 hash 留在 task plan/report，不进 README/根规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/152-game003-symbol-package-filename-keys-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 根因结论与错包/新包的 bytes、SHA-256、logical/physical 数量；
2. 实际修改文件、builder 输入和交付 ZIP 路径；
3. 实际验收命令与结果；
4. 真实浏览器 image/Spine/VNI 验收是已完成还是待用户完成；
5. 计划偏差、剩余风险和未完成项。

## 12. 风险、假设与待确认

### 风险

- 错包已不可逆地丢失 logical identity；用 digest 反查当前仓库只能得到偶然
  匹配，无法作为通用修复，因此必须从权威 source 重建。
- VNI asset 与 L1–L5 normal 目前 bytes 相同；只检查 unique hash 数会再次漏掉
  logical identity 合并，必须同时检查 map keys 与 payload paths。
- production manifest/YAML/assets 可能在执行前变更；计划中的 `62/57` 是当前
  HEAD 基线，执行时如 source 合法变更需先重新计划，不锁死旧清单。
- headless `loadTextures=false` 能证明 parser/closure，不能证明真实 WebGL、official Spine
  和 VNI 视觉播放；浏览器验收不能省略或用单测代替。

### 假设

- 用户需要的“正确包”是当前 HEAD 中 game003 skin 1 production symbol source
  的可编辑 mapped ZIP，不是保留 `(1).zip` 中手工改成 `172` 的 cell 宽度。
- `apps/game003/config/game-static.yaml`、`assets/game003-s1/symbol-state-textures.manifest.json`
  和 `assets/gamecfg003/gameconfig.json` 在执行时仍是当前 production 权威输入。

### 待确认

- 无阻塞实施的待确认项。若用户实际希望保留 `(1).zip` 中未记录在仓库
  source 的手工编辑，则需另行提供编辑前保留 logical filename 的项目包；仅凭
  hash-flat `(1).zip` 无法可靠恢复这些未记录语义。

# 272 gamelayoutpkgcli-flat-hashed-cdn-delivery 任务计划

> 2026-08-31T08:49:59Z 后续需求调整：用户确认 delivery manifest 已随游戏项目 import/发布，因此不再需要
> content-addressed manifest filename。本计划中关于 `delivery.<sha256>.json`、manifest 与 payload 同 CDN prefix、
> `manifestFilename` 参数和保留多个 hashed manifest 的原始条目由以下最终合同取代：固定项目文件
> `delivery.manifest.json`、append-only hashed payload pool，以及 runtime 独立的 `manifestUrl`/`manifestBytes` 与
> payload `urlPrefix`。其余 v2 flat payload、owner、lazy loading 和 strict failure 计划保持有效。

## 1. 目标与完成定义

### 目标

把 `gamelayoutpkgcli --delivery-dir` 的 Scene Layout CDN delivery 改为单层、不可变、内容寻址的文件池：
metadata ZIP、atlas、音视频和 delivery manifest 全部以含完整 SHA-256 的文件名直接放在同一目录，不再生成
`chunks/`、`assets/` 或固定名 `delivery.manifest.json`。RenderCore runtime 通过调用方显式提供的 CDN URL 前缀与
hashed manifest 文件名加载交付物，使 JS 部署 URL 与资产 CDN URL 解耦，同一 delivery 可部署到不同 CDN 前缀。

### 完成定义

- [x] 新生成的 delivery manifest 使用 version 2；其全部 CDN physical path 都是单段扁平文件名，文件名中的完整
      lowercase SHA-256 与 builder 生成的对应 bytes 一致。
- [x] manifest 自身输出为 `delivery.<sha256>.json`，与 ZIP、WebP、音视频位于同一目录；CLI 成功输出明确打印并返回
      exact manifest filename，不生成 unhashed `latest.json`、redirect 或第二份入口表。
- [x] 相同输入与参数生成 byte-equal 文件集合和相同 manifest filename；已有同名同 bytes 文件被复用且不重写，缺失
      文件才新增，同名不同 bytes 显式失败。
- [x] 已存在的旧 hashed 文件和 manifest 不被删除，当前 manifest 在其依赖文件全部就绪后最后发布；失败不得让一个
      可见的新 manifest 指向缺失文件。
- [x] `--check` 对当前输入推导出的 manifest 与全部依赖做只读存在性/byte parity 校验，允许同一扁平池保留其它合法
      hashed 版本，但拒绝目录、symlink、非法文件名和当前版本内容漂移。
- [x] `loadSceneLayoutDeliveryFromUrl()` 改为显式接收 `urlPrefix` 与 `manifestFilename`，manifest、chunk、atlas 和 external
      media 都只相对该 prefix 解析；prefix 不写入 versioned manifest。
- [x] RenderCore 继续 strict 读取旧 version 1 delivery；新 CLI 只生成 v2。未知版本、v2 nested path、prefix/filename
      非法、跨 origin/path escape 和缺实际引用仍显式失败。
- [x] 现有 owner 分配、metadata ZIP 内部 logical path、atlas packing/rotation、媒体原 bytes、lazy mode readiness、资源
      prepare/destroy 行为保持不变。
- [x] README、Scene Layout 长期规则、schema/builder/loader tests 与 UTC 中文执行报告同步完成。

## 2. 范围

### 包含

- `apps/gamelayoutpkgcli` delivery builder、目录发布/check transaction、CLI 结果和定向测试。
- `packages/rendercore/scene-layout` delivery v1/v2 data contract、public loader options、URL 解析和定向测试。
- 扁平物理文件命名、manifest 自身 content address、跨版本复用与发布顺序。
- CLI/RenderCore README 和 `docs/agent-rules/scene-layout.md` 中稳定 production delivery 合同。

### 不包含

- 不改变不带 `--delivery-dir` 的 legacy optimized ZIP / asset-groups 模式。
- 不取消 MaxRects atlas、metadata owner ZIP、mode lazy loading 或现有 owner/dependency 算法；缓存复用粒度仍是物理
  atlas、ZIP 或 external file，而不是 atlas/ZIP 内的单个 logical asset。
- 不上传真实 CDN、不配置域名、CORS、认证、cache header、对象存储 GC 或 CDN purge；部署侧应对 hashed 文件设置长期
  immutable cache，但不在本仓库伪造外部验收。
- 不增加 unhashed 当前版本指针、service worker、运行时 hash/byteLength 下载校验、fallback URL 或路径猜测。
- 不修改 Scene Layout authoring manifest、Editor production ZIP、Popup/Symbol/VNI schema、渲染状态机、游戏业务或美术。
- 不为仓库外 consumer 保留旧 TypeScript loader 参数 alias；其迁移只记录新的明确 public contract。

## 3. 制定计划时的基线

```text
UTC: 2026-08-31T03:42:47Z
HEAD: e93d66e6bf4c9cba6eb8378350a4082e958f3190
branch: (detached HEAD; commit also pointed to by main/origin/main/gitee/main)
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{scene-layout,editor-artifacts}.md`；目标目录
  没有更深层 `AGENTS.md`。
- `apps/gamelayoutpkgcli/src/delivery-builder.ts::buildSceneLayoutDelivery()` 当前把 metadata ZIP 写为
  `chunks/<owner>.<sha256>.zip`，atlas/external 写为 `assets/<sha256>.<ext>`，并以固定名
  `delivery.manifest.json` 加入输出 map。
- 同文件的 `commitSceneLayoutDeliveryDirectory()` 当前拒绝已存在目录并整目录 rename；
  `checkSceneLayoutDeliveryDirectory()` 要求目录文件集合 exact equal，无法把目录作为保留旧版本的共享不可变文件池。
- `packages/rendercore/src/scene-layout/data/delivery.ts` 只有 `SceneLayoutDeliveryManifestV1`；physical path 仅要求安全
  lowercase package path，允许 `chunks/`、`assets/` 等嵌套路径，也没有 hashed manifest filename 合同。
- `packages/rendercore/src/scene-layout/delivery-loader.ts::loadSceneLayoutDeliveryFromUrl()` 当前只接收完整 `manifestUrl`，
  `containedDeliveryUrl()` 隐式以该 URL 所在目录解析其它文件；loader 不从 JS URL 建表，也不下载前比较声明 hash/size。
- 当前仓库没有 `loadSceneLayoutDeliveryFromUrl()` 的 app source consumer；直接受影响的 public code、测试和文档位于
  RenderCore 与 gamelayoutpkgcli。历史 game 规则中的旧固定路径不是本任务 runtime consumer。
- builder 已使用 deterministic ZIP、stable JSON、完整 SHA-256 和 content-address allocator；可复用现有 primitives，不需
  新依赖或 lockfile 变化。

## 4. 需求解释与技术决策

### 需求解释

1. “不希望有目录”解释为 CDN delivery 的 physical files 全部是同一 output root 下的普通文件；metadata ZIP 内部仍保留
   mapped package 的 logical 目录，manifest 中 logical asset key 也不因 CDN 扁平化而改写。
2. “assets 没更新就不需要提交/下载”通过 immutable content-address filename 实现：物理 bytes 不变则 filename 不变，
   CLI 不重写已有文件，浏览器/CDN可复用同 URL 缓存。atlas 或 metadata ZIP 任一成员变化会改变整个物理文件 hash，
   本任务不承诺其中未变 logical member 单独复用。
3. “manifest 也 hash”解释为对 stable encoded manifest bytes 求完整 SHA-256，再输出
   `delivery.<sha256>.json`；manifest 不自带自引用 hash，避免循环合同，由 CLI build/check 证明文件名与 bytes parity。
4. “runtime 传 URL 前缀”解释为调用方提供资产根目录 URL 与 exact hashed manifest filename；所有 delivery physical path
   都相对该资产根解析，不能从 `import.meta.url`、当前页面或 JS chunk URL 推断。
5. 旧 v1 是已经公开的 versioned strict contract；新增 v2 表达 flat physical layout。runtime 对 v1/v2 分别 strict parse，
   builder 恒写 v2，不用修改 v1 含义或把 nested v1 静默当 v2。

### 关键决策

1. **v2 使用纯 content address 的物理文件。**
   - chunk 为 `<sha256>.zip`，atlas 为 `<sha256>.webp`，external 为 `<sha256>.<canonical-ext>`，manifest 为
     `delivery.<sha256>.json`；所有 path 必须只有一个 segment。
   - owner id 不进入 chunk filename，避免 bytes 相同却因 owner slug 变化失去复用；owner/dependency 仍只存在 manifest。
   - v2 parser 验证 route path 的 hash token 与其声明 `sha256` 一致，但 runtime 不重新 hash 下载 bytes；完整 bytes parity
     仍由 CLI build/`--check` 负责，符合 production runtime 不做全包 integrity gate 的规则。
2. **delivery dir 成为 append-only flat pool。**
   - 普通生成允许目标不存在或已存在；先完整构建并校验 candidate，在同目录 staging 缺失依赖，已存在文件必须 byte-equal。
   - 发布顺序为 chunk/atlas/external 在前、hashed manifest 最后；只清理本次尚未发布的 staging/新建文件，不覆盖、不删除
     进入任务前已有文件或旧 manifest。
   - `--check` 只要求 candidate closure 是现有池的 byte-equal 子集，并检查池仍为合法单层普通文件；extra valid hashed
     文件属于可回滚/仍被旧客户端引用的历史版本，不视为 orphan。
3. **runtime URL 合同与交付内容解耦。**
   - public options 变为 `{ urlPrefix, manifestFilename, manifestBytes?, fetchImpl?, loadSymbolTextures? }`；
     `manifestFilename` 必须符合 v1 固定名或 v2 hashed 名与对应 version，二者不允许 path segment。
   - `urlPrefix` 必须是明确的 HTTP(S) directory URL；统一 URL helper负责 manifest及所有 route，拒绝 query/hash、非目录
     prefix、origin变化和逃逸。`manifestBytes` 只省略 manifest fetch，不改变 physical URL root。
   - 不把 environment-specific prefix 写入 manifest，也不保留 `manifestUrl` 静默 alias；当前仓库 direct tests一次迁移，
     仓库外 consumer按README迁移。
4. **不制造 latest pointer。**
   - CLI 将 exact manifest filename作为返回值和成功日志交给部署配置；版本选择属于部署/app配置，不由共享 CDN 目录中的
     可变文件决定。

## 5. 职责与合同

- **RenderCore data**：拥有 v1/v2 strict schema、flat/hash filename parser、version dispatch 与 public types；v1语义不变，
  v2只接受扁平 physical route。
- **gamelayoutpkgcli builder**：拥有 deterministic physical bytes、canonical extension、完整 hash filename、manifest bytes/hash
  和 exact candidate closure；相同 bytes/path只保留一份。
- **目录 publisher**：拥有已有文件复验、缺失文件 staging、manifest-last commit、失败清理与 append-only边界；不得覆盖或
  GC旧文件。
- **RenderCore loader**：拥有 prefix/filename validation、fetch、bounded ZIP、atlas/media URL与资源destroy；调用方只拥有
  environment URL prefix和选择哪个manifest版本。
- **失败策略**：unknown version/field、v2 nested/non-hashed/mismatched path、非法 prefix/filename、同名不同 bytes、缺文件、
  非普通文件、fetch/ZIP/parser/decoder错误原位失败；不得改写已加载resource或发布半成品manifest。
- **禁止行为**：不得保留第二份resource表、basename猜测、首项fallback、unhashed入口、覆盖旧hash对象、递归目录输出、
  runtime integrity扫描或把CDN URL写进versioned manifest。

## 6. 文件范围

### 预计新增

```text
tasks/272-gamelayoutpkgcli-flat-hashed-cdn-delivery-<utctime>.md
```

### 预计修改

```text
apps/gamelayoutpkgcli/src/{delivery-builder,cli,types}.ts
apps/gamelayoutpkgcli/tests/{delivery-builder,cli}.test.ts
apps/gamelayoutpkgcli/README.md
packages/rendercore/src/scene-layout/data/delivery.ts
packages/rendercore/src/scene-layout/delivery-loader.ts
packages/rendercore/tests/scene-layout/{delivery-manifest,delivery-loader}.test.ts
packages/rendercore/README.md
docs/agent-rules/scene-layout.md
```

若 implementation 把 pure flat filename validator单独抽到
`packages/rendercore/src/scene-layout/data/delivery-path.ts` 并由 CLI public data API复用，可新增该文件及对应测试；不得在
CLI 和 loader 复制两套规则。

### 原则上不应修改

```text
apps/gamelayouteditor/**
apps/gamelayoutpkgcli/src/{asset-groups,audio-optimizer,image-optimizer,package-reader,package-writer,reference-rewriter}.ts
packages/rendercore/src/scene-layout/{manifest,package-resource,package-runtime,runtime,production-zip}.ts
packages/rendercore/src/{popup,symbol,image-string,reel,background}/**
assets/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
docs/agent-rules/{game002,game003}.md
```

若现有 shared content-address helper不足而必须修改 `browserartifactio` public API，或 loader改动触及 package runtime资源
lifecycle，属于明显扩大跨包范围，执行前先停止说明。

## 7. 实施步骤

1. **确认执行基线与 v1/v2 fixtures**
   - 重核 HEAD/status、本计划及两份领域规则，确认目标 symbols、public exports、当前 tests 与仓库 direct consumer。
   - 固定 v1 nested fixture和v2 flat fixture，列出 chunk/atlas/external/manifest bytes到expected filename映射；先证明同bytes
     稳定复用和不同bytes变更hash。
2. **建立 delivery v2 data contract**
   - 在 RenderCore data 增加 v2 type与strict parser，复用字段结构但将所有 CDN physical path约束为单段、完整hash与
     canonical extension；保留ZIP entry/logical key现有安全规则。
   - 增加明确version dispatch和manifest filename校验；v1仍接受原nested path，future version与v1/v2 filename错配失败。
   - 从`scene-layout/data`、`scene-layout/core`现有边界导出新type/helper，不恢复混合root入口。
3. **生成扁平 hashed candidate**
   - 更新builder，让所有physical payload仅按bytes hash+canonical ext分配；metadata chunk去掉owner slug和`chunks/`，atlas/
     media去掉`assets/`。
   - 生成stable v2 manifest bytes后计算自身hash、加入`delivery.<hash>.json`，在result显式保存`manifestFilename`；检测同path
     dedupe只能复用byte-equal内容。
   - 保持owner、dependency、atlas frame、logical route、媒体bytes和deterministic排序不变，并用v2 parser复验candidate。
4. **实现 append-only目录发布与check**
   - 允许创建新目录或复用已有flat pool；先只读扫描entry type/name并复验所有candidate冲突，再stage缺失文件。
   - 原子放置payload，最后放置manifest；失败仅回收本次拥有且未形成已发布manifest引用的新文件，保留所有pre-existing
     和历史版本。
   - `--check`验证candidate subset内容，不因extra valid hashed版本失败；CLI结果/日志输出exact manifest filename及新增、
     复用文件计数，方便部署只上传新增对象。
5. **迁移 runtime到显式URL前缀**
   - 修改loader public options和统一URL resolver；先从`urlPrefix + manifestFilename`读取/解析manifest，再以同一prefix
     加载chunk、atlas、external media。
   - 保持initial/mode lazy load、background prefetch、promise reuse、Pixi cache注册和destroy顺序；增加v1/v2、custom CDN
     prefix、`manifestBytes`、非法prefix/path与fetch顺序测试。
6. **同步文档、规则与验收**
   - 更新两个README的CLI示例、flat目录示例、runtime调用方式、增量上传/缓存粒度、manifest发布顺序及迁移说明。
   - 更新`scene-layout.md`稳定delivery合同，不把具体示例hash、执行证据或外部CDN配置写入规则。
   - 运行L2定向验收、检查diff/残留旧固定名，并生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- data tests覆盖v1 nested继续通过、v2各类flat route通过，以及nested、缺/短/大写hash、path/hash不一致、unknown version、
  unsafe filename和manifest filename/version错配失败。
- builder tests不仅断言“无斜杠”，还对每个输出重新hash验证filename，证明相同input/参数byte-equal、同bytes跨owner去重、
  单一payload变化只新增受影响physical files及新manifest。
- publisher tests使用临时目录覆盖首次生成、再次生成零写入、部分已有补齐、extra旧版本保留、同名不同bytes冲突、目录/
  symlink拒绝、payload失败时manifest不可见和`--check`只读subset parity。
- loader tests精确断言所有请求来自显式asset prefix而非JS/页面/manifest旧隐式URL，v1/v2 initial/background/mode/media顺序、
  `manifestBytes`、URL containment、失败cleanup和destroy保持。
- 不用runtime重新hash下载bytes来满足builder parity测试；不以fake CDN声称真实browser cache命中。

### 验收级别

`L2`：任务修改versioned delivery schema、RenderCore public loader API、正式CDN产物与直接CLI consumer；需同时验证
RenderCore data/core和gamelayoutpkgcli，但没有根工具链、lockfile或大规模跨包重构，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/delivery-manifest.test.ts tests/scene-layout/delivery-loader.test.ts --coverage=false
pnpm --filter gamelayoutpkgcli exec vitest run tests/cli.test.ts tests/delivery-builder.test.ts --coverage=false
pnpm --filter @slotclientengine/rendercore --filter gamelayoutpkgcli build
pnpm --filter @slotclientengine/rendercore --filter gamelayoutpkgcli format:check
git diff --check
```

执行后另做不计为重型命令的残留审计：新builder/README不得再声明固定`delivery.manifest.json`或输出
`chunks/`、`assets/`；v1 fixture/parser中的历史字符串允许保留并须有明确version标签。

### 人工验收

- 用一个最小合法 production ZIP连续发布两次到同一临时目录，确认第二次报告零新增；改变一个external bytes后确认保留
  旧文件，只新增新external与新manifest，且两个manifest都能分别加载。
- 用静态HTTP服务器把同一flat目录挂到与JS不同origin/path，在浏览器通过`urlPrefix + manifestFilename`启动initial mode、
  lazy加载另一个mode并播放一个external media；Network面板确认请求全部命中asset prefix且无nested CDN path。
- 真实CDN上传、cache header与跨版本浏览器disk-cache命中由部署方验收，执行报告必须标为未执行或记录真实证据，不能用
  单测代替。

### 独立验收建议

`建议`。这是跨包public API、versioned manifest和正式CDN发布transaction；独立复验重点限于：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/delivery-manifest.test.ts tests/scene-layout/delivery-loader.test.ts --coverage=false
pnpm --filter gamelayoutpkgcli exec vitest run tests/cli.test.ts tests/delivery-builder.test.ts --coverage=false
git diff --check
```

重点人工检查manifest-last、已有文件不覆盖/不删除，以及v1/v2 URL解析不混用。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 `pnpm`；shell没有Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时只执行`CI=true pnpm install --frozen-lockfile`；下载实际失败后才设置仓库约定代理并重试原命令。
- delivery atlas测试/构建继续使用现有`sharp`、`cwebp` runner和Web Crypto/Node hash能力；本任务不新增依赖、不修改
  package manifest或lockfile。

## 10. 生成物、文档与规则

- 本任务没有YAML或手改生成TypeScript；flat CDN directory是CLI正式生成物，只能由builder生成并由`--check`复验。
- `apps/gamelayoutpkgcli/README.md`记录新目录/publish workflow与CLI输出；`packages/rendercore/README.md`记录public runtime
  options、v1迁移和URL validation。
- `docs/agent-rules/scene-layout.md`更新稳定v2/append-only/prefix职责；根`AGENTS.md`已有“runtime不做全包hash gate”和
  content-address原则，不重复追加任务细节。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/272-gamelayoutpkgcli-flat-hashed-cdn-delivery-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终实现/文件、v1/v2与publish关键决策、计划偏差、实际验收命令、
人工浏览器/CDN未完成项和剩余风险；不收集无关coverage或整仓统计。

## 12. 风险、假设与待确认

### 风险

- append-only目录不会自动回收旧版本；这保证旧manifest可继续服务，但对象存储生命周期/引用追踪必须由部署侧另行管理。
- content hash只保证URL随bytes变化；浏览器是否跨版本命中缓存还取决于CDN/HTTP cache header，仓库测试无法替代。
- atlas/metadata ZIP是缓存单元；packing成员或chunk metadata变化可能使同组未改单项随新physical file重新下载。
- loader public参数是breaking TypeScript change；当前仓库无app source consumer，但仓库外consumer必须按README迁移。
- 多进程同时向同一目录publish存在race；实现必须依赖exclusive create/rename和最终byte复验，不得先检查后无条件覆盖。

### 假设

- `--delivery-dir`代表专用Scene Layout hashed对象池，因此可以拒绝subdirectory、symlink和非canonical文件名；JS bundle不与
  该目录混放，符合用户要求的JS/asset URL分离。
- 完整SHA-256加canonical extension足以作为physical identity；不需要owner、layout id或mode id进入filename。
- 旧v1 runtime兼容是versioned reader职责，新部署和CLI输出不再继续创建v1目录布局。

### 待确认

无。manifest选择由调用方配置、旧对象清理和真实CDN cache policy均已明确留在部署边界，不阻塞本任务实现。

## 13. 完成清单

- [x] 目标和非目标已满足。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] v1/v2 schema、public loader、flat path与publisher ownership符合计划。
- [x] 已有hash对象未覆盖/删除，candidate依赖先于manifest发布，失败没有可见半交付入口。
- [x] 测试、README和Scene Layout规则已同步。
- [x] 指定L2自动化验收已通过；全量 format baseline 例外见执行报告。
- [x] 自动化、浏览器和真实CDN验收已明确区分。
- [x] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划与`docs/agent-rules/{scene-layout,editor-artifacts}.md`；
2. 核对Git基线、工作区和current public exports/consumer；
3. 按v2 flat schema、append-only publish和显式URL prefix合同实现，不重新制定另一套路径方案；
4. 小幅适配当前实现时在报告记录，若需browserartifactio public API、lockfile或runtime lifecycle扩项则先停止说明；
5. 只运行计划规定的L2验收并保留人工CDN边界；
6. 完成后生成UTC中文执行报告；
7. 除非用户明确要求，不commit、不push、不创建PR。

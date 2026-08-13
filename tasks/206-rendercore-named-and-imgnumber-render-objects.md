# 206 rendercore-named-and-imgnumber-render-objects 任务计划

## 1. 目标与完成定义

### 目标

为 RenderCore 建立按 Scene Layout/Gamelayout `runtimeResources` exact name 创建 owned `RenderObject` 的直接接口，消除 Crave 为 `nearwin1`、`nearwin2` 手工取得底层 resource、判断 kind、创建 player 和包装显示对象的重复流程。

在同一对象体系中增加 standalone ImgNumber（仓库 runtime 名称为 image-string）render object：由未来放入 Gamelayout 包的 exact named resource 创建，继承统一位置接口，并可修改当前显示文字。Crave 源码仍由用户在自己的仓库按本任务使用文档人工修改。

### 完成定义

- [x] `SceneLayoutPackageRuntime` 可按 exact program resource name 异步创建 owned `RenderObject`；调用方不再传 skeleton、atlas、texture 或自行创建 official player。
- [x] named factory 根据 manifest 声明严格分派资源类型；unknown name、unsupported kind、资源缺失和初始化失败显式报错，不猜路径或 fallback。
- [x] public export 提供 opaque、cloneable 的 `ImgNumberRenderObject`，继承 `RenderObject.setPosition()`，并提供 `setText()/getText()`；不公开 `RenderImageString.container` 或 raw Pixi display tree。
- [x] Spine/VNI 等动态 object 由创建它的 package runtime 持续 `update(deltaSeconds)`；调用方不接触 player/update，object/runtime destroy 都能完整清理。
- [x] 正常、失败、abort 和 runtime destroy 路径不留下已挂载 node、active player、pending playback、注册或资源泄漏。
- [x] 新增一份独立、可直接交给 Crave 执行者的人工修改文档，覆盖 Nearwin1/2 和图标中奖 ImgNumber 接入；不修改 Crave 源码或 assets。
- [x] public exports、RenderCore 使用文档、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- Scene Layout program runtime resource 到 `RenderObject` 的 exact-name materializer 与 package-runtime façade。
- image、official Spine、VNI 等当前可表现 program resource 的 strict kind dispatch；image-string 使用专门 ImgNumber typed façade。
- dynamic named object 的 manual update、play/stop、async init、ownership、rollback 和 destroy。
- `ImgNumberRenderObject` 对现有 `createRenderImageString()` 的 opaque adapter、clone、position、visibility、anchor 和 set/get text。
- RenderCore 自包含 fixtures/tests，以及 canonical Crave 人工迁移说明。

### 不包含

- 不修改外部 Crave 仓库，也不修改本仓 `apps/game002v2` 来冒充 Crave 已完成迁移。
- 不新增、选择、复制或修改 ImgNumber 美术；不修改 `assets/crave`、`assets.map.json`、Gamelayout manifest/ZIP 或生成物。美术与 exact resource key 后续由 Gamelayout 包提供。
- 不让 RenderCore 识别 `nearwin1/2`、Crave、`bg-win`、CN、WL 或业务金额格式；这些名字只出现在文档示例和 consumer-owned config 中。
- 不把 `runtimeResources` 变成任意路径加载器，不扫描 assets map、不猜 kind、不按 basename/首项 fallback。
- 不给 `RenderObject` 增加 raw Container getter、public `update()`、generic property bag、全局 ticker或RAF。
- 不把 video 包装成普通 `RenderObject`；video 继续只走现有有手势约束的 transition player。
- 不修改 `SymbolWinCarousel`、`SymbolCascadePlayer`、collect item amount 或 cumulative summary；Crave 如何把自身图标中奖字体文字替换为新 ImgNumber 接口只写入使用文档。
- 不修改 symbol 内 value presentation、named image-string node、Popup ImgNumber、tier 切换或数字飞行合同。
- 不新增依赖，不修改 lockfile、根工具链、LogicCore 或 server 数据边界。

## 3. 制定计划时的基线

```text
UTC: 2026-08-13T11:42:30Z
HEAD: 2f6250aa8dd86b31e0ec553d62c2adb97df9b1e9
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/game002.md`、`docs/agent-rules/editor-artifacts.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- `packages/rendercore/src/scene-layout/types.ts#SceneLayoutPackageResource.loadRuntimeResource(key, kind)` 已提供 typed async prepare，但调用方必须预先知道 kind，取得的仍是底层 resource，不是 render object。
- `apps/game002v2/src/reel-presentation.ts#prepareGame002v2ReelPresentation()` 展示了当前复杂度：path-to-key、`loadRuntimeResource(key, "spine")`、`createGridCellEffectResourceFromLoadedSpine()` 依次由 consumer 手工完成。本任务不修改该 app，只以它作为 API 缺口证据。
- `assets/crave/layout.manifest.json#runtimeResources` 当前已声明 Nearwin1/2/3，但用户明确要求本任务不修改 Crave/Gamelayout assets。
- `packages/rendercore/src/presentation/render-object.ts` 已有 Container-backed opaque `RenderObject`、owned/borrowed guard、`setPosition()`、`setVisible()`、`play/stop/getAnchor/destroy`，可作为 named factory 的唯一公共对象合同。
- `packages/rendercore/src/image-string/render-image-string.ts#createRenderImageString()` 已拥有 glyph layout、dynamic anchor、stable container、`setText()` 和 destroy，但返回 `container`，尚未包装为通用 `RenderObject`。
- 任务203/205已经采用“RenderCore 实现能力 + `docs/crave-*.md` 人工迁移，不写外部 Crave”的交付方式；任务206沿用相同边界。
- 本规划会话只创建本任务计划；未修改源码/assets、未安装依赖、未运行构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- “根据名字生成 renderobj”解释为从当前 Scene Layout package manifest 的 exact `runtimeResources[name]` 创建对象，而不是从文件名、path 或 assets map 猜资源。
- `nearwin1/2` 只是 Crave 当前 consumer 的例子；RenderCore API保持通用，并允许未来其它游戏按各自 manifest name创建对象。
- “ImgNumber 这种 renderobj”解释为 image-string-backed typed object；位置复用 `RenderObject.setPosition({x,y})`，内容沿用 image-string 的 `setText/getText`，不内置金额formatter或number/string猜测。
- “Crave 图标中奖里的字体文字”解释为：Crave人工迁移文档要求其调用点把现有字体对象替换为由Gamelayout exact name创建的ImgNumber；RenderCore不修改或接管Crave中奖业务流程。
- ImgNumber美术、字形闭包、logical key和Gamelayout binding明确不属于本任务；RenderCore测试只使用包内自包含fixture。

### 关键决策

1. **public 创建入口放在 package runtime。**
   - 目标 façade：

     ```ts
     interface SceneLayoutPackageRuntime {
       createRenderObject(name: string): Promise<RenderObject>;
       createImgNumberRenderObject(
         name: string,
         options: {
           readonly text: string;
           readonly anchor?: { readonly x: number; readonly y: number };
         },
       ): Promise<ImgNumberRenderObject>;
     }
     ```

   - runtime 已拥有 package resource、manual update 和 destroy 边界，适合登记 active player；不把 ticker或player update泄露给游戏。
   - generic入口遇到image-string时要求调用typed ImgNumber入口；ImgNumber入口遇到非image-string立即失败，避免返回值能力靠运行时猜测。

2. **name 是 manifest identity，不是 path alias。**
   - name大小写精确命中`runtimeResources`；unknown name、unsupported video和kind mismatch显式失败。
   - 继续复用`loadRuntimeResource()`的并发Promise、lazy group与resource closure；named materializer只消费其strict validated result。

3. **动态对象由caller ownership和runtime update registry共同管理。**
   - factory返回detached owned object；caller负责mount/交给presentation scope或destroy。
   - Spine/VNI object alive期间登记在创建它的runtime，由`runtime.update()`推进；object destroy deregister并释放player，runtime destroy清理遗留对象并拒绝pending play/create。
   - 异步load/init失败或期间runtime destroy时，等待已启动prepare收敛并回滚，不发布半初始化object。

4. **ImgNumber 是 typed RenderObject，不泄露低层 renderer。**
   - `ImgNumberRenderObject extends CloneableRenderObject`，增加`setText/getText`并保持协变`clone(): ImgNumberRenderObject`。
   - adapter复用`createRenderImageString`的stable container和glyph validation；clone保留当前text/anchor/resource，后续互不联动。
   - `setPosition()`只设置对象位置；image-string visual-bounds pivot继续由dynamic anchor负责，两者不混成world-coordinate API。

5. **program object 的播放能力使用现有 RenderObject seam。**
   - Spine/VNI adapter实现`play(name, {signal})/stop()`，由runtime update推进并在真实once完成、abort、supersede或destroy时settle/reject。
   - image等静态object调用`play()`继续严格报“不支持播放”；不制造默认animation、loop或首项fallback。
   - repeat/loop count、Nearwin时序和业务中断仍由Crave编排，RenderCore只提供对象原子能力。

6. **Crave只交付接口使用文档。**
   - 新建不带历史task编号的canonical文档，或在现有`docs/crave-render-object-migration.md`中增加独立任务206章节；以最终可维护性选择最小方案。
   - 文档必须给出Nearwin1/2 direct factory、ImgNumber创建/定位/改值、替换原字体文字、mount/destroy、ticker和strict failure示例。
   - 文档中的ImgNumber name使用consumer config常量/manifest exact name，不承诺本任务提供某个asset key。

## 5. 职责与合同

- **Scene Layout package resource**：拥有 exact program resource spec、lazy bytes、kind validation和共享prepared resource；不拥有实例playback。
- **Named object materializer**：把已验证的image/Spine/VNI/image-string resource转换为opaque owned object，建立内部adapter与失败cleanup；不解释业务name。
- **Scene Layout package runtime**：公开name factory、推进dynamic object、在destroy时取消playback和清理注册；不自动mount对象。
- **ImgNumberRenderObject**：拥有一个image-string renderer实例、当前text/anchor/position和clone/destroy；共享resource但不销毁package-owned resource。
- **Crave**：声明exact resource name、Nearwin时序、金额formatter、对象mount/位置与调用顺序；按文档自行修改和验收，RenderCore不接管这些职责。
- **失败策略**：unknown name/kind、video factory、missing glyph、invalid text/anchor/position、重复mount、destroyed object/runtime、播放名不存在和异步init失败全部显式失败，不fallback。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/imgnumber-render-object.ts
packages/rendercore/src/scene-layout/render-object-factory.ts
packages/rendercore/tests/presentation/imgnumber-render-object.test.ts
packages/rendercore/tests/scene-layout/render-object-factory.test.ts
docs/crave-named-render-object-migration.md
tasks/206-rendercore-named-and-imgnumber-render-objects-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/presentation/{index,render-object}.ts
packages/rendercore/src/scene-layout/{types,package-runtime,index}.ts
packages/rendercore/tests/scene-layout/**
packages/rendercore/src/index.ts
packages/rendercore/README.md
docs/crave-render-object-migration.md        # 仅在需要链接新canonical文档时
```

具体内部文件拆分可按import cycle最小化调整，但只能有一个canonical named resource materializer和一个ImgNumber RenderObject adapter。

### 原则上不应修改

```text
apps/**
assets/**
packages/{logiccore,gameframeworks,uiframeworks,netcore}/**
packages/rendercore/src/{reel,symbol,symbol-value-presentation,symbol-image-string,popup,symbol-cascade,symbol-win-carousel}/**
docs/agent-rules/game002.md
docs/agent-rules/shared-game-runtime.md
pnpm-lock.yaml
AGENTS.md
tasks/203-*.md
tasks/205-*.md
```

执行时若需要修改Crave/game002v2、Gamelayout assets/manifest、公开raw Container/update、增加fallback、迁移cascade或修改lockfile，属于明显范围扩大，必须先说明。

## 7. 实施步骤

1. **确认执行基线和public surface**
   - 重新核对HEAD/status、`SceneLayoutPackageRuntime`生命周期、runtime resource kind和RenderObject adapter。
   - 固定现有resource lazy-load并发与runtime update/destroy测试。

2. **实现ImgNumber RenderObject**
   - 新增typed façade和adapter，复用`createRenderImageString()`；接入public exports与RenderObject registry。
   - 覆盖position、text更新、dynamic anchor、clone独立性、owned destroy幂等、resource失效和伪造object拒绝。

3. **实现Scene Layout named object factory**
   - 从exact runtime resource spec/materialized resource创建对应object，完成Spine/VNI init、play/stop/update bridge和rollback。
   - 在package runtime暴露两个typed入口，登记dynamic object并处理create/play期间destroy；video和kind mismatch显式失败。

4. **编写Crave接口使用文档**
   - 给出Nearwin1/2按exact name创建、play/stop/position/mount/destroy示例，删除手工resource/player组装的迁移清单。
   - 给出Gamelayout ImgNumber resource到位后的创建、`setPosition`、`setText`和替换现有中奖字体对象示例；明确不使用字体fallback、不猜resource key。
   - 列出Crave侧搜索、typecheck/test和浏览器验收，不声称当前仓已修改Crave。

5. **同步public文档并执行定向验收**
   - 更新RenderCore README并链接新的Crave使用文档；不修改领域规则或历史任务事实。
   - 运行第8节定向命令，生成UTC中文执行报告并记录Crave人工迁移待办。

## 8. 测试与验收

### 测试原则

- shared package fixture自包含，不读取`assets/crave`或依赖未来Gamelayout美术。
- named factory覆盖支持kind、unknown name、kind mismatch、unsupported video、同resource多实例、并发创建和runtime destroy during init。
- playback只用runtime manual `update(deltaSeconds)`推进，不使用RAF、wall-clock timer或Pixi shared ticker。
- ImgNumber覆盖多glyph更新、缺glyph原值/画面不变、clone、mount/destroy和package-resource ownership。
- 不用fake resource证明Crave视觉完成；外部真实美术验收明确留给Crave接入会话。

### 验收级别

采用 `L1`：只修改RenderCore package public API、内部动态player registry和自包含测试，不修改任何仓内consumer、正式schema/assets或跨package实现。build用于验证public export产物。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/scene-layout/render-object-factory.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
git diff --check
```

另用定向`rg`检查新文档是否明确删除Crave旧手工resource/player组装，并同时覆盖ImgNumber位置与改值接口。

### 人工验收

本仓只进行RenderCore测试fixture人工快照检查；真实Crave验收由迁移文档要求其执行者完成：

- Nearwin1/2对象的位置、scale、动画、开始/结束时机和低FPS cadence与迁移前一致。
- 图标中奖使用Gamelayout提供的ImgNumber美术，金额、位置、显示/隐藏和原有业务播放时序正确。
- 实际formatter的全部字符被正式ImgNumber glyph闭包覆盖；缺glyph原位报错，不显示字体或空白。
- runtime销毁或presentation打断后无残留dynamic object/player。

### 独立验收建议

`必须`。本任务涉及跨模块public contract、动态player update registry和异步resource ownership。重点复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/scene-layout/render-object-factory.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```

## 9. 环境与依赖

- 使用仓库要求的Node.js 24和pnpm；shell没有Node时加载`/Users/zerro/.nvm/nvm.sh`后`nvm use 24`。
- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有Pixi、official Spine、VNI、image-string和Scene Layout loader，不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- 本任务不修改YAML、manifest、assets、ZIP、assets map或生成器输入，不运行无关generator。
- ImgNumber美术后续进入Gamelayout包时，继续遵守manifest-owned exact binding与Editor导出闭包；任务206不预选name、glyph或physical path。
- 更新`packages/rendercore/README.md`，记录named object与ImgNumber ownership，并链接Crave使用文档。
- 新增`docs/crave-named-render-object-migration.md`作为可独立执行的Crave说明；`docs/crave-render-object-migration.md`只增加入口链接，不复制全文。
- 本任务不修改根`AGENTS.md`或`docs/agent-rules/**`；接口与ownership说明保存在RenderCore README和Crave使用文档。
- 不修改根`AGENTS.md`，不回写任务203/205历史计划和报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/206-rendercore-named-and-imgnumber-render-objects-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终API、实际文件、ownership决策、验收结果、Crave文档路径、外部人工迁移待办和剩余风险。

## 12. 风险、假设与待确认

### 风险

- 动态Spine/VNI object若同时被runtime registry和caller当owner，容易重复update/destroy；实现必须固定“caller拥有object，runtime拥有推进与最终兜底清理”的单一账本。
- `RenderObject.play()`的Promise与runtime manual update绑定；宿主停止ticker会使播放无法完成，文档必须明确该前提。
- 外部Crave与未来Gamelayout assets不在本任务控制范围，自动化不能代替其typecheck/test和真实美术验收。

### 假设

- 未来Gamelayout会为Nearwin和中奖ImgNumber提供exact program resource name与完整资源闭包；本任务只消费合同。
- ImgNumber内容是formatter输出string，业务金额/币种逻辑继续由Crave拥有。
- Crave会在自己的接入会话中决定具体调用点和业务时序；任务206不为其新增共享业务adapter。

### 待确认

- 无。ImgNumber asset name、glyph和视觉规格明确由后续Gamelayout美术交付决定，不是任务206的待确认实施输入。

## 13. 完成清单

- [x] 目标和非目标已满足。
- [x] 实际修改未超范围，或偏差已在报告说明。
- [x] public API、职责和资源生命周期符合计划。
- [x] named resource无需caller取得底层kind/resource/player。
- [x] ImgNumber位置、改值、clone和destroy合同完整。
- [x] Crave接口使用文档覆盖Nearwin1/2、ImgNumber位置/改值和图标中奖字体替换。
- [x] apps、assets、Gamelayout包和外部Crave均未被本任务修改。
- [x] 测试和使用文档已按需同步。
- [ ] 独立验收未另行委派；同一执行会话已完成指定自动化与最终 diff 复核。
- [x] 自动化与Crave人工验收已明确区分。
- [x] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对Git基线、工作区和当前public surface；
3. 按计划只修改RenderCore与文档，不触碰Crave/apps/assets/Gamelayout美术；
4. 小幅适配当前实现时在报告记录；重大范围扩张时先停止说明；
5. 只运行计划规定的L1验收，并让独立验收复核高风险合同；
6. 完成后生成UTC中文执行报告，明确Crave仍待按文档人工迁移；
7. 除非用户明确要求，不commit、不push、不创建PR。

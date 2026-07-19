# symbol value tier ImgNumber 任务计划

## 1. 任务目标

本任务调整通用 symbol value-presentation 与 `apps/symbolseditor`，让类似 `game002` 的 `CN` coin symbol 能把“档位美术”和“数字显示”作为两组独立配置维护：

- 档位继续只负责按 raw positive integer value 选择 official Spine 4.3 skeleton、atlas、texture、loop animation 和 transform；
- 数字显示单独配置，不在 Spine tier 内复制阈值、动画或资源路径；
- 现有 font、完整数值图片（例如 `25 -> 25.png`）继续可用；
- 新增 ImgNumber/image-string 数字模式，并允许每个已解析 tier 显式选择不同的 image-string dependency、Spine slot、anchor、transform 和 `followSlotColor`；
- 完整数值图片与 ImgNumber 是严格互斥的 manifest union，不能同时生效、互相兜底或残留隐藏字段；
- 将 `assets/game002-s3` 的 `CN` 从当前完整数值图片模式迁移到 ImgNumber 模式，并能在 `apps/symbolseditor` 导入、编辑、预览、导出、重新导入；
- rendercore 继续拥有 manifest parser、精确资源闭包、image-string glyph layout、Pixi renderer、official Spine slot attach/detach、异步初始化和销毁生命周期；app/editor 只配置和调用公共 API。

本文件是完整实施合同。执行者不能依赖聊天记录、旧任务计划、旧任务报告或口头说明来补全需求。

任务完成后必须新增中文任务报告：

```text
tasks/109-symbol-value-tier-imgnumber-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/109-symbol-value-tier-imgnumber-260401-181300.md
```

## 2. 已确定的产品与数据合同

### 2.1 档位与数字是独立配置

`valuePresentation.tiers[]` 只描述档位选择和档位 Spine 美术。不得把 ImgNumber dependency、glyph、slot 或数字 layout 写进 `tiers[].animation`。

数字配置继续位于独立的 `valuePresentation.text` discriminated union。扩展后的类型固定为：

```text
font | image | image-string
```

- `font`：保留当前 Pixi Text 配置；
- `image`：保留当前 `${prefix}${value}.png` 完整数值图片配置；
- `image-string`：新增按 resolved tier index 选择 ImgNumber binding 的配置。

manifest 形状固定为：

```json
{
  "valuePresentation": {
    "defaultValues": [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000],
    "reelStates": {
      "normal": { "kind": "transparent", "width": 200, "height": 200 },
      "spinBlur": "./CN.spinBlur.png",
      "disabled": "./CN.disabled.png"
    },
    "tiers": [
      {
        "maxExclusive": 10,
        "animation": {
          "kind": "spine",
          "skeleton": "./CN_1.json",
          "atlas": "./Symbol.atlas",
          "texture": "./Symbol.png",
          "playback": {
            "mode": "animation",
            "animationName": "Loop",
            "loop": true
          }
        }
      },
      {
        "animation": {
          "kind": "spine",
          "skeleton": "./CN_2.json",
          "atlas": "./Symbol.atlas",
          "texture": "./Symbol.png",
          "playback": {
            "mode": "animation",
            "animationName": "Loop",
            "loop": true
          }
        }
      }
    ],
    "text": {
      "type": "image-string",
      "tiers": [
        {
          "resource": "./dependencies/image-strings/coin-small/image-string.manifest.json",
          "slot": "Num",
          "anchor": { "x": 0.5, "y": 0.5 },
          "transform": { "x": 0, "y": 0, "scale": 1 },
          "followSlotColor": true
        },
        {
          "resource": "./dependencies/image-strings/coin-large/image-string.manifest.json",
          "slot": "Num",
          "anchor": { "x": 0.5, "y": 0.5 },
          "transform": { "x": 0, "y": 0, "scale": 1 },
          "followSlotColor": true
        }
      ]
    }
  }
}
```

上例只展示两档。实现必须支持任意合法档数，不得硬编码四档、`CN`、`Num`、`coin-*`、`game002` 或任何文件名。

`text.tiers.length` 必须与 `valuePresentation.tiers.length` 完全一致。每一项只按相同 index 消费已经解析好的 tier 结果，不复制 `maxExclusive`。同一 image-string resource 可以被多档显式重复引用，但禁止“未配则沿用第一档/上一档/全局默认”的隐式 fallback。

### 2.2 三种数字模式严格互斥

严格 parser 必须按 `text.type` 只允许该分支的 exact keys：

- `font` 只接受当前 font 字段；
- `image` 只接受当前 `slot/x/y/prefix` 字段；
- `image-string` 只接受 `type/tiers`，每个 tier binding 只接受 `resource/slot/anchor/transform/followSlotColor`。

下列情况必须失败：

- `image` 同时出现 `tiers`、image-string resource 或 glyph 字段；
- `image-string` 同时出现 `prefix`、font 字段、全局 `slot/x/y`；
- 缺 binding、binding 数量漂移、空 resource/slot、非法 anchor/scale、未知字段；
- resource path 逃逸、manifest 非 image-string v1、glyph closure 缺失、多余或尺寸漂移；
- 当前 raw value 的 `String(value)` 含 dependency 未声明 glyph；
- 当前 tier skeleton 没有该 tier binding 指定的 exact slot。

不添加 font fallback、完整图片 fallback、首档 fallback、placeholder、缺字替换、路径猜测或宽泛 glob。

### 2.3 value 与 tier 选择语义不变

- raw value 仍为 positive safe integer；不格式化为美元，不除以 100，不加 `$`，ImgNumber 渲染 `String(value)`；
- tier 仍只由现有严格递增的 `maxExclusive` 规则选择；
- 数字 binding 使用 resolved tier index，不建立第二份阈值表；
- `defaultValues` 仍只负责本地公开 default scene / local strip occurrence 的候选值；
- 服务器 otherScene value、symbol occurrence 搬运、drop/refill、CN collect、renderPriority 和 cascade 顺序不因数字 renderer 改变；
- 同 value 同 tier 的 normal/loop/activeSpine continuity 继续保留同一 player 和时间轴，不因 ImgNumber 重播；value 或 tier 真正变化时才重建相应展示。

### 2.4 ImgNumber 绑定属于 tier player 内部

ImgNumber 必须通过 rendercore 的 official Spine slot API 挂到当前 tier player 的 exact slot，继承 slot/bone 的位移、旋转、缩放、可见性和颜色；不能作为 sibling Pixi overlay，也不能由 `apps/game002` 或 `apps/symbolseditor` 直接操作 Pixi child、Spine track 或 slot object。

`image-string` resource 在相同 manifest path 间共享，单个 occurrence 只创建轻量 `RenderImageString`。resource 由明确 owner 统一销毁，renderer 销毁不能误销毁共享纹理；package、preview、game rollback 和 game destroy 都不能泄漏 Object URL、Pixi Texture、renderer 或 slot attachment。

## 3. 范围

### 3.1 包含

- `packages/rendercore` value-presentation manifest/type/parser/resource/runtime 扩展；
- image-string nested exact closure 与共享资源池扩展；
- package bytes、Vite modules、symbol package preview 三条资源装配路径；
- value controller 与 standalone value presenter 的 ImgNumber 展示；
- value resource generator、state-texture generator 保留/校验；
- `apps/symbolseditor` dependency 引用、结构化编辑、预览、ZIP round-trip；
- `apps/game002` CN manifest、资源闭包、loading、prepared lifecycle、release check、README 和测试迁移；
- `apps/symbolsviewer` 对迁移后的 game002 value symbol 的加载/预览适配；
- `packages/rendercore/README.md`、`docs/symbol-package.md`、`docs/image-string-manifest.md`、`apps/symbolseditor/README.md` 等直接相关文档；
- 更新根级 `agents.md` 中已过时或与本任务冲突的 current contract；
- 中文任务报告。

### 3.2 不包含

- 不修改 GMI、logiccore otherScenes parser、game002 CN value 业务解析或服务端协议；
- 不把 tier 或 raw value 写进 image-string manifest；
- 不给普通 `imageStringNodes` 增加 otherScene 或 value 语义；
- 不把 ImgNumber 做成 paytable symbol、主 display symbol、VNI、字体或 Spine 资源；
- 不新增后端、数据库、上传服务、CDN 发布或 editor 持久化；
- 不生成、猜测或手绘缺失 glyph，不从字体补字；
- 不扩大 Spine runtime，继续只接受 official 4.3.x；
- 不顺手重构 game002 cascade、nearwin、reel、background 或 win-amount；
- 不保留双写的新旧 CN 数字配置。

## 4. 当前仓库基线与执行保护

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

制定计划时现场快照：

```text
branch: main
HEAD: 9b4a1c8c0c5bd45d6f320b53ae8ce11e72be4c8f
working tree: clean
shell 中 node: 不可用
shell 中 pnpm: 11.9.0
```

执行时必须重新记录 branch、HEAD、完整 `git status --short --untracked-files=all`。所有已有修改和未跟踪文件都属于用户，禁止 `git reset --hard`、`git checkout --`、自动 stash、`git clean`、覆盖用户资源或格式化任务外文件。

环境初始化固定按以下顺序：

```bash
cd /Users/zerro/github.com/minecart2
command -v node || true
command -v nvm || true
```

若 shell 中没有 node，先加载当前机器已有 nvm，再执行：

```bash
nvm use 24
hash -r
node --version
pnpm --version
command -v node
command -v pnpm
```

后续所有生成、测试、lint、typecheck 和 build 必须使用这次 `nvm use 24` 后同一套 node/pnpm。不要全局安装 pnpm，不要为了匹配 `packageManager` 强制升降级，也不要修改仓库版本声明。

本任务原则上不需要新增第三方依赖。只有真实发现现有 rendercore/image-string/Pixi 能力不足时才允许新增，并在报告说明原因和 lockfile 变化。

依赖安装或下载真实失败时才设置代理后重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不要预先设置代理。若测试因旧 fixture/旧断言强迫 production 增加双写、fallback、硬编码或奇怪分支，应修改测试和 fixture，使其验证新合同；不要扭曲正确实现来迁就测试。

## 5. 已确认的当前实现事实

实施前仍须按 live checkout 复核，不能把本节当成跳过盘点的理由。

### 5.1 rendercore 当前限制

主要文件：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/symbol-value-presentation/types.ts
packages/rendercore/src/symbol-value-presentation/create-symbol-value-presenter.ts
packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
packages/rendercore/src/symbol-value-presentation/value-display.ts
packages/rendercore/src/symbol-image-string/resources.ts
packages/rendercore/src/symbol-image-string/controller.ts
packages/rendercore/src/image-string/**
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
```

当前事实：

- `SymbolValuePresentationSpec.text` 只有 `font|image`，且整颗 value symbol 共用一份 slot/layout；
- `SymbolValuePresentationResource` 只有全局 `text` 与 `textImageUrls`；
- `createSymbolValueDisplay()` 只创建 Pixi Text 或完整数值 Sprite；
- `RenderSymbolValueController` 和 `SymbolValuePresenter` 都把这份全局 display 挂到 tier player；
- 普通 `imageStringNodes` 已有严格 manifest、glyph closure、共享 resource、renderer、slot attach/detach 和 `setText()`，但 target 必须是固定的普通 Spine state，不能绑定 value tier 内部 player；
- symbol package 已会递归收集普通 image-string node 的 manifest/glyph，但 valuePresentation 尚未复用该能力；
- `createSymbolValuePresentationResourcesFromManifest()` 当前同步返回 map，没有 image-string shared-resource owner/destroy 合同。

### 5.2 symbolseditor 当前限制

主要文件：

```text
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/io/image-string-dependency.ts
apps/symbolseditor/src/io/symbol-package-zip.ts
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/ui/resource-picker.ts
apps/symbolseditor/src/ui/ui-session.ts
apps/symbolseditor/tests/**
```

当前编辑器已经可以：

- 导入 standalone ImgNumber ZIP，并 vendoring 到 `dependencies/image-strings/<id>/`；
- 管理 dependency 替换、删除和精确 ZIP round-trip；
- 为普通 Spine state 编辑命名 `imageStringNodes`；
- 编辑 value tiers 和全局 font/完整数值图片。

当前不能：

- 在 Value Inspector 选择 `image-string`；
- 为各 tier 选择不同 dependency/slot/layout；
- 把 value-tier ImgNumber 引用计入 dependency 删除保护；
- 用 preview value 驱动对应 tier 的 ImgNumber；
- 导出/重新导入这种新配置。

### 5.3 game002 当前配置

`assets/game002-s3/symbol-state-textures.manifest.json` 的 `CN` 当前为四个 Spine tier，数字为：

```json
{
  "type": "image",
  "slot": "Num",
  "x": 0,
  "y": 0,
  "prefix": "./"
}
```

精确完整值图片为：

```text
1.png, 2.png, 5.png, 10.png, 25.png,
50.png, 100.png, 250.png, 500.png, 1000.png
```

工作区另有 `0-1.png` 到 `7-1.png` 的单字符图片，当前尺寸分别约为 `26..37 x 48..49`。实施者必须先视觉核对和尺寸核对，再把确认为 digit glyph 的权威字节通过 `apps/Imgnumbereditor` 或等价严格 manifest 流程组织成 standalone image-string v1 闭包。不得凭文件名自动绑定，也不得合成不存在的 `8/9`。

当前 default values 只需要字符 `0/1/2/5`。若最终 dependency 未声明 `8/9`，服务器返回含 `8/9` 的 value 必须在 prepare/展示前显式失败；不能回退完整图片或字体。报告必须明确记录实际 glyph 集及其业务限制。

相关生产文件：

```text
assets/game002-s3/symbol-state-textures.manifest.json
apps/game002/src/generated/symbol-value-resources.generated.ts
apps/game002/src/skin-config.ts
apps/game002/src/loading-resources.ts
apps/game002/src/game-entry.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/tests/**
apps/game002/README.md
```

## 6. 实施步骤

### 6.1 预检与测试基线

1. 按第 4 节启用 Node 24，并记录 node/pnpm 路径和版本。
2. 记录 git 快照与现有用户修改，不覆盖任何任务外文件。
3. 运行最小现状基线：rendercore、symbolseditor、game002 的相关测试/typecheck；若现状已有失败，在报告中分开记录，不把旧失败伪装成本任务回归。
4. 用 `rg` 重新盘点 `valuePresentation.text`、`textImageModules`、普通 `imageStringNodes`、resource generator、game002 release check 和 symbolsviewer 的全部调用点。
5. 检查 `0-1.png..7-1.png` 的实际画面、透明边界、decoded size、字符含义和是否被其它 manifest/脚本引用；不依据文件名猜测。

### 6.2 扩展严格 manifest 与公共类型

修改 `packages/rendercore/src/symbol/manifest.ts` 及相应 public exports：

1. 新增 `SymbolValuePresentationImageStringTextSpec` 和 per-tier binding 类型。
2. `SymbolValuePresentationTextSpec` 变为严格三分支 union。
3. parser 对 `image-string` exact keys、tier binding 数量、path、slot、anchor、transform、scale 和 boolean 做 fail-fast 校验并递归冻结。
4. 继续校验 tier `maxExclusive`、looping Spine 和 transparent reel normal，不改变旧语义。
5. 旧的 image-string node slot 冲突校验改为逐 tier 精确判断：普通 node 与当前 value tier binding 指向同一实际 player/slot 时失败；不能再假设 value symbol 只有一个全局 text slot。
6. parser 层不读取 glyph bytes，但必须保留 canonical local reference；需要 files/modules 的闭包和 Spine slot 校验放到资源装配阶段。
7. 保留合法旧 `font`/`image` manifest 的解析和 round-trip；不自动把旧 image 猜成 image-string。

至少新增以下 parser 回归：

- 一档、三档、五档 image-string 配置；
- 每档不同 resource/slot；
- 多档显式共享同一 resource；
- binding 数量少/多、非法 path、空 slot、非法 anchor/scale、未知字段；
- image 与 image-string 字段混用；
- font/image 旧 fixture 不回归；
- parsed object 深冻结。

### 6.3 建立共享 image-string resource pool

不要在 value-presentation 复制 `packages/rendercore/image-string` 的 parser、layout、Sprite 池或 texture loader。

在 `packages/rendercore/src/symbol-image-string` 或职责等价的新内部模块中抽取通用资源池：

1. 输入 canonical manifest path、raw image-string manifests 和 exact image URL modules。
2. 同一路径只解析、校验和创建一个 `ImageStringResource`。
3. 普通 `imageStringNodes` 与 value-tier bindings 复用同一个 pool。
4. pool 创建必须原子；任一 manifest/glyph/decoded size 失败时销毁已创建资源。
5. pool owner 暴露明确的 `destroy()`，保证 package、editor preview、game loading rollback 和 game destroy 只销毁一次。
6. resource collector 对每个 distinct value-tier resource 递归加入 `image-string.manifest.json + collectImageStringAssetPaths()`；symbol package files 缺失时不能跳过校验。
7. validate default values：只用每个 default value 实际命中的 tier dependency 校验 `String(value)`；运行期服务器值在创建/更新 renderer 前再完整校验。

禁止每个 CN occurrence 重复加载全部 glyph，禁止 module-level 永久缓存且无法销毁，也禁止 resource 销毁后继续创建 renderer。

### 6.4 重构 value-presentation resource 与显示生命周期

将 value tier art resource 和 number display resource 分开表达。推荐资源模型：

```text
SymbolValuePresentationResource
  tiers[]                 -> Spine art only
  text/font|image         -> global legacy display
  text/image-string
    tierBindings[]        -> resolved ImageStringResource + slot/layout
```

实现要求：

1. 资源装配先严格验证每个 tier skeleton 的 normal/activeSpine animations，再只验证该 tier binding 指定的 exact slot；不再要求所有 tier 共用 slot intersection。
2. `value-display.ts` 提供统一 display handle，而不是只返回裸 `Container`。handle 至少拥有 container、当前 text snapshot/更新能力和 destroy；font/image 可以是简单实现，image-string 必须复用 `createRenderImageString()`。
3. `RenderSymbolValueController.setValue()` 先解析 tier 和 display binding，再进行异步初始化。新请求、clear、pool release 或 destroy 必须使旧请求失效并清理晚到结果。
4. image-string renderer 使用 `String(value)`，挂到 resolved tier binding 的 slot，应用其 anchor/transform/followSlotColor。
5. state texture 显式优先于 active Spine 的既有合同保持不变；异步 ImgNumber 或 tier player init 早到/晚到都不能把 `spinBlur/disabled` 隐藏成空格。
6. `normal/activeSpine` 回来后显示同一 tier player；等价 Loop continuity 不 replay。value/tier/resource 真变化时才清理旧 renderer/player。
7. `SymbolValuePresenter.prepare/show/update/clear/destroy` 使用同一 display factory 和绑定规则，不建立第二套实现。
8. snapshot 增加足以验证 resolved display type/resource/slot 的中性字段，但不得泄露 Pixi/Spine 私有对象。

必须覆盖：

- 两个相同 value occurrence 共享 resource 但 renderer 独立；
- tier 边界两侧选择不同 ImgNumber；
- 同一 resource 不重复加载；
- 缺 glyph/slot 在可见提交前失败且不部分挂载；
- 快速 value 切换、clear、destroy、晚到 Promise 不泄漏；
- activeSpine once/loop、dropdown continuity、explicit reel texture 优先级不回归；
- presenter 与 reel controller 都能正常 drain/destroy。

### 6.5 更新精确生成链路

#### value Vite resource generator

扩展：

```text
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/symbol-value-vite-resource-generator.test.ts
```

要求：

1. 严格解析 `image-string` 分支和每档 binding。
2. 从 manifest 文件所在目录解析每个 nested image-string manifest，验证 v1 exact closure、glyph 图片存在性、canonical containment 和无路径碰撞。
3. 生成 Vite 可静态分析的 exact imports：tier skeleton/atlas/texture、reel state textures、image-string raw manifest、glyph URL 和 loading URL。
4. 相同 dependency 被多档引用时去重，但不得用宽泛 glob。
5. 旧 image 模式继续生成完整数值图片 imports；image-string 模式不得同时生成这些旧 value images。
6. `--check` 继续检测 generated file 漂移。

#### state texture generator

扩展 `generate-symbol-state-textures.mjs` 的 preserved metadata validator：

- 严格保留合法 `image-string` 分支；
- 拒绝混合字段、binding 数量漂移、非法路径/slot/layout；
- 重生成不能静默丢字段、改回 image、写回顶层 normal/state 或添加 fallback。

### 6.6 调整 symbol package 与 symbolsviewer

1. `createSymbolPackageResource()` 构建一个覆盖普通 node 与 value-tier binding 的共享 image-string pool，再装配 animation/value/controller factories。
2. `SymbolPackageResource.destroy()` 必须销毁 pool；创建失败时 rollback 所有 Object URL、texture 和 resource。
3. `collectSymbolManifestResourcePaths()` 的结果必须精确包含 nested manifest/glyph，且无 orphan。
4. `apps/symbolsviewer` 改为在其现有 async 初始化边界准备 value resource bundle，不在 app 复制 glyph/player/slot 逻辑。
5. viewer 的 game002 `CN` 仍是一个 display symbol，`CN_1..CN_4` 和 ImgNumber glyph 都只作为附属资源；tier 和 dependency 不新增为 symbol selector。
6. viewer 切换 preview value 时必须选择对应 tier ImgNumber，销毁/切 symbol 时释放 renderer；不增加缺资源 placeholder。

### 6.7 扩展 symbolseditor model 与 dependency 管理

修改 `apps/symbolseditor/src/model/editor-project.ts`：

1. typed draft 支持新的严格 text union，clone、set、compile、import、export 全部保真。
2. `collectAssetReferences()` 计入每个 `valuePresentation.text.type=image-string` tier binding 的 resource。
3. `removeImageStringDependency()` 同时保护普通 `imageStringNodes` 和 value-tier bindings，错误信息列出 `SYMBOL.valuePresentation.text.tiers[index]` 等精确位置。
4. dependency 显式替换后所有引用保持相同 logical id/path；不同内容仍必须走 replace。
5. tier add/remove/move 与 image-string binding 在同一个 store transaction 中维护 index 对齐：
   - 新增 tier 时新增一份空的、未就绪 binding，要求用户显式选择 dependency/slot，不暗中复制上一档；
   - 删除 tier 时删除对应 binding；
   - 移动 tier 时连同其数字 binding 一起移动，保持用户配置的 tier identity；
   - 任一中间非法状态显示 diagnostics，不能导出。
6. 从旧 image 模式切到 image-string 时原子替换整个 `text` 分支，不保留 `prefix/x/y`；切回 image/font 时删除所有 tier bindings。UI 应明确提示这是互斥切换。
7. 导入旧 image package 不自动迁移；只有用户显式切换后才写新 schema。

### 6.8 扩展 symbolseditor Value Inspector

修改 `workspace-app.ts`、`resource-picker.ts`、`ui-session.ts` 和必要 CSS：

1. Value Inspector 的数字模式显示为：

```text
Font | 完整数值图片 | ImgNumber（按 tier）
```

2. `Spine tiers` 和 `Number presentation` 保持两个独立 section。数字 section 不嵌进 animation JSON，不显示第二份阈值编辑器。
3. image-string 模式按 tier 摘要显示 resolved range、dependency、slot 和 ready/error；每档可配置：
   - 已导入 ImgNumber dependency；
   - 该 tier skeleton 的 exact slot；
   - anchor x/y；
   - transform x/y/scale；
   - followSlotColor。
4. slot 候选来自当前 tier skeleton，而不是所有 tier slot intersection；没有 skeleton 或 metadata 时保持未就绪并阻止导出，不猜 `Num`。
5. dependency picker 只列 logical ImgNumber dependencies，不暴露内部 glyph PNG 让用户逐张绑定。
6. 资源页的 dependency 引用摘要同时显示普通 node 与 value-tier 引用。
7. 右侧 preview 的 Value 输入继续使用 positive safe integer；输入改变时由 rendercore resolve tier 并显示该档 ImgNumber，不写入 project，不复用普通 named-node 的 manual preview text。
8. mode/tier/dependency 切换后 preview 的旧 async resource 必须取消并销毁，错误进入现有 diagnostics/feedback。

UI 测试至少覆盖：

- 未导入 dependency 时 ImgNumber binding 不可伪完成；
- 导入两份 dependency 后给两档选择不同资源和不同 slot；
- mode 切换后 DOM 与导出都不存在另一分支字段；
- tier add/remove/move 后 binding 对齐；
- 被 value tier 引用的 dependency 不能删除；
- preview value 跨 tier 选择不同 resource；
- ZIP 导出/重新导入后配置、依赖和 exact closure 完全一致。

### 6.9 迁移 game002 CN

#### ImgNumber 资源

在 game002-s3 下建立可被 standalone ZIP 与 symbols package 共用的 canonical 目录：

```text
assets/game002-s3/dependencies/image-strings/cn-digits/
  image-string.manifest.json
  assets/
    u0030.png
    ...
```

执行要求：

1. 用 `apps/Imgnumbereditor` 或同一严格 schema 根据实际确认的 `0-1.png..7-1.png` 生成 manifest/资源；文件名仅是输入候选，不自动决定字符。
2. manifest id 使用稳定 kebab-case，例如 `cn-digits`；glyph path 使用 lowercase ASCII canonical path。
3. decoded size、lineHeight、offset、letterSpacing/fixedAdvance 必须由实际美术和视觉验收决定，不从完整数值图片宽度硬猜，不 resize/拉伸/字体替代。
4. 只声明真实存在且确认含义的 glyph。不要伪造 `8/9`。
5. 旧完整数值图片从 CN manifest、generated Vite closure、loading 和 dist closure 中移除。源文件是否保留必须先用 `rg` 确认是否有其它用途；若保留，报告说明它们已不属于 CN runtime closure，若删除则必须明确列出。

#### CN manifest

将 `CN.valuePresentation.text` 改为 `type: "image-string"`，为四个 tier 写四份显式 binding。当前若四档共用同一 `cn-digits`，也必须四次明确引用；通用测试和 editor 集成测试另用不同 dependency 证明 per-tier 可配置性。

每档 slot 必须从对应 `CN_1..CN_4.json` 实际检查，当前预期为 `Num`，但不能只凭旧配置写入。anchor/transform/followSlotColor 以数字在 slot 内居中、继承动画和颜色为验收，不在 app 建第二份表。

#### loading 与生命周期

1. regenerated file 导出 image-string manifest/glyph modules 和 loading resources；不再导入 `symbolValueTextImageModules` 的旧完整数值图片集合。
2. glyph texture 必须在 loading 0%–99% 的现有资源阶段进入 Pixi Cache；99% 之后不能出现先空白再补数字。
3. `prepareGame002At99()` 在创建 framework 前准备共享 image-string/value resource bundle，并和 live session 保持单 WebSocket 合同。
4. 若 bundle 或 live session 任一准备失败，回滚另一方；进入游戏后 ownership 转移给 entered game/framework，fatal cleanup 和 destroy 都释放一次。
5. `skin-config.ts` 只持有 manifest/module/static art config，不在 module scope 创建无法销毁的 image-string resource；若需要拆分 static skin 与 prepared skin，类型和调用点要清晰。
6. game002 app 仍只提供 `CN`/otherScene/value resolver，不操作 renderer、glyph、slot 或 tier index。

#### release check 与测试

更新 `verify-static-dist.mjs`：

- 断言 CN 使用 `image-string`，四档 binding 数与 tier 数一致；
- 逐档验证 resource、slot 和 tier skeleton；
- 验证 nested manifest/glyph source 与 dist 字节闭包；
- 断言旧完整数值图片不再作为 generated value-image/loading/dist 依赖；
- 继续排除宽泛 JSON/PNG、`CN_1..CN_4` display symbol、Nearwin/WM_Fx 等现有边界；
- 不把 `cn-digits`、`Num` 或四档语义写进 rendercore。

game002 测试至少覆盖：

- default candidates `1/2/5/10/25/50/100/250/500/1000` 都可由实际命中 tier dependency 渲染；
- rendercore/game002 资源测试使用具备所需 glyph 的专用 fixture 验证 `9/10/99/100/999/1000` tier 边界和对应数字 binding；真实 `cn-digits` 只对其实际 glyph 集负责，若不含 `9`，实际 value `9/99/999` 必须走下一条 fail-fast 回归而不是伪造成功；
- 当前 glyph 集不支持的字符显式失败，无 image/font fallback；
- initial spin、dropdown、refill、cascade collect 和 global win-amount 期间数字仍跟随 occurrence/player 并持续 update；
- next spin、fatal cleanup、mount rollback、destroy 无 resource/slot 泄漏；
- loading 资源、generated file、release dist 精确闭合。

### 6.10 文档与 agents.md

更新直接相关文档，至少包括：

```text
packages/rendercore/README.md
docs/image-string-manifest.md
docs/symbol-package.md
apps/symbolseditor/README.md
apps/game002/README.md
apps/symbolsviewer/README.md（若现有文档描述 value 资源）
```

文档必须说明：

- `font|image|image-string` strict union；
- image 与 image-string 互斥；
- image-string 每 tier binding、共享 resource 与 exact slot；
- dependency vendoring、exact glyph closure、缺字 fail-fast；
- editor mode 切换和 per-tier 配置流程；
- game002 当前实际 glyph 集与限制。

本任务必须更新根级小写 `agents.md`，因为当前文本仍明确写着 game002 `text.type=image,prefix=./`，并把 `CN.valuePresentation` 称为 legacy compatibility。更新后应明确：

- rendercore 拥有 value-tier ImgNumber resource pool、exact closure、slot attach/detach 和生命周期；
- symbolseditor 只拥有 dependency/UI/draft/ZIP 配置；
- game002 CN 当前使用 manifest-driven per-tier image-string binding；
- 完整数值图片与 ImgNumber 互斥，缺 glyph/slot/resource 显式失败；
- app 不硬编码 tier 数、glyph、slot 或 renderer。

只修改与本任务真实合同冲突的条目，不重写整个 agents.md。

## 7. 建议文件改动清单

实施者应以 live `rg` 结果为准；以下是已知最小范围：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/symbol-value-presentation/types.ts
packages/rendercore/src/symbol-value-presentation/value-display.ts
packages/rendercore/src/symbol-value-presentation/create-symbol-value-presenter.ts
packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
packages/rendercore/src/symbol-image-string/resources.ts
packages/rendercore/src/symbol-image-string/types.ts
packages/rendercore/src/**/index.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/**
packages/rendercore/tests/symbol-value-presentation/**
packages/rendercore/tests/symbol-image-string/**

apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/ui/resource-picker.ts
apps/symbolseditor/src/ui/ui-session.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/**

assets/game002-s3/symbol-state-textures.manifest.json
assets/game002-s3/dependencies/image-strings/cn-digits/**
apps/game002/src/generated/symbol-value-resources.generated.ts
apps/game002/src/skin-config.ts
apps/game002/src/loading-resources.ts
apps/game002/src/game-entry.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/tests/**

apps/symbolsviewer/src/**（仅 value resource async 装配/预览所需）
apps/symbolsviewer/tests/**

packages/rendercore/README.md
docs/image-string-manifest.md
docs/symbol-package.md
apps/symbolseditor/README.md
apps/game002/README.md
agents.md
```

禁止手改：

```text
apps/game002/src/generated/symbol-value-resources.generated.ts
```

它必须通过 generator 生成并通过 `--check`。

## 8. 验证命令

所有命令在同一次 `nvm use 24` 后执行。先运行聚焦测试，再运行包级门禁：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore build

pnpm --filter symbolseditor test
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor build

pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer build

pnpm --filter game002 generate:symbol-value-resources
pnpm --filter game002 check:symbol-value-resources
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 lint
pnpm --filter game002 release:check
```

再执行受影响范围 format check；若工作区允许且耗时可接受，补根级门禁：

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

不要为了让根级无关旧失败通过而改任务外 production。报告中必须区分：本任务通过、现有无关失败、因环境/依赖导致未运行。

## 9. 手工验收

### 9.1 symbolseditor

1. 启动编辑器，导入含 game002 CN 的 symbols package 或用 game config 建项目并上传相应资源。
2. 导入至少两份 standalone ImgNumber ZIP。
3. 启用/打开 CN Value，确认 Spine tier 与 Number presentation 是两个独立 section。
4. 选择 ImgNumber 模式，为不同 tier 选不同 dependency 和 slot；确认不存在完整图片 prefix 字段。
5. 输入跨 tier 的 preview values，确认 Spine 档位和 ImgNumber 均切换正确。
6. 增删移动 tier，确认 binding 不串档、不静默继承，未配置项阻止导出。
7. 尝试删除被 tier 引用的 dependency，确认失败并显示精确引用位置。
8. 导出 ZIP、重新导入、再次导出，比较 manifest 和 resource closure 稳定一致。
9. 切回完整数值图片模式，确认 ImgNumber tier fields 从 manifest 完全消失，而非隐藏残留。

### 9.2 game002

1. 使用合法 URL 参数进入 game002，确认 loading 99% 前完成 nested manifest/glyph texture 加载，100% 后 CN 首帧不空白。
2. 观察四档 CN，数字挂在各自 `Num` slot 内并随 Loop/Start/Win_Start/Win/Collect/End 动画移动和着色。
3. initial spin 与 selective refill 中数字随实际 occurrence 滚动，最终 otherScene value 覆盖正确。
4. dropdown 相同 value/tier 不重播 Loop；value 跨 tier 时切换相应 art 与 ImgNumber binding。
5. CN collect、cascade、global win-amount 期间正常逐帧更新。
6. 下一 spin、返回/销毁、故意制造加载失败时无残留 slot object、纹理或双 WebSocket。
7. 检查 production dist：包含 exact nested manifest/glyph，不再包含 CN 旧完整值图片作为 runtime closure，不包含额外 glyph/resource glob。

## 10. 完成定义

只有同时满足以下条件才算完成：

- manifest 和 public type 能严格表达独立 tier art + per-tier ImgNumber；
- font/image 旧能力不回归，image 与 image-string 完全互斥；
- rendercore 复用现有 image-string parser/layout/renderer/slot API，无 consumer 算法复制；
- nested resource/glyph closure 在 files/Vite/loading/dist 全链路精确且可销毁；
- symbolseditor 能导入、配置不同 tier dependency、预览、导出和 round-trip；
- game002 CN 已真正迁移到 ImgNumber，不再双写完整数值图片模式；
- symbolsviewer 能加载迁移后的 CN；
- 缺 glyph、slot、resource、binding 或非法 value 全部 fail-fast，无不必要 fallback；
- generated file 由命令重生成并通过 check；
- 相关测试、typecheck、lint、build、game002 release check 已通过，或报告明确列出非本任务旧失败；
- 文档和根级 `agents.md` 与新合同一致；
- 已生成中文任务报告。

## 11. 任务报告内容

报告至少包含：

1. UTC 时间、branch、起止 HEAD、Node/pnpm 版本与路径；
2. 实际修改文件和职责摘要；
3. 最终 manifest schema 与互斥规则；
4. rendercore resource pool、async rollback、slot attach/detach 和 destroy 设计；
5. symbolseditor 的 mode/tier/dependency 交互与 round-trip 结果；
6. game002 实际 ImgNumber manifest、glyph 字符集、每档 binding、旧完整图片处理；
7. generated/loading/dist 精确闭包变化；
8. 执行过的全部命令、结果、耗时明显异常与代理是否使用；
9. 测试 fixture 调整说明，确认没有为测试加入 production fallback/硬编码；
10. `agents.md` 和文档更新摘要；
11. 已知限制、未完成项（若有）和复现方式；
12. 最终 `git status --short --untracked-files=all`。

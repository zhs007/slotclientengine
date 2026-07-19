# popup editor award celebration bootstrap 任务计划

## 1. 任务目标

本任务新增一个纯前端弹窗动画编辑器：

```text
apps/popupeditor
```

弹窗体系未来至少包含两类：

- 普通弹窗：触发免费游戏、免费游戏庆祝等一次性或简单循环弹窗；
- 获奖庆祝：根据 `win / bet` 进入不同金额档位、金额持续递增，并支持点击跳档与退出的 big win 类弹窗。

本任务只实现第二类“获奖庆祝”。普通弹窗只允许在 manifest 顶层预留可判别的类型扩展点，不实现 UI、runtime、假 schema 或空目录。

任务完成后，美术/配置人员应能：

1. 通过统一的“上传资源 / 上传文件夹”把 image、VNI、official Spine 4.3 和 standalone ImgNumber ZIP 导入资源库；导入器按内容和完整依赖严格识别，先展示 import review，确认后一次提交。上传只建立 logical resource，不自动绑定到档位或图层。
2. 分别配置 `base`、`standard`、`bigwin`、`superwin`、`megawin` 五个金额档位；`base` 固定覆盖 `0 < win / bet <= 1`，`standard` 覆盖 `1 < win / bet < bigwin threshold`，后三档通过显式 bet 倍数阈值进入。
3. 明确配置 bigwin、superwin、megawin 的 `thresholdMultiplier`；初始项目可以填入当前 game003 等价默认值 `15 / 30 / 50`，但导出的 manifest 必须显式保存，runtime 和 game app 不得另存第二份。
4. 为每个档位独立配置有序图层、位置、统一缩放和资源播放；不同档位可复用同一 logical resource，也可使用完全不同的资源。
5. 每个档位的 `start / loop / end` 三个播放段都必须至少有一个动态 ImgNumber 金额图层覆盖；同一个 ImgNumber 图层可以覆盖三段，也可以让三段分别引用不同的 standalone image-string dependency，并分别配置 anchor、位置和缩放。
6. VNI 图层配置三段式播放的两个时间点：`loopStartTime`、`loopEndTime`；进入档位播放 start，停在 loop，离开档位或 dismiss 时播放 end。`keepParticlesAlive` 新建时默认勾选，导出 manifest 时必须显式写布尔值。
7. Spine 图层配置大小写精确的三个动画名：`startAnimation`、`loopAnimation`、`endAnimation`；start/end once、loop loop，不猜 skeleton 第一段动画、不回退静态首帧。
8. 在预览区选择常用或自定义分辨率，以屏幕中心作为 `(0, 0)`，输入 bet 和最终 win 金额，真实观看金额递增、档位切换、点击跳档、等待退出和 dismiss。
9. 导出并重新导入 `<popup-id>-popup.zip`；ZIP 包含唯一 production `popup.manifest.json` 与精确传递资源闭包。
10. 在 `gamelayouteditor` 中导入该 popup ZIP，把它作为获奖庆祝 overlay 绑定到 layout；popup 内部坐标仍以自身中心为原点，layout 只按 variant 配置相对于当前 viewport 中心的 root offset 和 scale。
11. 最终 production 汇总产物仍是 `gamelayouteditor` 导出的 `<layout-id>-layout.zip`。popup ZIP 是独立编辑和传输用中间产物，不要求游戏同时维护 popupeditor project、旧 win-amount manifest、YAML 阈值或 app 内图层表。
12. rendercore 从最终 layout package 的 vendored popup dependency 创建完整播放器。游戏调用方只提交当轮 `betAmountRaw`、`winAmountRaw`，再逐帧 `update()` 和转发点击；阈值、金额格式、计数时长、图层、资源、三段式、位置和退出行为全部来自 manifest/runtime。
13. popupeditor 从第一版就采用 logical resource 与 production path 分离：来源文件名只用于 provenance/id 建议，owned payload 导出为完整 SHA-256 content-addressed `assets/<hash>.<ext>`；VNI project、Spine atlas/texture mapping 和 popup manifest 必须结构化改写到最终路径。

本文件是完整实施合同。执行者不能依赖聊天记录、任务 88、98、102、107、其它任务计划/报告或口头说明来补全产品行为。可以阅读现有实现作为迁移输入，但若与本合同冲突，以本合同为准。

完成后必须新增中文任务报告：

```text
tasks/108-popup-editor-award-celebration-bootstrap-[utctime].md
```

UTC 时间戳固定使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/108-popup-editor-award-celebration-bootstrap-260401-181300.md
```

## 2. 已确定的产品与架构决定

### 2.1 “档位”与动画“三段式”是两套概念

为避免 UI、manifest 和 runtime 混用术语，本任务固定：

- `tier` / 档位：`base`、`standard`、`bigwin`、`superwin`、`megawin`；由最终 win、bet 和阈值决定。
- `segment` / 播放段：单个 VNI/Spine 图层内部的 `start -> loop -> end` 生命周期。

“每个阶段至少一个 ImgNumber”按更严格语义落实：每个 tier 内的 `start / loop / end` 三个 segment 都必须被至少一个动态 ImgNumber 金额图层覆盖。一个 ImgNumber layer 可以声明同时覆盖三段；也可以为 start、loop、end 建立三个 layer，并引用不同的 image-string dependency。进入新 segment 时，新显示的金额 layer 必须立即收到当前 displayed amount；不能先闪默认字符串或空白。

全局 segment 由 tier stage controller 统一协调：

- 进入 tier 时所有 VNI/Spine 动画图层开始各自 start，静态/image-string layer 按 `visibleSegments` 显示 start 集合；
- 全部动画图层到达真实 loop boundary 后，全局 segment 才变为 loop；没有动画图层时在同一个确定 update boundary 进入 loop；
- 请求离开 tier/dismiss 后进入 end，切换静态/image-string layer 集合，并请求全部动画图层完成 end；
- 金额计数从 tier start 边界开始推进，不要求等待所有动画进入 loop；若计数先完成，end request 排队到合法动画边界执行；
- 全部 end 和 live particles 完成后，该 tier 才结束。旧 tier 可在新 tier 后方排空，但各自 segment/snapshot 必须独立。

### 2.2 固定五个金额档位

获奖庆祝 v1 固定且只允许：

```text
base -> standard -> bigwin -> superwin -> megawin
```

边界语义固定：

- `winAmountRaw === 0`：不展示，直接完成。
- `0 < win / bet <= 1`：只播放 `base`，从 0 递增到最终金额。
- `1 < win / bet < bigwin.thresholdMultiplier`：先播放 `base` 到 `1 × bet`，再播放 `standard` 到最终金额。
- `win / bet >= bigwin.thresholdMultiplier`：先经过 base/standard，再按严格递增阈值进入所有已达到的 celebration tier。
- 最终值刚好等于 big/super/mega 阈值时，必须进入该档；阈值比较不能用浮点 ratio 相等判断，应使用安全整数交叉相乘或等价无精度损失算法。

`base` 的上界固定为 `1 × bet`，不能在 manifest 修改。big/super/mega 阈值必须是 positive safe integer，且满足：

```text
1 < bigwin < superwin < megawin
```

`standard` 没有独立阈值，它的上界由 bigwin 阈值唯一决定。这样既保留当前 game003 的 `minor 0..1x` 与 `major 1x..15x` 语义，又消除 YAML thresholds 和 VNI manifest thresholds 的双写。

### 2.3 每个档位是完整、独立的 presentation

每个档位都必须显式保存：

- `countDurationSeconds`：该档位金额从进入值增长到离开值/最终值的时间；允许 `0` 表示立即完成，不能用缺省值猜测。
- 非空 `layers[]`；`order` 在该档位内唯一。
- 对 `start / loop / end` 每一段，都至少有一个 `kind: "image-string"`、`binding: "win-amount"` 且 `visibleSegments` 覆盖该段的图层。
- 每个图层自己的 resource 引用、`x/y/scale` 和类型专属播放配置。

不要保留当前 `minorTextPosition`、`majorTextPosition`、Pixi `TextStyle` 或 app 内 `tierStageRect` 作为第二套表现入口。获奖庆祝 production 路径只使用 image-string 金额图层；缺 ImgNumber、缺 glyph 或格式化字符串无法渲染时显式失败。

### 2.4 最少运行期输入

游戏调用获奖庆祝时只需要业务输入：

```ts
interface AwardCelebrationInput {
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
}
```

- `betAmountRaw` 必须是 positive safe integer。
- `winAmountRaw` 必须是 non-negative safe integer。
- raw 单位由 manifest 的 `amountFormat.rawScale` 定义，例如 `100` 表示服务器整数 `100 -> 1.00`。
- formatter、currency/prefix/suffix、阈值、档位时长、视觉和布局不再由 game app 注入。
- threshold comparison 用 `BigInt(winAmountRaw)`、`BigInt(betAmountRaw)` 和 safe-integer multiplier 做精确比较；不得先计算浮点 ratio 或让 `bet * multiplier` 在 Number 中溢出。
- preview 输入和当轮玩家金额是运行期/session state，绝不写入 popup/layout manifest 或 ZIP。

### 2.5 中心原点与分辨率

popupeditor 的坐标系固定：

```text
屏幕中心 = (0, 0)
右 = +x
下 = +y
```

`designViewport.width/height` 保存编辑时的参考画布和重新导入后的默认预览分辨率，但 runtime 不用它做 contain、cover、fit、裁切或自适应缩放。所有 image/VNI/Spine/image-string 都按资源真实 100% 尺寸、图层显式 scale 和中心坐标渲染。

popupeditor 的 preview zoom 只改变编辑器显示比例，不进入 manifest。常用分辨率和 custom width/height 只改变预览边框/裁切范围，不改变图层坐标。

gamelayouteditor 绑定 popup 时，每个 active variant 只配置：

```text
viewport center offset x/y + uniform root scale
```

这个 offset 相对最终 Pixi viewport 中心，而不是 background art 原点、reel frame、focus rect 或 DOM 页面左上角。rendercore 在每次 `applyViewport()` 时重新定位 popup root；game app 不复制这段映射。

### 2.6 点击和退出语义保持 game003 已验证行为

第一版点击行为固定，不做自由脚本编辑：

- base/standard 播放中且最终金额未达到 bigwin：第一次点击直接显示最终金额并进入 `awaiting-dismiss`，下一次点击 dismiss。
- base/standard 播放中且后面存在已达到的 celebration tier：点击跳到下一个 celebration tier 起点。
- bigwin/superwin/megawin 播放中：点击完成当前金额段并进入下一个已达到档位；若当前是最终已达到档位，则显示最终金额并进入 `awaiting-dismiss`。
- `awaiting-dismiss` 再点击：并行请求当前档位所有 VNI/Spine 图层播放 end；全部 end 和 live particle drain 完成后隐藏并完成。
- 下一次合法 spin 开始可调用 `dismissImmediately()` 清理遗留展示，不等待 end。
- 档位切换时，旧档位 end 允许在新档位 start 后方排空，保持当前 game003 的连续视觉；runtime 必须跟踪并销毁全部 active/ending layer，不能泄漏。
- 金额动画进入 `awaiting-dismiss` 后不再阻塞 `playSpin()`；这仍由 game orchestration 以 runtime snapshot 判断，popup manifest 不硬编码 game002/game003 或 component name。

### 2.7 复用现有底层，不复制 runtime

必须复用：

```text
packages/rendercore/src/image-string/**
packages/rendercore/src/spine/**
packages/vnicore/**
packages/rendercore/src/scene-layout/**
packages/browserartifactio/**
```

- image-string parser、glyph closure、Unicode code-point layout、Sprite 生命周期和 `setText()` 不得复制。
- Spine 必须走 rendercore 封装的 official `spine-pixi-v8` 4.3.x 底层；不得新增 4.2/3.8 adapter。
- VNI 必须使用 `VNIPlayer` public segmented API 和 live particle drain；不得在 editor 或 popup runtime 复制 VNI timeline/effect/particle 算法。
- 现有 `packages/rendercore/src/win-amount/**` 的金额阶段、点击、VNI tier 能力应迁移/重构为新 popup runtime 的内部基础。不得长期保留旧 `vni-win-amount-tiers` schema 与新 `award-celebration` schema 两套 production player。

### 2.8 popupeditor 直接采用任务 110 的资源模型

任务 110 后续会统一现有 ImgNumber Editor、Symbols Editor 和 Game Layout Editor。本任务不提前迁移这三个编辑器，但 `apps/popupeditor` 是新项目，没有 legacy draft 负担，因此必须从第一版直接采用以下目标模型，避免随后再做一次破坏性迁移。

#### Logical id

- logical resource id 是 editor 内稳定身份，不是 production 文件名。
- 新资源 id 建议从明确 primary source basename 的最后一个扩展名前 stem 派生：Unicode NFC、ASCII lowercase、连续空格/点/下划线/连字符折叠为 `-`、删除首尾 `-`，最终匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。
- `BG_2.PNG -> bg-2`，`Mini.BK.PNG -> mini-bk`。不能可靠得到 ASCII id 时，import review 要求用户显式填写。
- id 冲突不得自动覆盖、合并或追加随机后缀；用户可在 review 中改建议 id，确认时仍冲突则整批失败。
- replace 永远保留既有 logical id；source 文件名变化不改变 layer binding。
- tier id、layer id、popup package id、image-string dependency id 与 resource id 是不同 schema 身份，不能共用一个归一化操作偷偷改写。

#### Content-addressed owned payload

- popup package 自有 payload 的 production path 固定为 `assets/<64-char-lowercase-sha256>.<canonical-extension>`。
- hash 使用最终 canonical bytes 的完整 SHA-256；浏览器优先复用/扩展 `packages/browserartifactio` 的 Web Crypto helper，不在 popupeditor 私有实现弱 hash、Node-only hash、随机/时间戳路径或截断 hash。
- canonical extension 从已验证媒体类型派生，不能盲信上传扩展名。
- 相同 canonical bytes + extension 在 popup package 中只存一份 blob/path，但 logical resources 仍独立，不能因去重合并 id、layer transform 或 playback。
- replace 后 content path 随 bytes 改变，logical id、引用、selection 保持；旧 blob 只有在无 resource/dependency 引用后才释放。
- hash collision（相同 path、不同 bytes）显式失败，绝不覆盖。

popupeditor typed draft 至少分离：

```ts
interface PopupEditorAssetBlob {
  readonly digest: string;
  readonly extension: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

interface PopupEditorResourceProvenance {
  readonly sourceNames: readonly string[];
  readonly sourceKind: "files" | "directory" | "zip" | "package-import";
  readonly batchLabel: string;
}

interface PopupEditorLogicalResourceBase {
  readonly id: string;
  readonly kind: "image" | "image-string" | "vni" | "spine";
  readonly provenance: PopupEditorResourceProvenance;
}
```

blob store 以 `digest + canonical extension` 为 key。clone/transaction/preview 不得共享可变 `Uint8Array`；hash、decode、metadata 和完整 dependency prepare 全部成功后才提交。

#### Source index 与结构化 materialization

- `File.name` / `webkitRelativePath` 只用于当次导入依赖解析和 provenance，不直接进入 manifest/ZIP。
- source path 拒绝 absolute/drive/backslash/空 segment/`.`/`..`/NUL/URL/query/hash/percent escape/NFC collision；ASCII case-fold collision 整批失败。
- 内部引用先 exact source match，找不到时只允许唯一 ASCII case-fold match；歧义、缺失和未消费文件都在 review 阶段失败。
- VNI asset refs、Spine atlas pages/texture mapping 和 popup resource paths 必须通过各格式 owner 的结构化 API改写。禁止对 JSON/atlas 做全局字符串替换、正则猜路径或 basename fallback。
- 依赖图按 leaf payload -> rewritten atlas/VNI project -> popup manifest 的顺序物化；每个结构化文件对最终 canonical bytes 求 hash，不能拿含旧 source path 的临时 bytes 计算 production path。
- standalone image-string 是自包含 dependency，vendor 时只增加 `dependencies/image-strings/<id>/` 前缀，不把 glyph 提升到 popup `assets/`，也不由 popupeditor 重新 hash/改写 nested bytes。

#### 统一入口与 import review

- popupeditor 资源区只提供“上传资源”和“上传文件夹”两个普通入口；可选择多文件、目录或已知 ZIP。
- importer 按内容识别 raster image、完整 VNI group、完整 Spine group、standalone image-string ZIP/目录。不能只看扩展名或根据“只有一个候选”自动拼组。
- popup package ZIP 是顶层“导入项目”流程，不当成普通 resource；未知 ZIP、ZIP 内 ZIP 和缺 root sentinel 的 ZIP 显式失败。
- parse 完成、project commit 前显示 proposed id（可编辑）、kind、primary source、dependency count、尺寸/动画摘要、引用/冲突状态、未消费文件、歧义、文件数和总 bytes。
- 只有 review 无 error 才能确认；确认是一次 transaction，取消或失败不改变 project、selection、preview、Blob URL。

#### 与任务 110 的边界

- 本任务只让 popupeditor 使用上述模型，不迁移 `apps/Imgnumbereditor`、`apps/symbolseditor` 或 `apps/gamelayouteditor` 现有 image/Spine/VNI/image-string 资源 UI/model/path，也不宣称完成任务 110。gamelayouteditor 仍只做第 11 节规定的 popup dependency 最小增量。
- 若 `browserartifactio` 缺少 popupeditor 必需的通用 id/hash/source-index/flat allocator 原语，可以做最小、无 editor 语义的共享扩展并补单测；不得顺手迁移其它 editor。
- popupeditor vendoring 到 gamelayouteditor 时，父 editor 只把已验证 popup package 当自包含 dependency；在任务 110 真正执行前，不要求 gamelayouteditor 重写 nested popup 的 hash-flat 内部结构。

## 3. 范围

### 3.1 包含

- `apps/popupeditor` 的 Vite/TypeScript/Pixi v8 脚手架、resource-first UI、typed draft/store、preview、严格校验、ZIP import/export、测试和 README。
- popupeditor 专属的统一 files/folder/known-ZIP discovery、import review、logical id/provenance/blob graph、SHA-256 hash-flat owned payload 和结构化 materialization。
- `packages/browserartifactio` 中 popupeditor 确实需要且当前缺失的最小通用 id/hash/source-index/flat-allocation 原语；只提供无 Pixi/无 editor 业务语义的能力和测试。
- `packages/rendercore` 通用 popup package schema/parser、精确 closure、files/CDN resource loader、award celebration player、image/VNI/Spine/image-string layer runtime、snapshot 和生命周期。
- `gamelayouteditor` 导入/替换/删除 popup dependency、layout 绑定、variant placement、preview、deterministic vendoring、重新导入和 production package runtime 接入。
- 新的 `popup.manifest.json` production 合同和文档。
- 把 current game003 bigwin/superwin/megawin VNI 资源表达为新 popup manifest/package，并用等价 fixture 验证阈值、2.9 秒 VNI project、`1 / 2.5` segmented 边界、点击和 dismiss 行为。
- 只有在真实 game003 ImgNumber dependency 已提供并通过严格 glyph 校验后，才迁移 `apps/game003` production win-amount 到新 runtime；不得用字体、CN digits 或临时生成图片顶替。
- game002 使用同一套旧 win-amount 资源，至少完成 parser/runtime 等价 fixture；若本任务切除旧 public API，则必须同步迁移 game002，不能保留第二套 player。
- build/static loading、exact Vite module closure、dist 验证和相关生成物更新。
- README、manifest 文档、rendercore ownership 文档，以及必要时的根 `AGENTS.md` 更新。
- 完整中文任务报告。

### 3.2 不包含

- 不实现触发免费、免费庆祝或其它普通 popup editor/runtime。
- 不实现时间轴拖拽编辑、关键帧编辑、VNI/Spine 内容编辑、图像加工、glyph 制作或自动生成 ImgNumber。
- 不做后端、上传服务、数据库、账号、云素材库、在线协作、localStorage、IndexedDB 或 File System Access API。
- 不把 bet、win、token、cookie、GMI、服务器 scene、真实轮带或 randomNumbers 写入静态 manifest。
- 不允许 canvas 拖动图层回写坐标；位置和 scale 通过 Inspector 明确修改，preview 只负责呈现。
- 不自动迁移全部 game002/game003 scene layout/YAML。gamelayouteditor 必须能输出最终含 popup dependency 的 layout package，但已有游戏其它专属业务组件是否整体迁入 layout 仍按其各自任务边界处理。
- 不迁移或统一 ImgNumber Editor、Symbols Editor、Game Layout Editor 的上传入口、logical resource store 或 content-addressed owned path；这些仍属于任务 110。
- 不实现 texture atlas packing、图片转码、压缩质量调整、CDN 上传或跨 package 全局去重；content addressing 只在单个 popup package ownership 内生效。
- 不为旧 manifest 添加静默 alias、宽松 unknown key、默认动画、placeholder、字体 fallback 或缺资源 fallback。

## 4. 当前仓库基线与执行保护

制定本计划时现场为：

```text
root:   /Users/zerro/github.com/slotclientengine
branch: main
HEAD:   e4e0250
status: ?? tasks/110-editor-resource-management-unification.md
shell:  node 不在 PATH；pnpm 为 Codex bundled fallback
```

`tasks/110-editor-resource-management-unification.md` 是用户已有未跟踪文件，和本任务无关。实施者必须保护它以及执行时出现的全部已有修改/未跟踪资源；禁止 reset、checkout、stash、clean 或覆盖。

实施开始重新记录：

```bash
cd /Users/zerro/github.com/slotclientengine
git branch --show-current
git rev-parse --short HEAD
git status --short --untracked-files=all
command -v node || true
command -v nvm || true
command -v pnpm || true
```

仓库要求 Node `>=24.0.0`。如果当前 shell 没有 node，先加载机器已有 nvm，再执行：

```bash
nvm use 24
hash -r
node --version
pnpm --version
command -v node
command -v pnpm
```

后续 install、生成、test、lint、typecheck、build 必须统一使用这次 `nvm use 24` 后同一套 node/pnpm。不要全局安装 pnpm，不要强制调整仓库或 package 的 Node/pnpm 版本。

依赖安装/下载真实失败时才设置代理并重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

如果测试/fixture 因旧合同要求 production 加双写、fallback、硬编码或奇怪分支，应修改测试，使其验证新合同；不要扭曲正确生产实现来迁就旧测试。

## 5. 当前实现事实与必须重新盘点的文件

### 5.1 当前 win-amount 限制

当前主要实现：

```text
packages/rendercore/src/win-amount/types.ts
packages/rendercore/src/win-amount/win-amount-player.ts
packages/rendercore/src/win-amount/win-amount-stage.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/tests/win-amount/**
```

已确认事实：

- player 已有 base/minor、standard/major、tier counting、点击跳档、`awaiting-dismiss`、VNI end 和 ending tier drain 的大部分正确语义。
- tier effect 只支持 VNI；不支持 image、Spine、多图层或每档不同 ImgNumber。
- 金额仍用 Pixi `Text`；位置和字体样式由 app config 注入。
- `WinAmountAnimationConfig` 同时接收 app `thresholdMultipliers` 和 manifest tier threshold，game003 还用 `assertGame003WinAmountTierThresholds()` 比对两份值。
- `amountScale/currency/locale`、minor/major duration、thresholds、text/layout 仍在 game003 YAML/generated static config；当前 manifest 只描述 big/super/mega VNI project 和 segmented timing。

这部分应作为迁移输入，不能复制改名后保留两套状态机。

### 5.2 当前 game002/game003 资源

```text
assets/game002-s3/win-amount/win-amount.manifest.json
assets/game003-s1/win-amount/win-amount.manifest.json
assets/game00{2,3}-s*/win-amount/{bigwin,superwin,megawin}.json
assets/game00{2,3}-s*/win-amount/assets/**
apps/game002/src/win-amount-config.ts
apps/game003/src/win-amount-config.ts
apps/game003/config/game-static.yaml
apps/buildgamestatic/src/win-amount-manifest.ts
apps/buildgamestatic/src/{types,yaml-loader,generator}.ts
packages/gameframeworks/src/static-config/{types,validate}.ts
```

当前两套旧 manifest 都是：

```text
kind: vni-win-amount-tiers
thresholds: 15 / 30 / 50
VNI duration: 2.9
loopStartTime: 1
loopEndTime: 2.5
keepParticlesAlive: true
```

这些数值应进入新 game fixture 的唯一 popup manifest。迁移完成后，生产代码/YAML/generated config/测试不得再维护另一份 `15/30/50` 或 `1/2.5/2.9`。

制定计划时仓库只有 `assets/game002-s3/dependencies/image-strings/cn-digits/image-string.manifest.json`，没有 game003 bigwin 金额专用 standalone ImgNumber。执行者必须重新确认：

```bash
find assets -name image-string.manifest.json -print | sort
```

`cn-digits` 属于 game002 CN symbol，不能自动复用为获奖庆祝金额美术。现有 win-amount VNI asset 中类似 `1_asset_*.png` 的文件是 VNI project 引用资源，不能根据文件名猜成 `0..9` glyph。production game003 迁移前必须取得/制作并由 Imgnumbereditor 导出真实 standalone ZIP；缺失时应保留 editor/runtime/gamelayout integration 的完整实现和 fixture，但明确报告 game003 production 切换被真实美术输入阻塞，不能用 Pixi Text 或 placeholder 假装完成。

### 5.3 当前可复用 editor/package 能力

实施前至少重新阅读：

```text
apps/gamelayouteditor/src/model/**
apps/gamelayouteditor/src/io/**
apps/gamelayouteditor/src/preview/**
apps/gamelayouteditor/src/ui/**
apps/Imgnumbereditor/src/**
apps/symbolseditor/src/model/**
apps/symbolseditor/src/io/**
packages/browserartifactio/src/**
packages/rendercore/src/scene-layout/**
packages/rendercore/src/image-string/**
packages/rendercore/src/spine/**
packages/vnicore/src/**
docs/scene-layout-manifest.md
docs/image-string-manifest.md
AGENTS.md
```

应复用的已存在模式包括：

- resource-first logical library、typed Picker、引用保护和原子 replace；
- bounded ZIP import、canonical path、deterministic export、exact closure；
- standalone image-string dependency 导入与 vendoring；
- official Spine 4.3 skeleton/atlas/pages/animation metadata 校验；
- VNI project/asset 精确解析和外部 Pixi parent；
- gamelayouteditor 的 variant、fixed preview、layout package nested dependency 和组合 runtime。

## 6. Ownership 边界

```text
apps/Imgnumbereditor
  glyph/metrics 编辑、standalone image-string ZIP

apps/popupeditor
  popup logical resource/blob/provenance graph、import review、tier/layer draft、UI/session、preview、ZIP orchestration

packages/browserartifactio
  通用 id 建议、Web Crypto SHA-256、bounded source index、case-fold resolution、flat content path allocator、ZIP

apps/gamelayouteditor
  导入 popup package、layout-level overlay binding、variant root offset/scale、最终汇总 ZIP

packages/rendercore/image-string
  glyph parser/layout/resource/renderer/setText 生命周期

packages/rendercore/spine + packages/vnicore
  official Spine / VNI 播放底层与真实 completion/particle drain

packages/rendercore/popup
  popup schema、资源闭包、award tier sequence、layer composition、点击、snapshot、destroy

packages/rendercore/scene-layout
  vendored popup dependency、viewport-center placement、组合 runtime update/destroy/API

game app
  提交 bet/win、逐帧 update、转发 advance、下一 spin 清理；不拥有 tier/layer 算法
```

shared 包不得硬编码 game002、game003、bg-wins、bg-win、USD、bigwin VNI 文件名或具体 ImgNumber id。`bigwin/superwin/megawin` 是本次通用 award-celebration v1 schema 的档位 id，不代表 game component name。

popupeditor 自己不得复制 SHA-256、source path safety/case-fold、flat allocator 或 ZIP 基础算法；format-specific VNI/Spine/image-string 路径解释仍由 vnicore/rendercore 提供，不能塞进 browserartifactio。

## 7. Popup package v1 manifest 合同

### 7.1 ZIP 与顶层

独立编辑器产物固定：

```text
<popup-id>-popup.zip
  popup.manifest.json
  assets/**
  dependencies/image-strings/<id>/image-string.manifest.json
  dependencies/image-strings/<id>/assets/**
```

顶层推荐并固定为：

```ts
interface PopupManifestV1 {
  readonly version: 1;
  readonly kind: "popup";
  readonly id: string;
  readonly type: "award-celebration";
  readonly designViewport: { readonly width: number; readonly height: number };
  readonly amountFormat: PopupAmountFormat;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
  readonly awardCelebration: AwardCelebrationSpec;
}
```

规则：

- 所有对象递归拒绝 unknown key；不接受 `null` 代替省略，不保留旧字段 alias。
- id 匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；package path 是 lowercase POSIX 相对路径，拒绝绝对路径、反斜杠、`.`、`..`、空 segment 和 case collision。
- `designViewport` 是有限正数，只定义编辑边框，不触发 runtime fit。
- `resources` id 唯一；未被任一档位引用的 logical resource 可以留在 editor session，但禁止进入 production manifest/ZIP。
- production manifest 与 ZIP 的闭包必须完全相等；缺文件和 orphan 文件都失败。
- `resources` record key 是 popup production logical resource id；owned resource path 必须是 `assets/<full-sha256>.<canonical-ext>`。用户 source basename、source directory、upload batch 和 provenance 不得进入 manifest/ZIP。
- exact canonical content path 可以被多个 resource id 复用，ZIP byte store 只保留一份；这不会合并 resource playback 或 layer identity。

### 7.2 金额格式

不要在 manifest 保存 JS formatter 或依赖宿主 locale。使用确定性格式：

```ts
interface PopupAmountFormat {
  readonly rawScale: number;
  readonly fractionDigits: number;
  readonly useGrouping: boolean;
  readonly groupSeparator: string;
  readonly decimalSeparator: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly rounding: "floor";
}
```

约束：

- `rawScale` 是 positive safe integer；`fractionDigits` 是 `0..6` safe integer。
- `prefix/suffix/separator` 都是普通字符串，但不得含控制字符或换行。
- 插值金额先按 `floor` 变成 non-negative safe integer raw，再做精确整数除法和字符串拼接；最终帧必须严格等于 `winAmountRaw`。
- prepare 时对所有被绑定的 image-string dependency 校验 `0..9` 以及 amountFormat 固定字符的 glyph 覆盖；运行中仍由 `setText()` 对实际字符串严格校验。
- 不依赖 `Intl` 的环境空格/货币符号差异，不回退字体。

### 7.3 Resource union

```ts
type PopupResourceSpec =
  | {
      readonly kind: "image";
      readonly path: string;
      readonly size: { readonly width: number; readonly height: number };
    }
  | {
      readonly kind: "image-string";
      readonly manifest: string;
    }
  | {
      readonly kind: "vni";
      readonly project: string;
    }
  | {
      readonly kind: "spine";
      readonly skeleton: string;
      readonly atlas: string;
      readonly textures: Readonly<Record<string, string>>;
    };
```

合同：

- image 导入时真实 decode 并保存尺寸；重新导入/替换时尺寸漂移原子失败，除非用户显式确认采用新尺寸。
- image-string path 固定为 `dependencies/image-strings/<id>/image-string.manifest.json`，目录 id 必须等于 nested manifest id。
- VNI project 由 source project 自身 `assets[].path` 派生精确资源闭包；导出时由 vnicore 结构化改写为 hash-flat asset refs，再对改写后的 project JSON canonical bytes 求 hash。不保存 `assetGlob`，不允许宽泛 glob 猜资源。
- Spine atlas pages 必须与 source textures 大小写精确匹配；导出时结构化改写 atlas page name 和 manifest texture mapping 到 hash-flat texture path，再对 canonical atlas bytes 求 hash。skeleton 必须是 official Spine 4.3.x，animation 在绑定层 prepare 前完整验证。
- 相同 logical resource 可由多个 tier/layer 共享底层资源；每个 layer renderer/player 实例独立，owner 统一释放纹理/Spine/VNI/image-string resource。

### 7.4 档位与图层

推荐结构：

```ts
interface AwardCelebrationSpec {
  readonly base: AwardTierPresentation;
  readonly standard: AwardTierPresentation;
  readonly celebrationTiers: readonly [
    AwardCelebrationTier,
    AwardCelebrationTier,
    AwardCelebrationTier,
  ];
}

interface AwardCelebrationTier extends AwardTierPresentation {
  readonly id: "bigwin" | "superwin" | "megawin";
  // positive safe integer
  readonly thresholdMultiplier: number;
}

interface AwardTierPresentation {
  readonly countDurationSeconds: number;
  readonly layers: readonly PopupLayer[];
}
```

`celebrationTiers` 必须按 `bigwin, superwin, megawin` 顺序，不能只靠数组位置猜 id。parser 同时校验 id 完整、无重复、阈值严格递增。

通用图层字段：

```ts
interface PopupLayerBase {
  readonly id: string;
  readonly order: number;
  readonly resource: string;
  readonly transform: {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
  };
}
```

- `x/y` 是相对 popup 中心的有限数；scale 是有限正数。
- order 是档位内唯一 non-negative safe integer，小值先画；不根据数组位置或资源类型猜 z-order。
- layer id 在档位内唯一；同名跨档位合法，因为档位是独立 presentation。
- 第一版不加入 rotation、alpha、blend mode、mask、anchor-to-other-layer 或 constraint；没有明确需求的能力不预留假字段。

图层 discriminated union：

```ts
type PopupLayer =
  | (PopupLayerBase & {
      readonly kind: "image";
      readonly anchor: { readonly x: number; readonly y: number };
      readonly visibleSegments: readonly ("start" | "loop" | "end")[];
    })
  | (PopupLayerBase & {
      readonly kind: "image-string";
      readonly binding: "win-amount";
      readonly anchor: { readonly x: number; readonly y: number };
      readonly visibleSegments: readonly ("start" | "loop" | "end")[];
    })
  | (PopupLayerBase & {
      readonly kind: "vni";
      readonly playback: {
        readonly mode: "segmented";
        readonly loopStartTime: number;
        readonly loopEndTime: number;
        readonly keepParticlesAlive: boolean;
      };
    })
  | (PopupLayerBase & {
      readonly kind: "spine";
      readonly playback: {
        readonly mode: "segmented-animations";
        readonly startAnimation: string;
        readonly loopAnimation: string;
        readonly endAnimation: string;
      };
    });
```

`visibleSegments` 规则：

- image 和 image-string 必填非空数组，只允许 `start / loop / end`，不得重复，parser 规范化为固定顺序。
- VNI/Spine 自身已经定义完整三段生命周期，不接受 `visibleSegments`，避免两套状态互相矛盾。
- 每个 tier 分别对 start、loop、end 做 coverage 校验；每一段至少命中一个 dynamic image-string layer。
- segment 切换时，同一 layer 若前后都可见必须保留 renderer 和 texture，不 reset；只在可见性真正变化时 show/hide。

VNI 规则：

- project 的 `stage.duration` 必须是有限正数。
- 必须满足 `0 <= loopStartTime < loopEndTime <= stage.duration`。
- start=`0..loopStartTime`，loop=`loopStartTime..loopEndTime`，end=`loopEndTime..stage.duration`。
- `keepParticlesAlive` 新建默认 true，但 manifest 必填。
- VNI stage width/height 只作导出元数据/内部坐标；不得 fit 到 designViewport。

Spine 规则：

- 三个 animation name 非空、大小写精确存在；三者必须互不相同，避免 once/loop 语义冲突。
- 进入档位播放 start once，完成后 loop；请求离开时从当前状态进入 end once。
- 如果 start 尚未完成就请求离开，controller 必须记录 end request，在合法完成边界进入 end，不能直接跳帧或永久卡住。
- official runtime 的 completion 和 destroy rejection 必须真实传播。

ImgNumber 规则：

- 每档的 start/loop/end 都至少有一个 image-string layer 覆盖；同档当前 segment 内多个 layer 都接收同一格式化金额字符串。
- 同一个 image-string layer 可以覆盖全部 segment；也可以用不同 resource/layer 分别覆盖。segment 交接时新 layer 先 `setText(currentAmount)` 再原子显示。
- 每个 layer 自己持有 renderer、anchor、transform；共享 dependency resource 不能导致 text/位置互相污染。
- tier 切换先准备新 tier 所有 layer，再原子显示；任何 glyph/resource/player 初始化失败时旧 tier 保持，错误上报，不显示半套画面。

### 7.5 示例骨架

下面只说明字段形状，资源路径和 ImgNumber id 必须由实际导入结果产生：

```json
{
  "version": 1,
  "kind": "popup",
  "id": "game003-win-celebration",
  "type": "award-celebration",
  "designViewport": { "width": 900, "height": 1600 },
  "amountFormat": {
    "rawScale": 100,
    "fractionDigits": 2,
    "useGrouping": true,
    "groupSeparator": ",",
    "decimalSeparator": ".",
    "prefix": "$",
    "suffix": "",
    "rounding": "floor"
  },
  "resources": {
    "amount-base": {
      "kind": "image-string",
      "manifest": "dependencies/image-strings/amount-base/image-string.manifest.json"
    },
    "bigwin-vni": {
      "kind": "vni",
      "project": "assets/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.json"
    }
  },
  "awardCelebration": {
    "base": {
      "countDurationSeconds": 1.5,
      "layers": [
        {
          "id": "amount",
          "kind": "image-string",
          "order": 10,
          "resource": "amount-base",
          "binding": "win-amount",
          "visibleSegments": ["start", "loop", "end"],
          "anchor": { "x": 0.5, "y": 0.5 },
          "transform": { "x": 0, "y": 0, "scale": 1 }
        }
      ]
    },
    "standard": {
      "countDurationSeconds": 3,
      "layers": [
        {
          "id": "amount",
          "kind": "image-string",
          "order": 10,
          "resource": "amount-base",
          "binding": "win-amount",
          "visibleSegments": ["start", "loop", "end"],
          "anchor": { "x": 0.5, "y": 0.5 },
          "transform": { "x": 0, "y": 0, "scale": 1.3 }
        }
      ]
    },
    "celebrationTiers": [
      {
        "id": "bigwin",
        "thresholdMultiplier": 15,
        "countDurationSeconds": 2.9,
        "layers": [
          {
            "id": "effect",
            "kind": "vni",
            "order": 0,
            "resource": "bigwin-vni",
            "transform": { "x": 0, "y": 0, "scale": 1 },
            "playback": {
              "mode": "segmented",
              "loopStartTime": 1,
              "loopEndTime": 2.5,
              "keepParticlesAlive": true
            }
          },
          {
            "id": "amount",
            "kind": "image-string",
            "order": 10,
            "resource": "amount-base",
            "binding": "win-amount",
            "visibleSegments": ["start", "loop", "end"],
            "anchor": { "x": 0.5, "y": 0.5 },
            "transform": { "x": 0, "y": 180, "scale": 1.5 }
          }
        ]
      }
    ]
  }
}
```

示例中的 64 位 digest 只展示 hash-flat 路径形状，不声称对应示例 project bytes。真实 materializer 必须计算最终 canonical bytes 的实际 SHA-256。真实 manifest 还必须包含完整 bigwin/superwin/megawin 三项；示例为控制篇幅省略的 JSON 不能作为 fixture 直接使用。

## 8. Rendercore popup resource 与 runtime

新增建议目录：

```text
packages/rendercore/src/popup/
  types.ts
  manifest.ts
  package-resource.ts
  package-loader.ts
  amount-format.ts
  award-sequence.ts
  popup-stage.ts
  layers/
  index.ts
```

公共能力至少包括：

```ts
parsePopupManifest(value): PopupManifestV1
collectPopupPackagePaths({ manifest, files }): readonly string[]
createPopupPackageResource({ manifest, files }): Promise<PopupPackageResource>
loadPopupPackageFromUrl({ manifestUrl, fetchImpl? }): Promise<PopupPackageResource>
createAwardCelebrationPlayer({ resource }): AwardCelebrationPlayer
```

player API 至少包括：

```ts
interface AwardCelebrationPlayer {
  readonly container: Container;
  init(): Promise<void>;
  start(input: AwardCelebrationInput): void;
  update(deltaSeconds: number): AwardCelebrationSnapshot;
  requestAdvance(): void;
  requestDismiss(): void;
  dismissImmediately(): void;
  getSnapshot(): AwardCelebrationSnapshot;
  isPlaying(): boolean;
  destroy(): void;
}
```

snapshot 至少明确：

```text
phase: idle | counting | awaiting-dismiss | dismissing | complete
activeTierId: base | standard | bigwin | superwin | megawin | null
activeSegment: start | loop | end | null
displayedAmountRaw
finalAmountRaw
active/ending layer 数量
```

实现要求：

- `init()` 在播放前准备并校验所有 resources、VNI project assets、Spine atlas/pages/animations 和 image-string glyph；不能第一次进入 megawin 才发现资源坏。
- 一个档位的所有 layer 进入/退出由通用 stage controller 编排；editor/game 不操作 Pixi child、Spine track 或 VNI private display tree。
- player 只在 `update(deltaSeconds)` 推进，不能拥有第二个 RAF。
- displayed raw amount 单调不减、不超过当前 segment target，最终严格等于 server raw win。
- repeated `requestAdvance()`、destroy、async init error、pending end、ending layer drain 都有确定状态和测试。
- destroy 幂等；destroy 后 start/update/request 显式失败或按统一公共合同处理，不能静默泄漏。
- 开始下一轮前 `dismissImmediately()` 清理全部 active/ending resources；game002/game003 逐帧 reel update 不能因 popup 播放被冻结。

旧 `rendercore/win-amount` 迁移策略：

1. 先用 characterization tests 锁定现有正确的阈值/点击/awaiting-dismiss/end overlap 行为。
2. 把通用 sequence 重构到 `rendercore/popup`，让多 layer stage 使用同一状态机。
3. 迁移所有 consumer 和测试后删除旧窄 manifest parser、VNI-only tier factory、Pixi Text stage 和重复 public types。
4. 不保留长期 adapter、两份阈值、两套 parser 或 app 分支。若因分步提交需要短暂 adapter，最终交付前必须删除。

## 9. popupeditor 产品与代码结构

### 9.1 脚手架

新增：

```text
apps/popupeditor/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.eslint.json
  eslint.config.cjs
  src/
    main.ts
    styles.css
    model/
    io/
    preview/
    ui/
  tests/
  README.md
```

约束：

- package name 固定为 `popupeditor`；workspace 已覆盖 `apps/*`。
- Node/pnpm/Vite/Vitest/ESLint/Prettier/Pixi 版本与根工具链一致。
- production dependency 使用 workspace `@slotclientengine/rendercore`、`@slotclientengine/browserartifactio` 和 `pixi.js`；zip 继续复用仓库已有能力，不引入第二个压缩库。
- Vite `base: "./"`；dist 可部署任意静态 CDN 子路径。
- 不直接依赖 `gameframeworks/uiframeworks/netcore/logiccore`。

### 9.2 Resource-first 工作流

建议固定三个左侧工作区和一个常驻右侧 preview：

```text
资源 -> 档位 -> 项目
               |-> 右侧 preview / 输入 / 播放控制
```

资源 Tab：

- 只显示“上传资源 / 上传文件夹”；同一入口识别 image、VNI project + 精确 assets、Spine skeleton + atlas + pages、standalone ImgNumber ZIP/目录。
- discovery 完成后必须先显示 import review；用户可修正 proposed logical id，但不能手改 raw production path。确认才一次提交，取消/失败保持 project 和 preview。
- 每次上传只新增 logical resource/blob/provenance，不自动创建 layer、绑定档位、选择 animation 或根据文件名猜 big/super/mega。
- 支持搜索、类型/引用筛选、展开 metadata/provenance/content digest/materialized path、显式 replace/delete；hash/path 只在高级详情只读显示，不是主要 identity。
- 被 layer 引用的 resource 禁止删除；replace 必须保持 logical id，完整预校验所有引用后原子提交。
- 相同 bytes 的 logical resource 可独立存在但共享 blob；replace/delete 按引用计数回收无主 blob 和 Object URL。
- unused resource 可留在 session，但不进入 manifest/ZIP；重新导入 production ZIP 只按显式 manifest 关系重建 logical graph，不按 basename 猜资源，也不恢复 unused resource/provenance。

档位 Tab：

- 左侧 tier rail 固定五项并显示 threshold/range、layer 数和 diagnostics。
- 选中档位后显示 layer outline；新增 layer 必须通过 typed Resource Picker 明确选择兼容资源。
- Inspector 一次只编辑一个 tier 或 layer，包含 count duration、threshold（只对 big/super/mega）、order、x/y/scale、anchor、image/ImgNumber 的 `visibleSegments`、VNI timing 或 Spine animations。
- Spine animation Picker 只显示严格 metadata 中真实 animation，不提供自由猜名字的 fallback；仍应显示大小写精确名称。
- tier/layer 改动原子刷新 production-equivalent preview；失败保留旧 preview 和 draft，并显示完整错误。

项目 Tab：

- 编辑 project id、design viewport、amount format。
- 展示严格 diagnostics、五档 ImgNumber 覆盖、resource references、production closure 和只读 manifest preview。
- export 前必须通过 rendercore parser/resource/player prepare，而不是只做 editor 自己的浅校验。

### 9.3 Preview

preview 必须使用 rendercore production player，不复制档位、金额插值或 VNI/Spine 状态机。

控件至少包含：

- 常用 resolution presets：`1920×1080`、`1080×1920`、`2000×2000`，以及 custom width/height；默认从 manifest designViewport 读取。
- zoom：至少 `25% / 50% / 75% / 100% / 150% / 200% / fit`，session-only。
- 中心十字、viewport 边框、坐标提示和 guides 显隐；guides session-only。
- bet raw 输入、win raw 输入、格式化预览和 `win/bet` 档位说明。新项目 session 默认可用 `bet=100`、`win=5000`，但不得导出。
- `Play/Replay`、`Advance`、`Dismiss`、`Dismiss immediately`。
- snapshot：当前 tier、phase、displayed/final raw、格式化 string、active/ending layers。

输入修改不应偷偷开始播放；用户点击 Play 后使用一份冻结 input。播放期间修改表单应明确要求 Replay 或在下一次 Play 生效，不能让 threshold 在半段中漂移。

## 10. ZIP import/export 与安全

沿用 browserartifactio 的 bounded streaming/deterministic/path policy。限额至少不低于现有 layout editor，具体值应根据 VNI/Spine 实际包体通过测试确认并写 README；不能为了导入一个异常大包而取消单文件、总解压尺寸或 entry count 限制。

普通 files/folder ingestion 也必须在 `arrayBuffer()` 前执行等价数量、单文件和累计 bytes 限制；不得只保护 ZIP。popupeditor 自有 payload materialization 必须满足：相同 typed logical graph + canonical bytes 连续导出 byte-for-byte 相同，source filename/relative directory/upload order 不影响最终 content path 或 ZIP entry order。

必须测试：

- 缺 `popup.manifest.json`、重复 entry、CRC/截断、压缩炸弹、绝对路径、`..`、反斜杠、lowercase collision 失败；
- orphan asset、缺 nested glyph、VNI project 漏 asset、Spine atlas 漏 page、manifest 额外 key 失败；
- deterministic export：相同 project/bytes 连续导出 byte-for-byte 一致；
- known SHA-256 vectors、完整 64 位 lowercase digest、相同 bytes/ext 去重、不同 bytes 不同路径、collision guard；
- source exact/unique case-fold resolution、NFC/case-fold collision、未消费文件、ambiguous Spine/VNI group 和 import review 原子取消；
- VNI/Spine 结构化 path rewrite 后旧 source basename/relative directory 不出现在 manifest、project、atlas 或 ZIP；
- export -> import -> export manifest/closure 等价；
- Blob URL/Pixi texture/VNI/Spine/image-string owner 在 replace、preview rebuild、import new project、destroy 时释放；
- 原始上传 File/Blob 不被修改或上传网络。

## 11. gamelayouteditor 最终汇总集成

### 11.1 Scene layout manifest 扩展

保持：

```json
{ "version": 1, "kind": "scene-layout" }
```

在 v1 做向后兼容可选扩展：

```ts
interface SceneLayoutPopupBinding {
  readonly type: "award-celebration";
  readonly manifest: string;
  readonly placements: Partial<Record<"default" | "landscape" | "portrait", {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
  }>>;
}

interface SceneLayoutManifestV1 {
  // existing fields...
  readonly popups?: Readonly<Record<string, SceneLayoutPopupBinding>>;
}
```

第一版规则：

- 一个 layout 最多绑定一个 `type: award-celebration` popup；record key 是 game app 使用的稳定 popup id，不硬编码 `win-amount`。
- manifest path 固定为 `dependencies/popups/<popup-package-id>/popup.manifest.json`；目录 id 必须等于 nested popup manifest id。
- placements key 必须与 active layout variants 完全匹配；没有跨 variant fallback。
- x/y 相对 viewport center；scale 有限正数。popup 永远是 overlay，位于 scene layout node/reel presentation 之上，不能与 art-space node order 混用。
- popup binding 省略时旧 layout 继续合法；传 `null`、空 object、错误 type/path 或缺 placement 都失败。

### 11.2 gamelayouteditor UI 与资源管理

- 资源 Tab 增加“导入 Popup ZIP”，验证后保存 logical popup dependency 和完整 files map。
- 同 id 同内容可去重；同 id 不同内容必须显式 replace。仍被 layout binding 使用时不能删除。
- 布局 Tab 增加独立 `Popups` outline group；Resource Picker 只显示 compatible popup type。
- 绑定后按 active variant 编辑 root center offset/scale；右侧 preview 真实播放 popup，可输入 session bet/win 并转发点击。
- popup 内部 layer 不在 gamelayouteditor 展开编辑；要改内部内容必须回 popupeditor 重新导出，再在资源库显式 replace。
- 项目 Tab 展示 nested popup closure 和 diagnostics。
- popup dependency 只要被绑定就必须随 layout ZIP 导出，不增加“仅预览不导出”模式，因为 production layout 已显式引用它。

### 11.3 Layout ZIP 和组合 runtime

最终 layout ZIP：

```text
<layout-id>-layout.zip
  layout.manifest.json
  assets/**
  dependencies/image-strings/**
  dependencies/symbols/**                 # 若绑定
  dependencies/popups/<popup-id>/popup.manifest.json
  dependencies/popups/<popup-id>/assets/**
  dependencies/popups/<popup-id>/dependencies/image-strings/**
```

- nested popup bytes 只加 vendoring prefix，内部相对路径和文件 bytes 不重写。
- `collectSceneLayoutPackagePaths()` 递归合并 popup 精确 closure；missing/orphan/collision 失败。
- files loader 和 CDN loader 都能准备 nested popup。
- `SceneLayoutPackageRuntime.update()` 同时推进 scene node、reel 和 active popup；popup 播放不能冻结 symbol/CN/background loop。
- runtime 提供类型安全的 popup API，例如：

```ts
getAwardCelebrationPopup(id: string): AwardCelebrationPlayer;
```

未知 id、type mismatch、未绑定、destroy 后调用全部显式失败。

## 12. game003/game002 迁移与兼容策略

### 12.1 game003 等价资源包

用 popupeditor 或与其完全相同的 production serializer 建立 game003 award celebration package：

- VNI project 继续使用当前真实 `bigwin.json/superwin.json/megawin.json` 及精确 assets。
- VNI layer 三段式继续显式为 `loopStartTime=1`、`loopEndTime=2.5`、`keepParticlesAlive=true`；project duration 仍由 JSON 严格验证为 `2.9`。
- thresholds 唯一保存为 `15/30/50`。
- base/standard/tier count duration 从当前行为迁移并用 characterization test 确认；不能把 VNI stage duration 和金额 count duration继续隐式绑死，二者在 schema 中是独立字段。
- base/standard/big/super/mega 每档的 start/loop/end 都必须绑定真实 ImgNumber coverage；同一 layer 可覆盖三段，也可以分档、分段使用不同 dependency。
- amount format 表达当前服务器整数 `100 -> $1.00`，所需 `$`、`.`、`,`、`0..9` glyph 必须真实存在。

在 production ImgNumber 尚未提供时，允许使用测试 fixture 中的中性 `0..9/$/./,` glyph 验证 parser/editor/runtime，但 fixture 不得进入 `assets/game003-s1`、dist 或 production manifest。

### 12.2 移除双写

当 game003 production 切换条件满足后：

- 删除 YAML/generated static config 中 `minorCountDurationSeconds`、`majorCountDurationSeconds`、thresholds、text/layout 和旧 animations manifest 等重复 winAmount 表现字段；若整个 `winAmount` block 已无其它职责则整体删除。
- 删除 `apps/game003/src/win-amount-config.ts` 中 formatter/textStyle/layout/tier threshold 组装和比对；改为从最终 layout package 获取 popup player并只提交 bet/win。
- buildgamestatic 不再为获奖庆祝维护专属 `vni-win-amount-tiers` parser/glob；loading resources 从 layout/popup 精确 closure 派生。
- generated 文件只能通过 buildgamestatic 命令重生成，禁止手改；修改后必须执行 generate 和 `--check`。
- dist verifier 必须检查 nested popup manifest、VNI/Spine/image-string 精确资源存在，旧 manifest 和 orphan 不应继续打包。

### 12.3 game002

game002 当前也调用同一个 rendercore old player。若旧 API 在本任务结束时删除，则同步迁移 game002 到新 popup package/runtime，并保留：

- cash raw formatting `100 -> $1.00`；
- global win-amount 在全部 cascade 完成后播放；
- `awaiting-dismiss` 不阻塞下一 spin；
- 播放期间 reel runtime 仍逐帧更新；
- 下一合法 spin 清理遗留展示。

不要把 game002 cascade/CN/Nearwin 或 game003 bg-bar/minecart/component 语义写进 popup package。

## 13. 实施步骤

### 阶段 A：基线、characterization 与 schema

1. 记录 branch/HEAD/status/Node/pnpm，保护用户已有修改。
2. 跑现有 rendercore win-amount、scene-layout、gamelayouteditor、ImgNumbereditor 相关测试，记录基线失败。
3. 盘点 browserartifactio 已有能力；只补 popupeditor 必需的 id normalization、SHA-256、bounded source index/case-fold resolution 和 flat allocator 缺口及 known-vector 单测。
4. 为当前 game003 点击/阈值/end overlap/awaiting-dismiss 写 characterization tests。
5. 定稿本文件第 7 节 schema，并先实现严格 types/parser/amount formatter/closure tests。
6. 补 `docs/popup-manifest.md`，包含完整合法示例、五档边界、VNI/Spine 三段式、中心原点、content-addressed owned path、ZIP 和 runtime 示例。

### 阶段 B：rendercore popup runtime

1. 实现 popup resource union、nested image-string、VNI/Spine exact prepare 和 shared owner。
2. 抽取/迁移现有 win-amount sequence，改造成五档多 layer stage controller。
3. 实现 image、dynamic image-string、VNI segmented、Spine segmented layer。
4. 实现 click/dismiss/snapshot/async rollback/destroy/end drain。
5. 实现 files/CDN package loader 和 resource closure。
6. 迁移旧 tests；删除旧 parser/player/字体 stage 的 production consumer。

### 阶段 C：popupeditor

1. 建 app 脚手架、测试环境和 fixed app shell。
2. 实现 typed project/session、logical resource + content blob + provenance store、引用计数和原子 commands。
3. 实现“上传资源 / 上传文件夹”、四类资源 discovery、未消费/歧义诊断、import review 和一次 transaction。
4. 实现 typed Picker、replace/delete/reference diagnostics；replace 走同一 importer 并保留 logical id。
5. 实现 VNI/Spine 结构化 materializer、SHA-256 hash-flat popup owned paths、blob dedup/GC 和只读 production path preview。
6. 实现固定五档 rail、layer outline/Inspector、threshold/count/playback 配置。
7. 实现 production runtime preview、resolution/zoom/guides、bet/win/controls/snapshot。
8. 实现 deterministic ZIP import/export、exact closure 和 Blob/Pixi cleanup。
9. 补 README、source boundary 和 UI/store/IO/preview tests。

### 阶段 D：gamelayouteditor 汇总

1. 扩展 scene-layout manifest/parser/types/closure/resource/runtime。
2. 增加 popup logical dependency import/replace/delete/reference model。
3. 增加 Popups outline/Picker/variant center placement/preview 控件。
4. layout ZIP vendor nested popup，import 后重建 dependency 和 binding。
5. package runtime 自动 layout popup root 并推进 update。
6. 补旧 layout 向后兼容和 nested popup package tests。

### 阶段 E：game fixture、production 迁移与生成

1. 盘点 current game003 VNI JSON 与 assets，建立新 popup fixture/package。
2. 导入真实获奖庆祝 ImgNumber；缺失则停止 production switch，不制造 fallback。
3. 用 game003 等价 input 验证 0x、0.5x、1x、1x+epsilon、15x、30x、50x 和 mega 以上。
4. 迁移 game003；若删除 old API 同步迁移 game002。
5. 更新 loading closure、YAML/buildgamestatic/static config/generated/dist verifier。
6. 运行生成与 `--check`，检查没有旧 manifest/threshold/glob 双写。

### 阶段 F：全量验证、文档、AGENTS 与报告

1. 跑 scoped test/typecheck/lint/build/format:check。
2. 跑根级 typecheck/lint/build/format:check 和可行的 test，隔离记录任何既有失败。
3. 检查 `git diff --check`、资源闭包、无 orphan、无意外 binary churn、无用户文件覆盖。
4. 更新直接相关 README/docs。
5. 检查并按第 16 节更新 `AGENTS.md`。
6. 生成 UTC 任务报告，记录实现、迁移状态、真实资源输入、命令/结果、未完成风险。

## 14. 测试矩阵

### 14.1 Parser/amount/tier

- 五档完整性、id 顺序、阈值严格递增、exact threshold 边界。
- bet/win safe integer、zero win、超 safe integer、无精度损失阈值比较。
- amountScale/fraction/grouping/prefix/suffix/floor/final exact string。
- 每档或任一 segment 缺 ImgNumber coverage、单 layer 覆盖三段、三段不同 ImgNumber、同 segment 多个 ImgNumber、不同档不同 dependency。
- unknown key、null、NaN/Infinity、非法 order/scale/anchor/path。

### 14.2 Resource/layer

- image 尺寸校验和 replace rollback。
- VNI missing asset、bad duration、非法 loop points、keepParticlesAlive drain。
- Spine 版本/atlas/page/animation 大小写、start-loop-end completion、pending end。
- shared resource、多 independent renderer/player、destroy owner。
- tier atomic prepare/show，失败不出现半套新档。

### 14.3 Sequence/click

至少覆盖：

```text
win=0
0 < win < 1x
win=1x
1x < win < big
win=big
big < win < super
win=super
win=mega
win>mega
```

每项验证自然播放、base/standard/tier displayed raw、每次 advance、awaiting-dismiss、end/dismiss、dismissImmediately、下一轮 restart、delta=0/大 delta、重复点击、destroy。

### 14.4 popupeditor

- 新项目默认五档与 15/30/50，但任一档位 start/loop/end 未被 ImgNumber 覆盖时禁止导出。
- `BG_2.PNG -> bg-2`、非法/冲突 id review、取消/失败原子保留。
- resource files/folder/known image-string ZIP discovery；Spine/VNI 缺依赖、歧义和未消费文件失败。
- source path exact/unique case-fold、traversal/NFC/case-fold collision 和读取前限额。
- resource upload 不自动绑 layer；import review 与 Picker 分别明确确认才变更。
- SHA-256 known vectors、64 位 hash-flat path、identical blob dedup、replace 保留 id/binding、delete/GC 引用计数。
- VNI project/Spine atlas/texture mapping 结构化改写，导出不残留 source basename/path；dependency image-string 保持自包含、不重 hash。
- tier/layer CRUD、order、transform、VNI/Spine Inspector、referential integrity。
- preview resolution/zoom 不污染 manifest；bet/win 输入冻结。
- ZIP deterministic round-trip、安全限额、closure、cleanup。
- DOM shell 和 source boundary 不依赖 gameframeworks/uiframeworks/netcore/logiccore，不在 app 私有实现 SHA-256/source-index/flat allocator 或复制格式 parser。

### 14.5 gamelayouteditor/layout package

- old v1 layout 无 popups 继续解析/运行。
- default vs landscape/portrait placements 完整，无 fallback。
- popup root 以 viewport center 定位，resize 只更新 root，不改内部坐标/scale。
- popup dependency import/replace/delete/vendor/reimport exact。
- scene/reel/background/popup 同帧 update；popup 不冻结其它 runtime。
- malformed nested popup、id mismatch、orphan/missing/collision 失败。

### 14.6 game migration

- game003 15/30/50、1/2.5/2.9 只命中新 manifest。
- app 不再构造 Pixi Text、tier tables、VNI modules 或 popup layout。
- loading/dist 包含全部且仅包含 nested popup closure。
- game002/game003 orchestration 仍保持 awaiting-dismiss 非阻塞、点击和 next-spin cleanup。

## 15. 验证命令

先按实际 package scripts 复核；建议至少执行：

```bash
pnpm --filter @slotclientengine/browserartifactio test
pnpm --filter @slotclientengine/browserartifactio typecheck
pnpm --filter @slotclientengine/browserartifactio lint
pnpm --filter @slotclientengine/browserartifactio build

pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore build

pnpm --filter popupeditor test
pnpm --filter popupeditor typecheck
pnpm --filter popupeditor lint
pnpm --filter popupeditor format:check
pnpm --filter popupeditor build

pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor build

pnpm --filter buildgamestatic test
pnpm --filter game003 test
pnpm --filter game003 typecheck
pnpm --filter game003 build
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 build

pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
pnpm test
git diff --check
```

如果修改 game003 YAML/buildgamestatic，必须从 `apps/buildgamestatic/package.json` 和 README 读取当前真实 CLI 后执行对应 generate 与 `--check`；禁止凭记忆手写命令，也禁止手改：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

验证要求：

- 不因 coverage/旧 fixture 失败而降低阈值、排除新文件或给 production 增加 fallback。
- 若根测试存在与本任务无关的既有失败，必须跑任务相关包证明本次改动，并在报告记录原始命令、失败测试和隔离证据，不能伪报全绿。
- build 的 chunk size warning 可记录，但实际 error 必须修复。

## 16. 文档与 AGENTS.md

至少更新：

```text
apps/popupeditor/README.md
apps/gamelayouteditor/README.md
packages/rendercore/README.md
packages/browserartifactio/README.md             # 仅当新增共享原语
docs/popup-manifest.md
docs/scene-layout-manifest.md
```

若任务完成后 ownership 和 production source 已改变，应同步更新根 `AGENTS.md`：

- 新增 `apps/popupeditor` 目录职责和获奖庆祝 v1 范围；
- `packages/rendercore` 拥有 popup parser/resource/layer/tier/click/runtime；
- VNI/Spine/image-string 继续复用既有 shared runtime；
- 最终 game 汇总配置来自 gamelayouteditor layout package，popupeditor ZIP 是 nested dependency；
- game002/game003 不再维护第二份阈值、计数时长、字体金额层、VNI timing 或 popup layout；
- 更新/删除当前关于 `vni-win-amount-tiers`、game003 YAML tier timing 和 game002 临时 win-amount manifest 的过时规则。

如果 production game 因缺真实 ImgNumber 尚未切换，不能提前删除仍真实有效的旧规则；报告中应写清哪些规则等待迁移，避免 AGENTS.md 描述不存在的完成状态。

## 17. 完成定义

以下全部满足才可把任务报告写为“完成”；若真实 game003 ImgNumber 缺失，则必须把 production migration 明确标为阻塞项，不能声称整项完成：

- `apps/popupeditor` 可完整新建、编辑、预览、导出、重新导入 award celebration package。
- popupeditor 的 files/folder/known-ZIP discovery、import review、logical id/provenance/blob graph、SHA-256 hash-flat owned payload、结构化 VNI/Spine materialization、dedup/replace/delete/GC 全部可用；未迁移其它 editor 的任务 110 资源模型来冒充统一完成。
- 五档边界、阈值、每档每段 ImgNumber coverage、多图层、VNI/Spine 三段式、中心坐标和点击语义由严格 manifest/runtime 驱动。
- rendercore 没有 editor/app 私有 Pixi/Spine/VNI/image-string 算法副本。
- gamelayouteditor 能导入 popup package、按 variant 调 root placement、预览并 vendor 到最终 layout ZIP。
- scene-layout package runtime 能从 files/CDN 加载 nested popup，并在同一 update 中推进。
- game003 等价 fixture 覆盖当前 15/30/50 和 1/2.5/2.9。
- production game 切换后，不再存在旧/new threshold、timing、font/layout 双写；若 old API 删除，game002 同步完成。
- ZIP/manifest 精确闭包、路径、安全限额、deterministic round-trip、resource cleanup 全部有测试。
- scoped test/typecheck/lint/build/format:check 通过；根级结果如实记录。
- 相关 README/docs 和实际完成状态一致，必要的 `AGENTS.md` 已更新。
- 新增符合命名要求的 UTC 中文任务报告，包含 branch/HEAD/status、Node/pnpm、代理使用、资源来源、生成命令、测试结果、未完成项和风险。

## 18. 禁止事项复核

- 禁止在 popupeditor/gamelayouteditor/game app 复制 glyph layout、Spine track completion、VNI segmented/particle、tier click 或 Pixi layer runtime。
- 禁止在 popupeditor 私有实现弱 hash、截断 hash、随机/时间戳 filename、source path safety/case-fold 或 flat allocator；缺通用原语时只做最小 browserartifactio 扩展。
- 禁止把 source filename/path 当 production identity，或用全局字符串替换/正则猜测改写 VNI JSON、Spine atlas 和 manifest。
- 禁止借本任务迁移 ImgNumber Editor、Symbols Editor、Game Layout Editor 的任务 110 资源模型；gamelayouteditor 这里只处理既定 popup dependency 集成。
- 禁止继续用 Pixi Text/字体作为 production award amount fallback。
- 禁止把 `cn-digits`、VNI asset 文件名或测试 glyph 猜成 game003 正式 ImgNumber。
- 禁止让 app/YAML/manifest 同时维护 15/30/50、计数时长或三段式时间。
- 禁止宽泛 glob、路径猜测、首动画 fallback、静态首帧 fallback、placeholder、silent clamp、truthy field selection 或 unknown-key 容忍。
- 禁止根据 preview resolution 对 VNI/Spine/image 做 fit/cover/contain；只允许显式 layer/root scale。
- 禁止把 preview bet/win、zoom、guides、selected tier/layer、展开状态或临时错误写入 production artifact。
- 禁止修改、删除或格式化任务范围外的用户文件；尤其保护制定计划时已有的 `tasks/110-editor-resource-management-unification.md`。

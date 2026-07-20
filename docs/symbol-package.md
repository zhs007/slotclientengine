# Symbol package v1

Editor-owned payload 使用 `assets/<full-sha256>.<canonical-ext>`。Spine page 先物化、
再结构化改写 atlas，VNI 只改写 vnicore 声明的 `project.assets[].path`；package
`resources` 从重写后 manifest 精确派生。`dependencies/image-strings/<id>/` 保持
自包含，legacy 重导不得改变 symbol/state/animation/slot/scale/priority 语义。

Symbol package 是 symbols 编辑器与布局编辑器之间的独立、可重新导入 artifact。它不是 production spin 数据包，也不包含 scene layout。

## ZIP 结构

```text
game002-s3-symbols.zip
├── symbols.package.json
├── gameconfig.json
├── symbol-state-textures.manifest.json
├── WL.png
├── WL.spinBlur.png
├── WL.disabled.png
├── WL.json
├── Symbol.atlas
├── Symbol.png
├── CN_1.json
├── 1.png
└── ...
```

根 manifest schema：

```ts
interface SymbolPackageManifestV1 {
  version: 1;
  kind: "symbol-package";
  id: string; // lowercase ASCII kebab-case
  cellSize: { width: number; height: number };
  entrypoints: {
    gameConfig: string;
    symbolManifest: string;
  };
  resources: readonly string[];
}
```

示例：

```json
{
  "version": 1,
  "kind": "symbol-package",
  "id": "game002-s3",
  "cellSize": { "width": 120, "height": 120 },
  "entrypoints": {
    "gameConfig": "gameconfig.json",
    "symbolManifest": "symbol-state-textures.manifest.json"
  },
  "resources": ["1.png", "Symbol.atlas", "Symbol.png", "WL.png"]
}
```

所有 object 递归拒绝未知字段。两个 entrypoint 必填、不得相同，也不得出现在 `resources`。`resources` 必须是数组，允许合法的 `[]`；非空时必须唯一并按 canonical path 排序。ZIP 实际文件集合必须与 package manifest、两个 entrypoint 和 `resources` 的并集精确相等。`resources: []` 只表示 manifest 没有引用外部资源，并不放宽 referenced resource 校验。

## 三份配置的职责

- `gameconfig.json`：公开客户端 paytable、symbol code 与本地公开 reels 的唯一权威输入。它不得包含服务器真实轮带、token、cookie、玩家下注或本次 spin 数据。
- `symbol-state-textures.manifest.json`：display set、normal/state texture、scale、renderPriority、VNI/official Spine animation、valuePresentation 与可选高级 presentation metadata。
- `cellSize`：reel cell 的唯一逻辑宽高。图片、VNI、Spine 按自身资源尺寸和 manifest transform 渲染，导入不会重编码或 resize 美术。

game config 可以含未进入 package 的辅助 symbol；manifest 中每个 display symbol 则必须存在于 game config，且 symbol/code/paytable 映射一致。UI 与 layout preview 的 display 顺序固定为 numeric code ascending。

## 路径安全与大小限制

只接受 UTF-8、Unicode NFC、POSIX 相对 canonical path。拒绝绝对路径、drive prefix、URL、反斜杠、空 segment、`.`、`..`、NUL、query/hash、percent escape、exact duplicate、Unicode normalization collision 与 ASCII case-fold collision。manifest 资源引用允许一个 `./` 前缀；VNI asset 相对其 project、atlas page 相对其 atlas 解析且不能逃出 ZIP 根。

Symbols ZIP 固定限制：

- entries：1024
- compressed：100 MiB
- single expanded file：25 MiB
- total expanded：250 MiB

解压使用 bounded streaming `Unzip`；header size 可用时先拒绝，chunk 到达时再次累计。任一失败会终止 import 并释放临时 runtime/Object URL，旧项目保持可用。包含 nested dependencies 的 layout ZIP 限制为 `4096 / 200 MiB / 50 MiB / 500 MiB`。

## 精确资源闭包

闭包包含 normal/layer/keyframe、实际存在的稀疏 state texture、VNI project 及其 `assets[].path`、Spine skeleton/atlas/texture、value tier Spine，以及 text 分支所需资源：image 模式的每个 `defaultValues` 完整数值图片，或 image-string 模式每个 distinct tier dependency 的 nested manifest 与精确 glyph。旧 image package 可用 `prefix + value + .png` 表达导入路径；Symbols Editor 重新导出时必须升级为 `images` 中 value 到完整 SHA-256 hash-flat path 的精确映射，不能把动态 prefix 指向的 `1.png` 等旧名遗留在新 closure。普通 `imageStringNodes` 和 value-tier binding 共用同一个 canonical resource pool。资源按 manifest exact path 解析；缺资源、decoded size 漂移或多余 orphan 都失败，不扫描目录、不使用 glob、不从文件名猜 display symbol。

顶层 `states[]` 是允许出现的 state texture id 稳定并集，不再表示每个 symbol 必须提供每个 texture。需要全量 state texture 的 production generator/caller 必须显式传 `requiredStates`；普通 package catalog 保持 sparse per-symbol 语义。

空 normal 使用正式 transparent normal：

```json
{
  "normal": {
    "kind": "transparent",
    "width": 160,
    "height": 160
  },
  "scale": 1
}
```

非 normal 的 intentional empty 使用正式 animation spec：

```json
{
  "kind": "empty",
  "durationSeconds": 0.016666666666666666
}
```

`empty` reset 时隐藏 base/state/underlay/overlay，并按 state definition 的 static/once/loop 生命周期上报完成边界。它不引用隐藏 PNG，也绝不作为图片、VNI、Spine 或 resolver 错误的 fallback。

Spine 只接受 official 4.3.x，animation name 大小写精确，atlas page 必须匹配 texture。skeleton、atlas 与 texture 都使用 manifest-relative `./` 精确路径，可指向 `./assets/<full-sha256>.<canonical-ext>`；禁止 `../`、绝对路径、URL、非法 segment 或 basename fallback。Spine texture 支持 materializer 可生成的 PNG、JPEG 与 WebP。VNI project 通过 vnicore parser 和精确 asset manifest 验证。image value 缺图不回退 font。`cascadeWinPresentation` 等合法高级 metadata 可以 round-trip，但不因此引入 sequence UI。

## 导入、导出与稳定性

导入顺序是 bounded extract → package manifest → 实际 entry closure → game config → symbol manifest → config/display 交叉校验 → indirect closure/图片/VNI/Spine/value 初始化 → 原子替换。

导出 JSON 使用 UTF-8、2 空格和末尾换行；object key 稳定排序，array 顺序不变。ZIP entry 按 canonical path 排序，mtime 固定为 1980 ZIP epoch，未修改资源 bytes 原样保留。因此同一未修改 draft 连续导出 bytes 一致。

## 编辑器与 layout 接入

`apps/symbolseditor` 从 game config 创建 typed draft，默认 `160x160`、只有 explicit empty normal、scale `1`、priority `0` 和全选 display set。资源先进入持久于当前 draft 的资源库，再通过 image/VNI/Spine/animation/slot 下拉显式绑定；unused 资源不进入导出。每个 symbol 独立拥有 visible state 集合和顺序，custom state、valuePresentation 与 cascadeWinPresentation 使用结构化表单。

右侧固定为 all-symbol、single-state gallery，默认 `normal`，支持 Replay、fit 与 zoom；缺 state、empty state 和错误分别占位。编辑器不提供 sequence、hold、next、spin/cascade timeline、remove/drop/refill 或 Nearwin 预览。

`apps/gamelayouteditor` 导入同一 ZIP 后，以 package `cellSize` 原子覆盖 `main` grid 的 cell width/height，保留 rows、columns、gap 与 placement，并按现有 focus offsets 重派生 focus。越出 art/focus 时失败，不 auto-fit。用户必须显式选择 reel set 与 `standard | grid-cell`，并选择“仅预览”或“随布局包导出”；默认仅预览。

选择导出时，已符合小写 strict contract 的 validated file map 会原字节 vendor 到 `dependencies/symbols/<package-id>/`，nested manifest 相对路径不重写。历史 package 若仍含 `AF.disabled.png` 一类大写 owned resource path，必须先由 Symbols Editor 执行“导入旧包 → 导出新包”：格式 owner 将顶层 raster、VNI project、Spine skeleton/atlas 物化为完整 SHA-256 小写 hash-flat path，并结构化同步 symbol manifest、VNI asset 与 atlas page 引用。Game Layout Editor 在导入和导出边界拒绝旧路径并给出该迁移提示，不静默修改 dependency，也不放宽最终 ZIP 的全小写精确闭包合同；nested dependency 继续保持自包含。layout manifest 只保存 package manifest path、`reels.main`、reel set、render mode 与 reel order；package cell 必须等于 layout cell，reel count 必须等于 columns。ZIP 实际 entry 必须与 layout、image-string、symbols 的传递闭包精确一致。sampled scene、otherScene mapping、服务器真实轮带、token 和玩家输入均不进入 package。

## Production 接入

Production build 不应在每次 spin 解压 ZIP。发布流程先严格验证并解压，再用 rendercore 现有 manifest API 从精确 Vite modules 构造 texture、VNI、Spine、value resources：

```ts
import {
  createSymbolAssetMapFromManifestModules,
  createSymbolManifestAnimationResolver,
  createSymbolValuePresentationResourcesFromManifest,
} from "@slotclientengine/rendercore/symbol";

const assets = createSymbolAssetMapFromManifestModules({
  manifest,
  modules: exactTextureModules,
  displaySymbols,
});
const animationResolver = createSymbolManifestAnimationResolver({
  manifest,
  vniProjectModules,
  vniAssetModules,
  spineSkeletonModules,
  spineAtlasModules,
  spineTextureModules,
});
```

浏览器上传 bytes 使用 `createSymbolPackageResource({ packageManifest, files })`，其 `destroy()` 幂等并拥有 Object URL/临时 texture 生命周期。

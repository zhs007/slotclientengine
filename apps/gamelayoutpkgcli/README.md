# gamelayoutpkgcli

`apps/gamelayoutpkgcli` 是本地 Scene Layout production ZIP 后处理工具。它使用本机
`cwebp` 把包内 PNG/JPEG 转成 WebP，并使用本机 FFmpeg/FFprobe 把 typed BGM/音效统一优化为
M4A 容器中的 AAC-LC；随后结构化改写所有受支持的资源引用，重新生成 content-addressed
payload 与 `assets.map.json`，并在 ZIP 外输出一份可供后续 loading 优化使用的资源分组 JSON。

本工具不改美术源 ZIP，不实现合图，也不修改 runtime loading 策略。

## 前置条件

- Node.js 24 和仓库使用的 `pnpm`。
- 本机可执行 `cwebp -version`。默认从 `PATH` 查找，也可用 `--cwebp` 指定绝对路径。
- production ZIP 含音频时，本机可执行 `ffmpeg -version` 与 `ffprobe -version`。默认从
  `PATH` 查找，也可分别用 `--ffmpeg` / `--ffprobe` 指定绝对路径。macOS 可使用
  `brew install ffmpeg webp`；FFmpeg 自带本任务使用的 native AAC encoder。
- 输入必须是当前 filename-key、mapped、version 1 的 Scene Layout production ZIP；
  legacy direct-path ZIP 会显式失败。

WebP 转换当前使用 `cwebp -quiet -q <quality>`，因此是有损压缩。默认质量为 `80`。
上线前仍需由美术人工抽查画质，尤其是透明边缘、渐变、文字和细线。

音频输出固定为 AAC-LC + M4A，不提供 codec fallback：BGM 默认 `128 kbps`，mono effect
默认 `64 kbps`，其它 effect 默认 `96 kbps`。CLI 不传 `-ac` 或 `-ar`，转码后严格复验
声道数和采样率没有变化。已经是 `.m4a` / `audio/mp4` / AAC-LC 且探测码率不高于目标
105%（容纳 AAC mux/probe 的正常码率浮动）的文件原样保留；其它格式或无法证明合规的文件
从当前 production bytes 转码。为了避免累计有损，正式美术流程仍应从 WAV/无损母版生成
production ZIP。AAC encoder padding 可能影响无缝 BGM，交付前必须在目标浏览器试听 loop 接缝。

固定单一 AAC codec 后，一个 binding 不能继续保留多个不同媒体格式的 fallback source；CLI
要求每个 BGM/effect binding 恰好一个 source。多 source 输入会显式失败，不按数组首项猜交付资源。

## 使用方式

先构建：

```bash
pnpm --filter gamelayoutpkgcli build
```

执行：

```bash
pnpm --filter gamelayoutpkgcli start -- \
  --input /absolute/path/game-layout.zip
```

也可以直接运行开发入口：

```bash
pnpm --filter gamelayoutpkgcli dev -- \
  --input /absolute/path/game-layout.zip \
  --output /absolute/path/game-layout.optimized.zip \
  --assets-json /absolute/path/game-layout.assets-groups.json \
  --quality 80 \
  --cwebp /opt/homebrew/bin/cwebp \
  --ffmpeg /opt/homebrew/bin/ffmpeg \
  --ffprobe /opt/homebrew/bin/ffprobe \
  --bgm-bitrate 128 \
  --effect-mono-bitrate 64 \
  --effect-stereo-bitrate 96
```

参数：

- `--input <zip>`：必填，源 Scene Layout ZIP。
- `--output <zip>`：可选，默认与输入同目录，文件名加 `.optimized.zip`。
- `--assets-json <json>`：可选，默认与输入同目录，文件名加
  `.assets-groups.json`。
- `--quality <0..100>`：可选，默认 `80`，原样传给 `cwebp -q`。
- `--cwebp <executable>`：可选，默认 `cwebp`。
- `--ffmpeg <executable>`：可选，默认 `ffmpeg`；只在 package 实际含 typed 音频时调用。
- `--ffprobe <executable>`：可选，默认 `ffprobe`；只在 package 实际含 typed 音频时调用。
- `--bgm-bitrate <8..512>`：可选，AAC BGM 整数 kbps，默认 `128`。
- `--effect-mono-bitrate <8..512>`：可选，mono effect 整数 kbps，默认 `64`。
- `--effect-stereo-bitrate <8..512>`：可选，非 mono effect 整数 kbps，默认 `96`。

输入、ZIP 输出和 JSON 输出必须是三个不同路径。任何输出已存在时工具都会拒绝覆盖；
ZIP 与 JSON 作为一对提交，第二个文件提交失败时会回滚第一个文件。

## 输出合同

优化 ZIP 仍是标准 Scene Layout production package：

- 根目录只有正式 control files 与 content-addressed payload；
- `layout.manifest.json` 和 nested image-string、Symbols、Popup、VNI JSON 中受支持的
  typed 图片引用会更新为 WebP filename key；
- Popup reference rewrite 只依赖 `rendercore/popup/data`，任一受支持的 v1–v6 source manifest 都先
  strict 规范化为 latest v6；CLI 不加载 mapped editor workspace 或 Pixi runtime；
- Spine atlas page logical name、VNI `originalName` 和业务 identity 保持不变；
- Popup 的 WOFF2/WOFF/TTF/OTF 字体引用保持不变，并继续按 payload SHA-256 去重；
- `assets.map.json` 的 path、SHA-256、media type 和 byte length 按优化后 bytes
  重新生成；
- root Scene Layout、nested Symbols 与 Popup 的 typed 音频 path 同步改成 `.m4a`，media type
  同步改成 `audio/mp4`；video transition 的内嵌音轨不属于 audio catalog，不会被改写；
- 旧图片 payload 和资源分组 JSON 不进入 ZIP。

新输出的外置 `scene-layout-asset-groups` version 2 JSON 包含：

- `assets`：每个优化后 filename key 的 physical path、hash、大小、源 key、源大小和
  是否转换；
- `initialMode` / `initialAssets`：首次进入游戏需要的完整资源集合；
- `groups[].requiredAssets`：该 group 独立运行所需的完整闭包；
- `groups[].incrementalAssets`：`requiredAssets - initialAssets`，即初始资源已加载后
  还需增加的部分；
- `optimization`：cwebp 版本/质量、FFmpeg/FFprobe exact 版本、AAC codec/container/三类
  码率、图片/音频转换数量、音频输入输出体积和 ZIP 前后体积。无 typed 音频时 FFmpeg/FFprobe
  不执行，对应 version 为 `null`；parser 仍可显式读取历史 version 1 JSON。

分组类型包括 `shared`、`runtime-resource`、`mode`、`transition`、`symbols`、
`award-celebration` 和 `spine-popup`。每个 manifest `runtimeResources` 程序键拥有独立的
`runtime-resource:<key>` 增量闭包，不进入 initial/shared。模式名不硬编码为 BaseGame/FreeGame。转场由 source mode
拥有：`A -> B` 属于 A，`B -> A` 属于 B。初始集合包含 shared、initial mode、
initial mode 使用的 symbols、award popup，以及 initial mode 发出的转场及其 prelude closure；
没有 transition owner 的 programmatic Spine Popup 进入 initial，非 initial source 的 transition-only Popup 留在增量组。
缺少 node `gameMode` 的旧普通图层和显式全局普通图层进入 `shared` 并出现在每个 mode 的完整闭包；绑定单一 `gameMode` 的普通图层只进入 exact mode。背景继续由各 mode 的 `backgroundNodes` 拥有，图层 `order` 不参与资源归属。

资源允许同时出现在多个 `requiredAssets` 闭包中，但每个优化资源必须至少被一个 group
覆盖。所有列表与 JSON key 都确定性排序；相同输入和相同 cwebp 输出会得到 byte-equal
ZIP/JSON。

## 失败策略

以下情况会显式失败且不留下半成品：不安全或超限 ZIP、缺 control file、legacy 或
mixed path、manifest/schema 错误、assets map hash/size/path/orphan 错误、缺 nested
dependency、未知资源合同、WebP 目标 key 冲突、cwebp 不可用/失败/输出非法，以及输出
路径已存在。音频还会在以下情况失败：FFmpeg/FFprobe 不可用、不是恰好一条纯 audio stream、
manifest 与 assets map media type 不一致、目标 `.m4a` filename key 冲突、输出不是 AAC-LC/M4A，
binding 含多个 fallback source，或输出声道数/采样率改变。

本工具只结构化改写已知 manifest/VNI 字段，不扫描 JSON 字符串猜测资源路径，也不根据
文件名推断 BaseGame、FreeGame、Symbols 或 BigWin。Popup binding 的 root `order` 在优化重写中原样保留。无效果、Spine 与 video transition 的分组都包含其可选 `preludePopup` 精确闭包；无效果本身不增加资源。`spine-popup.usedByTransitions` 记录每条精确有向边（不同边可引用不同 Popup），只有 initial mode 发出的边或显式 programmatic popup 才进入 initial assets。

## 验收

```bash
pnpm --filter gamelayoutpkgcli typecheck
pnpm --filter gamelayoutpkgcli lint
pnpm --filter gamelayoutpkgcli test
pnpm --filter gamelayoutpkgcli build
pnpm --filter gamelayoutpkgcli format:check
```

# gamelayoutpkgcli

`apps/gamelayoutpkgcli` 是本地 Scene Layout production ZIP 后处理工具。它使用本机
`cwebp` 把包内 PNG/JPEG 转成 WebP，结构化改写所有受支持的资源引用，重新生成
content-addressed payload 与 `assets.map.json`，并在 ZIP 外输出一份可供后续 loading
优化使用的资源分组 JSON。

本工具不改美术源 ZIP，不实现合图，也不修改 runtime loading 策略。

## 前置条件

- Node.js 24 和仓库使用的 `pnpm`。
- 本机可执行 `cwebp -version`。默认从 `PATH` 查找，也可用 `--cwebp` 指定绝对路径。
- 输入必须是当前 filename-key、mapped、version 1 的 Scene Layout production ZIP；
  legacy direct-path ZIP 会显式失败。

WebP 转换当前使用 `cwebp -quiet -q <quality>`，因此是有损压缩。默认质量为 `80`。
上线前仍需由美术人工抽查画质，尤其是透明边缘、渐变、文字和细线。

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
  --cwebp /opt/homebrew/bin/cwebp
```

参数：

- `--input <zip>`：必填，源 Scene Layout ZIP。
- `--output <zip>`：可选，默认与输入同目录，文件名加 `.optimized.zip`。
- `--assets-json <json>`：可选，默认与输入同目录，文件名加
  `.assets-groups.json`。
- `--quality <0..100>`：可选，默认 `80`，原样传给 `cwebp -q`。
- `--cwebp <executable>`：可选，默认 `cwebp`。

输入、ZIP 输出和 JSON 输出必须是三个不同路径。任何输出已存在时工具都会拒绝覆盖；
ZIP 与 JSON 作为一对提交，第二个文件提交失败时会回滚第一个文件。

## 输出合同

优化 ZIP 仍是标准 Scene Layout production package：

- 根目录只有正式 control files 与 content-addressed payload；
- `layout.manifest.json` 和 nested image-string、Symbols、Popup、VNI JSON 中受支持的
  typed 图片引用会更新为 WebP filename key；
- Spine atlas page logical name、VNI `originalName` 和业务 identity 保持不变；
- `assets.map.json` 的 path、SHA-256、media type 和 byte length 按优化后 bytes
  重新生成；
- 旧图片 payload 和资源分组 JSON 不进入 ZIP。

外置 `scene-layout-asset-groups` version 1 JSON 包含：

- `assets`：每个优化后 filename key 的 physical path、hash、大小、源 key、源大小和
  是否转换；
- `initialMode` / `initialAssets`：首次进入游戏需要的完整资源集合；
- `groups[].requiredAssets`：该 group 独立运行所需的完整闭包；
- `groups[].incrementalAssets`：`requiredAssets - initialAssets`，即初始资源已加载后
  还需增加的部分；
- `optimization`：cwebp 版本、质量、转换数量和 ZIP 前后体积。

分组类型包括 `shared`、`runtime-resource`、`mode`、`transition`、`symbols` 和
`award-celebration`。每个 manifest `runtimeResources` 程序键拥有独立的
`runtime-resource:<key>` 增量闭包，不进入 initial/shared。模式名不硬编码为 BaseGame/FreeGame。转场由 source mode
拥有：`A -> B` 属于 A，`B -> A` 属于 B。初始集合包含 shared、initial mode、
initial mode 使用的 symbols，以及 initial mode 发出的转场；Popup 保持独立 group，
供业务按触发时机决定是否预加载。

资源允许同时出现在多个 `requiredAssets` 闭包中，但每个优化资源必须至少被一个 group
覆盖。所有列表与 JSON key 都确定性排序；相同输入和相同 cwebp 输出会得到 byte-equal
ZIP/JSON。

## 失败策略

以下情况会显式失败且不留下半成品：不安全或超限 ZIP、缺 control file、legacy 或
mixed path、manifest/schema 错误、assets map hash/size/path/orphan 错误、缺 nested
dependency、未知资源合同、WebP 目标 key 冲突、cwebp 不可用/失败/输出非法，以及输出
路径已存在。

本工具只结构化改写已知 manifest/VNI 字段，不扫描 JSON 字符串猜测资源路径，也不根据
文件名推断 BaseGame、FreeGame、Symbols 或 BigWin。

## 验收

```bash
pnpm --filter gamelayoutpkgcli typecheck
pnpm --filter gamelayoutpkgcli lint
pnpm --filter gamelayoutpkgcli test
pnpm --filter gamelayoutpkgcli build
pnpm --filter gamelayoutpkgcli format:check
```

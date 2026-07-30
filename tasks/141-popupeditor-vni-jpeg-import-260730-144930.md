# 141 popupeditor-vni-jpeg-import 执行报告

UTC：2026-07-30T14:49:30Z

## 最终实现

- `apps/popupeditor/src/io/resource-import.ts`
  - 将 PNG、WebP、JPEG 类型识别改为直接比较 `Uint8Array` magic bytes。
  - 图片探测不再调用严格 UTF-8 `TextDecoder`。
  - JSON 与 Spine atlas 仍保留 `TextDecoder("utf-8", { fatal: true })` 严格文本边界。
- `apps/popupeditor/tests/resource-import.test.ts`
  - 新增唯一 runtime VNI bundle 内含 JPEG asset 的确定性 ZIP 回归。
  - 断言 JPEG filename key、`image/jpeg`、runtime 自动选择和完整 dependency count。
  - 新增高位 unknown binary 的领域错误回归。
  - 新增非法 UTF-8 JSON 仍带 source path 严格失败的回归。

未修改 public API、schema、共享 package、README、领域规则、依赖或 lockfile。

## 关键决策与计划偏差

- 图片是二进制边界，使用数值 magic-byte comparison；没有放宽文本 decoder，也没有按
  扩展名猜 MIME 或忽略未知资源。
- 自动化使用仓库已有 VNI/JPEG 资源构造确定性 ZIP，没有提交用户的 8 MB 外部文件。
- 代码与自动化范围符合计划。
- 浏览器 UI 人工验收由用户明确接手，因此本报告记录为待完成；执行会话已完成真实 ZIP
  对正式 importer 的只读验证。

## 验收结果

失败回归在修复前准确复现：

- `resource-import.test.ts`：新增 JPEG VNI 与高位 unknown binary 两项均在
  `imageType()` 的 fatal UTF-8 decode 处失败。

修复后：

| 命令                                     | 结果                     |
| ---------------------------------------- | ------------------------ |
| `pnpm --filter popupeditor typecheck`    | 通过                     |
| `pnpm --filter popupeditor test`         | 通过，4 files / 16 tests |
| `pnpm --filter popupeditor lint`         | 通过                     |
| `pnpm --filter popupeditor build`        | 通过                     |
| `pnpm --filter popupeditor format:check` | 通过                     |
| `git diff --check`                       | 通过                     |

Build 仅有既有的 Vite `>500 kB` chunk warning。

真实输入：

```text
path: /Users/zerro/Downloads/crave_superwin.zip
sha256: b92bb85cc69b8c9e7a8e27f5a861d63b4597f9ac22c592ae70266301002f85a4
```

使用真实文件直接调用 `discoverPopupResources()` 的结果：

```text
candidate count: 1
rootKey: crave_superwin.json
selectedProfileId: runtime_100
dependencyCount: 15
JPEG key: image_asset_image_ms4gxgzv_1i.jpg
JPEG mediaType: image/jpeg
JPEG byteLength: 317737
```

## 待完成人工验收

用户将自行在真实浏览器执行：

1. 运行 `pnpm --filter popupeditor dev`。
2. 在“导入资源”选择上述 SHA-256 的 `crave_superwin.zip`。
3. 确认不弹 profile 选择，审查显示 `crave_superwin.json`、15 个 dependencies 和 JPEG
   key。
4. 确认页面错误区及 console 无原始 `TextDecoder` 异常。

## 剩余风险

- Magic bytes 只负责格式分类；完整 JPEG 的浏览器/runtime decode 仍由实际
  preview/prepare 显式验证。
- 自动化和真实 importer 已通过，浏览器 UI 入口的最终人工确认仍待用户完成。

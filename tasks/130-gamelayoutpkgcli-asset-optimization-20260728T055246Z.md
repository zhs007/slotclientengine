# Task 130 执行报告：Game Layout Package 本地优化 CLI

- 执行时间（UTC）：`2026-07-28T05:52:46Z`
- 基线：`621a696bdf2717c61934c644078f02cf2d3187ce`
- 工作区：detached HEAD 上直接实现；未创建分支、未提交、未 push
- 任务结果：CLI、正式 ZIP、asset-groups v1、测试、文档与规则已完成
- 人工保留项：WebP 最终画质仍需美术签字

## 1. 交付结论

新增 `apps/gamelayoutpkgcli`，本地消费当前 filename-key Scene Layout v1 production
ZIP，完成以下流程：

1. bounded ZIP、root manifest、gameModes、assets map hash/size/path/orphan 与完整 nested
   closure 严格校验；
2. 通过 argv 方式调用本机 `cwebp`，把 PNG/JPG/JPEG 转为 WebP，相同源 digest 只编码
   一次；
3. schema-aware 改写 layout、image-string、Symbols、Popup、VNI 的 typed 图片引用，
   保留 Spine atlas page、VNI `originalName` 和业务 identity；
4. 重建完整 SHA-256 content-addressed payload、`assets.map.json` 和确定性 ZIP；
5. 在 ZIP 外输出 version 1 `scene-layout-asset-groups` JSON；
6. ZIP/JSON 成对提交，不覆盖已有文件，第二文件提交失败时回滚 ZIP。

本任务未修改 Game Layout Editor、游戏 runtime/loading，未实现合图或物理分包。

## 2. 资源分组语义

- 使用 manifest 的真实 `initialMode` 和 mode id，不硬编码 BaseGame/FreeGame。
- `shared` 保存非 mode background 的公共节点闭包。
- `mode:<id>` 保存 shared + 该 mode 所有 variant background 的完整闭包。
- `transition:<from>-><to>` 归 source mode；正反向边分别属于各自 source。
- `symbols:<packageId>` 与 `award-celebration:<popupId>` 保存完整 nested dependency
  closure，并记录 `usedByModes`。
- `initialAssets` 包含 shared、initial mode、initial symbols 和 initial mode 发出的
  transitions；Popup 保持独立事件组。
- 每组同时保存 `requiredAssets` 和 `requiredAssets - initialAssets` 的
  `incrementalAssets`。闭包允许重叠，但全部优化资源必须至少被一个 group 覆盖。

JSON 还记录每个 logical asset 的新 physical path/hash/大小、源 key/源大小/转换标志，
以及 cwebp 版本、质量、转换数量和 ZIP 前后体积。

## 3. 自动化测试

`gamelayoutpkgcli`：

```text
pnpm --filter gamelayoutpkgcli lint        passed
pnpm --filter gamelayoutpkgcli typecheck   passed
pnpm --filter gamelayoutpkgcli test        6 files / 17 tests passed
pnpm --filter gamelayoutpkgcli build       passed
pnpm --filter gamelayoutpkgcli format:check passed
CI=true pnpm install --frozen-lockfile     passed
```

覆盖率：

| statements | branches | functions | lines  |
| ---------- | -------- | --------- | ------ |
| 72.96%     | 57.22%   | 78.18%    | 73.84% |

测试覆盖参数解析、任意 mode id、initial/delta/source-transition、WebP target collision、
digest 去重、非法 cwebp 输出、map 篡改、输入 control/schema 边界、typed reference
rewrite、确定性输出、不覆盖、双文件 rollback 和 JSON 外置。

整仓 L3：

```text
pnpm typecheck      35/35 passed
pnpm build          35/35 passed
pnpm format:check   35/35 passed
git diff --check    passed
```

两个未由本任务引入的整仓基线问题：

- `pnpm lint` 在未修改的
  `apps/gamelayouteditor/tests/zip-io.test.ts:8` 失败：
  `stableManifestJson` 已定义但未使用；新 CLI lint 已通过。
- `pnpm test` 中相关 package 与新 CLI 均通过，但未修改的
  `packages/netcore/tests/main-adv.test.ts` 7 个用例各自 10 秒超时，之后 Vitest
  worker 未自行退出；确认无新输出后终止整仓命令。未为通过验收越界修改 netcore。

## 4. 真实 cwebp 验收

输入使用仓库当前正式样例 `assets/crave` 生成的临时 ZIP，只在
`/tmp/gamelayoutpkg-task130.FDL8y1` 执行，未修改 `assets/`：

| 项目                             | 结果                                                     |
| -------------------------------- | -------------------------------------------------------- |
| cwebp                            | `1.6.0`，`-quiet -q 80`                                  |
| 输入 ZIP                         | `9,832,922` bytes                                        |
| 输出 ZIP                         | `2,913,753` bytes                                        |
| 体积减少                         | `6,919,169` bytes，约 `70.4%`                            |
| 转换图片                         | `89`                                                     |
| logical assets                   | `124`                                                    |
| ZIP entries                      | `120`                                                    |
| ZIP 内 PNG/JPEG physical entries | `0`                                                      |
| ZIP 内 asset-groups JSON         | `0`                                                      |
| initial mode / assets            | `BaseGame` / `80`                                        |
| groups                           | `1 popup + 2 mode + 1 shared + 1 symbols + 2 transition` |

Popup `bigwin2` 的完整闭包为 55 个资源，initial 后增量为 44。BaseGame/FreeGame、
Symbols 和两条 transition 的完整闭包均被记录；本样例的大量闭包复用导致部分
incremental 为空，这是 `required - initial` 的预期结果，不丢失完整归属。

两次独立真实运行结果 byte-equal：

```text
ZIP  SHA-256 1d4364faa47900757f5cdcbe71f9dc70f1167209ffb255b70d7506f444178c94
JSON SHA-256 a01cb9c3103733b2be6cfcbfc453f3008e62da430f71f0e253f8d14973f3d480
```

输出 ZIP 再次通过 production package 与 assets-map 校验。抽查最大图片 `Symbol.png`
（4,912,488 bytes）到 `Symbol.webp`（818,468 bytes），尺寸、透明区域和主要视觉内容
保持；有损压缩的最终主观质量仍由美术确认。

## 5. 主要文件

- `apps/gamelayoutpkgcli/src/cli.ts`
- `apps/gamelayoutpkgcli/src/package-reader.ts`
- `apps/gamelayoutpkgcli/src/image-optimizer.ts`
- `apps/gamelayoutpkgcli/src/reference-rewriter.ts`
- `apps/gamelayoutpkgcli/src/package-writer.ts`
- `apps/gamelayoutpkgcli/src/asset-groups.ts`
- `apps/gamelayoutpkgcli/tests/**`
- `apps/gamelayoutpkgcli/README.md`
- `pnpm-lock.yaml`
- `AGENTS.md`
- `docs/agent-rules/scene-layout.md`
- `docs/agent-rules/editor-artifacts.md`

## 6. 剩余风险与后续边界

- quality 80 是有损 WebP；不同 cwebp 版本可能产生不同 bytes/hash。
- 当前采用 bounded 内存 ZIP 和顺序图片转换，大包峰值内存仍受 production ZIP 上限
  约束。
- asset-groups JSON 只提供后续 loading/合图输入；本任务不改变 runtime 首屏加载量。
- 合图、按组物理拆包、CDN 发布和 loading gate 属于后续任务。

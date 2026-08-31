# Task 272 gamelayoutpkgcli 扁平 hashed CDN 交付执行报告

UTC：2026-08-31T04:08:32Z

## 最终实现

- `gamelayoutpkgcli --delivery-dir` 新输出 `scene-layout-delivery` version 2。metadata ZIP、WebP atlas 与外置媒体均以
  `<full-sha256>.<ext>` 平铺在同一目录，manifest 以 `delivery.<full-sha256>.json` 同目录输出；CLI 返回并打印 exact
  manifest filename、新增文件数与复用文件数。
- CDN 扁平化只影响外层交付文件；metadata ZIP 内部及 `assets.map.json` 继续使用标准
  `assets/<sha256>.<ext>` package path，runtime logical mapping 没有被 CDN filename 取代。
- delivery publisher 改为 append-only flat pool：已有同名文件必须 byte-equal，只 hard-link 新文件，payload 排序发布且
  manifest 最后发布；旧 hashed manifest/payload 不覆盖、不删除。`--check` 验证当前 candidate closure，同时允许其它合法
  hashed 旧版本。
- RenderCore 增加 strict v2 schema、flat/hash/extension filename 校验与 manifest filename/version dispatch；历史 v1
  `delivery.manifest.json` reader 保持原 nested path 语义。
- `loadSceneLayoutDeliveryFromUrl()` public options 改为显式 `{ urlPrefix, manifestFilename }`；manifest、chunk、atlas、
  external media 全部只相对该 HTTP(S) directory prefix 解析。prefix 必须以 `/` 结尾且不能含 credential、query 或 hash。
- 更新 `apps/gamelayoutpkgcli/README.md`、`packages/rendercore/README.md` 与 Scene Layout 长期规则，并补充 v1/v2、URL、
  deterministic build、flat hash、append-only reuse、partial pool、冲突与非法目录测试。

## 关键决策与计划偏差

- manifest 对 stable JSON bytes 求 SHA-256，但不包含自引用 hash；调用方保存 CLI 输出的 exact filename，不生成
  `latest.json` 或 unhashed alias。
- runtime 不重新 hash 下载内容；v2 parser 校验 route filename 中的 hash 与声明一致，完整 bytes parity 仍由 builder 与
  `--check` 承担，符合 runtime 不做全包完整性 gate 的仓库规则。
- 为保证并发 append-only 发布不误删其它 publisher 的对象，payload 一旦进入共享 pool 即不回滚。中途失败可能留下未被
  manifest 引用、以后可复用的 content-addressed payload，但 manifest-last 保证不会出现指向缺失依赖的新入口；这是对计划
  中“清理本次新建文件”措辞的安全收紧。
- 计划预计可能调整 `apps/gamelayoutpkgcli/src/types.ts` 与 `tests/cli.test.ts`，最终 public result 可直接在 `cli.ts` 表达，
  CLI 参数本身未变化，因此无需修改这两个文件。
- 未修改 lockfile 或依赖声明。worktree 初始缺 package-local `node_modules`，验收时临时复用同仓库主 checkout 的既有依赖；
  这些链接不属于提交内容。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore --filter gamelayoutpkgcli typecheck`：通过。
- RenderCore 定向 Vitest：2 files / 8 tests 通过。
- gamelayoutpkgcli 定向 Vitest：2 files / 8 tests 通过。
- `pnpm --filter @slotclientengine/rendercore --filter gamelayoutpkgcli build`：通过。
- 本次修改的 TypeScript、Markdown、README 与任务计划 Prettier check：通过。
- 本次修改的两个 package TypeScript 定向 ESLint：通过。
- 双包全量 `format:check` 未通过，失败仅来自本任务未修改的既有文件：
  `packages/rendercore/benchmarks/image-string-hot-path.mjs`、`src/popup/editor.ts`、
  `src/presentation/spine-slot-attachment.ts`。未顺手格式化这些无关文件。
- `git diff --check`：通过。

## 人工验收与剩余风险

- 自动化 fixture 已验证相同输入生成 byte-equal 文件集合、重复发布零新增、partial pool 补齐、旧合法对象保留、同名不同
  bytes 与 nested entry 显式失败；未使用正式 production ZIP 做命令行人工发布，也未验证“只改变一个 external bytes”时的
  实际增量上传清单。
- 未在真实浏览器把 JS 与资产部署到不同 origin/path，也未验证媒体播放、Network 请求、CORS、immutable cache header 或
  浏览器 disk-cache 命中；这些不能由 mock fetch 或单测替代。
- append-only pool 不执行 GC。旧 manifest 仍可能被客户端引用，对象生命周期、引用追踪、上传与 CDN purge 继续由部署侧
  管理。
- `loadSceneLayoutDeliveryFromUrl()` 的 TypeScript 参数是明确 breaking change；仓库内没有 source consumer，仓库外调用方需按
  README 迁移到 `urlPrefix + manifestFilename`。

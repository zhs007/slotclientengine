# 159 Symbols Editor VNI Bundle ZIP 导入执行报告

## 结果

任务 159 的 VNI export bundle 识别、runtime profile 选择、flat filename-key materialize、
Symbols Editor 导入事务、自动化测试、真实下载素材 headless 验收、production build 和文档
已完成。真实浏览器视觉与交互验收按用户要求由用户执行，当前待用户验收。

最终行为：

- 根 `manifest.json.type=vni_export_bundle` 由 rendercore symbol helper 调用 vnicore 正式
  parser/validator 识别，完整校验 manifest、全部 project/profile、路径、asset closure 和
  orphan。
- 只有 `purpose=runtime` 进入候选；唯一 runtime 自动选择，多个 runtime 使用受控下拉框，
  取消或 destroy 会结束 pending choice 且不提交。
- 只 materialize 所选 runtime project 与 exact assets；project/asset 使用 flat filename key，
  VNI refs 结构化改写，`originalName`、asset/layer identity 与 `exportProfile` 保持不变。
- VNI bundle sources 与 ordinary sources 进入既有 filename-key review/原子 commit；不导入
  bundle manifest/editing profile，不自动绑定 symbol/state，也不复制 hash/collision 算法。
- Symbols project ZIP、ImgNumber ZIP、generic ZIP、loose image/Spine/standalone VNI 的现有
  路由保持，回归测试通过。

## 实际修改

新增：

```text
packages/rendercore/src/symbol/vni-export-bundle.ts
packages/rendercore/tests/symbol/vni-export-bundle.test.ts
apps/symbolseditor/src/io/vni-bundle-import.ts
apps/symbolseditor/tests/vni-bundle-import.test.ts
tasks/159-symbolseditor-vni-bundle-zip-import.md
tasks/159-symbolseditor-vni-bundle-zip-import-260804-071320.md
```

修改：

```text
packages/rendercore/src/symbol/index.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/README.md
```

未修改 vnicore/editorresource/browserartifactio 合同、Symbols manifest schema、游戏资源、
其它 editor/game、依赖版本、`pnpm-lock.yaml`、根规则或领域规则。

## 真实素材证据

输入：

```text
/Users/zerro/Downloads/minecart2/minecart2-symbols.zip
SHA-256: 3dd2491612d053877c15d1662d6927010479c562b30c0f45f619c9e3f47882f8

/Users/zerro/Downloads/minecart2/矿工低级图标/l1.zip
SHA-256: 74d09fad79689f41fa171132d49f2d5e58b8ee11b8d721e58b145226933af49c
```

headless 验收结果：

- `minecart2-symbols.zip` 成功打开。
- `l1.zip` 只枚举 `runtime_100`，closure bytes 为 23,667。
- materialize 输出 `l1.json` 和
  `a_asset_image_ms7b1vaz_8.png`（20,430 bytes）；project asset path 改写为同名 flat key，
  `originalName` 保持 `A.png`。
- 两项 review action 均为 `add`；commit 后 `l1.json` kind 为 `vni-project`，图片存在，原
  imported project 对象没有被修改。

## 测试与验收

最终通过：

- rendercore typecheck。
- Symbols Editor typecheck。
- rendercore 定向：3 files / 15 tests。
- Symbols Editor 定向：4 files / 40 tests。
- 真实 Downloads 双 ZIP 临时验收：1 file / 1 test；临时测试文件已删除。
- rendercore build（作为 Symbols Editor dependency build 的一部分）。
- Symbols Editor Vite production build。
- Prettier target formatting 与 `git diff --check`。

Vite build 仍报告现有主 chunk 超过 500 kB 的 warning；build 成功，本任务未改变 chunk
ownership 或引入依赖。

依赖准备首次暴露 shell 未提供 Node；切换到仓库要求的 Node `v24.14.0` 后使用 frozen
lockfile 完成安装。pnpm 报告 esbuild/sharp install scripts 按当前安全策略未执行，但现有
预构建包足以完成全部 typecheck/test/build，lockfile 未变化。

## 与计划的适配

- 按计划新增独立 rendercore `vni-export-bundle.ts`，没有把职责塞入现有
  `introspection.ts`。
- 没有修改 `resource-import.test.ts` 或 `zip-io.test.ts`；新 adapter 的真实
  export→reimport closure 测试集中在 `vni-bundle-import.test.ts`，既有两组测试作为回归
  一并通过。
- `app-shell.test.ts` 在 typecheck 中暴露 7 处既有 Uint8Array/DOM `BlobPart` 类型不兼容；
  仅在该任务已修改的测试文件中补显式 test-only cast，无生产行为变化。
- 没有更新领域规则：现有规则已覆盖 runtime profile、filename-key、结构化 VNI ref、strict
  closure 和禁止自动绑定的职责边界。

## 待用户浏览器验收

1. 启动 `pnpm --filter symbolseditor dev`，打开真实 `minecart2-symbols.zip`。
2. 导入真实 `矿工低级图标/l1.zip`，确认自动选择 `runtime_100`，结果只出现 `l1.json` 与
   `a_asset_image_ms7b1vaz_8.png`，不出现 `manifest.json` 或 `edit_full`。
3. 从 Resource Picker 显式绑定 `l1.json`，确认 VNI preview/replay；导出重导后确认 binding
   与画面。
4. 复验多 runtime 选择/cancel（如有素材）和 browser console；cancel 后项目不变化。

## 剩余风险

- 自动化与真实素材 headless 链路证明 bundle/profile/closure/transaction 正确，但真实
  WebGL/VNI 视觉、dialog interaction 和浏览器环境差异仍需用户验收。
- 新导入且未绑定的 VNI 遵循现有 exact closure 规则，不会随 production ZIP 导出；用户需
  显式绑定后再导出，这是预期行为。

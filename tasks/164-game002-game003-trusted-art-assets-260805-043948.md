# 任务 164 执行报告：game002/game003 trusted-art 美术资源

## 结果

game002 与 game003 的 runtime 固定采用 directory-authoritative 资源路由。两款正式游戏的 runtime、
Vite 资源生成和 release checker 不再用 `assets.map.json` 中的 `sha256`、
`byteLength`、content-addressed 文件名或目录 exactness 阻断美术交付；额外文件、
未引用且缺失/格式陈旧的 map entry 也不会阻断游戏。

仍保留以下必要约束：实际被 layout/runtime 引用的 logical key 必须映射到安全的
`assets/` canonical path，文件必须存在，并能通过对应 JSON、图片、Spine/VNI 等
语义解析与 prepare 流程。editor/export/optimizer 和其他 consumer 默认仍使用原有
严格 `editor-package` integrity 校验。

## 基线与改动范围

- 执行基线：`41279e7c78894b5d0f8d8866e8985e0e36ca2f26`。
- rendercore scene-layout runtime resolver 不再包含 hash/size integrity 分支或
  bypass policy；game002/game003 无需传参即可使用当前美术 bytes。
- 专用 Vite 资源生成脚本和 release checker 直接以当前美术目录为权威。
- 新增 runtime 与 generator 定向测试，覆盖 metadata drift、额外文件、未引用缺失
  entry、unsafe path、实际引用缺失和 lazy load。
- 更新两款游戏 README 与 game002/game003/scene-layout 领域规则。
- 未修改正式 art payload、`assets.map.json`、generated Vite URL 文件或
  `pnpm-lock.yaml`。

计划外增加了 `apps/game002/src/loading-resources.ts` 的最小适配：原实现会在模块
初始化时读取所有 deferred entry 的 `path`，导致“未引用且缺失的 map entry”在进入
runtime resolver 前就抛错；现在只收集实际声明了 string path 的 deferred entry。

环境初始缺少 `node_modules`，按计划执行了
`CI=true pnpm install --frozen-lockfile`；没有产生 lockfile 变更或新增依赖。

## 自动验收

以下命令均通过：

- `pnpm --filter @slotclientengine/rendercore typecheck`
- `pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/package-resource.test.ts tests/scene-layout/production-zip.test.ts tests/scene-layout/vite-resource-generator.test.ts`
  —— 最终版本 3 个测试文件、18 个测试通过。
- `pnpm --filter game002 --filter game003 typecheck`
- `pnpm --filter game002 --filter game003 test`
  —— game002 26 个文件/190 个测试，game003 16 个文件/60 个测试通过。
- `pnpm --filter game002 release:check && pnpm --filter game003 release:check`
  —— 两款游戏的资源 parity、生产构建与 static dist checker 通过。
- `git diff --check`
- 变更范围检查确认 `assets/`、generated resource files 与
  `pnpm-lock.yaml` 无 diff。

## 待完成的人工验收

真实浏览器验收由用户完成，当前标记为待验收：

1. 使用 hash/size 已 drift 的最终美术交付启动 game002，确认 loading 可完成且不再
   出现 mapped asset hash/size validation error。
2. 启动 game003，确认 Minecart2 layout、Symbols、Spine/VNI、主转轮与 popup 显示
   当前 physical files。
3. 两款游戏分别执行 normal spin 与 destroy/re-enter，确认 lazy prepare 没有空白、
   半提交 player 或泄漏。

## 剩余风险

取消目录完整性 gate 是本任务的预期取舍，正式交付的视觉内容和动画效果需以上述
浏览器验收为准。实际引用资源的安全路径、存在性与 decoder failure 仍为严格失败，
未通过自动降级或猜测路径掩盖错误。

## 后续修正

确认 `generate-scene-layout-vite-resources.mjs` 的正式调用方只有 game002/game003，
editor 不使用该脚本后，删除了生成器中无调用方的默认严格分支及
`--trust-art-directory` 开关。生成器现在始终忽略 map hash/size、content-addressed
filename 和目录 exactness；editor/export/optimizer/ZIP 的严格 integrity 校验仍由
各自 package validator 负责。

进一步核对 Windows runtime 报错后，移除了 `package-resource.ts` 中隐式的默认
hash/size 分支和 `mappedAssetPolicy` 接口。runtime 现在天然只做安全路由与语义校验；
gamelayouteditor 已显式调用 `validateEditorAssetsMapPackage()`，production ZIP inspection
也在 resolve 前显式调用该 validator，因此严格完整性边界保持不变且不再影响 game。

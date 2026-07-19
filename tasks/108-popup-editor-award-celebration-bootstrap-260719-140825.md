# 任务 108 执行报告：Popup Editor / Award Celebration Bootstrap

## 结论

本次已完成并严格验收通用 popup 编辑、运行、layout 汇总链路；`game003` / `game002` production 切换因仓库没有真实“获奖金额 ImgNumber”资源而按计划停止，未使用 `cn-digits`、字体或测试 glyph 顶替。因此任务整体状态为：

> 通用链路完成并通过自动化验收；production game migration 阻塞，整项不标记为“完成”。

最终浏览器交互验收按用户要求由用户执行，本报告在末尾给出步骤。

## 执行现场

- 仓库：`/Users/zerro/github.com/slotclientengine`
- 分支：`main`
- 基线 HEAD：`e4e0250`
- Node：`v24.14.0`
- pnpm：`10.0.0`
- 初始未跟踪计划文件：`tasks/108-popup-editor-award-celebration-bootstrap.md`、`tasks/110-editor-resource-management-unification.md`
- 已保护任务 110 文件，未修改、格式化、删除、stash、reset 或 clean 用户文件。
- 执行过 `pnpm install` 以注册新 workspace app；沙箱内离线安装失败后，经授权在沙箱外正常安装成功。未设置或使用 HTTP/HTTPS 代理。

## 实现结果

### Browser Artifact IO

- 新增通用 logical resource id 建议与严格校验。
- 新增 Web Crypto 完整 SHA-256、`assets/<64-hex>.<ext>` allocator。
- 新增 bounded source index、exact / unique ASCII case-fold resolution、碰撞和限额校验。
- 保持 shared package 无 editor、Pixi 或 popup 业务语义。

### RenderCore Popup Runtime

- 新增 strict `popup.manifest.json` v1 / `award-celebration` parser。
- 固定 `base -> standard -> bigwin -> superwin -> megawin` 五档；后三档阈值显式、严格递增。
- 使用 `BigInt` 做无精度损失的 bet 倍数边界比较，覆盖 0、1x、15x、30x、50x 和阈值以上输入。
- 每档强制非空有序 layers，并强制 `start / loop / end` 都有动态 image-string 金额 coverage。
- 支持 image、image-string、VNI segmented、official Spine 4.3 segmented animations 图层。
- 金额格式、计数时长、点击跳档、`awaiting-dismiss`、dismiss、旧档 ending drain、restart、destroy 均由 manifest/runtime 驱动。
- 新增 files 与 HTTP(S) CDN loader、nested image-string / VNI / Spine 精确传递闭包、尺寸/动画/glyph 校验和失败回滚。
- game003 等价 fixture 锁定真实 VNI project duration `2.9s`、loop boundary `1 / 2.5`、threshold `15 / 30 / 50`。

### Popup Editor

- 新增 `apps/popupeditor` Vite + TypeScript + Pixi v8 纯前端 app。
- 实现 resource-first typed project/store；上传资源不会自动绑定 layer。
- 统一 files/folder 入口可识别 PNG、完整 VNI、official Spine 4.3、standalone image-string ZIP/目录。
- 导入前展示 proposed id、kind、primary source、依赖数、摘要、文件数和 bytes；确认后单 transaction 提交。
- owned payload 采用完整 SHA-256 content-addressed path；VNI project 和 Spine atlas/page mapping 结构化物化。
- logical resource 支持引用计数、同 kind 原子替换、保留 id/binding、删除与 package file/blob GC。
- 固定五档编辑；可编辑 threshold、count duration、layer order/transform、image anchor/segments、VNI loop points/particle、Spine exact animation names。
- 项目区可编辑 design viewport 和 amount format。
- preview 使用 production RenderCore player，支持常用/自定义分辨率、fit/25%~200% zoom、guides、bet/win、play/replay/advance/dismiss/immediate cleanup。
- 实现 deterministic `<popup-id>-popup.zip` 导入导出、唯一 sentinel 和精确闭包。

### Game Layout Editor / Scene Layout

- scene-layout v1 向后兼容地增加可选 popup dependencies、award-celebration binding 和 variant placement。
- placement 只保存相对 viewport center 的 root `x/y/scale`；runtime 在 viewport 应用时重新定位，不改变 popup 内部坐标。
- layout package files/CDN loader 校验并准备 nested popup exact closure。
- scene、reel、background、popup 在同一 package runtime update 中推进；公开 `getAwardCelebrationPopup()`。
- Game Layout Editor 可导入、替换、删除 popup dependency，配置 active variants placement，驱动预览，并 deterministic vendor 到最终 layout ZIP；重新导入可重建 dependency/binding。

### 文档和协作规则

- 新增 `docs/popup-manifest.md`。
- 更新 popupeditor、gamelayouteditor、rendercore、browserartifactio README。
- 更新 scene-layout manifest 文档。
- 更新根 `agents.md` ownership；明确 production ImgNumber 未提供前保留现有 game win-amount 路径，禁止假迁移。

## Production 资源盘点与阻塞项

仓库全部 `image-string.manifest.json` 盘点结果只有：

```text
assets/game002-s3/dependencies/image-strings/cn-digits/image-string.manifest.json
```

该资源属于 game002 CN value presentation，仅有 CN 数字语义，不能作为 game003 获奖金额资源。`assets/game003-s1` 没有可严格验证 `$`、`.`、`,`、`0..9` 的 standalone award ImgNumber dependency。

因此本次没有：

- 往 `assets/game003-s1` 写入 fixture glyph 或生成临时图片；
- 用 CN digits 或 Pixi Text/font fallback；
- 删除仍在 production 使用的旧 `win-amount` parser/player/config；
- 改写 game002/game003 YAML、generated static config 或 loading closure；
- 宣称 production migration 已完成。

后续切换条件是美术提供真实 standalone award ImgNumber ZIP，且其 glyph、尺寸和格式字符串通过 strict loader。满足后再用 popupeditor 导出正式 popup package、在最终 layout ZIP 中 vendor，并同步移除旧/new threshold、timing、font/layout 双写。

## 自动化验收

### Scoped 验收

| 范围 | 结果 |
| --- | --- |
| browserartifactio | 1 file / 18 tests 通过；typecheck、lint、build、format 通过 |
| rendercore | 63 files / 439 tests 通过；branch coverage `80.07%`；typecheck、lint、build、format 通过 |
| popupeditor | 4 files / 9 tests 通过；branch coverage `63.70%`；typecheck、lint、build、format 通过 |
| gamelayouteditor | 16 files / 101 tests 通过；typecheck、lint、build、format 通过 |
| buildgamestatic | 4 files / 24 tests 通过 |
| game003 | 27 files / 135 tests 通过；typecheck、build 通过；生成文件确认最新 |
| game002 | 18 files / 95 tests 通过；typecheck、build 通过 |

### 根级验收

- `pnpm typecheck`：27/27 packages 通过。
- `pnpm lint`：27/27 packages 通过。
- `pnpm build`：27/27 packages 通过；只有现有 Vite chunk-size warning。
- `pnpm format:check`：27/27 packages 通过。
- 默认并发 `pnpm test`：第一次在沙箱内因 netcore localhost WebSocket 端口能力受限而超时；沙箱外单测复跑 `main-adv.test.ts` 为 7/7、324ms 通过。第二次沙箱外默认并发命中多个 app 同时重建 shared `gameframeworks/dist` 的竞争，game002 两个 suite 临时解析失败；game002 scoped 已 95/95 通过。
- 最终使用 `pnpm exec turbo run test --concurrency=1` 在沙箱外消除两类环境竞争：**27/27 packages 全部通过**，耗时 `31.602s`。
- `git diff --check`：通过。
- build/static generator 未产生意外 tracked generated churn。

没有降低 coverage threshold、排除新文件或为测试添加 production fallback。

## 最终浏览器验收步骤（由用户执行）

### Popup Editor

1. 使用 Node 24 运行：`pnpm --filter popupeditor dev`。
2. 打开 Vite 输出地址，确认“资源 / 档位 / 项目”三工作区与右侧 preview。
3. 导入一个真实 standalone ImgNumber ZIP，确认先出现 import review，修改/确认 logical id 后资源进入库，且没有自动生成 layer。
4. 分别给五个 tier 增加金额 layer，确认任一 tier/segment 缺 coverage 时项目 diagnostics 阻止合法 manifest/export。
5. 可选导入 game003 单个 VNI project 及其精确引用 assets，配置 `1 / 2.5 / keepParticlesAlive=true`；或导入 official Spine 4.3 并填写大小写精确的 Start/Loop/End 动画名。
6. 调整 layer order、x/y/scale、anchor/segments、threshold `15/30/50` 和 count duration。
7. 切换常用与 custom resolution、zoom/guides，输入 bet/win；验收自然计数、跨档、Advance、awaiting-dismiss、Dismiss、Dismiss immediately。
8. 导出 popup ZIP，再导入项目，确认 manifest、资源、档位和预览可恢复。
9. 在资源卡执行同 kind 替换，确认 logical id 和 layer 引用不变；有引用时删除应显式失败。

### Game Layout Editor

1. 运行：`pnpm --filter gamelayouteditor dev`。
2. 导入上一步 popup ZIP，建立 award-celebration binding。
3. 为所有 active variants 设置相对 viewport center 的 x/y/scale，切换 viewport 验证 root placement。
4. 用 bet/win、Play/Advance 驱动 popup preview，确认其它 scene runtime 未冻结。
5. 导出 layout ZIP、重新导入，再验证 nested popup、binding、variant placement 和播放均恢复。

## 风险与后续

- 唯一产品阻塞是缺真实 production award ImgNumber；在资源到位前不能完成 game003/game002 production 切换，也不能删除旧 win-amount API。
- 默认并发根测试存在共享 package `dist` 重建竞争；本任务以 scoped test 和根级单并发 27/27 全绿完成隔离验收，未扩大范围修改 Turbo pipeline。
- 浏览器真实 GPU/Pixi、文件选择器、下载和视觉节奏仍需按上述步骤人工验收。

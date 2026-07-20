# 任务 110：Editor 资源管理统一与内容寻址执行报告

## 1. 执行结论

任务 110 已按计划完成代码、自动化测试、文档和严格命令验收。三个纯前端编辑器统一提供“上传资源 / 上传文件夹”，owned payload 在导出时使用完整 SHA-256 的扁平 `assets/<64-hex>.<ext>` 路径；image-string、Spine atlas、VNI project、symbol manifest 和 scene-layout 的受支持引用均通过结构化物化改写，不使用文本全局替换。

最终浏览器交互验收按任务约定留给用户执行，本报告不把自动化测试冒充浏览器验收。

## 2. 实施基线

```text
workspace: /Users/zerro/github.com/slotclientengine
branch:    main
HEAD:      ea3e27f
status:    实施开始时 clean
Node.js:   v24.14.0
pnpm:      11.9.0
```

非交互 shell 使用 Codex bundled Node 24 与 pnpm。依赖仅按现有 `pnpm-lock.yaml` 执行 `CI=true pnpm install --frozen-lockfile`，结果 `Already up to date`，未修改依赖版本或 lockfile。

## 3. 实施内容

### 3.1 共享基础能力

- `browserartifactio` 增加 logical resource id 建议/校验、完整 Web Crypto SHA-256、canonical raster 类型检测、content-addressed path 分配、不可变 blob 去重、bounded source 预检/读取和 preview-only fingerprint。
- source file 在 `arrayBuffer()` 前检查 4096 entries、50 MiB 单文件和 500 MiB 总量合同；拒绝 traversal、绝对路径、URL、反斜杠、NFC/case-fold 冲突等非法来源。
- exact canonical content path 允许复用；不同大小写或 NFC spelling 的 alias 继续失败。

### 3.2 Format owner 与物化顺序

- RenderCore image-string 新增 leaf-first materializer：先验证/散列真实 glyph bytes，再结构化改写 glyph path，最后生成稳定 manifest JSON。
- scene-layout parser 允许多个 logical resource/node 复用同一 exact path，但继续拒绝 canonical alias；真实媒体类型和尺寸仍在 prepare 阶段严格验证。
- VNICore 增加只改写已声明 `assets[].path` 的 VNI project API，保留 layer/effect/track 等业务字段。
- Symbols Editor 导出 materializer 对 image、Spine texture/atlas/skeleton、VNI asset/project 和 symbol manifest 做 leaf-first hash-flat 改写；package resources 从改写后的 manifest 精确派生。
- Game Layout Editor 导出 materializer 对 owned image/Spine 做相同处理；image-string、symbols、popup dependency 保持各自自包含 package 边界，不提升到父包 `assets/`。

### 3.3 ImgNumber Editor

- 图片与目录统一进入待映射资源库，文件名只提供 kebab logical id 和字符建议。
- 上传和 ZIP 导入均做 bounded 预检、可取消 import review；上传不会自动建立 glyph 绑定。
- 替换保留 logical image id 和 glyph binding，重新验证真实尺寸。
- legacy code-point path ZIP 可导入；再次导出升级为 hash-flat glyph path；相同 glyph bytes 在 ZIP 内去重。

### 3.4 Symbols Editor

- UI 统一为“上传资源 / 上传文件夹”；单个 image-string ZIP 会自动 bounded 解包并安装为 dependency。
- files/folder 批次在提交前检查完整 Spine 4.3 closure、VNI explicit closure、大小写歧义、诊断和未消费文件，并以一次 project replace 原子提交。
- Picker 不提供 raw path 文本输入，只能选择通过资源库诊断的 typed candidate；上传不会按文件名自动绑定 symbol/state/value。
- v1 draft 编译阶段继续保存 format owner 已解析的引用关系，以保持现有 schema 和 preview API；这些引用不可由用户自由编辑，最终 production 物理路径只由 export materializer 生成，不保留第二套可编辑 path 真相。
- image-string dependency 内容比较改为精确 bytes，不再使用弱 fingerprint 作为 identity。

### 3.5 Game Layout Editor

- 资源栏统一入口；单 ZIP 自动识别 image-string，多图批次和目录内多个完整 Spine group 可一次导入。
- `BG_2.PNG` 默认得到 `bg-2`，图片内容决定 hash-flat path；Spine page、atlas、skeleton 和 texture mapping 同步物化。
- image/Spine/image-string logical resource 带 provenance；替换保留 resource id 和全部 node binding。
- 删除/替换只回收不再被其它 logical resource 引用的 blob；相同 bytes 可被多个 resource 独立使用。
- 导出只包含 manifest 精确闭包，unused/source directory/original basename/provenance 不进入 production ZIP。

## 4. 兼容与边界

- 未升级 image-string v1、symbol-package v1 或 scene-layout v1；parser 继续接受合法 legacy path。
- legacy import 后的重新导出允许 bytes/path canonicalize，但 symbol code、state、animation、slot、scale、priority、value、cascade、layout placement 和 runtime 表现语义不变。
- 未实现 texture atlas packing、图片转码、压缩质量调整、CDN 上传或网络存储。
- 未加入 fallback、宽泛 glob、文件名/symbol-code 猜测、随机/时间戳 production path、localStorage/IndexedDB 或 Node-only browser runtime。

## 5. 自动化测试与严格门禁

最终全部命令 exit code 均为 `0`。

受影响 workspace 均逐项通过：

```text
@slotclientengine/browserartifactio: test/typecheck/lint/build/format:check
@slotclientengine/rendercore:        test/typecheck/lint/build/format:check
@slotclientengine/vnicore:           test/typecheck/lint/build/format:check
imgnumbereditor:                     test/typecheck/lint/build/format:check
symbolseditor:                       test/typecheck/lint/build/format:check
gamelayouteditor:                    test/typecheck/lint/build/format:check
```

最终测试摘要：

```text
browserartifactio  1 file / 21 tests passed
rendercore         64 files / 439 tests passed
vnicore            15 files / 207 tests passed
imgnumbereditor    7 files / 17 tests passed
symbolseditor      7 files / 35 tests passed
gamelayouteditor   16 files / 106 tests passed
```

关键覆盖率：

```text
browserartifactio overall branch: 84.40%
resource-identity.ts branch:       98.59%
rendercore overall branch:         80.06%
gamelayouteditor overall branch:   70.04%
imgnumbereditor overall branch:    71.80%
```

根仓库门禁：

```text
pnpm test       -> 27/27 tasks successful
pnpm typecheck  -> 27/27 tasks successful
pnpm lint       -> 27/27 tasks successful
pnpm build      -> 27/27 tasks successful
pnpm format:check
git diff --check
```

构建仅出现既有 Vite chunk-size warning 和 Node experimental/deprecation warning，没有 error。

## 6. 浏览器验收（待用户执行）

建议分别启动：

```bash
pnpm --filter imgnumbereditor dev -- --host 127.0.0.1 --port 4171
pnpm --filter symbolseditor dev -- --host 127.0.0.1 --port 4172
pnpm --filter gamelayouteditor dev -- --host 127.0.0.1 --port 4173
```

对应 URL：

```text
http://127.0.0.1:4171/
http://127.0.0.1:4172/
http://127.0.0.1:4173/
```

### ImgNumber Editor

1. 上传大写/下划线 glyph 文件，确认 kebab id 和 provenance。
2. 映射字符、预览、导出并重导。
3. 检查 ZIP glyph path 为 hash-flat，字符串表现不变。

### Symbols Editor

1. 用“上传资源”选择图片、完整 Spine、VNI 和 ImgNumber ZIP。
2. 用“上传文件夹”导入多组资源。
3. 检查 review、歧义/冲突和未消费文件提示。
4. 显式绑定 states，预览后导出/重导。
5. 检查 ZIP 不泄漏原目录，Spine/VNI/image-string 可播放。

### Game Layout Editor

1. 上传 `BG_2.PNG`，确认 id `bg-2`。
2. 上传多 page Spine 文件组/目录并创建 node。
3. 直接上传 ImgNumber ZIP，确认自动解包为一个 resource。
4. 替换被多个 node 使用的 resource，确认引用不变、画面原子更新。
5. 导出 ZIP，检查 owned assets 扁平 hash 命名、dependency 自包含。
6. 重导后检查 preview、状态机、image-string 与 symbols package 行为。

## 7. 浏览器验收反馈修正（2026-07-20）

- ImgNumber Editor 与 Popup Editor 补齐 `@slotclientengine/logiccore` 源码 alias，Vite 开发态不再把 CommonJS `dist/index.js` 当浏览器 ESM 直接加载；实际开发服务器转换结果已确认 `createGameConfig` 指向 `packages/logiccore/src/index.ts`。
- Popup Editor 的 import review 确认改为“建立 logical resource 并应用可解释的建议绑定”：standalone ImgNumber 贯穿五档，win-amount descriptor 的三份 VNI 各进入同名档位，其他资源仅入库；同类替换继续保留既有 layer 引用且不重复添加。
- Popup folder importer 从“整个批次只能唯一识别一组资源”改为逐资源精确闭包发现：单目录可混合多组 VNI、official Spine 4.3、图片及 standalone ImgNumber，允许共享依赖；闭包外合法图片成为独立 image resource，未知、缺失、歧义及不完整文件仍使 review 原子失败。
- Folder importer 显式忽略 `.DS_Store`、AppleDouble/`__MACOSX`、`Thumbs.db` 和 `desktop.ini` 等操作系统元数据；其他未知文件仍严格失败。真实 win-amount 回归同时注入根目录与 `assets/` 子目录的 `.DS_Store`。
- Popup Editor 项目页增加金额合同 preset：默认“纯数字整数”使用 `rawScale=1` 并直接显示服务器整数，只要求 `0–9`；可切换“纯数字两位小数”，使用 `rawScale=100` 并要求 `0–9` 与 `.`。两者均保持 `useGrouping=false` 和空 prefix/suffix。手动偏离 preset 后显示“自定义”，启用的字符仍严格校验对应 glyph。档位页根据当前 bet raw 动态展示 raw 与格式化后的累计计数边界。
- `vni-win-amount-tiers` descriptor 进入严格解析和 VNI project 顺序/闭包校验；真实 `assets/game003-s1/win-amount` 目录自动化测试稳定识别 `bigwin -> superwin -> megawin` 三组 VNI。
- 新项目档位阈值显式为 `1 / 15 / 25 / 50`，档位页集中编辑 `bigwin/superwin/megawin` 三个阈值并说明累计播放合同；descriptor 只提供 VNI 映射及 `2.9s` 总时长、`1s/2.5s` loop 边界，不覆盖项目阈值。五个档位导航改为无填充、底部 active indicator 的真实 tab 视觉。
- ImgNumber 不再拥有 `start/loop/end` 可见性；每档严格恰好一个金额 binding，award player 全程只创建一个 ImgNumber runtime。相同 resource 跨档零重建，不同 resource 通过同一 `RenderImageString.setResource()` 原子切换并复用 glyph sprite pool，避免 ending tier 与 next tier 金额重叠。
- Popup Editor 中再次为当前档选择 ImgNumber 会切换该档 binding，不会叠加第二个金额图层；后续导入的 ImgNumber 只自动补齐尚未配置金额的档位。Game Layout Editor 的自包含 popup fixture 已同步新合同并完成跨包回归。
- Popup Editor 上传入口移入“资源”tab，项目导入/导出移入“项目”tab；顶部导航改为可访问 tab 状态。编辑栏固定为约 `340–440px`，预览占剩余空间，canvas 保持自身宽高比；资源 provenance/path 默认折叠，避免大 closure 撑高资源卡。

反馈修正后严格门禁再次全部通过：

```text
popupeditor test: 4 files / 10 tests passed
pnpm test:         27/27 tasks successful
pnpm typecheck:    27/27 tasks successful
pnpm lint:         27/27 tasks successful
pnpm build:        27/27 tasks successful
pnpm format:check: 27/27 tasks successful
git diff --check:  passed
```

最终浏览器布局、文件夹选择、review 确认、预览及导出验收仍按约定由用户执行。

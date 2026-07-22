# Task 119 执行报告：Editor 统一扁平 filename 资源库

## 1. 结论

Task 119 的代码、自动化测试、静态检查、构建、package/runtime 兼容与文档迁移已完成。四个 Editor 现在共享同一套扁平 filename-key 资源合同、导入 review、同名默认覆盖、事务回滚与 `assets.map.json` / 完整 SHA-256 payload 导出机制；format owner 仍负责结构化引用的解析和改写。

最终真实浏览器验收按用户要求未执行，见第 10 节，状态为“待用户浏览器验收”。

## 2. 执行现场

| 项目       | 开始                                       | 结束                                                                   |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| repository | `/Users/zerro/github.com/slotclientengine` | 同左                                                                   |
| branch     | `main`                                     | `main`                                                                 |
| HEAD       | `c01884c468c209654ccc8e6f7bce671922954c31` | 同左，未提交                                                           |
| status     | 仅用户提供的 Task 119 计划为 untracked     | Task 119 实现、测试、文档和本报告未提交；未 reset/stash/clean 用户文件 |
| Node.js    | `v24.14.0`                                 | `v24.14.0`                                                             |
| pnpm       | `10.0.0`                                   | `10.0.0`                                                               |

原计划文件 `tasks/119-editor-unified-flat-filename-resource-library.md` 被视为用户输入并保留。

## 3. 最终架构

### 3.1 共享 package/API

新增 `@slotclientengine/editorresource`，提供以下 headless 能力：

- filename key：Unicode NFC、单 basename、保留大小写、必须有扩展名；拒绝 `/`、反斜杠、dot segment、控制字符及 NFC/case-fold 冲突。
- `EditorAssetWorkspace`：clone/freeze bytes、导入 review、同名默认 overwrite、rename/delete、引用影响、原子 commit/rollback、精确闭包。
- `EditorAssetRewriteAdapter<TProject>`：由格式 owner 提供引用枚举、改名改写和删除约束，共享层不猜业务字段。
- `ingestEditorResourceSources` 与 format adapter/profile：统一 bounded multi-file/ZIP ingestion、候选发现和多尺寸 profile 显式选择。
- `parse/decode/serialize/validateEditorAssetsMap`、`materializeEditorAssetPayloads`：统一 map parser、完整 SHA-256 校验、payload 去重、orphan/missing/corrupt 拒绝。
- `packages/editorresource/tests/source-boundary.test.ts` 长期阻止共享核心引入 DOM、Pixi、Node `fs` 或 app 业务。

`browserartifactio` 继续拥有 ZIP/path/SHA-256 与 bounded source 原语；`rendercore` 的 image-string、popup、symbol、scene-layout owner 增加 map-aware in-memory/URL materialization，ZIP preview、runtime 和 CDN URL loader 使用同一解析校验路径。

### 3.2 `assets.map.json` schema

```json
{
  "version": 1,
  "kind": "editor-assets",
  "files": {
    "BG.jpg": {
      "path": "assets/e552a0c970a0aea561faef5bc07537929d5525cb6b98bf38e7b8b747a2d272ae.jpg",
      "sha256": "e552a0c970a0aea561faef5bc07537929d5525cb6b98bf38e7b8b747a2d272ae",
      "mediaType": "image/jpeg",
      "byteLength": 841151
    }
  }
}
```

配置和 inner manifest 只引用 `BG.jpg` 这类 filename key；ZIP 中真实 bytes 位于 `assets/<完整 lowercase sha256>.<canonical-ext>`。相同 bytes 可由多个 filename key 指向同一 payload，导出只保留精确可达闭包。

### 3.3 四个 Editor model

- ImgNumber Editor：项目直接保存 filename-key glyph entries；字符映射引用 key，导入同名不同 bytes 时覆盖 entry、保持字符绑定。
- Popup Editor：resource root 身份为 root filename key，资源描述保存 exact flat key 集；layer/tier 仍引用格式 owner resource，覆盖共享 leaf 会影响所有引用。
- Symbols Editor：image、VNI、official Spine、image-string 均展开为 flat key 集；dependency 只保留结构化 descriptor，不再拥有 dependency 目录或 app-local payload namespace。
- Game Layout Editor：全局 `assets: Map<filenameKey, bytes>` 与资源 descriptor 分离；descriptor id 使用稳定 root key，mode/variant node、placement、transition identity 不因同名 bytes 替换而重建。

四个 UI 都只保留一个“导入资源”入口和统一 review；同名不同 bytes 默认选择“覆盖同名文件”，不自动生成 `-2/-3`、目录或 logical alias。

## 4. 删除/迁移的旧路径

- workspace importer 从 `apps/Imgnumbereditor` 完整改名为 `apps/imgnumbereditor`，根 lockfile importer 同步更新；历史任务文件未批量重写。
- 删除四个 Editor 中以 logical resource id、folder、dependency 子目录或多入口 importer 作为资源身份的路径。
- Popup 的 package-internal VNI、Spine、image-string 依赖在 review 阶段扁平化；VNI 多尺寸 bundle 必须显式选择一个 profile，未选不能提交。
- Symbols 的 nested image-string dependency 和旧 nested resource package 导入会迁移成 filename key + descriptor。
- Layout 的嵌套 Symbols/Popup vendor 资源会迁移到全局 filename map；导出 layout ZIP 不再创建 dependency 目录。
- Object URL、Texture、Spine/VNI player 与 decoded metadata cache 未进入 map/hash/ZIP，仍由原 owner 生命周期释放。

## 5. Legacy 与 schema 决策

- Legacy nested image-string、symbol、popup、scene-layout package 仍可由对应 rendercore owner 解析；重新导出统一升级为 `assets.map.json` + hash payload。
- image-string、popup、symbol、scene-layout 的结构化资源字段本来可以表达 filename key，因此没有建立 app-only manifest，也没有新增平行 inner schema。
- 为兼容新 package，format owner loader 仅增加统一 map resolver/materialization bridge；旧 package 无 map 时继续按旧 exact path 解析，错误仍 fail closed。
- CDN 仍从 root manifest URL 进入；存在 map 时读取同目录 `assets.map.json`，随后只请求 map 声明的 hash payload。

## 6. 交叉 fixture 与 ZIP/map 证据

自动化 fixture：

- ImgNumber glyph：`apps/imgnumbereditor/tests/fixtures/neutral-images.ts`；真实素材可用 `assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0030.png` 至 `u0039.png`。
- Popup VNI：`assets/game003-s1/win-amount/bigwin.json`、`superwin.json`、`megawin.json` 与其 `assets/`；完整组合覆盖在 `apps/popupeditor/tests/resource-import.test.ts`。
- Symbols：`assets/game003-s1/Symbol.atlas`、`Symbol.png`、`WL.json` 与 `assets/game003-s1/L1-wins.json`；flat Spine/VNI/image-string round-trip 覆盖在 `apps/symbolseditor/tests/zip-io.test.ts`。
- Layout：`apps/gamelayouteditor/tests/popup-fixture.ts`、`apps/gamelayouteditor/tests/zip-io.test.ts`，以及背景素材 `assets/game002-s1/bg.jpg`。
- 跨 runtime map fixture：`packages/rendercore/tests/editor-assets-map-fixture.ts`，同一 map 分别经过 ZIP resource creator、Blob/in-memory materialization 和 CDN URL loader，验证 exact same bytes。

仓库没有提交静态 `.zip` fixture；上述 ZIP 均由测试按确定性规则在内存生成，浏览器验收时 ImgNumber 导出的 ZIP 会直接作为 Popup/Symbols 的 ImgNumber ZIP 输入。典型新 ZIP entries：

```text
assets.map.json
image-string.manifest.json | popup.manifest.json | symbol.manifest.json | layout.manifest.json
assets/<64-char-sha256>.<ext>
```

真实样例 `BG.jpg` 对应 SHA-256 为 `e552a0c970a0aea561faef5bc07537929d5525cb6b98bf38e7b8b747a2d272ae`、841151 bytes；`u0030.png` 对应 `69aeaa648df4c2339a38446dee869629930d0a7a1aaccd6621c8a502574ac152`、2474 bytes。

## 7. 自动化验收结果

计划第 15 节列出的 scoped `format:check`、`lint`、`typecheck`、`test`、`build` 已全部执行并通过：

| scope                                 |   测试结果 |          branch coverage | 其它门禁                      |
| ------------------------------------- | ---------: | -----------------------: | ----------------------------- |
| `@slotclientengine/editorresource`    |  32 passed |                   89.59% | format/lint/type/build passed |
| `@slotclientengine/browserartifactio` |  21 passed |                   84.40% | format/lint/type/build passed |
| `@slotclientengine/rendercore`        | 478 passed |                   80.00% | format/lint/type/build passed |
| `@slotclientengine/vnicore`           | 219 passed |             既有阈值通过 | format/lint/type/build passed |
| `imgnumbereditor`                     |  19 passed |                   70.09% | format/lint/type/build passed |
| `popupeditor`                         |  13 passed |                   61.72% | format/lint/type/build passed |
| `symbolseditor`                       |  38 passed | 50.38%（该包未配置阈值） | format/lint/type/build passed |
| `gamelayouteditor`                    | 143 passed |                   73.08% | format/lint/type/build passed |
| `symbolsviewer`                       |  17 passed |             既有阈值通过 | type/build passed             |
| `anieditorv5viewer`                   |  28 passed |             既有阈值通过 | type/build passed             |
| `game002`                             |  97 passed |                   80.33% | type/build passed             |
| `game003`                             | 136 passed |                   83.68% | type/build passed             |

根级最终结果：

- `pnpm format:check`：exit 0，30/30 tasks。
- `pnpm lint`：exit 0，30/30 tasks。
- `pnpm typecheck`：exit 0，30/30 tasks。
- `pnpm exec turbo run test --concurrency=1`：exit 0，30/30 tasks。
- `pnpm test` 最终原样复跑：exit 0，30/30 tasks（30 cached）。
- `pnpm exec turbo run build --concurrency=1`：exit 0，30/30 tasks。
- `pnpm build` 最终原样复跑：exit 0，30/30 tasks（30 cached）。
- `git diff --check`：exit 0。

没有降低 coverage threshold、skip 新测试、放宽 parser、修改正确断言或加入 magic timeout。新增共享核心 branch coverage 为 89.59%，高于 80%；rendercore 保持既有 80% branch threshold。

## 8. 失败、根因与复跑

| command                                       | 首次 exit | 首个根因                                                                            | 修复/隔离                                                                 |                    最终结果 |
| --------------------------------------------- | --------: | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------: |
| `CI=true pnpm install --offline`              |         1 | lockfile 因 workspace rename/新增依赖需要更新，frozen lock 拒绝                     | 改用 `--no-frozen-lockfile`                                               |     继续暴露离线 store 缺包 |
| `pnpm install --offline --no-frozen-lockfile` |         1 | 本地 store 缺少 Turbo tarball                                                       | sandbox 联网因权限失败后，按批准执行 `pnpm install --no-frozen-lockfile`  |                           0 |
| editorresource lint                           |         1 | key validator 的控制字符 regex 触发 ESLint 规则                                     | 改为 Unicode code point 范围判断                                          |                           0 |
| rendercore test                               |         1 | 新 map 分支使全包 branch coverage 首次为 78.11%                                     | 增加 missing/corrupt/orphan、in-memory/URL、legacy/new-map 等真实行为测试 |          478 passed，80.00% |
| gamelayouteditor lint                         |         1 | 迁移后 5 个旧 helper/import 未使用                                                  | 删除失效符号                                                              |                           0 |
| game002/game003 并行 consumer gate            |         1 | 两个 app 同时重建共享 `packages/gameframeworks/dist`，出现 `ENOTEMPTY`              | 顺序隔离复跑                                                              | 两者 test/type/build 均为 0 |
| 首次根 `pnpm test`                            |         1 | game001 解析 gameframeworks 时，另一个并行游戏短暂重建共享 dist；27/30 tasks 后失败 | `pnpm exec turbo run test --concurrency=1` 隔离通过，再原样复跑           |               30/30，exit 0 |
| `pnpm test -- --concurrency=1`                |         1 | 参数被根 script 透传给 Vitest，Vitest 不支持该选项；未执行测试                      | 将参数放到 Turbo：`pnpm exec turbo run test --concurrency=1`              |               30/30，exit 0 |
| 未加载 NVM 的报告 Prettier audit              |         1 | shell 错误解析到 Codex bundled pnpm 11.9.0，并因 modules purge 需要 TTY 主动中止    | 回到任务统一 NVM Node 24 / pnpm 10.0.0 后重跑；中止发生在任何 mutation 前 |                           0 |

## 9. 已知限制/非阻塞提示

- 唯一尚未执行的验收是用户明确保留的真实浏览器验收；这不是自动化通过的替代项。
- Vite 对现有大体积 Pixi/Spine/VNI bundle 仍输出大于 500 kB 的 chunk warning；构建成功，Task 119 未扩大范围改动 bundling 策略。
- game003 现有 `ts-node/esm` experimental loader 与 `fs.Stats` deprecation warning 仍存在；生成物已确认最新，测试和构建成功。
- 仓库现有根任务允许多个 consumer 同时写共享 `dist`，冷缓存并行运行可产生瞬时竞态；本次已顺序隔离并让精确根命令最终成功，未在 Task 119 中改写整个仓库的构建编排。

## 10. 待用户浏览器验收

### 10.1 启动命令与实际 dev URL

四个 Vite app 默认端口相同；为同时验收，使用显式端口：

```bash
pnpm --filter imgnumbereditor dev -- --host 127.0.0.1 --port 5173
pnpm --filter popupeditor exec vite --host 127.0.0.1 --port 5174
pnpm --filter symbolseditor dev -- --host 127.0.0.1 --port 5175
pnpm --filter gamelayouteditor dev -- --host 127.0.0.1 --port 5176
```

- ImgNumber Editor：<http://127.0.0.1:5173/>
- Popup Editor：<http://127.0.0.1:5174/>
- Symbols Editor：<http://127.0.0.1:5175/>
- Game Layout Editor：<http://127.0.0.1:5176/>

Popup 的显式端口命令直接调用 workspace 内 Vite；其依赖已由本次 build 生成。如在全新 checkout 验收，先运行 `pnpm --filter popupeditor run prepare:deps`。

### 10.2 ImgNumber Editor

- [ ] 一次选择 `u0030.png` 至 `u0039.png`，确认列表保留原文件名、没有 logical id/文件夹入口。
- [ ] 映射字符并导出，确认 manifest 引用 filename key，ZIP payload 为完整 hash，重导预览一致；保留该 ZIP 给后续两个 Editor。
- [ ] 用同名不同图片重导，确认 review 默认覆盖、字符绑定不变。

### 10.3 Popup Editor

- [ ] 一次选择 image、完整 Spine、由 `assets/game003-s1/win-amount` 制作的 VNI ZIP，以及上一步 ImgNumber ZIP，确认统一 review 与 flat keys。
- [ ] 多尺寸 VNI 明确选择一个尺寸，确认其它尺寸不入库。
- [ ] 同一资源绑定多个 tier 后覆盖共享 leaf，确认全部 layer 更新；非法 replacement 完整 rollback。
- [ ] 导出/重导并播放完整 award-celebration。

### 10.4 Symbols Editor

- [ ] 用唯一“导入资源”入口选择 image、`Symbol.atlas` + `Symbol.png` + 对应 skeleton JSON、VNI、ImgNumber ZIP，检查 derived group 与 filename-key Picker。
- [ ] 绑定 normal/appear/win/value 后覆盖共享 leaf，确认全部引用影响可见。
- [ ] 导出/重导并检查 Pixi、VNI、official Spine、image-string 表现、state lifecycle 与资源名。

### 10.5 Game Layout Editor

- [ ] 将 `assets/game002-s1/bg.jpg` 的本地验收副本命名为 `BG.jpg` 后导入并绑定多个 mode/variant；同名覆盖后确认 bytes 全部更新，placement/node identity 不变。
- [ ] 导入前两步导出的 Symbols/Popup ZIP，确认没有 dependency 目录，冲突只允许覆盖或显式改名。
- [ ] 检查 Spine 与有声 MP4 direct transition 的 automatic prepare、单一状态动作、fade 和 play rejection。
- [ ] 导出/重导 layout，检查 preview、symbols、popup、image-string 与 transition 完整。

本节全部为“待用户浏览器验收”；happy-dom、Vitest、fake media 和 ZIP 单测均未被记作真实浏览器结果。

## 11. Symbols Editor CN 分档补充验收（2026-07-22）

用户补充的 CN / otherScene 分档合同已完成：编辑顺序固定为“先配置 Spine 档位，再配置状态”；每档只拥有 threshold、skeleton、atlas、texture 与 transform，同一状态的 animation 只选择一次并应用到全部档位；静态 reel state 继续独立绑定图片。ImgNumber 在编辑器中只显示一个共享 dependency / slot / transform 节点，导出时按既有 manifest schema 精确物化到各 tier；绑定 anchor 固定为 `(0.5, 0.5)`。

`rendercore/image-string` 现在按完整字符串的实际 visual bounds 计算 pivot，`setText()` 后会随新字符串宽高重新居中；因此一位、多位及长度变化都以内容中心对齐 Spine slot，不再把字形原点对到 slot 中心。

补充浏览器观察继续暴露了 official Spine attach 的第二层问题：`spine-pixi-v8.addSlotObject()` 会持续用 slot bone matrix 覆盖直接挂载对象的本地 transform，使 ImgNumber 已计算的 pivot 与配置 `x/y/scale` 在最终显示中失效。runtime 已改为外层 wrapper 跟随 slot、内层 display 保留动态 pivot 与 transform；现在 `x=0,y=0` 的精确定义是“当前完整字符串的视觉中心对齐 slot 原点”，不是“字符串左上角对齐 slot 原点”。

真实输入 `/Users/zerro/Downloads/game002-s3-symbols (2).zip` 已完成 headless 导入诊断：CN 被纳入 preview closure，4 个 skeleton 共享 1 个 atlas 合法，4 档 `Loop` 和共享 ImgNumber 配置均通过。该 ZIP 当前共享 slot 名为 `coin`；production `game002-s3` manifest 使用 `Num`，编辑器只提供一次共同 slot 选择，不猜测或静默改名。

补充自动化结果：

- `symbolseditor`：44 tests passed，format/lint/typecheck/build passed。
- `@slotclientengine/rendercore`：478 tests passed，format/lint/typecheck/build passed。
- `imgnumbereditor`：19 tests passed，format/lint/typecheck/build passed。
- `game002`：97 tests passed，format/lint/typecheck/release check passed，19 个 symbol value resources 精确闭包检查通过。
- `symbolsviewer`：17 tests passed，format/lint/typecheck/build passed。
- `git diff --check`：exit 0。

最终浏览器验收仍按用户要求保留为待用户执行，以上结果没有把 headless preview 或 build 当作浏览器验收。

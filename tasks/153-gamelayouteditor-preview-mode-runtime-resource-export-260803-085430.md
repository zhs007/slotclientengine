# 153 Game Layout Editor 预览状态与程序资源导出执行报告

## 结果

任务 153 的代码、自动化测试和文档已完成。浏览器人工验收按用户要求由用户执行，本报告不把自动化 DOM 测试或 build 结果冒充人工验收。

## 实现摘要

- 预览以 runtime settled snapshot 为反向转场 source；stable mode 或 preview target 改变后，自动选择精确的 `stable -> target` 显式边并重新 prepare。BG -> FG 完成后可直接选择 BG，FG -> BG 按钮在 prepare 完成后启用，不依赖切换分辨率。
- Scene Layout v1 新增可选 `runtimeResources`，以稳定程序键映射 image、Spine、VNI、image-string、video 五类 strict typed root。旧 manifest 缺少该字段时保持兼容。
- 编辑器资源列表新增“程序资源”绑定、取消绑定和筛选；binding 进入 project clone、manifest projection、ZIP import/export 与删除清理。
- rendercore direct/mapped/CDN/ZIP loader 把程序资源纳入 exact closure，并在 `SceneLayoutResource` / `SceneLayoutPackageResource` 暴露已准备资源；`requireSceneLayoutRuntimeResource()` 严格校验 key/kind，生命周期仍由父 resource 统一拥有。
- gamelayoutpkgcli 结构化改写程序资源内部图片引用，程序键保持不变；程序资源闭包进入 shared/initial asset group。
- Spine 闭包继续按 root 正向计算：Scene Spine 与程序 Spine 可共享 atlas/PNG，leaf 去重，未选择的 sibling skeleton JSON 不会被反向带入。

## 主要文件

- 编辑器：`apps/gamelayouteditor/src/{model,io,ui}` 与对应测试、README。
- public schema/runtime：`packages/rendercore/src/scene-layout/{types,manifest,resource,package-resource}.ts` 与对应测试。
- 优化器：`apps/gamelayoutpkgcli/src/{reference-rewriter,asset-groups}.ts` 与对应测试。
- 长期合同：`docs/scene-layout-manifest.md`、`docs/agent-rules/scene-layout.md`、`docs/agent-rules/editor-artifacts.md`。

## 计划偏差

- 没有新增独立 helper 模块；typed resolver 留在现有 `resource.ts` 并由 scene-layout index 现有 export 公开。
- 没有修改 nested owner schema、依赖、lockfile、game002/game003 或 root 工具链。
- 实现过程中完整 rendercore 测试第一次因新增分支使 branch coverage 从门槛下方失败（79.5%）；补齐五类程序资源、direct/mapped package 和错误分支回归后，最终为 80.02% 并通过。

## 自动化验收

运行环境使用仓库要求的 Node 24 bundled runtime；依赖以 `CI=true pnpm install --frozen-lockfile` 恢复，lockfile 未修改。

以下 L2 命令最终通过：

```text
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore test
  78 files / 620 tests passed; branch coverage 80.02%
pnpm --filter gamelayouteditor --filter gamelayoutpkgcli test
  gamelayouteditor: 22 files / 168 tests passed
  gamelayoutpkgcli: 6 files / 17 tests passed
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli build
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli format:check
git diff --check
```

编辑器 production build 保留既有单 chunk 大于 500 kB 的 Vite warning，不影响成功退出，本任务未扩大到代码拆包。

## 待用户人工验收

- 在真实浏览器执行 BG -> FG，settle 后直接选择 BG，确认 FG -> BG 按钮准备后启用并成功返回；全程不切分辨率。
- 分别验证 follow 开/关及分辨率 rebuild 后的 selector、source、target 与按钮状态。
- 用真实共享 atlas 素材绑定程序 Spine，导出、重新导入并经 CLI 优化，确认程序键/选中 skeleton/共享 leaf 保留，未选 sibling JSON 排除。

## 剩余风险

- 程序资源目前没有 mode ownership，按合同进入 shared/initial，可能增加首包体积；未来按 mode 懒加载需要单独 versioned 设计。
- 本任务只做文件级 closure/去重，不裁剪 atlas region 或重新打 atlas；单张 atlas 内未使用区域仍需由美术拆包流程处理。
- consumer 不得在父 package resource `destroy()` 后继续使用其 borrowed URL 或 nested resource。

## 后续修正

根据实际 Nearwin 素材验收反馈，Game Layout Editor 的 loose-file 上传边界进一步收敛：整批文件先验证只含 ASCII 字母、数字、点、下划线和连字符，再统一生成小写 filename key；中文、空格、非法字符或小写后重名会让整批上传在解析前失败。程序键默认由 root filename 去扩展名生成，手工大写输入也统一转为小写，因此不会把大小写错误延迟到 production export。

完整 mapped Editor ZIP 保留兼容迁移能力：map payload 完整性先严格验证，再对旧 logical filename key 执行 NFKC、ASCII 小写、非法 ASCII 转连字符、非 ASCII 转 Unicode code-point token 的确定性规范化。不同 bytes 的归一化重名按稳定顺序追加 `-2/-3`，相同 bytes 共享 key；layout、VNI、image-string、Symbols、Popup 的已知 JSON path 引用同步结构化改写，业务 identity 与 atlas page logical name 保持原值。这样 loose file 在入口拒绝歧义，已有完整包则可安全升级后继续使用。

后续修正验收通过：`gamelayouteditor` 22 files / 170 tests、typecheck、production build、format check 与 `git diff --check`。build 仍只有既有的大 chunk warning；浏览器人工验收仍由用户执行。

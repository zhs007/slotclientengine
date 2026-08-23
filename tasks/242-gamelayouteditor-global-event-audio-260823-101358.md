# 242 gamelayouteditor-global-event-audio 执行报告

## 结果

任务 242 的实现和自动验收已完成。浏览器人工验收按任务发起人的安排由其自行执行，本报告不伪造人工结论。

- Game Layout Editor“项目”分页新增“编辑音乐音效”按钮和“忽略老版本音乐音效配置”checkbox。Dialog 复用
  EditorCore exact event picker，只从当前项目已上传的 audio asset 中显式选择文件，不负责上传或自动选首项。
- EditorCore event dialog 增加 fixed source、generic typed row configuration、配置 mount/validate/summary 和订阅注入；原
  controller/plain event group 用法保持兼容，row/group cancel 仍隔离草稿，group confirm 原子提交。
- AudioCore 新增 event track contract。`music`/`effect` 分别乘玩家 music/effect volume；once track 可同时 duck BGM
  与一种 effect scope（same-audio/all），多个 owner lease 取最低 gain，并在自然结束、stop、失败和 destroy 时恢复。
- RenderCore Scene Layout latest 升为 v5，新增 strict `eventAudio`。v1-v4 reader 确定性升级为空配置；loop 必须绑定
  不同的 end event。Runtime 订阅 canonical event，保留解锁前 loop intent，丢弃解锁前 once，并在初始 mode commit
  后发布 displayed/stable entered。
- `ignoreLegacyAudio=true` 只抑制 mode BGM、Popup cue、Symbol cue 三类旧版自动 producer；不删除旧数据、不剪资源，
  也不改变显式 `playEffect()/stopEffect()`。
- Gamelayout package CLI 可读写 v1-v5，重写并转码 event audio 路径与 media type，按 event track category 归入
  music/effect 优化角色。Editor 导入旧版后预览/导出 canonical v5，lockfile 只增加 EditorCore workspace importer。

## 自动验收

通过：

```text
AudioCore test：5 files / 15 tests
EditorCore test：4 files / 24 tests
Gamelayout package CLI test：8 files / 38 tests
Gamelayout Editor 定向：3 files / 42 tests
RenderCore event-audio/manifest 定向：3 files / 30 tests

AudioCore、RenderCore、EditorCore、Gamelayout Editor、Gamelayout package CLI、Gameframeworks：
  package lint 全部通过
AudioCore、RenderCore、EditorCore、Gamelayout Editor、Gamelayout package CLI、Gameframeworks：
  package typecheck 全部通过

pnpm build：41/41 packages 通过
git diff --check：通过
改动文件 Prettier：通过
```

Gamelayout Editor 全包测试中，任务相关用例均通过；仅剩两个既有外部 production fixture 缺失：

- Crave map 不含 `symbol-state-textures.manifest.json`；
- Minecart2 map 不含 `gameconfig.json`。

L3 根命令的既有非本任务失败：

- `pnpm typecheck`：`packages/uiframeworks/tests/test-helpers.ts` 的 fake `GameLogic` 缺少四个当前接口方法；
- `pnpm lint`：`apps/game002v2/src/round-adapter.ts` 的 `_error` 未使用；
- `pnpm test`：RenderCore 13 项 configured-round fixture 使用空 `nodes`，另 1 项仍断言 Symbol manifest v2；本任务
  新增/修改的 Scene Layout、AudioCore、EditorCore、Editor、CLI 测试通过；
- `pnpm format:check`：既有 `packages/rendercore` 文件和 `apps/slot3ddemo001/src/scene.ts` 未格式化。本任务新增
  AudioCore `.prettierignore`，确保 coverage/dist 不参与 package 格式检查。

## 计划偏差与说明

- 计划预估的独立 `event-track-runtime`、`manifest-v5`、`event-audio-runtime`、`event-audio-dialog` 测试文件没有全部
  拆分；合同测试并入现有 AudioCore runtime/data、RenderCore manifest/package-runtime、EditorCore UI、Editor store/ZIP
  与 CLI package-flow/reference-rewriter 测试。
- same-audio 以 resolved source identity 匹配，降低 owner 启动前已存在的同源 effect voice；owner 本身不受自己的
  lease 影响。all-effect lease 对存量和 lease 期间新启动的 effect voice 都生效。
- 未修改 production assets、game002/game003 业务配置或外部 `pixicrave`/`piximinecart2` 仓库。

## 浏览器人工验收

状态：**待任务发起人执行**。

建议按计划重点检查：无 audio asset 时不能保存、mode/non-mode 初始默认、category 与 playback 可独立修改、loop end
event 必填、duck 组合与 0%/50% 数值、row/group cancel、checkbox 持久化、导出/重导入 v5，以及真实浏览器解锁后的
初始 loop、once 播放、结束 event、音量恢复和 legacy gate。

## 基线与时间

```text
baseline HEAD: 76ca8f9e7854a82992ee243b96b0a713887cef35
baseline UTC: 2026-08-23T08:53:22Z
report UTC: 2026-08-23T10:13:58Z
```

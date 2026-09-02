# 283 gamelayouteditor-ui-radio-control-layer 执行报告

## 结果

- 完成时间：2026-09-02T08:05:12Z
- 基线：`e2f8bde9d7a2ee8aca8083ab0e35c2bbad81aa90`（detached HEAD）
- 状态：代码与自动验收完成；浏览器人工验收按用户要求待用户执行。
- Scene Layout latest 保持 v7，`eventAudio.version` 保持 1；未修改 manifest 版本号、根工具链、lockfile、production assets 或下载目录素材。

## 已完成

1. Scene Layout v7 `nodes` 扩展为严格互斥的 `resource | uiControl` 图层 union；UI 控件为可扩展 discriminated union，当前实现 `radio`，显式保存不同且同尺寸的 off/on image spec。旧 v1–v6 parser 继续拒绝该字段。
2. RenderCore 为 radio 并发准备两张 texture，用一个稳定 Sprite 以 `off` 初始化并切换 texture；partial prepare 失败会回收已准备 texture。scope、placement、rotation、geometry-only update 与 selection bounds 复用普通图层路径，geometry 更新不重置状态。
3. 新增 borrowed `getUiControl(id)` / `radio.getState()` / `setState()`，并通过 `gamelayout:/ui-control/<id>` 的 `ui-control` endpoint 暴露同一 capability；UI 控件不进入 RenderObject namespace。GameFrameworks facade 同步导出 capability/state/endpoint 类型。
4. 状态真正改变后由 package 唯一 event manager 发布 `gamelayout:/ui-control/<id>/radio/state/<off|on>/entered`，detail 包含 previous/current/source；初始化与 same-state set 不发 occurrence。pointertap 同时消费 federated pointer 与随后 native click，避免同次输入继续触发宿主 primary action。
5. Shared event catalog 新增 `ui-control-state` family 和 control/control-kind/state/edge facets；EditorCore Event dialog 增加中文展示并通过 DOM 用例验证逐级选择与保存 exact address。
6. Game Layout Editor 增加“图形图层”与“UI 控件 / 单选框”入口、双 image picker、Inspector 两侧分别重绑、typed reference roles、删除/替换保护、导入导出及 mapped ZIP 往返。图片整体替换若破坏两图同尺寸合同，会在写入 bytes 前原子拒绝。
7. Gamelayout package CLI 的 reference rewrite 与 asset grouping 同步遍历 radio 两图，确保 WebP 优化、production ZIP 和 CDN owner closure 不漏资源。
8. 更新 RenderCore、EditorCore、GameFrameworks、Game Layout Editor、package CLI README、manifest/API 文档及最小领域规则。

## 自动验收

### Typecheck

- RenderCore：通过。
- EditorCore：通过。
- Game Layout Editor：通过。
- Game Layout package CLI：通过。
- GameFrameworks：通过。

### Build

- RenderCore `tsconfig.build.json`：通过。
- EditorCore `tsconfig.build.json`：通过。
- Game Layout package CLI `tsconfig.json`：通过。
- Game Layout Editor Vite production build：通过。仅保留既有 dynamic-import 与大 chunk warning，无 build error。

### 定向测试

- RenderCore Scene Layout：4 files / 26 tests，通过。
- EditorCore event/assets UI：1 file / 18 tests，通过。
- Game Layout Editor：4 files / 39 tests，通过。
- Game Layout package CLI：3 files / 24 tests，通过。

覆盖 parser union/legacy reject、order 唯一性、双图 closure、partial prepare rollback、off 初值、programmatic/pointer 切换、same-state no-op、geometry 状态保持、native click 隔离、destroy、owner endpoint、唯一 event catalog、Event dialog、资源重绑/整体替换原子性、production ZIP 往返、CLI rewrite/asset group。

### 静态检查

- 所有变更 TypeScript 的 ESLint：通过。
- Prettier 已应用到全部变更文件。
- `git diff --check`：通过。

## 浏览器人工验收（待用户）

使用：

- `/Users/zerro/Downloads/crave/splash/splash_flag_off.png`
- `/Users/zerro/Downloads/crave/splash/splash_flag_on.png`

建议检查：

1. 导入两张图片，新增“UI 控件 / 单选框”，分别选择 off/on，并确认大纲与 Inspector 明确显示 UI 控件分类。
2. 在 preview 点击控件，确认初始为 off、每次点击只切换一次、不会同时触发 Splash primary action。
3. 在 Event 音乐音效对话框搜索“UI 控件状态”，逐级选择 control/radio/off 或 on/entered 并保存。
4. 导出 ZIP 后重新导入，确认两张图片、控件 id/order/scope/placement 和 exact event binding 保持；runtime 完整重建后状态回到 off。

## 说明

- 没有复制或修改下载目录素材。
- 没有实现 radio group 互斥、disabled/hover/pressed、键盘导航或可配置初始状态；这些仍属于计划明确排除项。

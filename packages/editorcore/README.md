# `@slotclientengine/editorcore`

共享 Editor 能力包。Task 229 首先提供统一 Assets 模块；四个正式 Editor 尚未迁移。

## 分层

- `assets/data`：十一类顶层 root、唯一 graph node、typed relation、host reference/program binding 和 snapshot 类型。
- `assets/core`：graph 校验、树投影、使用状态派生、导入/覆盖/改名/删除事务，以及精确 map/payload 导出计划。
- `assets/adapters`：组合 AudioCore、VNICore、RenderCore 和 EditorResource 的 strict owner API，识别 loose 文件与 ZIP。
- `assets/ui`：可挂载/销毁的原生 DOM treegrid、统一导入 review、搜索筛选、inspector 和固定行高虚拟列表。

Assets UI 默认可通过 `mountEditorAssetsDialog()` 作为一枚管理按钮接入宿主。按钮打开 native modal dialog，宿主无需为 Assets 永久划分 panel；底层 `mountEditorAssetsView()` 仍保留给需要自行组合容器的 consumer。

Game Layout event group 使用独立的 `mountEditorGameLayoutEventDialog()`。它只读取已经由统一 Assets 入口提交的
`game-layout` root，并从该 root 的完整 ZIP closure 编译候选；具体 node、Symbol、state、Popup、mode、坐标和
lifecycle 不由 EditorCore 预置。Dialog 左侧维护有序 event 列表，右侧一次只展开一个 catalog facet；候选较多时
提供当前层搜索和可回退 breadcrumb，避免多层树状下拉。

宿主也可传入固定 `sources` 与自定义 `inspectCatalog`，用当前尚未导出的 typed project 作为 event source；这种模式不复制 Game Layout event 编译器。可选 `configuration` adapter 为每行提供 create/clone/mount/validate/summarize 生命周期，配置跟随 row draft 一起取消或确认，宿主重渲染前必须 `destroy()`。asset picker 等业务配置仍由宿主实现，EditorCore 不接管业务 bytes。

底层 logical identity 仍是 `@slotclientengine/editorresource` 的扁平 filename key；树是 owner 关系的视图，不是目录。Spine atlas page、VNI 图片和 package leaf 只能随其顶层 root 使用，不能独立绑定。需要复用时应单独导入顶层资源；相同 bytes 在 `assets.map.json` materialization 时共享 content-addressed payload，logical identity 不合并。

## Host 接入

```ts
import { createDefaultEditorAssetsController } from "@slotclientengine/editorcore/assets/adapters";
import { mountEditorAssetsDialog } from "@slotclientengine/editorcore/assets/ui";

const controller = createDefaultEditorAssetsController({ project, host });
const dialog = mountEditorAssetsDialog({
  controller,
  root: toolbarElement,
  triggerLabel: "Assets 管理",
});

// host 卸载时
dialog.destroy();
controller.destroy();
```

Event group 由 host 控制并在确认时整组提交：

```ts
import type { EditorGameLayoutEventGroup } from "@slotclientengine/editorcore/assets/adapters";
import { mountEditorGameLayoutEventDialog } from "@slotclientengine/editorcore/assets/ui";

let eventGroup: EditorGameLayoutEventGroup | null = null;
const events = mountEditorGameLayoutEventDialog({
  controller,
  root: toolbarElement,
  value: eventGroup,
  onConfirm(value) {
    eventGroup = value;
    events.setValue(value);
  },
});
```

输出固定为 immutable `{ rootKey, events: readonly { address, descriptor }[] }`。新增/修改先保存在 row draft，只有
“保存修改”才进入 dialog draft；关闭或取消 dialog 不调用 host。替换同名 Layout 后组件按 exact address 复验旧项，
已消失项明确失效并阻止确认；切换到另一 Layout 必须显式清空已有列表。宿主卸载时先销毁两个 dialog，再销毁
controller。

`host` 必须负责 clone project、收集业务引用、收集/写入显式程序 binding、结构化重写 root 引用；建议实现 candidate project/catalog/workspace 的最终校验。`used` 和 `programmatic` 均从 host 合同实时派生，不持久化布尔副本。

默认 adapter factory 的 `prepareImport()` 可以接收同一批普通文件和 ZIP。所有格式发现、profile 选择和冲突 review 完成后，调用 `commitImport()` 原子提交；blocking diagnostic、未处理同名冲突或 host 校验失败都保留旧 snapshot。`exportRoot()` 对原子 root 返回原 bytes，对 Spine/VNI/ImgNumber/Popup/Symbols/Game Layout 返回 strict closure ZIP。只需 graph/usage/export plan 的 headless consumer 可直接使用 `assets/core` 的 factory并注入自己的 discover/export function，不会由 core 隐式加载 format adapter。

## Dialog、预览与生命周期

- desktop dialog 的 tree 默认较窄，可用鼠标拖动或键盘方向键调整 splitter；该宽度、Spine animation、VNI playback 和 ImgNumber text 都只属于 UI session。
- inspector 只显示名称、所属 root 和类型。程序 key 只有在标记流程或已标记状态下可编辑；内部 leaf 不能独立标记、删除或导出。
- image/audio/video 使用原生媒体预览；Spine 使用 RenderCore official player；VNI 使用 VNICore viewer；ImgNumber 使用 RenderCore image-string renderer。Popup、Symbols、Game Layout 当前明确不提供预览。
- 切换选择、关闭 dialog 或 destroy 时，UI 会销毁 player/resource/Pixi Application、停止 ticker 并撤销 Object URL。宿主仍负责在 dialog 之后销毁 controller。

## 单 Root 导出

- image/audio/video/text/binary：下载 workspace 中的 exact bytes。
- Spine：导出 skeleton JSON、atlas 与 atlas page 实际引用的图片。
- VNI：导出 project JSON 与 schema 引用图片组成的完整 single-project ZIP。
- ImgNumber、Popup、Symbols、Game Layout：导出对应 owner sentinel、`assets.map.json` 与 content-addressed exact payload；导出前重新执行 strict schema/closure/resource 校验。

导出只接受 top-level root。失败不会生成下载，也不会修改 controller snapshot。

## 当前边界

- 原子 root：PNG/JPEG/WebP、AudioCore 支持的音频、MP4，以及尚无 loader 的 opaque text/binary 文件。
- compound root：VNI、Spine 4.3、ImgNumber、Popup、Symbols、Game Layout。
- 已有 loader 的格式继续严格验证签名/schema；没有 loader 的文件保留 bytes 和 text/binary 类型，后续 loader 可在 generic fallback 前显式 claim。坏 hash、缺失引用和 package physical orphan 不会 fallback。
- compound root 不能通过通用命令只改内部 leaf；需要 owner schema rewrite 的整体 keep-both/rename 应由后续 owner adapter 扩展。
- Popup、Symbols、Game Layout 暂不提供 Assets inspector preview；它们仍由正式 owner preview/runtime 承担完整业务预览。
- `apps/editordemo` 是当前公开合同与工程 ZIP 的隔离验收宿主。

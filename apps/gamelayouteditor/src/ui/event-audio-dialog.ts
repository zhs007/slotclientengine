import {
  mountEditorGameLayoutEventDialog,
  mountEditorGameLayoutEventPickerDialog,
  type EditorGameLayoutEventDialog,
  type EditorGameLayoutEventPickerDialog,
} from "@slotclientengine/editorcore/assets/ui";
import {
  inspectSceneLayoutRuntimeEventCatalog,
  type GameLayoutRuntimeEventCatalogEntry,
} from "@slotclientengine/rendercore/scene-layout/editor";
import type {
  SceneLayoutEventAudioBindingV1,
  GameLayoutRuntimeAddress,
} from "@slotclientengine/rendercore/scene-layout/data";
import type { AudioEventTrackBindingV1 } from "@slotclientengine/audiocore/data";
import {
  editorProjectToManifest,
  type EditorProject,
} from "../model/editor-project.js";
import type { EditorAudioLayoutResource } from "../model/editor-resource.js";

const CURRENT_PROJECT_ROOT = "layout.manifest.json";
interface EventAudioConfiguration {
  audio: AudioEventTrackBindingV1;
  endEvent?: GameLayoutRuntimeAddress;
}

export function mountProjectEventAudioDialog(options: {
  readonly root: HTMLElement;
  readonly project: EditorProject;
  readonly onConfirm: (
    bindings: readonly SceneLayoutEventAudioBindingV1[],
  ) => void;
}): EditorGameLayoutEventDialog<EventAudioConfiguration> {
  let catalogEntries: readonly GameLayoutRuntimeEventCatalogEntry[] = [];
  const audioResources = [...options.project.resources.values()]
    .filter(
      (resource): resource is EditorAudioLayoutResource =>
        resource.kind === "audio",
    )
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  return mountEditorGameLayoutEventDialog<
    EditorProject,
    EventAudioConfiguration
  >({
    root: options.root,
    sources: [{ key: CURRENT_PROJECT_ROOT, label: "当前 Game Layout 项目" }],
    value: {
      rootKey: CURRENT_PROJECT_ROOT,
      events: options.project.eventAudio.bindings.map((binding) => ({
        address: binding.event,
        descriptor: {
          address: binding.event,
          kind: "event",
          ownerAddress: null,
          authored: true,
          capability: "event",
        },
        configuration: {
          audio: structuredClone(binding.audio),
          ...(binding.endEvent ? { endEvent: binding.endEvent } : {}),
        },
      })),
    },
    title: "全局 Event 音乐音效",
    triggerLabel: "编辑音乐音效",
    inspectCatalog() {
      const catalog = inspectSceneLayoutRuntimeEventCatalog({
        manifest: editorProjectToManifest(options.project),
        files: options.project.assets,
      });
      catalogEntries = catalog.entries;
      return { rootKey: CURRENT_PROJECT_ROOT, entries: catalog.entries };
    },
    configuration: {
      create(entry) {
        const music = entry.family === "mode-state";
        return {
          audio: {
            name: eventTrackName(entry.descriptor.address),
            asset: {
              sources: [],
            },
            category: music ? "music" : "effect",
            playback: music ? "loop" : "once",
            voices: {
              maxConcurrent: music ? 1 : 8,
              overflow: "restart-oldest",
            },
            focus: {},
          },
        };
      },
      clone(value) {
        return structuredClone(value);
      },
      mount(root, context) {
        return mountConfiguration(
          root,
          context,
          audioResources,
          catalogEntries,
        );
      },
      validate(value, entry) {
        validateConfiguration(value, entry, audioResources);
      },
      summarize(value) {
        const source = value.audio.asset.sources[0]?.path ?? "未选素材";
        return `${value.audio.category === "music" ? "音乐" : "音效"} · ${value.audio.playback} · ${source}`;
      },
    },
    onConfirm(value) {
      options.onConfirm(
        value.events.map((item) => {
          if (!item.configuration)
            throw new Error(`event audio 缺少配置：${item.address}`);
          return {
            event: item.address,
            ...structuredClone(item.configuration),
          };
        }),
      );
    },
  });
}

function mountConfiguration(
  root: HTMLElement,
  context: {
    readonly entry: GameLayoutRuntimeEventCatalogEntry;
    readonly value: EventAudioConfiguration;
    readonly setValue: (value: EventAudioConfiguration) => void;
  },
  audioResources: readonly EditorAudioLayoutResource[],
  catalogEntries: readonly GameLayoutRuntimeEventCatalogEntry[],
): () => void {
  let value = structuredClone(context.value);
  let endEventPicker: EditorGameLayoutEventPickerDialog | null = null;
  let endEventPickerPortal: HTMLDivElement | null = null;
  const destroyEndEventPicker = () => {
    endEventPicker?.destroy();
    endEventPicker = null;
    endEventPickerPortal?.remove();
    endEventPickerPortal = null;
  };
  const render = () => {
    destroyEndEventPicker();
    const audio = value.audio;
    const sourcePath = audio.asset.sources[0]?.path ?? "";
    const bgmGain = audio.focus.bgm?.targetGain ?? 0.5;
    const effectsScope = audio.focus.effects?.scope ?? "none";
    const effectsGain = audio.focus.effects?.targetGain ?? 0.5;
    root.innerHTML = `<div class="event-audio-fields">
      <label>素材<select data-event-audio-field="asset"><option value="">请选择已上传的 audio asset</option>${audioResources.map((resource) => `<option value="${escapeHtml(resource.path)}" ${resource.path === sourcePath ? "selected" : ""}>${escapeHtml(resource.path)}</option>`).join("")}</select></label>
      <label>类型<select data-event-audio-field="category"><option value="music" ${audio.category === "music" ? "selected" : ""}>音乐 (BGM)</option><option value="effect" ${audio.category === "effect" ? "selected" : ""}>音效</option></select></label>
      <label>播放<select data-event-audio-field="playback"><option value="loop" ${audio.playback === "loop" ? "selected" : ""}>循环</option><option value="once" ${audio.playback === "once" ? "selected" : ""}>单次</option></select></label>
      ${audio.playback === "loop" ? `<label>结束 Event<div class="event-audio-end-event" data-event-audio-end-event></div></label><p class="hint">循环音乐和循环音效都必须由另一个精确 event 结束。</p>` : `<fieldset><legend>播放期间降低其它声音</legend><label><input type="checkbox" data-event-audio-field="duckBgm" ${audio.focus.bgm ? "checked" : ""}/>降低 BGM</label><label>保留 BGM 音量<input type="number" min="0" max="100" step="1" data-event-audio-field="bgmGain" value="${Math.round(bgmGain * 100)}" />%</label><label>音效影响范围<select data-event-audio-field="effectsScope"><option value="none" ${effectsScope === "none" ? "selected" : ""}>不影响</option><option value="same-audio" ${effectsScope === "same-audio" ? "selected" : ""}>同 audio</option><option value="all" ${effectsScope === "all" ? "selected" : ""}>全部音效</option></select></label><label>保留音效音量<input type="number" min="0" max="100" step="1" data-event-audio-field="effectsGain" value="${Math.round(effectsGain * 100)}" />%</label><p class="hint">BGM 可与一种音效影响范围同时启用；同 audio 与全部音效互斥。</p></fieldset>`}
    </div>`;
    if (audio.playback === "loop") {
      const control = root.querySelector<HTMLElement>(
        "[data-event-audio-end-event]",
      );
      if (!control) throw new Error("结束 Event 控件挂载失败。");
      const selected = catalogEntries.find(
        ({ descriptor }) => descriptor.address === value.endEvent,
      );
      endEventPickerPortal = document.createElement("div");
      endEventPickerPortal.className = "event-audio-event-picker-portal";
      document.body.append(endEventPickerPortal);
      endEventPicker = mountEditorGameLayoutEventPickerDialog({
        root: endEventPickerPortal,
        rootKey: CURRENT_PROJECT_ROOT,
        sources: [
          { key: CURRENT_PROJECT_ROOT, label: "当前 Game Layout 项目" },
        ],
        value: selected
          ? {
              address: selected.descriptor.address,
              descriptor: selected.descriptor,
            }
          : null,
        title: "选择结束 Event",
        triggerLabel: value.endEvent ?? "选择结束 Event",
        inspectCatalog: () => ({
          rootKey: CURRENT_PROJECT_ROOT,
          entries: catalogEntries.filter(
            ({ descriptor }) =>
              descriptor.address !== context.entry.descriptor.address,
          ),
        }),
        onConfirm(item) {
          value = {
            audio: value.audio,
            endEvent: item.address,
          };
          context.setValue(structuredClone(value));
          render();
        },
      });
      control.append(endEventPicker.trigger);
      if (value.endEvent) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.dataset.eventAudioClearEndEvent = "";
        clear.textContent = "清除";
        control.append(clear);
      }
    }
  };
  const onChange = (event: Event) => {
    const field = (event.target as HTMLElement).dataset.eventAudioField;
    if (!field) return;
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (field === "asset") {
      const resource = audioResources.find(({ path }) => path === target.value);
      value = {
        ...value,
        audio: {
          ...value.audio,
          asset: {
            sources: resource
              ? [{ path: resource.path, mediaType: resource.mediaType }]
              : [],
          },
        },
      };
    } else if (field === "category") {
      value = {
        ...value,
        audio: {
          ...value.audio,
          category: target.value as "music" | "effect",
        },
      };
    } else if (field === "playback") {
      const playback = target.value as "once" | "loop";
      value = {
        audio: {
          ...value.audio,
          playback,
          voices: {
            maxConcurrent: playback === "loop" ? 1 : 8,
            overflow: "restart-oldest",
          },
          focus: playback === "loop" ? {} : value.audio.focus,
        },
        ...(playback === "loop" && value.endEvent
          ? { endEvent: value.endEvent }
          : {}),
      };
    } else {
      let bgm = value.audio.focus.bgm
        ? { ...value.audio.focus.bgm }
        : undefined;
      let effects = value.audio.focus.effects
        ? { ...value.audio.focus.effects }
        : undefined;
      if (field === "duckBgm")
        bgm = (target as HTMLInputElement).checked
          ? { targetGain: bgm?.targetGain ?? 0.5 }
          : undefined;
      if (field === "bgmGain" && bgm)
        bgm = { targetGain: percent(target.value) };
      if (field === "effectsScope")
        effects =
          target.value === "none"
            ? undefined
            : {
                scope: target.value as "same-audio" | "all",
                targetGain: effects?.targetGain ?? 0.5,
              };
      if (field === "effectsGain" && effects)
        effects = { ...effects, targetGain: percent(target.value) };
      value = {
        ...value,
        audio: {
          ...value.audio,
          focus: {
            ...(bgm ? { bgm } : {}),
            ...(effects ? { effects } : {}),
          },
        },
      };
    }
    context.setValue(structuredClone(value));
    render();
  };
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    if (!target.matches("[data-event-audio-clear-end-event]")) return;
    value = { audio: value.audio };
    context.setValue(structuredClone(value));
    render();
  };
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);
  render();
  return () => {
    destroyEndEventPicker();
    root.removeEventListener("change", onChange);
    root.removeEventListener("click", onClick);
  };
}

function validateConfiguration(
  value: EventAudioConfiguration,
  entry: GameLayoutRuntimeEventCatalogEntry,
  resources: readonly EditorAudioLayoutResource[],
): void {
  const source = value.audio.asset.sources[0];
  if (!source || value.audio.asset.sources.length !== 1)
    throw new Error("请选择一个已上传的 audio asset。");
  if (
    !resources.some(
      ({ path, mediaType }) =>
        path === source.path && mediaType === source.mediaType,
    )
  )
    throw new Error(`audio asset 已不存在：${source.path}`);
  if (value.audio.playback === "loop") {
    if (!value.endEvent) throw new Error("循环 audio 必须选择结束 event。");
    if (value.endEvent === entry.descriptor.address)
      throw new Error("结束 event 不能与播放 event 相同。");
  } else if (value.endEvent) {
    throw new Error("单次 audio 不能配置结束 event。");
  }
}

function eventTrackName(address: string): string {
  let hash = 2166136261;
  for (const char of address) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `event-audio-${(hash >>> 0).toString(36)}`;
}

function percent(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100)
    throw new Error("保留音量必须在 0% 到 100% 之间。");
  return number / 100;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

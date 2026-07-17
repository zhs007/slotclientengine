import { createSymbolPackageResource } from "@slotclientengine/rendercore/symbol";
import {
  createFromGameConfig,
  exportSnapshot,
  getGameConfigSymbols,
  removeAnimationSpec,
  replaceUploadedFiles,
  setAnimationSpec,
  setSymbolIncluded,
  setSymbolRenderPriority,
  setSymbolScale,
  setSymbolNormal,
  setSymbolTexturePath,
  setTextureStateSetting,
  setTextureStates,
  setValuePresentationField,
  type SymbolEditorProject,
} from "../model/editor-project.js";
import {
  SymbolEditorStore,
  type SymbolEditorStoreSnapshot,
} from "../model/editor-store.js";
import {
  createSnapshotFiles,
  exportSymbolPackageZip,
  importSymbolPackageZip,
} from "../io/symbol-package-zip.js";
import { SymbolEditorPreview } from "../preview/symbol-preview.js";

export class SymbolsEditorApp {
  readonly #root: HTMLElement;
  readonly #store = new SymbolEditorStore();
  #preview: SymbolEditorPreview | null = null;
  #unsubscribe: (() => void) | null = null;
  #previewRequest = 0;
  #selectedSymbol = "";
  #selectedState = "normal";
  #gallery = false;

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  async init(): Promise<void> {
    this.#root.innerHTML = shellMarkup();
    this.#preview = new SymbolEditorPreview(
      this.requireElement("[data-preview]"),
    );
    await this.#preview.init();
    this.bindActions();
    this.#unsubscribe = this.#store.subscribe((snapshot) => {
      this.render(snapshot);
      void this.refreshPreview(snapshot);
    });
  }

  destroy(): void {
    this.#unsubscribe?.();
    this.#preview?.destroy();
    this.#root.replaceChildren();
  }

  private bindActions(): void {
    this.requireElement("[data-new]").addEventListener(
      "click",
      () => void this.createProject(),
    );
    this.requireElement("[data-import]").addEventListener(
      "click",
      () => void this.importPackage(),
    );
    this.requireElement("[data-export]").addEventListener(
      "click",
      () => void this.exportPackage(),
    );
    this.requireElement("[data-upload]").addEventListener(
      "click",
      () => void this.uploadResources(),
    );
    this.requireElement("[data-gallery]").addEventListener(
      "change",
      (event) => {
        this.#gallery = (event.currentTarget as HTMLInputElement).checked;
        this.#preview?.setGallery(this.#gallery);
      },
    );
    this.requireElement("[data-replay]").addEventListener("click", () =>
      this.#preview?.replay(),
    );
  }

  private render(snapshot: SymbolEditorStoreSnapshot): void {
    const panel = this.requireElement("[data-project-panel]");
    if (!snapshot.project) {
      panel.innerHTML =
        '<p class="empty">上传公开 gameconfig.json 或导入 symbols ZIP 开始。</p>';
      this.requireElement("[data-errors]").textContent = "";
      return;
    }
    const project = snapshot.project;
    const symbols = getGameConfigSymbols(project);
    if (
      !this.#selectedSymbol ||
      !symbols.some(
        ({ symbol }) =>
          symbol === this.#selectedSymbol &&
          project.includedSymbols.has(symbol),
      )
    ) {
      this.#selectedSymbol =
        symbols.find(({ symbol }) => project.includedSymbols.has(symbol))
          ?.symbol ?? "";
    }
    panel.innerHTML = projectMarkup(
      project,
      symbols,
      this.#selectedSymbol,
      this.#selectedState,
    );
    this.requireElement("[data-errors]").replaceChildren(
      ...snapshot.diagnostics.map((message) =>
        Object.assign(document.createElement("div"), { textContent: message }),
      ),
    );
    this.bindProjectControls(panel);
  }

  private bindProjectControls(panel: HTMLElement): void {
    panel
      .querySelector<HTMLInputElement>("[data-id]")
      ?.addEventListener("change", (event) => {
        this.#store.transact((draft) => {
          draft.id = (event.currentTarget as HTMLInputElement).value;
        });
      });
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-cell]",
    )) {
      input.addEventListener("change", () =>
        this.#store.transact((draft) => {
          draft.cellSize[input.dataset.cell as "width" | "height"] = Number(
            input.value,
          );
        }),
      );
    }
    panel
      .querySelector<HTMLInputElement>("[data-texture-states]")
      ?.addEventListener("change", (event) => {
        try {
          const states = (event.currentTarget as HTMLInputElement).value
            .split(",")
            .map((state) => state.trim())
            .filter(Boolean);
          this.#store.transact((draft) => setTextureStates(draft, states));
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-state-setting]",
    )) {
      input.addEventListener("change", () => {
        const state = input.dataset.stateSetting!;
        const kind = input.dataset.settingKind!;
        const field = input.dataset.settingField!;
        this.#store.transact((draft) =>
          setTextureStateSetting(draft, state, {
            kind,
            [field]: Number(input.value),
          }),
        );
      });
    }
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-include]",
    )) {
      input.addEventListener("change", () =>
        this.#store.transact((draft) =>
          setSymbolIncluded(draft, input.dataset.include!, input.checked),
        ),
      );
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>(
      "[data-select-symbol]",
    )) {
      button.addEventListener("click", () => {
        this.#selectedSymbol = button.dataset.selectSymbol!;
        this.render(this.#store.getSnapshot());
        this.#preview?.setSelectedSymbol(this.#selectedSymbol);
      });
    }
    panel
      .querySelector<HTMLInputElement>("[data-scale]")
      ?.addEventListener("change", (event) => {
        this.#store.transact((draft) =>
          setSymbolScale(
            draft,
            this.#selectedSymbol,
            Number((event.currentTarget as HTMLInputElement).value),
          ),
        );
      });
    panel
      .querySelector<HTMLInputElement>("[data-priority]")
      ?.addEventListener("change", (event) => {
        this.#store.transact((draft) =>
          setSymbolRenderPriority(
            draft,
            this.#selectedSymbol,
            Number((event.currentTarget as HTMLInputElement).value),
          ),
        );
      });
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-texture-path]",
    )) {
      input.addEventListener("change", () => {
        try {
          this.#store.transact((draft) =>
            setSymbolTexturePath(
              draft,
              this.#selectedSymbol,
              input.dataset.texturePath!,
              input.value,
            ),
          );
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    }
    panel
      .querySelector<HTMLSelectElement>("[data-normal-kind]")
      ?.addEventListener("change", (event) => {
        const kind = (event.currentTarget as HTMLSelectElement).value;
        this.#store.transact((draft) =>
          setSymbolNormal(
            draft,
            this.#selectedSymbol,
            kind === "layered"
              ? {
                  kind: "layered",
                  layers: [
                    {
                      index: 0,
                      texture: `./${this.#selectedSymbol}-0.png`,
                      keyframes: [],
                    },
                  ],
                }
              : `./${this.#selectedSymbol}.png`,
          ),
        );
      });
    panel
      .querySelector<HTMLInputElement>("[data-normal-single]")
      ?.addEventListener("change", (event) => {
        this.#store.transact((draft) =>
          setSymbolNormal(
            draft,
            this.#selectedSymbol,
            (event.currentTarget as HTMLInputElement).value,
          ),
        );
      });
    panel
      .querySelector<HTMLInputElement>("[data-layer-count]")
      ?.addEventListener("change", (event) => {
        const count = Number((event.currentTarget as HTMLInputElement).value);
        const normal = currentLayeredNormal(
          this.#store.getSnapshot().project!,
          this.#selectedSymbol,
        );
        this.#store.transact((draft) =>
          setSymbolNormal(draft, this.#selectedSymbol, {
            kind: "layered",
            layers: Array.from({ length: count }, (_, index) =>
              normal.layers[index]
                ? { ...normal.layers[index], index }
                : {
                    index,
                    texture: `./${this.#selectedSymbol}-${index}.png`,
                    keyframes: [],
                  },
            ),
          }),
        );
      });
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-layer-field]",
    )) {
      input.addEventListener("change", () => {
        const normal = currentLayeredNormal(
          this.#store.getSnapshot().project!,
          this.#selectedSymbol,
        );
        const index = Number(input.dataset.layerIndex);
        const layers = normal.layers.map((layer) => ({ ...layer }));
        if (input.dataset.layerField === "texture") {
          layers[index].texture = input.value;
        } else {
          layers[index].keyframes = input.value
            .split(",")
            .map((path) => path.trim())
            .filter(Boolean);
        }
        this.#store.transact((draft) =>
          setSymbolNormal(draft, this.#selectedSymbol, {
            kind: "layered",
            layers,
          }),
        );
      });
    }
    panel
      .querySelector<HTMLSelectElement>("[data-state]")
      ?.addEventListener("change", (event) => {
        this.#selectedState = (event.currentTarget as HTMLSelectElement).value;
        this.#preview?.setState(this.#selectedState);
        this.render(this.#store.getSnapshot());
      });
    const animationKind = panel.querySelector<HTMLSelectElement>(
      "[data-animation-kind]",
    );
    const updateAnimation = () => {
      const kind = animationKind?.value ?? "none";
      try {
        this.#store.transact((draft) =>
          applyAnimationForm(
            draft,
            this.#selectedSymbol,
            this.#selectedState,
            kind,
            panel,
          ),
        );
      } catch (error) {
        this.#store.setExternalError(error);
      }
    };
    animationKind?.addEventListener("change", updateAnimation);
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-animation-field]",
    )) {
      input.addEventListener("change", updateAnimation);
    }
    for (const control of panel.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("[data-vp-path]")) {
      control.addEventListener("change", () => {
        try {
          const fieldValue = parseStructuredInputValue(
            control.value,
            control.dataset.valueType!,
            control instanceof HTMLInputElement && control.checked,
          );
          this.#store.transact((draft) =>
            setValuePresentationField(
              draft,
              this.#selectedSymbol,
              control.dataset.vpPath!,
              fieldValue,
            ),
          );
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    }
    panel
      .querySelector<HTMLInputElement>("[data-preview-value]")
      ?.addEventListener("change", (event) => {
        this.#preview?.setPresentationValue(
          Number((event.currentTarget as HTMLInputElement).value),
        );
      });
  }

  private async refreshPreview(
    snapshot: SymbolEditorStoreSnapshot,
  ): Promise<void> {
    const request = ++this.#previewRequest;
    if (!snapshot.project || snapshot.diagnostics.length > 0) return;
    try {
      const exportData = exportSnapshot(snapshot.project);
      const resource = await createSymbolPackageResource({
        packageManifest: exportData.packageManifest,
        files: createSnapshotFiles(exportData),
      });
      if (request !== this.#previewRequest) {
        resource.destroy();
        return;
      }
      await this.#preview?.setResource(resource, this.#selectedSymbol);
      this.#preview?.setGallery(this.#gallery);
      this.#preview?.setState(this.#selectedState);
    } catch (error) {
      if (request === this.#previewRequest) this.#store.setExternalError(error);
    }
  }

  private async createProject(): Promise<void> {
    const [file] = await pickFiles(".json,application/json", false);
    if (!file) return;
    try {
      this.#store.replace(
        createFromGameConfig({
          rawGameConfig: JSON.parse(await file.text()),
          fileName: file.name,
        }),
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async importPackage(): Promise<void> {
    const [file] = await pickFiles(".zip,application/zip", false);
    if (!file) return;
    try {
      const imported = await importSymbolPackageZip(
        new Uint8Array(await file.arrayBuffer()),
      );
      const previousRequest = ++this.#previewRequest;
      this.#store.replace(imported.project);
      if (previousRequest !== this.#previewRequest) imported.destroy();
      else await this.#preview?.setResource(imported.resource);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadResources(): Promise<void> {
    const files = await pickFiles(".png,.jpg,.jpeg,.webp,.json,.atlas", true);
    if (files.length === 0) return;
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      this.#store.transact((draft) => replaceUploadedFiles(draft, uploaded));
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async exportPackage(): Promise<void> {
    const project = this.#store.getSnapshot().project;
    if (!project) return;
    try {
      const exported = await exportSymbolPackageZip(project);
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.click();
      queueMicrotask(() => URL.revokeObjectURL(url));
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private requireElement(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`缺少 UI element ${selector}`);
    return element;
  }
}

function projectMarkup(
  project: SymbolEditorProject,
  symbols: readonly { code: number; symbol: string }[],
  selectedSymbol: string,
  selectedState: string,
): string {
  const manifestSymbols = project.manifestDraft.symbols as Record<
    string,
    Record<string, unknown>
  >;
  const selected = manifestSymbols[selectedSymbol];
  const parsed = selected ? selected : {};
  const animations = (parsed.animations ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const animation = animations[selectedState];
  const textureStates = (project.manifestDraft.states ?? []) as string[];
  const settings = (project.manifestDraft.settings ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const states = [
    ...new Set([
      "normal",
      "appear",
      "win",
      "remove",
      "dropdown",
      ...textureStates,
    ]),
  ];
  return `
    <section><h2>项目</h2>
      <label>ID <input data-id value="${escapeHtml(project.id)}"></label>
      <div class="two"><label>Cell 宽 <input data-cell="width" type="number" min="0.01" step="0.01" value="${project.cellSize.width}"></label>
      <label>Cell 高 <input data-cell="height" type="number" min="0.01" step="0.01" value="${project.cellSize.height}"></label></div>
      <label>Texture states（逗号分隔） <input data-texture-states value="${escapeHtml(textureStates.join(","))}"></label>
      ${settings.spinBlur?.kind === "verticalBoxBlur" ? `<label>spinBlur kernelHeight <input data-state-setting="spinBlur" data-setting-kind="verticalBoxBlur" data-setting-field="kernelHeight" type="number" min="1" value="${Number(settings.spinBlur.kernelHeight)}"></label>` : ""}
      ${settings.disabled?.kind === "grayscale" ? `<label>disabled brightness <input data-state-setting="disabled" data-setting-kind="grayscale" data-setting-field="brightness" type="number" min="0" step="0.01" value="${Number(settings.disabled.brightness)}"></label>` : ""}
      <p class="hint">game config: ${escapeHtml(project.gameConfigFileName)} · mapped ${project.assets.size} · unmapped ${project.unmappedFiles.size}</p>
    </section>
    <section><h2>Display symbols</h2><div class="symbol-list">
      ${symbols
        .map(
          ({
            code,
            symbol,
          }) => `<div class="symbol-row ${symbol === selectedSymbol ? "selected" : ""}">
        <label><input type="checkbox" data-include="${escapeHtml(symbol)}" ${project.includedSymbols.has(symbol) ? "checked" : ""}> ${code} · ${escapeHtml(symbol)}</label>
        <button type="button" data-select-symbol="${escapeHtml(symbol)}" ${project.includedSymbols.has(symbol) ? "" : "disabled"}>编辑</button>
      </div>`,
        )
        .join("")}
    </div></section>
    ${
      selected
        ? `<section><h2>${escapeHtml(selectedSymbol)} 状态</h2>
      <div class="two"><label>Scale <input data-scale type="number" min="0.01" step="0.01" value="${Number(parsed.scale ?? 1)}"></label>
      <label>Priority <input data-priority type="number" min="0" step="1" value="${Number(parsed.renderPriority ?? 0)}"></label></div>
      ${parsed.valuePresentation ? "" : `${normalFields(parsed.normal, selectedSymbol)}${textureStates.map((state) => `<label>${escapeHtml(state)} texture <input data-texture-path="${escapeHtml(state)}" value="${escapeHtml(String(parsed[state] ?? ""))}"></label>`).join("")}`}
      <label>单状态预览 <select data-state>${states.map((state) => `<option ${state === selectedState ? "selected" : ""}>${state}</option>`).join("")}</select></label>
      <label>Animation 类型 <select data-animation-kind>
        ${["none", "builtin", "static", "vni", "spine", ...(parsed.valuePresentation ? ["activeSpine"] : [])].map((kind) => `<option value="${kind}" ${animation?.kind === kind || (!animation && kind === "none") ? "selected" : ""}>${kind}</option>`).join("")}
      </select></label>
      ${animationFields(animation)}
      <p class="hint">每次只预览一个 state；once 可点 Replay。未提供 sequence / hold / next 编排。</p>
      ${parsed.valuePresentation ? valuePresentationFields(parsed.valuePresentation as Record<string, unknown>, textureStates) : ""}
      ${parsed.cascadeWinPresentation ? '<p class="hint">cascadeWinPresentation 已严格解析，只读保留并 round-trip。</p>' : ""}
    </section>`
        : ""
    }`;
}

function animationFields(
  animation: Record<string, unknown> | undefined,
): string {
  if (!animation) return "";
  if (animation.kind === "builtin" || animation.kind === "static")
    return `<label>Duration(s) <input data-animation-field data-duration type="number" min="0.001" step="0.001" value="${Number(animation.durationSeconds ?? 1)}"></label>`;
  if (animation.kind === "vni")
    return `<label>Project <input data-animation-field data-project value="${escapeHtml(String(animation.project ?? ""))}"></label><div class="two"><label>Start <input data-animation-field data-start type="number" step="0.001" value="${Number((animation.playback as Record<string, unknown> | undefined)?.startTime ?? 0)}"></label><label>End <input data-animation-field data-end type="number" step="0.001" value="${Number((animation.playback as Record<string, unknown> | undefined)?.endTime ?? 1)}"></label></div>`;
  if (animation.kind === "spine")
    return `<label>Skeleton <input data-animation-field data-skeleton value="${escapeHtml(String(animation.skeleton ?? ""))}"></label><label>Atlas <input data-animation-field data-atlas value="${escapeHtml(String(animation.atlas ?? ""))}"></label><label>Texture <input data-animation-field data-texture value="${escapeHtml(String(animation.texture ?? ""))}"></label><label>Animation name <input data-animation-field data-animation-name value="${escapeHtml(String((animation.playback as Record<string, unknown> | undefined)?.animationName ?? ""))}"></label><label><input data-animation-field data-loop type="checkbox" ${(animation.playback as Record<string, unknown> | undefined)?.loop ? "checked" : ""}> Loop</label>${spineTransformFields(animation.transform as Record<string, unknown> | undefined)}`;
  if (animation.kind === "activeSpine")
    return `<label>Animation name <input data-animation-field data-animation-name value="${escapeHtml(String((animation.playback as Record<string, unknown> | undefined)?.animationName ?? ""))}"></label><label><input data-animation-field data-loop type="checkbox" ${(animation.playback as Record<string, unknown> | undefined)?.loop ? "checked" : ""}> Loop</label>`;
  return "";
}

function normalFields(normal: unknown, symbol: string): string {
  const layered =
    normal &&
    typeof normal === "object" &&
    (normal as Record<string, unknown>).kind === "layered"
      ? (normal as { layers: readonly Record<string, unknown>[] })
      : null;
  return `<label>Normal 类型 <select data-normal-kind><option value="single" ${layered ? "" : "selected"}>single</option><option value="layered" ${layered ? "selected" : ""}>layered</option></select></label>
    ${
      layered
        ? `<label>Layer 数 <input data-layer-count type="number" min="1" step="1" value="${layered.layers.length}"></label>${layered.layers
            .map(
              (layer, index) =>
                `<div class="tier-card"><strong>Layer ${index}</strong><label>Texture <input data-layer-field="texture" data-layer-index="${index}" value="${escapeHtml(String(layer.texture ?? `./${symbol}-${index}.png`))}"></label><label>Keyframes（逗号分隔，首项必须是 texture） <input data-layer-field="keyframes" data-layer-index="${index}" value="${escapeHtml(((layer.keyframes as readonly string[] | undefined) ?? []).join(","))}"></label></div>`,
            )
            .join("")}`
        : `<label>Normal texture <input data-normal-single value="${escapeHtml(typeof normal === "string" ? normal : `./${symbol}.png`)}"></label>`
    }`;
}

function spineTransformFields(
  transform: Record<string, unknown> | undefined,
): string {
  return `<fieldset><legend>Spine transform（可选）</legend><div class="two"><label>X <input data-animation-field data-transform-x type="number" step="0.01" value="${transform?.x === undefined ? "" : Number(transform.x)}"></label><label>Y <input data-animation-field data-transform-y type="number" step="0.01" value="${transform?.y === undefined ? "" : Number(transform.y)}"></label></div><label>Scale <input data-animation-field data-transform-scale type="number" min="0.001" step="0.01" value="${transform?.scale === undefined ? "" : Number(transform.scale)}"></label></fieldset>`;
}

function valuePresentationFields(
  presentation: Record<string, unknown>,
  textureStates: readonly string[],
): string {
  const defaultValues = presentation.defaultValues as readonly number[];
  const reelStates = presentation.reelStates as Record<string, unknown>;
  const normal = reelStates.normal as Record<string, unknown>;
  const text = presentation.text as Record<string, unknown>;
  const tiers = presentation.tiers as readonly Record<string, unknown>[];
  return `<fieldset><legend>Value presentation（结构化）</legend>
    <label>Preview value <input data-preview-value type="number" min="1" step="1" value="${defaultValues[0]}"></label>
    <label>Default values <input data-vp-path="defaultValues" data-value-type="csv-numbers" value="${escapeHtml(defaultValues.join(","))}"></label>
    <div class="two"><label>Transparent width <input data-vp-path="reelStates.normal.width" data-value-type="number" type="number" min="0.01" value="${Number(normal.width)}"></label>
    <label>Transparent height <input data-vp-path="reelStates.normal.height" data-value-type="number" type="number" min="0.01" value="${Number(normal.height)}"></label></div>
    ${textureStates.map((state) => `<label>Reel ${escapeHtml(state)} <input data-vp-path="reelStates.${escapeHtml(state)}" data-value-type="string" value="${escapeHtml(String(reelStates[state] ?? ""))}"></label>`).join("")}
    <label>Text 类型 <select data-vp-path="text.type" data-value-type="string"><option value="image" ${text.type === "image" ? "selected" : ""}>image</option><option value="font" ${text.type === "font" ? "selected" : ""}>font</option></select></label>
    <label>Slot <input data-vp-path="text.slot" data-value-type="string" value="${escapeHtml(String(text.slot))}"></label>
    <div class="two"><label>X <input data-vp-path="text.x" data-value-type="number" type="number" step="0.01" value="${Number(text.x)}"></label><label>Y <input data-vp-path="text.y" data-value-type="number" type="number" step="0.01" value="${Number(text.y)}"></label></div>
    ${text.type === "image" ? `<label>Image prefix <input data-vp-path="text.prefix" data-value-type="string" value="${escapeHtml(String(text.prefix))}"></label>` : fontTextFields(text)}
    <h3>Tiers</h3>
    ${tiers.map((tier, index) => valueTierFields(tier, index)).join("")}
    <p class="hint">image value 候选严格来自 defaultValues；缺图不会回退 font。</p>
  </fieldset>`;
}

function fontTextFields(text: Record<string, unknown>): string {
  return `<label>Font family <input data-vp-path="text.fontFamily" data-value-type="string" value="${escapeHtml(String(text.fontFamily))}"></label>
    <div class="two"><label>Font size <input data-vp-path="text.fontSize" data-value-type="number" type="number" value="${Number(text.fontSize)}"></label><label>Weight <input data-vp-path="text.fontWeight" data-value-type="string" value="${escapeHtml(String(text.fontWeight))}"></label></div>
    <div class="two"><label>Fill <input data-vp-path="text.fill" data-value-type="string" value="${escapeHtml(String(text.fill))}"></label><label>Stroke <input data-vp-path="text.stroke" data-value-type="string" value="${escapeHtml(String(text.stroke))}"></label></div>
    <label>Stroke width <input data-vp-path="text.strokeWidth" data-value-type="number" type="number" value="${Number(text.strokeWidth)}"></label>`;
}

function valueTierFields(tier: Record<string, unknown>, index: number): string {
  const animation = tier.animation as Record<string, unknown>;
  const playback = animation.playback as Record<string, unknown>;
  return `<div class="tier-card"><strong>Tier ${index + 1}</strong>
    <label>maxExclusive（末档留空） <input data-vp-path="tiers.${index}.maxExclusive" data-value-type="optional-number" type="number" value="${tier.maxExclusive === undefined ? "" : Number(tier.maxExclusive)}"></label>
    <label>Skeleton <input data-vp-path="tiers.${index}.animation.skeleton" data-value-type="string" value="${escapeHtml(String(animation.skeleton))}"></label>
    <label>Atlas <input data-vp-path="tiers.${index}.animation.atlas" data-value-type="string" value="${escapeHtml(String(animation.atlas))}"></label>
    <label>Texture <input data-vp-path="tiers.${index}.animation.texture" data-value-type="string" value="${escapeHtml(String(animation.texture))}"></label>
    <label>Animation name <input data-vp-path="tiers.${index}.animation.playback.animationName" data-value-type="string" value="${escapeHtml(String(playback.animationName))}"></label>
    <label><input data-vp-path="tiers.${index}.animation.playback.loop" data-value-type="boolean" type="checkbox" ${playback.loop ? "checked" : ""}> Loop</label>
    ${valueTierTransformFields((animation.transform as Record<string, unknown> | undefined) ?? {}, index)}
  </div>`;
}

function valueTierTransformFields(
  transform: Record<string, unknown>,
  index: number,
): string {
  return `<fieldset><legend>Transform（可选）</legend><div class="two"><label>X <input data-vp-path="tiers.${index}.animation.transform.x" data-value-type="optional-number" type="number" step="0.01" value="${transform.x === undefined ? "" : Number(transform.x)}"></label><label>Y <input data-vp-path="tiers.${index}.animation.transform.y" data-value-type="optional-number" type="number" step="0.01" value="${transform.y === undefined ? "" : Number(transform.y)}"></label></div><label>Scale <input data-vp-path="tiers.${index}.animation.transform.scale" data-value-type="optional-number" type="number" min="0.001" step="0.01" value="${transform.scale === undefined ? "" : Number(transform.scale)}"></label></fieldset>`;
}

function parseStructuredInputValue(
  value: string,
  type: string,
  checked: boolean,
): unknown {
  if (type === "string") return value;
  if (type === "number") return Number(value);
  if (type === "optional-number")
    return value.trim() ? Number(value) : undefined;
  if (type === "boolean") return checked;
  if (type === "csv-numbers") {
    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }
  throw new Error(`未知结构化字段类型：${type}`);
}

function applyAnimationForm(
  project: SymbolEditorProject,
  symbol: string,
  state: string,
  kind: string,
  panel: HTMLElement,
): void {
  if (kind === "none") return removeAnimationSpec(project, symbol, state);
  const value = (selector: string, fallback = "") =>
    panel.querySelector<HTMLInputElement>(selector)?.value ?? fallback;
  const number = (selector: string, fallback: number) =>
    Number(value(selector, String(fallback)));
  const loop =
    panel.querySelector<HTMLInputElement>("[data-loop]")?.checked ??
    state === "normal";
  if (kind === "builtin" || kind === "static") {
    setAnimationSpec(project, symbol, state, {
      kind,
      durationSeconds: number("[data-duration]", 1),
    });
  } else if (kind === "vni") {
    setAnimationSpec(project, symbol, state, {
      kind,
      project: value("[data-project]", `./${symbol}-wins.json`),
      playback: {
        mode: "range",
        startTime: number("[data-start]", 0),
        endTime: number("[data-end]", 1),
        loop: false,
      },
    });
  } else if (kind === "spine") {
    const transform = Object.fromEntries(
      [
        ["x", value("[data-transform-x]")],
        ["y", value("[data-transform-y]")],
        ["scale", value("[data-transform-scale]")],
      ]
        .filter(([, fieldValue]) => fieldValue !== "")
        .map(([field, fieldValue]) => [field, Number(fieldValue)]),
    );
    setAnimationSpec(project, symbol, state, {
      kind,
      skeleton: value("[data-skeleton]", `./${symbol}.json`),
      atlas: value("[data-atlas]", "./Symbol.atlas"),
      texture: value("[data-texture]", "./Symbol.png"),
      playback: {
        mode: "animation",
        animationName: value("[data-animation-name]", state),
        loop,
      },
      ...(Object.keys(transform).length > 0 ? { transform } : {}),
    });
  } else if (kind === "activeSpine") {
    setAnimationSpec(project, symbol, state, {
      kind,
      playback: {
        mode: "animation",
        animationName: value("[data-animation-name]", state),
        loop,
      },
    });
  }
}

function currentLayeredNormal(
  project: SymbolEditorProject,
  symbol: string,
): {
  readonly kind: "layered";
  readonly layers: {
    index: number;
    texture: string;
    keyframes: string[];
  }[];
} {
  const symbols = project.manifestDraft.symbols as Record<
    string,
    Record<string, unknown>
  >;
  const normal = symbols[symbol]?.normal as
    | {
        readonly kind: "layered";
        readonly layers: readonly {
          readonly index: number;
          readonly texture: string;
          readonly keyframes?: readonly string[];
        }[];
      }
    | undefined;
  if (normal?.kind !== "layered")
    throw new Error(`symbol ${symbol} 当前 normal 不是 layered。`);
  return {
    kind: "layered",
    layers: normal.layers.map((layer) => ({
      index: layer.index,
      texture: layer.texture,
      keyframes: [...(layer.keyframes ?? [])],
    })),
  };
}

function shellMarkup(): string {
  return `<div class="app-shell">
    <aside><header><h1>Symbols Editor</h1><p>本地、严格、可重导入</p></header>
      <div class="toolbar"><button data-new>上传 gameconfig</button><button data-import>导入 symbols ZIP</button><button data-upload>上传资源</button><button data-export>导出 ZIP</button></div>
      <div data-errors class="errors" role="alert"></div><div data-project-panel></div>
    </aside>
    <section class="preview-pane"><div class="preview-toolbar"><label><input data-gallery type="checkbox"> Gallery</label><button data-replay>Replay once</button></div><div data-preview class="preview"></div></section>
  </div>`;
}

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]), {
      once: true,
    });
    input.click();
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

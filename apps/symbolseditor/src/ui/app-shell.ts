import { createSymbolPackageResource } from "@slotclientengine/rendercore/symbol";
import {
  addCustomStateDefinition,
  addSymbolState,
  createFromGameConfig,
  createPreviewSnapshot,
  deleteAsset,
  exportSnapshot,
  getAssetReferences,
  getIncludedSymbols,
  getSymbolResourceStatus,
  moveSymbolState,
  removeCustomStateDefinition,
  removeSymbolState,
  replaceAsset,
  setAllSymbolsIncluded,
  setCascadeWinPresentation,
  setStateVisual,
  setSymbolIncluded,
  setSymbolRenderPriority,
  setSymbolScale,
  setValuePresentation,
  uploadAssetBatch,
  type EditorAssetRecord,
  type EditorBaseVisual,
  type EditorStateDefinition,
  type EditorStateVisual,
  type EditorSymbolDraft,
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
import {
  SymbolEditorPreview,
  type SymbolPreviewCell,
} from "../preview/symbol-preview.js";

export class SymbolsEditorApp {
  readonly #root: HTMLElement;
  readonly #store = new SymbolEditorStore();
  #preview: SymbolEditorPreview | null = null;
  #unsubscribe: (() => void) | null = null;
  #previewRequest = 0;
  #selectedSymbol = "";
  #selectedState = "normal";
  #assetFilter = "";
  #replacePath: string | null = null;
  #previewValue = 1;

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  async init(): Promise<void> {
    this.#root.innerHTML = shellMarkup();
    this.#preview = new SymbolEditorPreview(
      this.requireElement("[data-preview]"),
    );
    await this.#preview.init();
    this.bindToolbar();
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

  private bindToolbar(): void {
    this.requireElement("[data-new]").addEventListener("click", () =>
      this.requireInput("[data-new-input]").click(),
    );
    this.requireElement("[data-import]").addEventListener("click", () =>
      this.requireInput("[data-import-input]").click(),
    );
    this.requireElement("[data-upload]").addEventListener("click", () =>
      this.requireInput("[data-upload-input]").click(),
    );
    this.requireElement("[data-upload-directory]").addEventListener(
      "click",
      () => this.requireInput("[data-directory-input]").click(),
    );
    this.requireElement("[data-export]").addEventListener(
      "click",
      () => void this.exportPackage(),
    );
    this.requireElement("[data-new-input]").addEventListener(
      "change",
      (event) =>
        void this.createProject(event.currentTarget as HTMLInputElement),
    );
    this.requireElement("[data-import-input]").addEventListener(
      "change",
      (event) =>
        void this.importPackage(event.currentTarget as HTMLInputElement),
    );
    for (const selector of ["[data-upload-input]", "[data-directory-input]"]) {
      this.requireElement(selector).addEventListener(
        "change",
        (event) =>
          void this.uploadResources(event.currentTarget as HTMLInputElement),
      );
    }
    this.requireElement("[data-replace-input]").addEventListener(
      "change",
      (event) =>
        void this.replaceResource(event.currentTarget as HTMLInputElement),
    );
    this.requireElement("[data-replay]").addEventListener("click", () =>
      this.#preview?.replay(),
    );
    this.requireElement("[data-fit]").addEventListener("click", () =>
      this.updateZoom(this.#preview?.fitAll() ?? 1),
    );
    this.requireElement("[data-zoom-out]").addEventListener("click", () =>
      this.updateZoom(
        this.#preview?.setZoom((this.#preview.getZoom() ?? 1) / 1.2) ?? 1,
      ),
    );
    this.requireElement("[data-zoom-in]").addEventListener("click", () =>
      this.updateZoom(
        this.#preview?.setZoom((this.#preview.getZoom() ?? 1) * 1.2) ?? 1,
      ),
    );
    this.requireElement("[data-zoom]").addEventListener("input", (event) => {
      const zoom = Number((event.currentTarget as HTMLInputElement).value);
      this.updateZoom(this.#preview?.setZoom(zoom) ?? zoom);
    });
    this.requireElement("[data-preview-state]").addEventListener(
      "change",
      (event) => {
        this.#selectedState = (event.currentTarget as HTMLSelectElement).value;
        const snapshot = this.#store.getSnapshot();
        this.render(snapshot);
        void this.refreshPreview(snapshot);
      },
    );
    this.requireElement("[data-preview-value]").addEventListener(
      "change",
      (event) => {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        if (Number.isSafeInteger(value) && value > 0)
          this.#previewValue = value;
        void this.refreshPreview(this.#store.getSnapshot());
      },
    );
  }

  private render(snapshot: SymbolEditorStoreSnapshot): void {
    const panel = this.requireElement("[data-project-panel]");
    const errors = this.requireElement("[data-errors]");
    const exportButton = this.requireElement(
      "[data-export]",
    ) as HTMLButtonElement;
    if (!snapshot.project) {
      panel.innerHTML =
        '<p class="empty">上传公开 gameconfig.json 或导入 symbols ZIP 开始。</p>';
      errors.textContent = "";
      exportButton.disabled = true;
      this.#preview?.clearResource();
      return;
    }
    const project = snapshot.project;
    const symbols = [...project.symbols.values()].sort(
      (left, right) => left.code - right.code,
    );
    if (!this.#selectedSymbol || !project.symbols.has(this.#selectedSymbol)) {
      this.#selectedSymbol = symbols[0]?.symbol ?? "";
    }
    if (
      !project.stateDefinitions.some(
        (definition) => definition.id === this.#selectedState,
      )
    ) {
      this.#selectedState = "normal";
    }
    panel.innerHTML = projectMarkup(
      project,
      symbols,
      this.#selectedSymbol,
      this.#assetFilter,
    );
    errors.replaceChildren(
      ...snapshot.diagnostics.map((message) =>
        Object.assign(document.createElement("div"), { textContent: message }),
      ),
    );
    try {
      exportSnapshot(project);
      exportButton.disabled = false;
      exportButton.title = "";
    } catch (error) {
      exportButton.disabled = true;
      exportButton.title = formatError(error);
    }
    const stateSelect = this.requireElement(
      "[data-preview-state]",
    ) as HTMLSelectElement;
    stateSelect.innerHTML = project.stateDefinitions
      .map((definition) =>
        option(
          definition.id,
          definition.id,
          definition.id === this.#selectedState,
        ),
      )
      .join("");
    this.bindProjectControls(panel, project);
  }

  private bindProjectControls(
    panel: HTMLElement,
    project: SymbolEditorProject,
  ): void {
    this.bindInput(panel, "[data-project-id]", (input) =>
      this.#store.transact((draft) => {
        draft.id = input.value.trim();
      }),
    );
    for (const key of ["width", "height"] as const) {
      this.bindInput(panel, `[data-cell-${key}]`, (input) =>
        this.#store.transact((draft) => {
          draft.cellSize[key] = Number(input.value);
        }),
      );
    }
    panel
      .querySelectorAll<HTMLElement>("[data-select-mode]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          this.#store.transact((draft) =>
            setAllSymbolsIncluded(
              draft,
              button.dataset.selectMode as "all" | "none" | "invert",
            ),
          ),
        );
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-symbol-included]")
      .forEach((input) => {
        input.addEventListener("change", () =>
          this.#store.transact((draft) =>
            setSymbolIncluded(
              draft,
              input.dataset.symbolIncluded!,
              input.checked,
            ),
          ),
        );
      });
    panel
      .querySelectorAll<HTMLElement>("[data-edit-symbol]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#selectedSymbol = button.dataset.editSymbol!;
          this.render(this.#store.getSnapshot());
        });
      });
    this.bindInput(panel, "[data-symbol-scale]", (input) =>
      this.#store.transact((draft) =>
        setSymbolScale(draft, this.#selectedSymbol, Number(input.value)),
      ),
    );
    this.bindInput(panel, "[data-symbol-priority]", (input) =>
      this.#store.transact((draft) =>
        setSymbolRenderPriority(
          draft,
          this.#selectedSymbol,
          Number(input.value),
        ),
      ),
    );
    panel
      .querySelector<HTMLSelectElement>("[data-add-state]")
      ?.addEventListener("change", (event) => {
        const input = event.currentTarget as HTMLSelectElement;
        if (!input.value) return;
        this.#store.transact((draft) =>
          addSymbolState(draft, this.#selectedSymbol, input.value),
        );
      });
    panel
      .querySelectorAll<HTMLElement>("[data-state-action]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const state = button.dataset.state!;
          const action = button.dataset.stateAction;
          try {
            this.#store.transact((draft) => {
              if (action === "remove")
                removeSymbolState(draft, this.#selectedSymbol, state);
              else
                moveSymbolState(
                  draft,
                  this.#selectedSymbol,
                  state,
                  action === "up" ? -1 : 1,
                );
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLSelectElement>("[data-visual-kind]")
      .forEach((select) => {
        select.addEventListener("change", () => {
          const state = select.dataset.state!;
          try {
            this.#store.transact((draft) =>
              setStateVisual(
                draft,
                this.#selectedSymbol,
                state,
                defaultVisualForKind(
                  draft,
                  this.#selectedSymbol,
                  state,
                  select.value,
                ),
              ),
            );
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLSelectElement>("[data-visual-field]")
      .forEach((select) => {
        select.addEventListener("change", () =>
          this.updateVisualField(
            select.dataset.state!,
            select.dataset.visualField!,
            select.value,
          ),
        );
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-visual-number]")
      .forEach((input) => {
        input.addEventListener("change", () =>
          this.updateVisualField(
            input.dataset.state!,
            input.dataset.visualNumber!,
            Number(input.value),
          ),
        );
      });
    panel
      .querySelectorAll<HTMLSelectElement>("[data-layer-field]")
      .forEach((select) => {
        select.addEventListener("change", () => {
          const state = select.dataset.state!;
          const layerIndex = Number(select.dataset.layerIndex);
          const keyframeIndex = select.dataset.keyframeIndex;
          this.#store.transact((draft) => {
            const visual = draft.symbols
              .get(this.#selectedSymbol)!
              .states.get(state);
            if (!visual || visual.kind !== "layered-image") return;
            const layers = visual.layers.map((layer) => ({
              index: layer.index,
              texturePath: layer.texturePath,
              keyframePaths: [...layer.keyframePaths],
            }));
            const layer = layers[layerIndex]!;
            if (keyframeIndex === undefined) layer.texturePath = select.value;
            else layer.keyframePaths[Number(keyframeIndex)] = select.value;
            setStateVisual(draft, this.#selectedSymbol, state, {
              kind: "layered-image",
              layers,
            });
          });
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-layer-action]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const state = button.dataset.state!;
          const action = button.dataset.layerAction!;
          this.#store.transact((draft) => {
            const visual = draft.symbols
              .get(this.#selectedSymbol)!
              .states.get(state);
            if (!visual || visual.kind !== "layered-image") return;
            const layers = visual.layers.map((layer) => ({
              index: layer.index,
              texturePath: layer.texturePath,
              keyframePaths: [...layer.keyframePaths],
            }));
            const images = assetsOfKind(draft, "image");
            const layerIndex = Number(button.dataset.layerIndex);
            if (action === "add-layer") {
              if (!images[0]) throw new Error("资源库中没有可选图片。");
              layers.push({
                index: layers.length,
                texturePath: images[0],
                keyframePaths: [],
              });
            } else if (action === "remove-layer") {
              if (layers.length <= 1)
                throw new Error("layered normal 至少保留一个 layer。");
              layers.splice(layerIndex, 1);
              layers.forEach((layer, index) => {
                layer.index = index;
              });
            } else if (action === "add-keyframe") {
              if (!images[0]) throw new Error("资源库中没有可选图片。");
              layers[layerIndex]!.keyframePaths.push(images[0]);
            } else if (action === "remove-keyframe") {
              layers[layerIndex]!.keyframePaths.splice(
                Number(button.dataset.keyframeIndex),
                1,
              );
            }
            setStateVisual(draft, this.#selectedSymbol, state, {
              kind: "layered-image",
              layers,
            });
          });
        });
      });
    panel
      .querySelector<HTMLInputElement>("[data-asset-filter]")
      ?.addEventListener("input", (event) => {
        this.#assetFilter = (event.currentTarget as HTMLInputElement).value;
        this.render(this.#store.getSnapshot());
      });
    panel
      .querySelectorAll<HTMLElement>("[data-replace-asset]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#replacePath = button.dataset.replaceAsset!;
          this.requireInput("[data-replace-input]").click();
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-delete-asset]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) =>
              deleteAsset(draft, button.dataset.deleteAsset!),
            );
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-asset-reference]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const [symbol, state] = button.dataset.assetReference!.split(".");
          if (symbol) this.#selectedSymbol = symbol;
          if (
            state &&
            project.stateDefinitions.some((item) => item.id === state)
          ) {
            this.#selectedState = state;
          }
          this.render(this.#store.getSnapshot());
        });
      });
    panel
      .querySelector<HTMLElement>("[data-add-custom]")
      ?.addEventListener("click", () => {
        const id =
          panel.querySelector<HTMLInputElement>("[data-custom-id]")!.value;
        const lifecycle = panel.querySelector<HTMLSelectElement>(
          "[data-custom-lifecycle]",
        )!.value;
        try {
          this.#store.transact((draft) =>
            addCustomStateDefinition(
              draft,
              lifecycle === "once"
                ? { id, phase: "once", playback: "once" }
                : { id, phase: "stable", playback: "loop" },
            ),
          );
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<HTMLElement>("[data-remove-custom]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) =>
              removeCustomStateDefinition(draft, button.dataset.removeCustom!),
            );
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    this.bindCascadeControls(panel);
    this.bindValueControls(panel);
  }

  private bindCascadeControls(panel: HTMLElement): void {
    panel
      .querySelector<HTMLSelectElement>("[data-cascade-mode]")
      ?.addEventListener("change", (event) => {
        const mode = (event.currentTarget as HTMLSelectElement).value;
        this.#store.transact((draft) => {
          const symbol = draft.symbols.get(this.#selectedSymbol)!;
          if (!mode) {
            setCascadeWinPresentation(draft, this.#selectedSymbol, undefined);
            return;
          }
          const once = compatibleStates(draft, symbol, "once");
          const loop = compatibleStates(draft, symbol, "loop");
          if (mode === "group") {
            setCascadeWinPresentation(draft, symbol.symbol, {
              order: 0,
              playback: {
                mode: "group",
                winState: once[0] ?? "win",
                removeState: once[1] ?? "remove",
              },
              summary: { mode: "groupAmount" },
            });
          } else {
            setCascadeWinPresentation(draft, symbol.symbol, {
              order: 0,
              playback: {
                mode: "sequentialCollect",
                startState: once[0] ?? "winStart",
                loopState: loop[0] ?? "winLoop",
                collectState: once[1] ?? "collect",
                removeState: once[2] ?? "remove",
              },
              summary: { mode: "itemAmount" },
            });
          }
        });
      });
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-cascade-field]")
      .forEach((input) => {
        input.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const symbol = draft.symbols.get(this.#selectedSymbol)!;
            const current = symbol.cascadeWinPresentation;
            if (!current) return;
            const field = input.dataset.cascadeField!;
            if (field === "order") {
              setCascadeWinPresentation(draft, symbol.symbol, {
                ...current,
                order: Number(input.value),
              });
            } else {
              setCascadeWinPresentation(draft, symbol.symbol, {
                ...current,
                playback: {
                  ...current.playback,
                  [field]: input.value,
                } as typeof current.playback,
              });
            }
          }),
        );
      });
  }

  private bindValueControls(panel: HTMLElement): void {
    panel
      .querySelector<HTMLInputElement>("[data-value-enabled]")
      ?.addEventListener("change", (event) => {
        const enabled = (event.currentTarget as HTMLInputElement).checked;
        try {
          this.#store.transact((draft) => {
            if (!enabled)
              setValuePresentation(draft, this.#selectedSymbol, undefined);
            else
              setValuePresentation(
                draft,
                this.#selectedSymbol,
                createDefaultValuePresentation(draft),
              );
          });
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-value-field]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(this.#selectedSymbol)!;
              if (!symbol.valuePresentation) return;
              const value = structuredClone(
                symbol.valuePresentation,
              ) as unknown as Record<string, unknown>;
              const field = input.dataset.valueField!;
              let nextValue: unknown =
                input.dataset.valueType === "number"
                  ? Number(input.value)
                  : input.value;
              if (input.dataset.valueResource === "true")
                nextValue = `./${input.value}`;
              setObjectPath(value, field, nextValue);
              setValuePresentation(draft, symbol.symbol, value as never);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-value-action]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(this.#selectedSymbol)!;
              if (!symbol.valuePresentation) return;
              const value = structuredClone(
                symbol.valuePresentation,
              ) as unknown as {
                defaultValues: number[];
                tiers: Array<Record<string, unknown>>;
                text: Record<string, unknown>;
              };
              const action = button.dataset.valueAction!;
              const index = Number(button.dataset.valueIndex);
              if (action === "add-default") {
                const candidate = Number(
                  panel.querySelector<HTMLInputElement>("[data-new-default]")!
                    .value,
                );
                if (
                  !Number.isSafeInteger(candidate) ||
                  candidate <= 0 ||
                  value.defaultValues.includes(candidate)
                ) {
                  throw new Error(
                    "default value 必须是未重复的 positive safe integer。",
                  );
                }
                value.defaultValues.push(candidate);
              } else if (action === "remove-default") {
                if (value.defaultValues.length <= 1)
                  throw new Error("defaultValues 不能为空。");
                value.defaultValues.splice(index, 1);
              } else if (action === "move-default") {
                moveArrayItem(
                  value.defaultValues,
                  index,
                  Number(button.dataset.direction),
                );
              } else if (action === "add-tier") {
                const previous = value.tiers.at(-1)!;
                const priorMax =
                  value.tiers.length > 1
                    ? Number(value.tiers.at(-2)?.maxExclusive ?? 0)
                    : 0;
                previous.maxExclusive = Math.max(
                  priorMax + 1,
                  priorMax === 0 ? 10 : priorMax * 10,
                );
                const clone = structuredClone(previous);
                delete clone.maxExclusive;
                value.tiers.push(clone);
              } else if (action === "remove-tier") {
                if (value.tiers.length <= 1)
                  throw new Error("valuePresentation 至少保留一个 tier。");
                value.tiers.splice(index, 1);
                delete value.tiers.at(-1)!.maxExclusive;
              } else if (action === "move-tier") {
                const boundaries = value.tiers
                  .slice(0, -1)
                  .map((tier) => Number(tier.maxExclusive));
                moveArrayItem(
                  value.tiers,
                  index,
                  Number(button.dataset.direction),
                );
                value.tiers.forEach((tier, tierIndex) => {
                  if (tierIndex === value.tiers.length - 1)
                    delete tier.maxExclusive;
                  else tier.maxExclusive = boundaries[tierIndex];
                });
              } else if (action === "text-type") {
                const type = button.dataset.textType!;
                const slots = valueSlotOptions(draft, symbol);
                value.text =
                  type === "image"
                    ? {
                        type: "image",
                        slot: slots[0] ?? "",
                        x: 0,
                        y: 0,
                        prefix: "./",
                      }
                    : {
                        type: "font",
                        slot: slots[0] ?? "",
                        x: 0,
                        y: 0,
                        fontFamily: "Arial",
                        fontSize: 24,
                        fontWeight: "700",
                        fill: "#ffffff",
                        stroke: "#000000",
                        strokeWidth: 1,
                      };
              }
              setValuePresentation(draft, symbol.symbol, value as never);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
  }

  private updateVisualField(
    state: string,
    field: string,
    value: unknown,
  ): void {
    try {
      this.#store.transact((draft) => {
        const visual = draft.symbols
          .get(this.#selectedSymbol)!
          .states.get(state)!;
        const next = structuredClone(visual) as unknown as Record<
          string,
          unknown
        >;
        if (field.startsWith("transform.")) {
          const key = field.slice("transform.".length);
          const transform =
            next.transform && typeof next.transform === "object"
              ? (next.transform as Record<string, unknown>)
              : {};
          transform[key] = value;
          next.transform = transform;
        } else {
          next[field] = value;
        }
        if (field === "skeletonPath" && next.kind === "spine") {
          const record = draft.assetLibrary.records.get(String(value));
          const names =
            (record?.metadata?.animationNames as
              | readonly string[]
              | undefined) ?? [];
          next.animationName = names[0] ?? "";
        }
        setStateVisual(
          draft,
          this.#selectedSymbol,
          state,
          next as unknown as EditorStateVisual,
        );
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async createProject(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      this.#store.replace(
        createFromGameConfig({
          rawGameConfig: JSON.parse(await file.text()),
          fileName: file.name,
        }),
      );
      this.#selectedSymbol = "";
      this.#selectedState = "normal";
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async importPackage(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const imported = await importSymbolPackageZip(
        new Uint8Array(await file.arrayBuffer()),
        {
          loadTextures: false,
        },
      );
      try {
        this.#store.replace(imported.project);
        this.#selectedSymbol = "";
        this.#selectedState = "normal";
      } finally {
        imported.destroy();
      }
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadResources(input: HTMLInputElement): Promise<void> {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length === 0) return;
    try {
      const values = await Promise.all(
        files.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      this.#store.transact((draft) => uploadAssetBatch(draft, values));
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async replaceResource(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    const path = this.#replacePath;
    this.#replacePath = null;
    if (!file || !path) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.#store.transact((draft) => replaceAsset(draft, path, bytes));
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
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exported.fileName;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async refreshPreview(
    snapshot: SymbolEditorStoreSnapshot,
  ): Promise<void> {
    const request = ++this.#previewRequest;
    const project = snapshot.project;
    if (!project || !this.#preview) return;
    const cells = createPreviewCells(
      project,
      this.#selectedState,
      this.#previewValue,
    );
    const previewSnapshot = createPreviewSnapshot(project);
    if (!previewSnapshot) {
      await this.#preview.setResource(null, cells, this.#selectedState);
      return;
    }
    try {
      const resource = await createSymbolPackageResource({
        packageManifest: previewSnapshot.packageManifest,
        files: createSnapshotFiles(previewSnapshot),
      });
      if (request !== this.#previewRequest) {
        resource.destroy();
        return;
      }
      await this.#preview.setResource(resource, cells, this.#selectedState);
      this.updateZoom(this.#preview.getZoom());
    } catch (error) {
      if (request === this.#previewRequest) {
        await this.#preview.setResource(null, cells, this.#selectedState);
      }
      void error;
    }
  }

  private updateZoom(value: number): void {
    const slider = this.requireElement("[data-zoom]") as HTMLInputElement;
    slider.value = String(value);
    this.requireElement("[data-zoom-label]").textContent =
      `${Math.round(value * 100)}%`;
  }

  private bindInput(
    root: HTMLElement,
    selector: string,
    callback: (input: HTMLInputElement) => void,
  ): void {
    root
      .querySelector<HTMLInputElement>(selector)
      ?.addEventListener("change", (event) => {
        try {
          callback(event.currentTarget as HTMLInputElement);
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
  }

  private requireElement(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`缺少 UI element：${selector}`);
    return element;
  }

  private requireInput(selector: string): HTMLInputElement {
    return this.requireElement(selector) as HTMLInputElement;
  }
}

function shellMarkup(): string {
  return `
    <main class="app-shell">
      <header class="toolbar">
        <strong>Symbols Editor</strong>
        <button data-new>新建（game config）</button>
        <button data-import>导入 ZIP</button>
        <button data-upload>上传文件组</button>
        <button data-upload-directory>上传目录</button>
        <button data-export disabled>导出 ZIP</button>
        <input hidden type="file" accept="application/json,.json" data-new-input>
        <input hidden type="file" accept=".zip,application/zip" data-import-input>
        <input hidden type="file" multiple data-upload-input>
        <input hidden type="file" multiple webkitdirectory data-directory-input>
        <input hidden type="file" data-replace-input>
      </header>
      <div class="errors" data-errors></div>
      <section class="workspace">
        <aside class="panel" data-project-panel></aside>
        <section class="preview-panel">
          <div class="preview-toolbar">
            <label>预览 state <select data-preview-state><option>normal</option></select></label>
            <button data-replay>Replay</button>
            <label>Value <input data-preview-value type="number" min="1" step="1" value="1"></label>
            <button data-fit>适配全部</button>
            <button data-zoom-out>−</button>
            <input data-zoom type="range" min="0.25" max="4" step="0.05" value="1">
            <button data-zoom-in>＋</button>
            <span data-zoom-label>100%</span>
          </div>
          <div class="preview" data-preview></div>
        </section>
      </section>
    </main>`;
}

function projectMarkup(
  project: SymbolEditorProject,
  symbols: readonly EditorSymbolDraft[],
  selectedSymbol: string,
  filter: string,
): string {
  const selected = project.symbols.get(selectedSymbol) ?? symbols[0];
  return `
    <section><h2>项目设置</h2>
      <label>ID <input data-project-id value="${escapeAttr(project.id)}"></label>
      <label>Cell W <input data-cell-width type="number" min="1" value="${project.cellSize.width}"></label>
      <label>Cell H <input data-cell-height type="number" min="1" value="${project.cellSize.height}"></label>
    </section>
    ${assetLibraryMarkup(project, filter)}
    <section><h2>Display symbols</h2>
      <div class="button-row"><button data-select-mode="all">全选</button><button data-select-mode="none">全不选</button><button data-select-mode="invert">反选</button></div>
      <div class="symbol-list">${symbols.map((symbol) => symbolRow(project, symbol, selectedSymbol)).join("")}</div>
    </section>
    ${selected ? symbolEditorMarkup(project, selected) : ""}
    ${stateDefinitionsMarkup(project)}
    ${selected ? valuePresentationMarkup(project, selected) : ""}
    ${selected ? cascadeMarkup(project, selected) : ""}`;
}

function assetLibraryMarkup(
  project: SymbolEditorProject,
  filter: string,
): string {
  const normalized = filter.toLowerCase();
  const records = [...project.assetLibrary.records.values()].filter((record) =>
    `${record.path} ${record.kind} ${record.diagnostics.join(" ")}`
      .toLowerCase()
      .includes(normalized),
  );
  const references = getAssetReferences(project);
  return `<section><h2>资源库</h2>
    <input data-asset-filter type="search" placeholder="path / type / status" value="${escapeAttr(filter)}">
    ${
      project.assetLibrary.batches
        .map((batch) => {
          const batchRecords = records.filter(
            (record) => record.uploadBatchId === batch.id,
          );
          if (batchRecords.length === 0) return "";
          return `<details open><summary>${escapeHtml(batch.label)} · ${batchRecords.length}</summary>${batchRecords
            .map((record) =>
              assetRow(
                record,
                references.filter((ref) => ref.path === record.path),
              ),
            )
            .join("")}</details>`;
        })
        .join("") ||
      '<p class="empty">资源库为空；empty normal 项目仍可导出。</p>'
    }
  </section>`;
}

function assetRow(
  record: EditorAssetRecord,
  references: readonly { readonly location: string }[],
): string {
  const status =
    record.diagnostics.length > 0
      ? "错误"
      : references.length > 0
        ? "有效"
        : "未使用";
  const summary = metadataSummary(record);
  return `<article class="asset-row asset-${status === "错误" ? "error" : status === "未使用" ? "unused" : "valid"}">
    <code>${escapeHtml(record.path)}</code>
    <small>${record.kind} · ${formatBytes(record.size)} · ${status}</small>
    ${summary ? `<small>${escapeHtml(summary)}</small>` : ""}
    ${record.diagnostics.map((item) => `<div class="inline-error">${escapeHtml(item)}</div>`).join("")}
    <div class="refs">${references.map((ref) => `<button data-asset-reference="${escapeAttr(ref.location)}">${escapeHtml(ref.location)}</button>`).join("") || "0 references"}</div>
    <div class="button-row"><button data-replace-asset="${escapeAttr(record.path)}">替换</button><button data-delete-asset="${escapeAttr(record.path)}">删除</button></div>
  </article>`;
}

function symbolRow(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  selected: string,
): string {
  const status = getSymbolResourceStatus(project, symbol.symbol);
  return `<div class="symbol-row ${symbol.symbol === selected ? "selected" : ""}">
    <label><input type="checkbox" data-symbol-included="${escapeAttr(symbol.symbol)}" ${symbol.included ? "checked" : ""}> ${symbol.code} · ${escapeHtml(symbol.symbol)}</label>
    <small>${symbol.states.size} states · ${symbol.states.get("normal")?.kind ?? "?"} · ${status.ready ? "ready" : "error"}</small>
    <button data-edit-symbol="${escapeAttr(symbol.symbol)}">编辑</button>
  </div>`;
}

function symbolEditorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const available = project.stateDefinitions.filter(
    (definition) => !symbol.states.has(definition.id),
  );
  return `<section><h2>当前 symbol · ${escapeHtml(symbol.symbol)}</h2>
    <label>scale <input data-symbol-scale type="number" min="0.01" step="0.01" value="${symbol.scale}"></label>
    <label>renderPriority <input data-symbol-priority type="number" min="0" step="1" value="${symbol.renderPriority}"></label>
    <label>添加状态 <select data-add-state><option value="">选择…</option>${available.map((item) => option(item.id, `${item.id} · ${item.phase}/${item.playback}`)).join("")}</select></label>
    <div class="state-list">${symbol.stateOrder.map((state) => stateCard(project, symbol, state)).join("")}</div>
  </section>`;
}

function stateCard(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  state: string,
): string {
  const visual = symbol.states.get(state)!;
  const definition = project.stateDefinitions.find(
    (item) => item.id === state,
  )!;
  const kinds = compatibleVisualKinds(symbol, state, definition);
  return `<article class="state-card"><header><strong>${escapeHtml(state)}</strong><small>${definition.phase}/${definition.playback}</small>
    <span class="spacer"></span>${state === "normal" ? "" : `<button data-state-action="up" data-state="${escapeAttr(state)}">↑</button><button data-state-action="down" data-state="${escapeAttr(state)}">↓</button><button data-state-action="remove" data-state="${escapeAttr(state)}">删除</button>`}</header>
    <label>资源类型 <select data-visual-kind data-state="${escapeAttr(state)}">${kinds.map((kind) => option(kind, visualKindLabel(kind), visual.kind === kind)).join("")}</select></label>
    ${visualFieldsMarkup(project, symbol, state, visual)}
  </article>`;
}

function visualFieldsMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  state: string,
  visual: EditorStateVisual,
): string {
  const data = `data-state="${escapeAttr(state)}"`;
  const images = assetsOfKind(project, "image");
  if (visual.kind === "image")
    return assetSelect("imagePath", visual.imagePath, images, data);
  if (visual.kind === "spine") {
    const skeletons = assetsOfKind(project, "spine-skeleton");
    const atlases = assetsOfKind(project, "spine-atlas");
    const animations = assetMetadataList(
      project,
      visual.skeletonPath,
      "animationNames",
    );
    const page = assetMetadataList(project, visual.atlasPath, "pageNames")[0];
    const textures = page
      ? images.filter((path) => fileName(path) === page)
      : images;
    return [
      assetSelect(
        "skeletonPath",
        visual.skeletonPath,
        skeletons,
        data,
        "Skeleton",
      ),
      assetSelect("atlasPath", visual.atlasPath, atlases, data, "Atlas"),
      assetSelect("texturePath", visual.texturePath, textures, data, "Texture"),
      selectMarkup(
        "animationName",
        visual.animationName,
        animations,
        data,
        "Animation",
      ),
      numberMarkup("transform.x", visual.transform?.x ?? 0, data, "X"),
      numberMarkup("transform.y", visual.transform?.y ?? 0, data, "Y"),
      numberMarkup(
        "transform.scale",
        visual.transform?.scale ?? 1,
        data,
        "Scale",
      ),
    ].join("");
  }
  if (visual.kind === "vni") {
    return `${assetSelect("projectPath", visual.projectPath, assetsOfKind(project, "vni-project"), data, "VNI project")}${numberMarkup("startTime", visual.startTime, data, "Start")}${numberMarkup("endTime", visual.endTime, data, "End")}`;
  }
  if (visual.kind === "activeSpine") {
    return selectMarkup(
      "animationName",
      visual.animationName,
      activeSpineAnimationOptions(project, symbol),
      data,
      "Tier animation intersection",
    );
  }
  if ("durationSeconds" in visual)
    return numberMarkup(
      "durationSeconds",
      visual.durationSeconds,
      data,
      "Duration seconds",
    );
  if (visual.kind === "empty")
    return `<small>显式 transparent ${visual.width} × ${visual.height}</small>`;
  if (visual.kind === "layered-image") {
    return `${visual.layers
      .map(
        (
          layer,
          layerIndex,
        ) => `<div class="tier-card"><strong>Layer ${layer.index}</strong>
          <label>Texture <select data-layer-field data-state="${escapeAttr(state)}" data-layer-index="${layerIndex}">${images.map((path) => option(path, path, path === layer.texturePath)).join("")}</select></label>
          ${layer.keyframePaths.map((path, keyframeIndex) => `<div class="form-row"><select data-layer-field data-state="${escapeAttr(state)}" data-layer-index="${layerIndex}" data-keyframe-index="${keyframeIndex}">${images.map((candidate) => option(candidate, candidate, candidate === path)).join("")}</select><button data-layer-action="remove-keyframe" data-state="${escapeAttr(state)}" data-layer-index="${layerIndex}" data-keyframe-index="${keyframeIndex}">删除 keyframe</button></div>`).join("")}
          <div class="button-row"><button data-layer-action="add-keyframe" data-state="${escapeAttr(state)}" data-layer-index="${layerIndex}">增加 keyframe</button><button data-layer-action="remove-layer" data-state="${escapeAttr(state)}" data-layer-index="${layerIndex}">删除 layer</button></div>
        </div>`,
      )
      .join(
        "",
      )}<button data-layer-action="add-layer" data-state="${escapeAttr(state)}">增加 layer</button>`;
  }
  return "";
}

function stateDefinitionsMarkup(project: SymbolEditorProject): string {
  return `<section><h2>项目状态定义</h2>
    ${project.stateDefinitions.map((item) => `<div class="definition-row"><code>${escapeHtml(item.id)}</code><small>${item.phase}/${item.playback}</small>${item.source === "custom" ? `<button data-remove-custom="${escapeAttr(item.id)}">删除</button>` : ""}</div>`).join("")}
    <div class="form-row"><input data-custom-id placeholder="custom state id"><select data-custom-lifecycle><option value="once">once / once</option><option value="loop">stable / loop</option></select><button data-add-custom>增加</button></div>
  </section>`;
}

function valuePresentationMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const value = symbol.valuePresentation;
  if (!value)
    return `<section><h2>Value presentation</h2><label><input type="checkbox" data-value-enabled> 启用 valuePresentation</label><p class="hint">启用后 normal 变为 transparent reel normal，active art 由 tier Spine 提供；删除时回到 explicit empty normal。</p></section>`;
  const imagePaths = assetsOfKind(project, "image");
  const skeletons = assetsOfKind(project, "spine-skeleton");
  const atlases = assetsOfKind(project, "spine-atlas");
  const slots = valueSlotOptions(project, symbol);
  const prefixes = [
    "./",
    ...new Set(
      imagePaths.map(
        (path) =>
          `./${path.includes("/") ? `${path.slice(0, path.lastIndexOf("/") + 1)}` : ""}`,
      ),
    ),
  ];
  return `<section><h2>Value presentation</h2><label><input type="checkbox" data-value-enabled checked> 启用 valuePresentation</label>
    <h3>Default values</h3>
    ${value.defaultValues.map((candidate, index) => `<div class="form-row"><input data-value-field="defaultValues.${index}" data-value-type="number" type="number" min="1" step="1" value="${candidate}"><button data-value-action="move-default" data-value-index="${index}" data-direction="-1">↑</button><button data-value-action="move-default" data-value-index="${index}" data-direction="1">↓</button><button data-value-action="remove-default" data-value-index="${index}">删除</button></div>`).join("")}
    <div class="form-row"><input data-new-default type="number" min="1" step="1" value="1"><button data-value-action="add-default">增加 value</button></div>
    <h3>Reel normal</h3>
    ${valueNumberField("reelStates.normal.width", value.reelStates.normal.width, "Width")}${valueNumberField("reelStates.normal.height", value.reelStates.normal.height, "Height")}
    <h3>Spine tiers</h3>
    ${value.tiers
      .map((tier, index) => {
        const skeletonPath = tier.animation.skeleton.replace(/^\.\//u, "");
        const atlasPath = tier.animation.atlas.replace(/^\.\//u, "");
        const texturePath = tier.animation.texture.replace(/^\.\//u, "");
        const animations = assetMetadataList(
          project,
          skeletonPath,
          "animationNames",
        );
        const page = assetMetadataList(project, atlasPath, "pageNames")[0];
        const textures = page
          ? imagePaths.filter((path) => fileName(path) === page)
          : imagePaths;
        return `<div class="tier-card"><strong>Tier ${index + 1}</strong>
        ${index < value.tiers.length - 1 ? valueNumberField(`tiers.${index}.maxExclusive`, tier.maxExclusive!, "maxExclusive") : "<small>unbounded final tier</small>"}
        ${valueResourceField(`tiers.${index}.animation.skeleton`, skeletonPath, skeletons, "Skeleton")}
        ${valueResourceField(`tiers.${index}.animation.atlas`, atlasPath, atlases, "Atlas")}
        ${valueResourceField(`tiers.${index}.animation.texture`, texturePath, textures, "Texture")}
        ${valueSelectField(`tiers.${index}.animation.playback.animationName`, tier.animation.playback.animationName, animations, "Loop animation")}
        ${valueNumberField(`tiers.${index}.animation.transform.x`, tier.animation.transform?.x ?? 0, "X")}
        ${valueNumberField(`tiers.${index}.animation.transform.y`, tier.animation.transform?.y ?? 0, "Y")}
        ${valueNumberField(`tiers.${index}.animation.transform.scale`, tier.animation.transform?.scale ?? 1, "Scale")}
        <div class="button-row"><button data-value-action="move-tier" data-value-index="${index}" data-direction="-1">↑</button><button data-value-action="move-tier" data-value-index="${index}" data-direction="1">↓</button><button data-value-action="remove-tier" data-value-index="${index}">删除 tier</button></div>
      </div>`;
      })
      .join("")}
    <button data-value-action="add-tier">增加 tier</button>
    <h3>Value text</h3>
    <div class="button-row"><button data-value-action="text-type" data-text-type="font">Font</button><button data-value-action="text-type" data-text-type="image">Image</button></div>
    ${valueSelectField("text.slot", value.text.slot, slots, "Slot intersection")}
    ${valueNumberField("text.x", value.text.x, "X")}${valueNumberField("text.y", value.text.y, "Y")}
    ${
      value.text.type === "image"
        ? `${valueSelectField("text.prefix", value.text.prefix, prefixes, "Image prefix")}${value.defaultValues
            .map((candidate) => {
              const prefix = (value.text as { readonly prefix: string }).prefix;
              return `<small>${escapeHtml(`${prefix}${candidate}.png`)} ${project.assetLibrary.records.has(prefix.replace(/^\.\//u, "") + candidate + ".png") ? "✓" : "缺失"}</small>`;
            })
            .join("<br>")}`
        : `${valueTextField("text.fontFamily", value.text.fontFamily, "Font family")}${valueNumberField("text.fontSize", value.text.fontSize, "Font size")}${valueTextField("text.fontWeight", value.text.fontWeight, "Font weight")}${valueTextField("text.fill", value.text.fill, "Fill")}${valueTextField("text.stroke", value.text.stroke, "Stroke")}${valueNumberField("text.strokeWidth", value.text.strokeWidth, "Stroke width")}`
    }
    <p class="hint">所有 tier 资源、animation 和 slot 都来自资源库与 tier 交集；loop 固定由 runtime 合同派生。</p>
  </section>`;
}

function cascadeMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const cascade = symbol.cascadeWinPresentation;
  const mode = cascade?.playback.mode ?? "";
  let fields = "";
  if (cascade) {
    fields += numberMarkup(
      "order",
      cascade.order,
      "data-cascade-field",
      "Order",
    );
    const playback = cascade.playback;
    for (const [field, value] of Object.entries(playback)) {
      if (field === "mode") continue;
      const expected = field === "loopState" ? "loop" : "once";
      fields += `<label>${escapeHtml(field)} <select data-cascade-field="${escapeAttr(field)}">${compatibleStates(
        project,
        symbol,
        expected,
      )
        .map((state) => option(state, state, state === value))
        .join("")}</select></label>`;
    }
    fields += `<small>summary.mode: ${cascade.summary.mode}（由 playback mode 派生）</small>`;
  }
  return `<section><h2>Cascade presentation</h2><label>Mode <select data-cascade-mode><option value="" ${!mode ? "selected" : ""}>关闭</option>${option("group", "group", mode === "group")}${option("sequentialCollect", "sequentialCollect", mode === "sequentialCollect")}</select></label>${fields}</section>`;
}

function createPreviewCells(
  project: SymbolEditorProject,
  state: string,
  previewValue: number,
): readonly SymbolPreviewCell[] {
  return getIncludedSymbols(project).map((symbol) => {
    const visual = symbol.states.get(state);
    if (!visual)
      return { symbol: symbol.symbol, code: symbol.code, status: "missing" };
    if (visual.kind === "empty" || visual.kind === "empty-state") {
      return { symbol: symbol.symbol, code: symbol.code, status: "empty" };
    }
    const status = getSymbolResourceStatus(project, symbol.symbol);
    if (!status.ready) {
      return {
        symbol: symbol.symbol,
        code: symbol.code,
        status: "error",
        message: status.error ?? status.missing.join(", "),
      };
    }
    return {
      symbol: symbol.symbol,
      code: symbol.code,
      status: "configured",
      ...(symbol.valuePresentation ? { value: previewValue } : {}),
    };
  });
}

function compatibleVisualKinds(
  symbol: EditorSymbolDraft,
  state: string,
  definition: EditorStateDefinition,
): readonly string[] {
  if (state === "normal")
    return ["empty", "image", "layered-image", "spine", "vni"];
  const kinds = ["empty-state", "image", "spine", "static"];
  if (definition.playback === "once") kinds.push("vni");
  if (state === "appear" || state === "win") kinds.push("builtin");
  if (symbol.valuePresentation) kinds.push("activeSpine");
  return kinds;
}

function defaultVisualForKind(
  project: SymbolEditorProject,
  symbolName: string,
  state: string,
  kind: string,
): EditorStateVisual {
  const images = assetsOfKind(project, "image");
  if (kind === "empty")
    return {
      kind,
      width: project.cellSize.width,
      height: project.cellSize.height,
    };
  if (kind === "empty-state") return { kind, durationSeconds: 1 / 60 };
  if (kind === "image")
    return { kind, imagePath: images[0] ?? "select-an-image" };
  if (kind === "layered-image") {
    return {
      kind,
      layers: images[0]
        ? [{ index: 0, texturePath: images[0], keyframePaths: [] }]
        : [],
    };
  }
  if (kind === "spine") {
    const skeletonPath =
      assetsOfKind(project, "spine-skeleton")[0] ?? "select-a-skeleton.json";
    return {
      kind,
      ...(state === "normal"
        ? {
            baseVisual: {
              kind: "empty",
              width: project.cellSize.width,
              height: project.cellSize.height,
            } as EditorBaseVisual,
          }
        : {}),
      skeletonPath,
      atlasPath:
        assetsOfKind(project, "spine-atlas")[0] ?? "select-an-atlas.atlas",
      texturePath: images[0] ?? "select-a-texture.png",
      animationName:
        assetMetadataList(project, skeletonPath, "animationNames")[0] ?? "",
    };
  }
  if (kind === "vni") {
    const projectPath =
      assetsOfKind(project, "vni-project")[0] ?? "select-a-project.json";
    const endTime = Number(
      project.assetLibrary.records.get(projectPath)?.metadata
        ?.durationSeconds ?? 1,
    );
    return {
      kind,
      ...(state === "normal"
        ? {
            baseVisual: {
              kind: "empty",
              width: project.cellSize.width,
              height: project.cellSize.height,
            } as EditorBaseVisual,
          }
        : {}),
      projectPath,
      startTime: 0,
      endTime,
    };
  }
  if (kind === "activeSpine")
    return {
      kind,
      animationName:
        activeSpineAnimationOptions(
          project,
          project.symbols.get(symbolName),
        )[0] ?? "",
    };
  if (kind === "builtin")
    return { kind, durationSeconds: state === "win" ? 0.58 : 0.42 };
  void symbolName;
  return { kind: "static", durationSeconds: 1 / 60 };
}

function compatibleStates(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  playback: string,
): readonly string[] {
  return symbol.stateOrder.filter((state) => {
    const definition = project.stateDefinitions.find(
      (item) => item.id === state,
    );
    const visual = symbol.states.get(state);
    return (
      definition?.playback === playback &&
      visual !== undefined &&
      (playback !== "loop" ||
        visual.kind === "spine" ||
        visual.kind === "activeSpine")
    );
  });
}

function createDefaultValuePresentation(project: SymbolEditorProject) {
  const skeleton = assetsOfKind(project, "spine-skeleton")[0];
  const atlas = assetsOfKind(project, "spine-atlas")[0];
  const texture = assetsOfKind(project, "image")[0];
  if (!skeleton || !atlas || !texture) {
    throw new Error(
      "启用 valuePresentation 前至少需要一组有效 Spine skeleton、atlas 和 texture。",
    );
  }
  const animations = assetMetadataList(project, skeleton, "animationNames");
  const slots = assetMetadataList(project, skeleton, "slotNames");
  return {
    defaultValues: [1],
    reelStates: {
      normal: {
        kind: "transparent" as const,
        width: project.cellSize.width,
        height: project.cellSize.height,
      },
      states: {},
    },
    tiers: [
      {
        animation: {
          kind: "spine" as const,
          skeleton: `./${skeleton}`,
          atlas: `./${atlas}`,
          texture: `./${texture}`,
          playback: {
            mode: "animation" as const,
            animationName: animations[0] ?? "",
            loop: true as const,
          },
        },
      },
    ],
    text: {
      type: "font" as const,
      slot: slots[0] ?? "",
      x: 0,
      y: 0,
      fontFamily: "Arial",
      fontSize: 24,
      fontWeight: "700",
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 1,
    },
  };
}

function activeSpineAnimationOptions(
  project: SymbolEditorProject,
  symbol?: EditorSymbolDraft,
): readonly string[] {
  const tiers = symbol?.valuePresentation?.tiers ?? [];
  const sets = tiers.map(
    (tier) =>
      new Set(
        assetMetadataList(
          project,
          tier.animation.skeleton.replace(/^\.\//u, ""),
          "animationNames",
        ),
      ),
  );
  if (sets.length === 0) return [];
  return [...sets[0]!].filter((name) => sets.every((set) => set.has(name)));
}

function valueSlotOptions(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): readonly string[] {
  const tiers = symbol.valuePresentation?.tiers ?? [];
  const sets = tiers.map(
    (tier) =>
      new Set(
        assetMetadataList(
          project,
          tier.animation.skeleton.replace(/^\.\//u, ""),
          "slotNames",
        ),
      ),
  );
  if (sets.length === 0) return [];
  return [...sets[0]!].filter((name) => sets.every((set) => set.has(name)));
}

function assetsOfKind(
  project: SymbolEditorProject,
  kind: EditorAssetRecord["kind"],
): string[] {
  return [...project.assetLibrary.records.values()]
    .filter((record) => record.kind === kind && record.diagnostics.length === 0)
    .map((record) => record.path)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function assetMetadataList(
  project: SymbolEditorProject,
  path: string,
  key: string,
): readonly string[] {
  const value = project.assetLibrary.records.get(path)?.metadata?.[key];
  return Array.isArray(value) ? (value as string[]) : [];
}

function assetSelect(
  field: string,
  current: string,
  paths: readonly string[],
  data: string,
  label = "Resource",
): string {
  return selectMarkup(field, current, paths, data, label);
}

function selectMarkup(
  field: string,
  current: string,
  values: readonly string[],
  data: string,
  label: string,
): string {
  return `<label>${escapeHtml(label)} <select data-visual-field="${escapeAttr(field)}" ${data}><option value="">选择…</option>${values.map((value) => option(value, value, value === current)).join("")}</select></label>`;
}

function numberMarkup(
  field: string,
  value: number,
  data: string,
  label: string,
): string {
  const attribute =
    data === "data-cascade-field"
      ? `data-cascade-field="${escapeAttr(field)}"`
      : `data-visual-number="${escapeAttr(field)}" ${data}`;
  return `<label>${escapeHtml(label)} <input ${attribute} type="number" step="0.01" value="${value}"></label>`;
}

function valueNumberField(field: string, value: number, label: string): string {
  return `<label>${escapeHtml(label)} <input data-value-field="${escapeAttr(field)}" data-value-type="number" type="number" step="0.01" value="${value}"></label>`;
}

function valueTextField(field: string, value: string, label: string): string {
  return `<label>${escapeHtml(label)} <input data-value-field="${escapeAttr(field)}" value="${escapeAttr(value)}"></label>`;
}

function valueSelectField(
  field: string,
  current: string,
  values: readonly string[],
  label: string,
): string {
  return `<label>${escapeHtml(label)} <select data-value-field="${escapeAttr(field)}">${values.map((value) => option(value, value, value === current)).join("")}</select></label>`;
}

function valueResourceField(
  field: string,
  current: string,
  values: readonly string[],
  label: string,
): string {
  return `<label>${escapeHtml(label)} <select data-value-field="${escapeAttr(field)}" data-value-resource="true">${values.map((value) => option(value, value, value === current)).join("")}</select></label>`;
}

function setObjectPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".");
  let current: Record<string | number, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const key = /^\d+$/u.test(segment) ? Number(segment) : segment;
    let next = current[key];
    if (!next || typeof next !== "object") {
      next = {};
      current[key] = next;
    }
    current = next as Record<string | number, unknown>;
  }
  const last = segments.at(-1)!;
  current[/^\d+$/u.test(last) ? Number(last) : last] = value;
}

function moveArrayItem<T>(items: T[], index: number, direction: number): void {
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next]!, items[index]!];
}

function option(value: string, label: string, selected = false): string {
  return `<option value="${escapeAttr(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function visualKindLabel(kind: string): string {
  return (
    (
      {
        empty: "空（transparent normal）",
        "empty-state": "空（显式 state）",
        image: "图片",
        "layered-image": "分层图片",
        spine: "Spine 4.3",
        vni: "VNI",
        static: "Static",
        builtin: "Builtin",
        activeSpine: "Active Spine",
      } as Record<string, string>
    )[kind] ?? kind
  );
}

function metadataSummary(record: EditorAssetRecord): string {
  if (record.kind === "spine-skeleton") {
    return `Spine ${record.metadata?.version ?? "?"}; animations ${(record.metadata?.animationNames as string[] | undefined)?.join(", ") ?? ""}; slots ${(record.metadata?.slotNames as string[] | undefined)?.join(", ") ?? ""}`;
  }
  if (record.kind === "spine-atlas")
    return `pages ${(record.metadata?.pageNames as string[] | undefined)?.join(", ") ?? ""}`;
  if (record.kind === "vni-project")
    return `${record.metadata?.schemaVersion ?? "VNI"}; duration ${record.metadata?.durationSeconds ?? "?"}s; assets ${(record.metadata?.assetPaths as string[] | undefined)?.length ?? 0}`;
  return "";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(
    /[&<>"']/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

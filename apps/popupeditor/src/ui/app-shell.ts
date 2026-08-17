import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  createEditorAssetEntry,
  normalizeEditorPackageZipEntries,
  type EditorImportConflictResolution,
  type EditorImportResolution,
} from "@slotclientengine/editorresource";
import { detectAudioMediaType } from "@slotclientengine/audiocore/editor";
import {
  formatPopupAmount,
  resolvePopupLayerAttachment,
  validatePopupId,
} from "@slotclientengine/rendercore/popup/editor";
import type {
  AwardTierId,
  PopupLayer,
  PopupOverlayLayer,
  PopupVisibilityState,
} from "@slotclientengine/rendercore/popup/editor";
import type { PopupAudioCueV1 } from "@slotclientengine/rendercore/popup/data";
import {
  addAwardTextLayer,
  addLayer,
  applyImportedResourceBindings,
  assertPopupLayerCanDelete,
  clonePopupEditorProject,
  createPopupAmountFormat,
  createPopupEditorProject,
  detectPopupAmountFormatPreset,
  getPopupVniTextLayerTargets,
  getPopupSpineAttachmentTargets,
  removePopupResource,
  reuseAwardLayerInTier,
  PopupEditorStore,
  projectToManifest,
  popupEditorVisibilityStates,
  resourceReferenceCount,
  setPopupVniPlaybackMode,
  type PopupEditorProject,
} from "../model/project.js";
import {
  commitImportReview,
  discoverPopupResources,
  inspectVniBundleProfiles,
  POPUP_ZIP_LIMITS,
  reviewPopupImportTransaction,
  type PopupImportReviewCandidate,
  type PopupVniRuntimeProfile,
} from "../io/resource-import.js";
import { exportPopupZip, importPopupZip } from "../io/popup-zip.js";
import {
  DEFAULT_POPUP_PREVIEW_AMOUNT_FORMAT,
  PopupPreview,
  type PopupPreviewAmountFormat,
} from "../preview/popup-preview.js";

const TIERS: readonly AwardTierId[] = [
  "base",
  "standard",
  "bigwin",
  "superwin",
  "megawin",
];
export class PopupEditorApp {
  readonly #root: HTMLElement;
  readonly #store = new PopupEditorStore();
  #preview: PopupPreview | null = null;
  #tab: "resources" | "tiers" | "project" = "resources";
  #tier: AwardTierId = "base";
  #previewBetRaw = 100;
  #previewAmountFormat: PopupPreviewAmountFormat =
    DEFAULT_POPUP_PREVIEW_AMOUNT_FORMAT;
  #errors: readonly string[] = [];
  #notice = "";
  #hasProject = false;
  #previewGeneration = 0;
  #previewTimer: ReturnType<typeof setTimeout> | null = null;
  #skipNextWorkspaceRender = false;
  constructor(root: HTMLElement) {
    this.#root = root;
  }
  async init() {
    this.#root.innerHTML = shell();
    this.#preview = new PopupPreview(
      this.required("preview-canvas"),
      this.required("preview-status"),
    );
    await this.#preview.init();
    this.#preview.setAmountFormat(this.#previewAmountFormat);
    this.bindGlobal();
    this.#store.subscribe((project, errors) => {
      this.#errors = errors;
      if (this.#skipNextWorkspaceRender) {
        this.#skipNextWorkspaceRender = false;
        this.renderDiagnostics();
      } else this.renderWorkspace(project);
      this.schedulePreview(project, errors);
    });
    this.renderWorkspace(this.#store.project);
  }
  destroy() {
    if (this.#previewTimer) clearTimeout(this.#previewTimer);
    this.#previewGeneration += 1;
    this.#preview?.destroy();
  }
  private renderWorkspace(project: PopupEditorProject) {
    this.#root
      .querySelector("nav")
      ?.toggleAttribute("hidden", !this.#hasProject);
    this.#root
      .querySelector("aside")
      ?.toggleAttribute("hidden", !this.#hasProject);
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-tab]")
      .forEach((button) => {
        const active = button.dataset.tab === this.#tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    const host = this.required("workspace");
    if (!this.#hasProject) {
      host.innerHTML = `<section class="project-landing"><h2>开始 Popup 项目</h2><p>创建一个空项目，或导入 Popup Editor 导出的 ZIP。</p><div class="project-landing-actions"><button id="create-project" class="project-entry-action">创建项目</button><label class="file-action project-entry-action">导入项目<input id="import-project" type="file" accept=".zip,application/zip"/></label></div></section>`;
      this.required("diagnostics").textContent = this.#notice;
      this.bindWorkspace(project);
      return;
    }
    host.innerHTML =
      this.#tab === "resources"
        ? resourcesMarkup(project)
        : this.#tab === "tiers"
          ? project.type === "spine"
            ? spineMarkup(project)
            : tiersMarkup(project, this.#tier, this.#previewBetRaw)
          : projectMarkup(project, this.#errors);
    this.required("diagnostics").textContent =
      [this.#notice, ...this.#errors].filter(Boolean).join("\n") ||
      "严格 diagnostics：ready";
    this.bindWorkspace(project);
  }
  private renderDiagnostics() {
    this.required("diagnostics").textContent =
      [this.#notice, ...this.#errors].filter(Boolean).join("\n") ||
      "严格 diagnostics：ready";
  }
  private transactField(update: (draft: PopupEditorProject) => void) {
    this.#skipNextWorkspaceRender = true;
    try {
      this.#store.transact(update);
    } catch (error) {
      this.#skipNextWorkspaceRender = false;
      throw error;
    }
  }
  private bindGlobal() {
    this.required("workspace").addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (
        input.matches(
          "[data-overlay-field], [data-layer-field], [data-project-field], [data-spine-popup-field]",
        )
      )
        input.dispatchEvent(new Event("change"));
    });
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-tab]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#tab = button.dataset.tab as "resources" | "tiers" | "project";
          this.renderWorkspace(this.#store.project);
        }),
      );
    const createDialog = this.required<HTMLDialogElement>(
      "create-project-dialog",
    );
    this.required("create-project-confirm").addEventListener("click", () => {
      const name = this.required<HTMLInputElement>(
        "create-project-name",
      ).value.trim();
      const type = this.required<HTMLSelectElement>("create-project-type")
        .value as "award-celebration" | "spine";
      if (!name) {
        this.#notice = "项目名不能为空。";
        return;
      }
      const token = crypto.randomUUID().replaceAll("-", "");
      this.#hasProject = true;
      createDialog.close();
      this.#store.replace(
        createPopupEditorProject({ name, type, id: `popup-${token}` }),
      );
    });
    this.required("create-project-cancel").addEventListener("click", () =>
      createDialog.close(),
    );
    const bet = this.required<HTMLInputElement>("preview-bet");
    const win = this.required<HTMLInputElement>("preview-win");
    const sync = () => {
      this.#previewBetRaw = Number(bet.value);
      this.#preview?.setInput(this.#previewBetRaw, Number(win.value));
      const boundaries = this.#root.querySelector("#tier-boundaries");
      if (boundaries)
        boundaries.textContent = tierBoundarySummary(
          this.#store.project,
          this.#previewBetRaw,
        );
    };
    bet.addEventListener("change", sync);
    win.addEventListener("change", sync);
    sync();
    const fractionDigits = this.required<HTMLInputElement>(
      "preview-fraction-digits",
    );
    const useGrouping = this.required<HTMLInputElement>("preview-use-grouping");
    const syncAmountFormat = () =>
      this.safe(() => {
        const next = {
          fractionDigits:
            fractionDigits.value.trim() === ""
              ? Number.NaN
              : Number(fractionDigits.value),
          useGrouping: useGrouping.checked,
        };
        this.#preview!.setAmountFormat(next);
        this.#previewAmountFormat = Object.freeze(next);
      });
    fractionDigits.addEventListener("change", syncAmountFormat);
    useGrouping.addEventListener("change", syncAmountFormat);
    this.required("preview-play").addEventListener("click", () =>
      this.safe(() => this.#preview!.play()),
    );
    const viewport = this.required<HTMLSelectElement>("preview-resolution");
    const customWidth = this.required<HTMLInputElement>("preview-width");
    const customHeight = this.required<HTMLInputElement>("preview-height");
    const zoom = this.required<HTMLSelectElement>("preview-zoom");
    const guides = this.required<HTMLInputElement>("preview-guides");
    const layout = () => {
      const [width, height] =
        viewport.value === "custom"
          ? [Number(customWidth.value), Number(customHeight.value)]
          : viewport.value.split("x").map(Number);
      this.#preview?.setViewport(
        width!,
        height!,
        zoom.value === "fit" ? "fit" : Number(zoom.value),
        guides.checked,
      );
    };
    viewport.addEventListener("change", layout);
    customWidth.addEventListener("change", layout);
    customHeight.addEventListener("change", layout);
    zoom.addEventListener("change", layout);
    guides.addEventListener("change", layout);
    layout();
  }
  private bindWorkspace(project: PopupEditorProject) {
    this.#root
      .querySelector("#create-project")
      ?.addEventListener("click", () => {
        this.required<HTMLInputElement>("create-project-name").value = "";
        this.required<HTMLDialogElement>("create-project-dialog").showModal();
      });
    const projectFile =
      this.#root.querySelector<HTMLInputElement>("#import-project");
    projectFile?.addEventListener("change", () => {
      const file = projectFile.files?.[0];
      if (file) void this.importProject(file);
    });
    const files = this.#root.querySelector<HTMLInputElement>("#import-assets");
    files?.addEventListener(
      "change",
      () => void this.reviewFiles([...(files.files ?? [])]),
    );
    this.#root
      .querySelector<HTMLButtonElement>("#export-project")
      ?.addEventListener("click", () => void this.exportProject());
    this.#root
      .querySelector<HTMLButtonElement>("#close-project")
      ?.addEventListener("click", () => {
        this.#hasProject = false;
        this.#previewGeneration += 1;
        this.#preview?.reset();
        this.renderWorkspace(this.#store.project);
      });
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-tier]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#tier = button.dataset.tier as AwardTierId;
          this.renderWorkspace(project);
        }),
      );
    this.#root
      .querySelector<HTMLButtonElement>("#add-spine-overlay")
      ?.addEventListener("click", () =>
        this.safe(() =>
          this.#store.transact((draft) => {
            const select = this.required<HTMLSelectElement>(
              "spine-overlay-resource",
            );
            const resource = draft.resources.get(select.value);
            if (
              !resource ||
              !["image", "image-string", "spine", "vni"].includes(resource.kind)
            )
              throw new Error(
                "请选择 image、ImgNumber、Spine 或 VNI overlay resource。",
              );
            const order = draft.spine.overlays.length
              ? Math.max(...draft.spine.overlays.map((item) => item.order)) + 1
              : 0;
            const base = {
              id: `overlay-${order}`,
              order,
              resource: resource.rootKey,
              transform: { x: 0, y: 0, scale: 1, rotation: 0 },
              attachment: { kind: "popup-root" as const },
              visibleStates: [...popupEditorVisibilityStates("spine")],
            };
            const overlay: PopupOverlayLayer =
              resource.kind === "image"
                ? {
                    ...base,
                    kind: "image",
                    anchor: { x: 0.5, y: 0.5 },
                  }
                : resource.kind === "image-string"
                  ? {
                      ...base,
                      kind: "image-string",
                      name: `imgnumber-${order}`,
                      binding: "manual",
                      defaultText: "0",
                      anchor: { x: 0.5, y: 0.5 },
                    }
                  : resource.kind === "vni"
                    ? {
                        ...base,
                        kind: "vni",
                        playback: {
                          mode: "segmented",
                          loopStartTime: 1,
                          loopEndTime: 2.5,
                          keepParticlesAlive: true,
                        },
                      }
                    : {
                        ...base,
                        kind: "spine",
                        playback: {
                          mode: "segmented-animations",
                          startAnimation: "Start",
                          loopAnimation: "Loop",
                          endAnimation: "End",
                        },
                      };
            draft.spine.overlays.push(overlay);
          }),
        ),
      );
    this.#root
      .querySelector<HTMLButtonElement>("#add-spine-font-text")
      ?.addEventListener("click", () =>
        this.#store.transact((draft) => {
          const order = nextOrder(draft.spine.overlays);
          draft.spine.overlays.push(
            createFontTextLayer(
              `overlay-${order}`,
              order,
              popupEditorVisibilityStates("spine"),
            ),
          );
        }),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-overlay-font]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.transactField((draft) => {
            const overlay = draft.spine.overlays.find(
              ({ id }) => id === select.dataset.overlayFont,
            );
            if (!overlay || overlay.kind !== "text")
              throw new Error("字体文字 overlay 不存在。");
            setTextLayerFont(overlay, select.value, draft);
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-delete-overlay]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.#store.transact((draft) => {
            assertPopupLayerCanDelete(
              draft.spine.overlays,
              button.dataset.deleteOverlay!,
            );
            draft.spine.overlays = draft.spine.overlays.filter(
              ({ id }) => id !== button.dataset.deleteOverlay,
            );
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-overlay-field]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          this.transactField((draft) => {
            const overlay = draft.spine.overlays.find(
              ({ id }) => id === input.dataset.overlayId,
            );
            if (!overlay) throw new Error("overlay 不存在。");
            const field = input.dataset.overlayField!;
            if (["x", "y", "scale", "rotation"].includes(field))
              (overlay.transform as any)[field] = Number(input.value);
            else if (field === "order" || field === "alpha")
              (overlay as any)[field] = Number(input.value);
            else if (["name", "defaultText"].includes(field))
              (overlay as any)[field] = input.value;
            else if (["anchor-x", "anchor-y"].includes(field))
              (overlay as any).anchor[field.at(-1)!] = Number(input.value);
            else if (
              overlay.kind === "text" &&
              updateTextStyleField(overlay as any, field, input)
            )
              return;
            else if (["loopStartTime", "loopEndTime"].includes(field))
              (overlay as any).playback[field] = Number(input.value);
            else if (field === "keepParticlesAlive")
              (overlay as any).playback[field] = input.checked;
            else if (
              ["startAnimation", "loopAnimation", "endAnimation"].includes(
                field,
              )
            )
              (overlay as any).playback[field] = input.value;
            else if (field.startsWith("state-")) {
              updateVisibleStates(
                overlay,
                field.slice("state-".length) as PopupVisibilityState,
                input.checked,
                popupEditorVisibilityStates("spine"),
              );
            }
          });
          if (input.dataset.overlayField === "curvedEnabled")
            syncCurvedAngleInput(this.#root, "overlay", input);
        }),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-overlay-fill-kind]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.transactField((draft) => {
            const overlay = draft.spine.overlays.find(
              ({ id }) => id === select.dataset.overlayFillKind,
            );
            if (!overlay || overlay.kind !== "text")
              throw new Error("字体文字 overlay 不存在。");
            setTextFillKind(overlay as any, select.value);
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-overlay-vni-mode]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const overlay = draft.spine.overlays.find(
              ({ id }) => id === select.dataset.overlayVniMode,
            );
            if (!overlay || overlay.kind !== "vni")
              throw new Error("VNI overlay 不存在。");
            (overlay as any).playback =
              select.value === "once"
                ? { mode: "once" }
                : {
                    mode: "segmented",
                    loopStartTime: 1,
                    loopEndTime: 2.5,
                    keepParticlesAlive: true,
                  };
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-add-layer]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const select = this.required<HTMLSelectElement>("layer-resource");
          this.safe(() =>
            this.#store.transact((draft) =>
              addLayer(draft, this.#tier, select.value),
            ),
          );
        }),
      );
    this.#root
      .querySelector<HTMLButtonElement>("#add-font-text-layer")
      ?.addEventListener("click", () =>
        this.#store.transact((draft) => addAwardTextLayer(draft, this.#tier)),
      );
    this.#root
      .querySelector<HTMLButtonElement>("#reuse-award-layer")
      ?.addEventListener("click", () => {
        const select = this.required<HTMLSelectElement>("existing-award-layer");
        this.safe(() =>
          this.#store.transact((draft) =>
            reuseAwardLayerInTier(draft, this.#tier, select.value),
          ),
        );
      });
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-layer-font]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.transactField((draft) => {
            const layer = draft.tiers
              .get(this.#tier)!
              .layers.find(({ id }) => id === select.dataset.layerFont);
            if (!layer || layer.kind !== "text")
              throw new Error("字体文字 layer 不存在。");
            setTextLayerFont(layer, select.value, draft);
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-delete-resource]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.safe(() =>
            this.#store.transact((draft) => {
              const key = button.dataset.deleteResource!;
              removePopupResource(draft, key);
            }),
          ),
        ),
      );
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-delete-layer]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.#store.transact((draft) => {
            const tier = draft.tiers.get(this.#tier)!;
            assertPopupLayerCanDelete(tier.layers, button.dataset.deleteLayer!);
            tier.layers = tier.layers.filter(
              (layer) => layer.id !== button.dataset.deleteLayer,
            );
          }),
        ),
      );
    const duration =
      this.#root.querySelector<HTMLInputElement>("#tier-duration");
    duration?.addEventListener("change", () =>
      this.transactField((draft) => {
        draft.tiers.get(this.#tier)!.countDurationSeconds = Number(
          duration.value,
        );
      }),
    );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-threshold-tier]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.transactField((draft) => {
            const tierId = input.dataset.thresholdTier as AwardTierId;
            draft.tiers.get(tierId)!.thresholdMultiplier = Number(input.value);
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-vni-playback-mode]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.#store.transact((draft) =>
            setPopupVniPlaybackMode(
              draft,
              this.#tier,
              select.dataset.layerId!,
              select.value as "segmented" | "once",
            ),
          ),
        ),
      );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-layer-field]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          this.transactField((draft) => {
            const tier = draft.tiers.get(this.#tier)!;
            const layer = tier.layers.find(
              (item) => item.id === input.dataset.layerId,
            )!;
            const field = input.dataset.layerField!;
            if (["x", "y", "scale", "rotation"].includes(field))
              (layer.transform as any)[field] = Number(input.value);
            else if (field === "order" || field === "alpha")
              (layer as any)[field] = Number(input.value);
            else if (["name", "defaultText"].includes(field))
              (layer as any)[field] = input.value;
            else if (field === "anchor-x" || field === "anchor-y")
              (layer as any).anchor[field.at(-1)!] = Number(input.value);
            else if (
              layer.kind === "text" &&
              updateTextStyleField(layer as any, field, input)
            )
              return;
            else if (field === "loopStartTime" || field === "loopEndTime")
              (layer as any).playback[field] = Number(input.value);
            else if (field === "keepParticlesAlive")
              (layer as any).playback[field] = input.checked;
            else if (
              ["startAnimation", "loopAnimation", "endAnimation"].includes(
                field,
              )
            )
              (layer as any).playback[field] = input.value;
          });
          if (input.dataset.layerField === "curvedEnabled")
            syncCurvedAngleInput(this.#root, "layer", input);
        }),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-layer-fill-kind]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const layer = draft.tiers
              .get(this.#tier)!
              .layers.find(({ id }) => id === select.dataset.layerFillKind);
            if (!layer || layer.kind !== "text")
              throw new Error("字体文字 layer 不存在。");
            setTextFillKind(layer as any, select.value);
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-attachment-target-id]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const layer = findAttachmentLayer(
              draft,
              this.#tier,
              select.dataset.attachmentOwner!,
              select.dataset.attachmentTargetId!,
            );
            if (select.value === "popup-root") {
              (layer as any).attachment = { kind: "popup-root" };
              return;
            }
            if (select.value.startsWith("vni:")) {
              const [vniLayerId, textLayerId] = select.value
                .slice("vni:".length)
                .split(":", 2)
                .map(decodeURIComponent);
              if (!vniLayerId || !textLayerId || layer.kind !== "image-string")
                throw new Error("VNI 文字层挂接选择无效。");
              (layer as any).attachment = {
                kind: "vni-text-layer",
                vniLayerId,
                textLayerId,
              };
              return;
            }
            if (!select.value.startsWith("spine:"))
              throw new Error("Spine 挂接目标无效。");
            const targetKey = decodeURIComponent(
              select.value.slice("spine:".length),
            );
            (layer as any).attachment = {
              kind: "spine-slot",
              target:
                targetKey === "main-spine"
                  ? { kind: "main-spine" }
                  : { kind: "layer", layerId: targetKey },
              slot: "",
            };
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-attachment-slot-id]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const layer = findAttachmentLayer(
              draft,
              this.#tier,
              select.dataset.attachmentOwner!,
              select.dataset.attachmentSlotId!,
            );
            if (layer.attachment?.kind !== "spine-slot")
              throw new Error("图层当前未挂接到 Spine slot。");
            (layer as any).attachment = {
              ...layer.attachment,
              slot: select.value,
            };
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-color-picker-owner]")
      .forEach((picker) =>
        picker.addEventListener("input", () => {
          const owner = picker.dataset.colorPickerOwner!;
          const id = picker.dataset.colorPickerId!;
          const field = picker.dataset.colorPickerField!;
          const input = this.#root.querySelector<HTMLInputElement>(
            `[data-${owner}-id="${id}"][data-${owner}-field="${field}"]`,
          );
          if (!input) throw new Error("颜色 string input 不存在。");
          input.value = picker.value;
          input.dispatchEvent(new Event("change"));
        }),
      );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-project-color-picker]")
      .forEach((picker) =>
        picker.addEventListener("input", () => {
          const field = picker.dataset.projectColorPicker!;
          const input = this.#root.querySelector<HTMLInputElement>(
            `[data-project-field="${field}"]`,
          );
          if (!input) throw new Error("项目颜色 string input 不存在。");
          input.value = picker.value;
          input.dispatchEvent(new Event("change"));
        }),
      );
    const id = this.#root.querySelector<HTMLInputElement>("#project-id");
    if (id) {
      syncProjectIdValidity(id);
      id.addEventListener("input", () => syncProjectIdValidity(id));
      id.addEventListener("change", () =>
        this.transactField((draft) => {
          draft.id = id.value;
        }),
      );
    }
    const spineResource =
      this.#root.querySelector<HTMLSelectElement>("#spine-resource");
    spineResource?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.spine.resource = spineResource.value || null;
        draft.spine.playback = {
          startAnimation: "",
          loopAnimation: "",
          endAnimation: "",
        };
      }),
    );
    this.#root
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-spine-popup-field]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.transactField((draft) => {
            const field = input.dataset.spinePopupField!;
            if (["x", "y", "scale"].includes(field))
              (draft.spine.transform as any)[field] = Number(input.value);
            else (draft.spine.playback as any)[field] = input.value;
          }),
        ),
      );
    const amountPreset = this.#root.querySelector<HTMLSelectElement>(
      "#amount-format-preset",
    );
    amountPreset?.addEventListener("change", () => {
      if (amountPreset.value === "custom") return;
      this.#store.transact((draft) => {
        draft.amountFormat = createPopupAmountFormat(
          amountPreset.value as "integer" | "decimal",
        );
      });
    });
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-import-popup-audio]")
      .forEach((importAudio) =>
        importAudio.addEventListener("change", () => {
          void this.importPopupAudio(
            [...(importAudio.files ?? [])],
            importAudio.dataset.popupAudioTarget!,
          );
          importAudio.value = "";
        }),
      );
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-remove-popup-audio-cue]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.#store.transact((draft) => {
            const name = button.dataset.removePopupAudioCue!;
            const targetKey = button.dataset.popupAudioTarget!;
            const cues = draft.audio.cues.filter(
              (cue) =>
                cue.effect !== name ||
                popupAudioTargetKey(cue.target) !== targetKey,
            );
            const referenced = cues.some((cue) => cue.effect === name);
            draft.audio = {
              ...draft.audio,
              effects: referenced
                ? draft.audio.effects
                : draft.audio.effects.filter((effect) => effect.name !== name),
              cues,
            };
          }),
        ),
      );
    this.#root
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-popup-audio-field]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const name = ensureOwnedPopupAudioEffect(
              draft,
              input.dataset.popupAudioName!,
              parsePopupAudioTarget(
                draft.type,
                input.dataset.popupAudioTarget!,
              ),
            );
            draft.audio = {
              ...draft.audio,
              effects: draft.audio.effects.map((effect) => {
                if (effect.name !== name) return effect;
                if (input.dataset.popupAudioField === "offsetSeconds")
                  return { ...effect, offsetSeconds: Number(input.value) };
                if (input.dataset.popupAudioField === "playback")
                  return {
                    ...effect,
                    playback: input.value as "once" | "loop",
                    voices: {
                      ...effect.voices,
                      maxConcurrent: input.value === "loop" ? 1 : 4,
                    },
                  };
                const kind = input.value;
                return {
                  ...effect,
                  bgm:
                    kind === "duck"
                      ? {
                          kind: "duck" as const,
                          targetGain: 0.35,
                          attackSeconds: 0.2,
                          releaseSeconds: 0.5,
                        }
                      : kind === "pause"
                        ? {
                            kind: "pause" as const,
                            fadeOutSeconds: 0.2,
                            fadeInSeconds: 0.5,
                          }
                        : { kind: "keep" as const },
                };
              }),
            };
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-project-field]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.transactField((draft) => {
            const field = input.dataset.projectField!;
            if (field === "project-name") draft.name = input.value;
            else if (field.startsWith("focus-"))
              (draft.adaptation.focus as any)[field.slice("focus-".length)] =
                Number(input.value);
            else if (field === "backdrop-enabled")
              draft.backdrop.enabled = input.checked;
            else if (field === "backdrop-color")
              draft.backdrop.color = input.value;
            else if (field === "backdrop-alpha")
              draft.backdrop.alpha = Number(input.value);
            else if (field.startsWith("backdrop-state-")) {
              const state = field.slice(
                "backdrop-state-".length,
              ) as PopupVisibilityState;
              const values = new Set(draft.backdrop.visibleStates);
              input.checked ? values.add(state) : values.delete(state);
              draft.backdrop.visibleStates = popupEditorVisibilityStates(
                draft.type,
              ).filter((item) => values.has(item));
            } else {
              const key = field as keyof typeof draft.amountFormat;
              (draft.amountFormat as any)[key] =
                input.type === "checkbox"
                  ? input.checked
                  : input.type === "number"
                    ? Number(input.value)
                    : input.value;
            }
          }),
        ),
      );
  }
  private schedulePreview(
    project: PopupEditorProject,
    errors: readonly string[],
  ) {
    if (this.#previewTimer) clearTimeout(this.#previewTimer);
    this.#preview?.cancelPendingRebuild();
    const generation = ++this.#previewGeneration;
    if (!this.#hasProject || errors.length) return;
    const snapshot = clonePopupEditorProject(project);
    this.#previewTimer = setTimeout(() => {
      this.#previewTimer = null;
      void this.#preview!.rebuild(snapshot).catch((error) => {
        if (generation !== this.#previewGeneration) return;
        this.#notice = `自动预览失败：${error instanceof Error ? error.message : String(error)}`;
        this.renderDiagnostics();
      });
    }, 120);
  }

  private async importPopupAudio(
    files: readonly File[],
    targetKey: string,
  ): Promise<void> {
    await this.action(async () => {
      const entries = await Promise.all(
        files.map(async (file) => {
          const key = file.name.toLowerCase();
          const bytes = new Uint8Array(await file.arrayBuffer());
          const mediaType = detectAudioMediaType(bytes);
          if (!mediaType) throw new Error(`无法识别音频格式：${file.name}`);
          const name = key
            .replace(/\.[^.]+$/u, "")
            .replace(/[^a-z0-9]+/gu, "-")
            .replace(/^-+|-+$/gu, "");
          return {
            name,
            mediaType,
            entry: await createEditorAssetEntry({ key, mediaType, bytes }),
          };
        }),
      );
      this.#store.transact((draft) => {
        const target = parsePopupAudioTarget(draft.type, targetKey);
        const usedNames = new Set(
          draft.audio.effects.map((effect) => effect.name),
        );
        for (const imported of entries) {
          const { mediaType, entry } = imported;
          const name = allocatePopupAudioName(usedNames, imported.name);
          usedNames.add(name);
          const existing = draft.assets.get(entry.key);
          if (existing && existing.sha256 !== entry.sha256)
            throw new Error(
              `音频 filename key 已存在且 bytes 不同：${entry.key}`,
            );
          draft.assets.set(entry.key, entry);
          draft.audio = {
            ...draft.audio,
            effects: [
              ...draft.audio.effects,
              {
                name,
                asset: { sources: [{ path: entry.key, mediaType }] },
                playback: "once",
                offsetSeconds: 0,
                voices: { maxConcurrent: 4, overflow: "restart-oldest" },
                bgm: { kind: "keep" },
              },
            ],
            cues: [...draft.audio.cues, { effect: name, target }],
          };
        }
      });
      this.#notice = `已导入 ${entries.length} 个 Popup 音效。`;
    });
  }
  private async importProject(file: File) {
    await this.action(async () => {
      if (!file.name.toLowerCase().endsWith(".zip"))
        throw new Error("Popup 项目必须是 ZIP。");
      const imported = await importPopupZip(
        new Uint8Array(await file.arrayBuffer()),
      );
      this.#hasProject = true;
      this.#store.replace(imported);
      this.#notice = `已导入项目：${imported.name}`;
    });
  }
  private async reviewFiles(files: readonly File[]) {
    await this.action(async () => {
      if (files.length === 1 && files[0]!.name.toLowerCase().endsWith(".zip")) {
        const bytes = new Uint8Array(await files[0]!.arrayBuffer());
        const entries = normalizeEditorPackageZipEntries(
          extractBoundedZip(bytes, { limits: POPUP_ZIP_LIMITS }),
          ["popup.manifest.json", "image-string.manifest.json"],
        );
        if (entries.has("popup.manifest.json")) {
          throw new Error("这是 Popup 项目 ZIP，请使用“导入项目”。");
        }
      }
      const profileSelections = new Map<string, string>();
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".zip")) continue;
        const profiles = inspectVniBundleProfiles(
          new Uint8Array(await file.arrayBuffer()),
        );
        if (!profiles) continue;
        if (profiles.length === 1) {
          profileSelections.set(file.name, profiles[0]!.id);
          continue;
        }
        const selected = await this.chooseVniRuntimeProfile(
          file.name,
          profiles,
        );
        if (!selected) return;
        profileSelections.set(file.name, selected);
      }
      const candidates = await discoverPopupResources(files, {
        vniProfileSelections: profileSelections,
      });
      await this.showReview(candidates);
    });
  }
  private chooseVniRuntimeProfile(
    fileName: string,
    profiles: readonly PopupVniRuntimeProfile[],
  ): Promise<string | null> {
    const dialog = this.required<HTMLDialogElement>("vni-runtime-choice");
    const description = this.required("vni-runtime-description");
    const select = this.required<HTMLSelectElement>("vni-runtime-select");
    const confirm = this.required<HTMLButtonElement>("vni-runtime-confirm");
    const cancel = this.required<HTMLButtonElement>("vni-runtime-cancel");
    description.textContent = `${fileName} 包含多个 runtime 运行发布包，请选择本次导入版本。`;
    select.replaceChildren(
      ...profiles.map((profile) => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = `${profile.label} · ${profile.id} · ${profile.assetScale * 100}% · ${profile.byteLength} bytes`;
        return option;
      }),
    );
    return new Promise((resolve) => {
      const finish = (value: string | null) => {
        confirm.onclick = null;
        cancel.onclick = null;
        dialog.removeEventListener("cancel", onDialogCancel);
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onDialogCancel = (event: Event) => {
        event.preventDefault();
        finish(null);
      };
      confirm.onclick = () => finish(select.value);
      cancel.onclick = () => finish(null);
      dialog.addEventListener("cancel", onDialogCancel);
      dialog.showModal();
    });
  }
  private async showReview(candidates: readonly PopupImportReviewCandidate[]) {
    const transaction = await reviewPopupImportTransaction(
      this.#store.project,
      candidates,
    );
    const dialog = this.required<HTMLDialogElement>("import-review");
    const body = this.required("review-body");
    body.innerHTML =
      candidates
        .map(
          (candidate) =>
            `<article><strong>${candidate.rootKey}</strong><span>${candidate.kind}</span><span>${candidate.primarySource}</span><span>${candidate.summary}</span>${candidate.profiles ? `<span>VNI profile：${candidate.selectedProfileId} / ${candidate.profiles.map(({ id, label }) => `${id} (${label})`).join(", ")}</span>` : ""}<span>${candidateBindingSummary(candidate)}</span><span>${candidate.dependencyCount} dependencies / ${candidate.assets.length} filename keys / ${candidate.assets.reduce((sum, asset) => sum + asset.byteLength, 0)} bytes</span></article>`,
        )
        .join("") +
      `<div class="import-conflicts">${transaction.assets.items
        .map(
          (item, index) =>
            `<p><strong>${item.targetKey}</strong> · ${item.action}${item.references.length ? ` · 影响 ${item.references.map(({ location }) => location).join(", ")}` : ""}${item.action === "overwrite" || item.action === "rename-required" ? `<label>处理方式<select data-import-resolution="${index}">${item.action === "overwrite" ? '<option value="overwrite">覆盖同名资源</option>' : ""}<option value="keep-both">保留两份（自动重命名）</option></select></label>` : ""}</p>`,
        )
        .join("")}</div>`;
    this.required("review-confirm").onclick = () =>
      void this.action(async () => {
        const draft = clonePopupEditorProject(this.#store.project);
        const resolutions: EditorImportResolution[] = [
          ...dialog.querySelectorAll<HTMLSelectElement>(
            "[data-import-resolution]",
          ),
        ].map((select) => ({
          itemIndex: Number(select.dataset.importResolution),
          resolution: select.value as EditorImportConflictResolution,
        }));
        const committed = await commitImportReview(
          draft,
          candidates,
          resolutions,
        );
        if (draft.type === "award-celebration")
          for (const candidate of candidates) {
            const rootKey =
              committed.assets.items.find((item) =>
                item.sourceKeys.includes(candidate.rootKey),
              )?.targetKey ?? candidate.rootKey;
            applyImportedResourceBindings(
              draft,
              rootKey,
              candidate.suggestedTierBindings,
            );
          }
        this.#store.replace(draft);
        this.#notice = resourceImportNotice(draft, candidates);
        dialog.close();
      });
    this.required("review-cancel").onclick = () => dialog.close();
    dialog.showModal();
  }
  private async exportProject() {
    await this.action(async () => {
      const result = await exportPopupZip(this.#store.project);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      queueMicrotask(() => URL.revokeObjectURL(url));
    });
  }
  private async action(work: () => Promise<void>) {
    this.#notice = "";
    try {
      await work();
      if (!this.#notice) this.#notice = "操作成功";
    } catch (error) {
      this.#notice = error instanceof Error ? error.message : String(error);
    }
    this.renderWorkspace(this.#store.project);
  }
  private safe(work: () => void) {
    try {
      work();
      this.#notice = "操作成功";
    } catch (error) {
      this.#notice = error instanceof Error ? error.message : String(error);
    }
    this.renderWorkspace(this.#store.project);
  }
  private required<T extends HTMLElement = HTMLElement>(id: string): T {
    const node = this.#root.querySelector<T>(`#${id}`);
    if (!node) throw new Error(`UI missing #${id}`);
    return node;
  }
}

function shell() {
  return `<header><h1>Popup Editor</h1><nav class="primary-tabs" role="tablist" aria-label="编辑区域"><button role="tab" data-tab="resources">资源</button><button role="tab" data-tab="tiers">动画 / 档位</button><button role="tab" data-tab="project">项目</button></nav></header><main><section class="left"><div id="workspace" role="tabpanel"></div><pre id="diagnostics"></pre></section><aside><div class="preview-controls"><select id="preview-resolution"><option value="1920x1080">1920×1080</option><option value="1080x1920" selected>1080×1920</option><option value="2000x2000">2000×2000</option><option value="custom">custom</option></select><label>width<input id="preview-width" type="number" min="1" value="1080"/></label><label>height<input id="preview-height" type="number" min="1" value="1920"/></label><select id="preview-zoom"><option value="fit">fit</option>${[0.25, 0.5, 0.75, 1, 1.5, 2].map((v) => `<option value="${v}">${v * 100}%</option>`)}</select><label><input id="preview-guides" type="checkbox" checked/>guides</label><label>bet raw<input id="preview-bet" type="number" value="100"/></label><label>win raw<input id="preview-win" type="number" value="5000"/></label><label>小数位数（仅预览）<input id="preview-fraction-digits" type="number" min="0" max="6" step="1" value="0"/></label><label><input id="preview-use-grouping" type="checkbox"/>千位分隔（仅预览）</label><button id="preview-play">Play / Replay</button></div><div id="preview-canvas"></div><output id="preview-status"></output></aside></main><dialog id="create-project-dialog"><h2>创建 Popup 项目</h2><label>项目名<input id="create-project-name"/></label><label>类型<select id="create-project-type"><option value="award-celebration">获奖庆祝</option><option value="spine">Spine 弹窗</option></select></label><button id="create-project-confirm">创建</button><button id="create-project-cancel">取消</button></dialog><dialog id="vni-runtime-choice"><h2>选择 VNI runtime</h2><p id="vni-runtime-description"></p><label class="vni-runtime-options">运行版本<select id="vni-runtime-select"></select></label><button id="vni-runtime-confirm">确认 runtime</button><button id="vni-runtime-cancel">取消导入</button></dialog><dialog id="import-review"><h2>Import review</h2><div id="review-body"></div><button id="review-confirm">确认导入</button><button id="review-cancel">取消</button></dialog>`;
}
function resourcesMarkup(project: PopupEditorProject) {
  return `<section class="resource-import-panel"><h2>资源库</h2><p>这里只导入资源：VNI 与 ImgNumber 使用 ZIP；图片、字体使用文件；Spine 每次选择完整 JSON、atlas、PNG 组。Popup 项目 ZIP 请使用项目入口。同名不同 bytes 必须在 review 中选择覆盖或保留两份。</p><div class="resource-actions"><label class="file-action">上传资源<input id="import-assets" type="file" accept="image/png,image/webp,image/jpeg,.json,.atlas,.zip,.woff2,.woff,.ttf,.otf" multiple/></label></div></section><div class="resource-list">${[...project.resources.values()].map((resource) => `<article class="card"><strong>${resource.rootKey}</strong><span>${resource.kind}</span><details><summary>${resource.keys.length} filename keys</summary><code>${resource.keys.join("\n")}</code></details><span>${resourceReferenceCount(project, resource.rootKey)} 个图层绑定</span><button data-delete-resource="${resource.rootKey}">删除</button></article>`).join("") || '<p class="empty-state">尚无资源</p>'}</div>`;
}

function spineMarkup(project: PopupEditorProject) {
  const resources = [...project.resources.values()].filter(
    (resource) => resource.spec.kind === "spine",
  );
  const animations = spineAnimationNames(project);
  const overlayResources = [...project.resources.values()].filter((resource) =>
    ["image", "image-string", "spine", "vni"].includes(resource.kind),
  );
  const animationSelect = (
    field: "startAnimation" | "loopAnimation" | "endAnimation",
    label: string,
  ) => {
    const selected = project.spine.playback[field];
    return `<label>${label}<select data-spine-popup-field="${field}"><option value="">请选择动画</option>${animations.map((name) => `<option value="${name}" ${name === selected ? "selected" : ""}>${name}</option>`).join("")}</select></label>`;
  };
  return `<section class="tier-editor"><h2>普通 Spine 弹窗</h2><p>播放 start 后进入 loop；用户点击会锁存关闭请求，并在当前 loop 播放到边界后进入 end。</p><label>Spine 资源<select id="spine-resource"><option value="">请选择资源</option>${resources.map((resource) => `<option value="${resource.rootKey}" ${resource.rootKey === project.spine.resource ? "selected" : ""}>${resource.rootKey}</option>`).join("")}</select></label><div class="threshold-grid">${(["x", "y", "scale"] as const).map((field) => `<label>${field}<input data-spine-popup-field="${field}" type="number" step="0.1" value="${project.spine.transform[field]}"/></label>`).join("")}</div>${animationSelect("startAnimation", "开始动画")}${animationSelect("loopAnimation", "循环动画")}${animationSelect("endAnimation", "结束动画")}<p class="segment-summary">${project.spine.resource ? (animations.length ? `已从 skeleton JSON 读取 ${animations.length} 个动画。` : "所选 skeleton JSON 没有可用动画。") : "导入并选择一组 Spine JSON、atlas 与 PNG 后配置动画。"}</p><h3>分段音效</h3><p>每个动画段可以独立添加多条音效。</p>${popupStateAudioMarkup(project, { kind: "segment", segment: "start" }, "start")}${popupStateAudioMarkup(project, { kind: "segment", segment: "loop" }, "loop")}${popupStateAudioMarkup(project, { kind: "segment", segment: "end" }, "end")}<h3>Overlay 图层</h3><div class="layer-add"><select id="spine-overlay-resource">${overlayResources.map((resource) => `<option value="${resource.rootKey}">${resource.rootKey} (${resource.kind})</option>`).join("")}</select><button id="add-spine-overlay" ${overlayResources.length ? "" : "disabled"}>添加 overlay</button><button id="add-spine-font-text">添加字体文字</button></div>${project.spine.overlays.map((layer) => overlayMarkup(layer, project)).join("")}</section>`;
}

function overlayMarkup(layer: PopupOverlayLayer, project: PopupEditorProject) {
  const input = (field: string, value: string | number, type = "number") =>
    `<label>${field}<input data-overlay-id="${layer.id}" data-overlay-field="${field}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${value}"/></label>`;
  const visibility = stateControls(
    "overlay",
    layer.id,
    layer.visibleStates ?? popupEditorVisibilityStates("spine"),
    popupEditorVisibilityStates("spine"),
  );
  const playback =
    layer.kind === "image"
      ? `${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}`
      : layer.kind === "image-string"
        ? `${input("name", layer.name, "text")}${input("defaultText", layer.defaultText, "text")}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}`
        : layer.kind === "text"
          ? `${input("name", layer.name, "text")}${fontSelectMarkup("overlay", layer.id, layer.resource, project)}${input("defaultText", layer.defaultText, "text")}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${textStyleMarkup("overlay", layer.id, layer.style)}`
          : layer.kind === "spine"
            ? (["startAnimation", "loopAnimation", "endAnimation"] as const)
                .map((field) => input(field, layer.playback[field], "text"))
                .join("")
            : `${`<label>mode<select data-overlay-vni-mode="${layer.id}"><option value="segmented" ${layer.playback.mode === "segmented" ? "selected" : ""}>segmented</option><option value="once" ${layer.playback.mode === "once" ? "selected" : ""}>once</option></select></label>`}${
                layer.playback.mode === "segmented"
                  ? `${input("loopStartTime", layer.playback.loopStartTime)}${input("loopEndTime", layer.playback.loopEndTime)}<label>keepParticlesAlive<input data-overlay-id="${layer.id}" data-overlay-field="keepParticlesAlive" type="checkbox" ${layer.playback.keepParticlesAlive ? "checked" : ""}/></label>`
                  : `<p>VNI once</p>`
              }`;
  return `<article class="card"><strong>${layer.id}</strong><span>${layer.kind} / ${layer.resource ?? "system"}</span>${attachmentMarkup(layer, project, { kind: "spine-popup" }, "overlay")}${input("order", layer.order)}${input("alpha", layer.alpha ?? 1)}${(["x", "y", "scale", "rotation"] as const).map((field) => input(field, layer.transform[field])).join("")}${visibility}${playback}<button data-delete-overlay="${layer.id}">删除 overlay</button></article>`;
}

function stateControls(
  owner: "overlay" | "layer",
  id: string,
  selected: readonly string[],
  states: readonly string[],
) {
  const idAttribute = owner === "overlay" ? "data-overlay-id" : "data-layer-id";
  const fieldAttribute =
    owner === "overlay" ? "data-overlay-field" : "data-layer-field";
  return states
    .map(
      (state) =>
        `<label>${state}<input ${idAttribute}="${id}" ${fieldAttribute}="state-${state}" type="checkbox" ${selected.includes(state) ? "checked" : ""}/></label>`,
    )
    .join("");
}

function fontSelectMarkup(
  owner: "overlay" | "layer",
  id: string,
  selected: string | undefined,
  project: PopupEditorProject,
) {
  const attribute =
    owner === "overlay" ? "data-overlay-font" : "data-layer-font";
  const fonts = [...project.resources.values()].filter(
    ({ kind }) => kind === "font",
  );
  return `<label>字体<select ${attribute}="${id}"><option value="" ${selected ? "" : "selected"}>系统字体（未选择资源）</option>${fonts.map((font) => `<option value="${font.rootKey}" ${selected === font.rootKey ? "selected" : ""}>${font.rootKey}</option>`).join("")}</select></label>`;
}

function setTextLayerFont(
  layer: Extract<PopupOverlayLayer | PopupLayer, { kind: "text" }>,
  resourceKey: string,
  project: PopupEditorProject,
) {
  if (!resourceKey) {
    delete (layer as { resource?: string }).resource;
    return;
  }
  const resource = project.resources.get(resourceKey);
  if (!resource || resource.kind !== "font")
    throw new Error(`字体文字必须引用 font resource：${resourceKey}`);
  (layer as { resource?: string }).resource = resourceKey;
}

function nextOrder(layers: readonly { readonly order: number }[]): number {
  return layers.length ? Math.max(...layers.map(({ order }) => order)) + 1 : 0;
}

function createFontTextLayer(
  id: string,
  order: number,
  visibleStates: readonly PopupVisibilityState[],
) {
  return {
    id,
    kind: "text" as const,
    name: id,
    defaultText: "TEXT",
    order,
    alpha: 1,
    attachment: { kind: "popup-root" as const },
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    anchor: { x: 0.5, y: 0.5 },
    style: {
      fontSize: 72,
      letterSpacing: 0,
      fill: { kind: "solid" as const, color: "#ffffff" },
      stroke: { color: "#000000", width: 4 },
      shadow: {
        color: "#000000",
        alpha: 0.5,
        blur: 4,
        distance: 6,
        angleDegrees: 90,
      },
      arcDegrees: 0,
    },
    visibleStates: [...visibleStates],
  };
}

function updateVisibleStates(
  layer: PopupLayer | PopupOverlayLayer,
  state: PopupVisibilityState,
  checked: boolean,
  states: readonly PopupVisibilityState[],
) {
  const values = new Set(layer.visibleStates ?? states);
  checked ? values.add(state) : values.delete(state);
  (layer as { visibleStates?: readonly PopupVisibilityState[] }).visibleStates =
    states.filter((item) => values.has(item));
}

function updateTextStyleField(
  layer: Extract<PopupOverlayLayer | PopupLayer, { kind: "text" }>,
  field: string,
  input: HTMLInputElement,
): boolean {
  const mutable = layer as any;
  if (field === "curvedEnabled") {
    mutable.style.arcDegrees = input.checked
      ? mutable.style.arcDegrees || 30
      : 0;
    return true;
  }
  if (["fontSize", "letterSpacing", "arcDegrees"].includes(field)) {
    mutable.style[field] = Number(input.value);
    return true;
  }
  if (field === "fillColor") {
    if (mutable.style.fill.kind === "solid")
      mutable.style.fill.color = input.value;
    else mutable.style.fill.stops[0].color = input.value;
    return true;
  }
  if (field === "gradientEndColor") {
    if (mutable.style.fill.kind === "linear-gradient")
      mutable.style.fill.stops[mutable.style.fill.stops.length - 1].color =
        input.value;
    return true;
  }
  if (field === "gradientAngle") {
    if (mutable.style.fill.kind === "linear-gradient")
      mutable.style.fill.angleDegrees = Number(input.value);
    return true;
  }
  if (field === "strokeEnabled") {
    if (input.checked) mutable.style.stroke ??= { color: "#000000", width: 4 };
    else delete mutable.style.stroke;
    return true;
  }
  if (field === "shadowEnabled") {
    if (input.checked)
      mutable.style.shadow ??= {
        color: "#000000",
        alpha: 0.6,
        blur: 4,
        distance: 6,
        angleDegrees: 90,
      };
    else delete mutable.style.shadow;
    return true;
  }
  const strokeFields: Record<string, string> = {
    strokeColor: "color",
    strokeWidth: "width",
  };
  if (strokeFields[field]) {
    if (mutable.style.stroke)
      mutable.style.stroke[strokeFields[field]] =
        field === "strokeColor" ? input.value : Number(input.value);
    return true;
  }
  const shadowFields: Record<string, string> = {
    shadowColor: "color",
    shadowAlpha: "alpha",
    shadowBlur: "blur",
    shadowDistance: "distance",
    shadowAngle: "angleDegrees",
  };
  if (shadowFields[field]) {
    if (mutable.style.shadow)
      mutable.style.shadow[shadowFields[field]] =
        field === "shadowColor" ? input.value : Number(input.value);
    return true;
  }
  return false;
}

function syncCurvedAngleInput(
  root: HTMLElement,
  owner: "overlay" | "layer",
  checkbox: HTMLInputElement,
) {
  const id =
    owner === "overlay" ? checkbox.dataset.overlayId : checkbox.dataset.layerId;
  const idAttribute = owner === "overlay" ? "data-overlay-id" : "data-layer-id";
  const fieldAttribute =
    owner === "overlay" ? "data-overlay-field" : "data-layer-field";
  const angle = root.querySelector<HTMLInputElement>(
    `[${idAttribute}="${id}"][${fieldAttribute}="arcDegrees"]`,
  );
  if (angle)
    angle.value = checkbox.checked ? String(Number(angle.value) || 30) : "0";
}

function setTextFillKind(
  layer: Extract<PopupOverlayLayer | PopupLayer, { kind: "text" }>,
  kind: string,
) {
  const mutable = layer as any;
  const start =
    mutable.style.fill.kind === "solid"
      ? mutable.style.fill.color
      : mutable.style.fill.stops[0].color;
  mutable.style.fill =
    kind === "linear-gradient"
      ? {
          kind: "linear-gradient",
          angleDegrees: 90,
          stops: [
            { offset: 0, color: start },
            { offset: 1, color: "#ffd84d" },
          ],
        }
      : { kind: "solid", color: start };
}

function textStyleMarkup(
  owner: "overlay" | "layer",
  id: string,
  style: Extract<PopupOverlayLayer | PopupLayer, { kind: "text" }>["style"],
) {
  const idAttribute = owner === "overlay" ? "data-overlay-id" : "data-layer-id";
  const fieldAttribute =
    owner === "overlay" ? "data-overlay-field" : "data-layer-field";
  const input = (field: string, value: string | number, type = "number") =>
    `<label>${field}<input ${idAttribute}="${id}" ${fieldAttribute}="${field}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${value}"/></label>`;
  const colorInput = (label: string, field: string, value: string) =>
    `<label>${label}<span class="color-control"><input type="color" data-color-picker-owner="${owner}" data-color-picker-id="${id}" data-color-picker-field="${field}" value="${value.slice(0, 7)}"/><input ${idAttribute}="${id}" ${fieldAttribute}="${field}" type="text" value="${value}"/></span></label>`;
  const gradient =
    style.fill.kind === "linear-gradient"
      ? style.fill
      : {
          kind: "linear-gradient" as const,
          angleDegrees: 90,
          stops: [
            { offset: 0, color: style.fill.color },
            { offset: 1, color: style.fill.color },
          ],
        };
  const fillKindAttribute =
    owner === "overlay" ? "data-overlay-fill-kind" : "data-layer-fill-kind";
  return `${input("fontSize", style.fontSize)}${input("letterSpacing", style.letterSpacing)}<label><input ${idAttribute}="${id}" ${fieldAttribute}="curvedEnabled" type="checkbox" ${style.arcDegrees === 0 ? "" : "checked"}/>Curved Text</label><label>弧度（-180..180°）<input ${idAttribute}="${id}" ${fieldAttribute}="arcDegrees" type="number" min="-180" max="180" step="1" value="${style.arcDegrees}"/></label><label>fill<select ${fillKindAttribute}="${id}"><option value="solid" ${style.fill.kind === "solid" ? "selected" : ""}>纯色</option><option value="linear-gradient" ${style.fill.kind === "linear-gradient" ? "selected" : ""}>线性渐变</option></select></label>${colorInput("起始 / 纯色", "fillColor", style.fill.kind === "solid" ? style.fill.color : style.fill.stops[0]!.color)}${colorInput("渐变结束色", "gradientEndColor", gradient.stops.at(-1)!.color)}${input("gradientAngle", gradient.angleDegrees)}<label><input ${idAttribute}="${id}" ${fieldAttribute}="strokeEnabled" type="checkbox" ${style.stroke ? "checked" : ""}/>描边</label>${colorInput("描边颜色", "strokeColor", style.stroke?.color ?? "#000000")}${input("strokeWidth", style.stroke?.width ?? 0)}<label><input ${idAttribute}="${id}" ${fieldAttribute}="shadowEnabled" type="checkbox" ${style.shadow ? "checked" : ""}/>投影</label>${colorInput("投影颜色", "shadowColor", style.shadow?.color ?? "#000000")}${input("shadowAlpha", style.shadow?.alpha ?? 0.6)}${input("shadowBlur", style.shadow?.blur ?? 4)}${input("shadowDistance", style.shadow?.distance ?? 6)}${input("shadowAngle", style.shadow?.angleDegrees ?? 90)}`;
}

function spineAnimationNames(project: PopupEditorProject): readonly string[] {
  const resourceKey = project.spine.resource;
  if (!resourceKey) return [];
  const resource = project.resources.get(resourceKey);
  if (!resource || resource.spec.kind !== "spine") return [];
  const bytes = project.assets.get(resource.spec.skeleton)?.bytes;
  if (!bytes) return [];
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as {
      animations?: unknown;
    };
    if (
      !value.animations ||
      typeof value.animations !== "object" ||
      Array.isArray(value.animations)
    )
      return [];
    return Object.keys(value.animations).sort((left, right) =>
      left.localeCompare(right),
    );
  } catch {
    return [];
  }
}
function tiersMarkup(
  project: PopupEditorProject,
  active: AwardTierId,
  betRaw: number,
) {
  const tier = project.tiers.get(active)!;
  const layerResources = [...project.resources.values()].filter(
    ({ kind }) => kind !== "font",
  );
  const activeIds = new Set(tier.layers.map(({ id }) => id));
  const reusable = [
    ...new Map(
      [...project.tiers.values()]
        .flatMap(({ layers }) => layers)
        .filter(({ id }) => !activeIds.has(id))
        .map((layer) => [layer.id, layer] as const),
    ).values(),
  ];
  const reuse = reusable.length
    ? `<div class="layer-add"><select id="existing-award-layer">${reusable.map((layer) => `<option value="${layer.id}">${layer.id} (${layer.kind})</option>`).join("")}</select><button id="reuse-award-layer">复用逻辑图层到当前档</button></div>`
    : "";
  return `<nav class="tier-tabs" role="tablist" aria-label="获奖档位">${TIERS.map((id) => `<button role="tab" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}" data-tier="${id}" class="${id === active ? "active" : ""}"><span>${id}</span><small>${project.tiers.get(id)!.layers.length} 层</small></button>`).join("")}</nav><section class="tier-contract"><h2>累计档位合同</h2><p>base：0 &lt; win ≤ 1×bet；standard：1×bet &lt; win &lt; bigwin。达到某个阈值时进入该档，已达到的前序档位会依次累计播放。</p><div class="threshold-grid">${(["bigwin", "superwin", "megawin"] as const).map((id) => `<label><span>${id}</span><input data-threshold-tier="${id}" type="number" min="2" step="1" value="${project.tiers.get(id)!.thresholdMultiplier}"/><small>× bet</small></label>`).join("")}</div><p class="contract-example">当前倍数边界：1× / ${project.tiers.get("bigwin")!.thresholdMultiplier}× / ${project.tiers.get("superwin")!.thresholdMultiplier}× / ${project.tiers.get("megawin")!.thresholdMultiplier}×；等于阈值时进入对应档。</p><p id="tier-boundaries" class="raw-boundaries">${tierBoundarySummary(project, betRaw)}</p></section><section class="tier-editor"><h2>${active}</h2><p class="layer-order-help">同一 id 在不同档位表示同一逻辑图层；当前档没有该 id 时不可见。order 只控制当前档位内的图层顺序。</p><label>金额计数时长<input id="tier-duration" type="number" step="0.1" min="0" value="${tier.countDurationSeconds}"/><small>秒</small></label>${popupStateAudioMarkup(project, { kind: "award-tier", tier: active }, `${active} 音效`)}<div class="layer-add"><select id="layer-resource">${layerResources.map((resource) => `<option value="${resource.rootKey}">${resource.rootKey} (${resource.kind})</option>`)}</select><button data-add-layer ${layerResources.length ? "" : "disabled"}>新增图层</button><button id="add-font-text-layer">添加字体文字</button></div>${reuse}${tier.layers.map((layer) => layerMarkup(layer, project, active)).join("")}</section>`;
}

function tierBoundarySummary(project: PopupEditorProject, betRaw: number) {
  if (!Number.isSafeInteger(betRaw) || betRaw <= 0)
    return "请输入 positive safe integer bet raw 以计算实际边界。";
  const multipliers = [
    1,
    project.tiers.get("bigwin")!.thresholdMultiplier!,
    project.tiers.get("superwin")!.thresholdMultiplier!,
    project.tiers.get("megawin")!.thresholdMultiplier!,
  ];
  const rawBoundaries = multipliers.map((multiplier) => betRaw * multiplier);
  if (rawBoundaries.some((value) => !Number.isSafeInteger(value)))
    return "当前 bet raw × threshold 超出 safe integer 范围。";
  const displayed = rawBoundaries.map((value) =>
    formatPopupAmount(value, project.amountFormat),
  );
  return `当前 bet raw=${betRaw}：累计计数 raw 0→${rawBoundaries.join("→")}；按金额合同显示为 0→${displayed.join("→")}。`;
}
function layerMarkup(
  layer: PopupLayer,
  project: PopupEditorProject,
  tierId: AwardTierId,
) {
  const input = (field: string, value: string | number, type = "number") =>
    `<label>${field}<input data-layer-id="${layer.id}" data-layer-field="${field}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${value}"/></label>`;
  const playback =
    layer.kind === "vni"
      ? vniPlaybackMarkup(layer, project)
      : layer.kind === "spine"
        ? (["startAnimation", "loopAnimation", "endAnimation"] as const)
            .map((field) => input(field, layer.playback[field], "text"))
            .join("")
        : layer.kind === "image-string"
          ? `${input("name", layer.name ?? "win-amount", "text")}${layer.binding === "manual" ? input("defaultText", layer.defaultText ?? "", "text") : ""}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}`
          : layer.kind === "text"
            ? `${input("name", layer.name, "text")}${fontSelectMarkup("layer", layer.id, layer.resource, project)}${input("defaultText", layer.defaultText, "text")}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${textStyleMarkup("layer", layer.id, layer.style)}`
            : `${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}`;
  return `<article class="card"><strong>${layer.id}</strong><span>${layer.kind} / ${layer.resource ?? "system"}</span>${attachmentMarkup(layer, project, { kind: "award", tierId }, "layer")}${input("order", layer.order)}${input("alpha", layer.alpha ?? 1)}${(["x", "y", "scale"] as const).map((field) => input(field, layer.transform[field])).join("")}${layer.kind === "text" || layer.kind === "image-string" ? input("rotation", layer.transform.rotation ?? 0) : ""}${playback}<button data-delete-layer="${layer.id}">删除当前档配置</button></article>`;
}

function vniPlaybackMarkup(
  layer: Extract<PopupLayer, { kind: "vni" }>,
  project: PopupEditorProject,
) {
  const mode = `<label>播放模式<select data-vni-playback-mode data-layer-id="${layer.id}"><option value="segmented" ${layer.playback.mode === "segmented" ? "selected" : ""}>分段循环</option><option value="once" ${layer.playback.mode === "once" ? "selected" : ""}>完整单次</option></select></label>`;
  if (layer.playback.mode === "once")
    return `${mode}${vniTimingSummary(project, layer)}<p class="amount-layer-note">完整时间轴只播放一次；动画先结束时保持 authored 最后一帧，直到跨档或关闭 Popup。切回分段循环会建立并显示默认分段值。</p>`;
  const input = (field: string, value: number) =>
    `<label>${field}<input data-layer-id="${layer.id}" data-layer-field="${field}" type="number" step="0.1" value="${value}"/></label>`;
  return `${mode}${vniTimingSummary(project, layer)}${input("loopStartTime", layer.playback.loopStartTime)}${input("loopEndTime", layer.playback.loopEndTime)}<label>keepParticlesAlive<input data-layer-id="${layer.id}" data-layer-field="keepParticlesAlive" type="checkbox" ${layer.playback.keepParticlesAlive ? "checked" : ""}/></label><p class="amount-layer-note">切换到完整单次会从导出配置移除当前分段字段。</p>`;
}

function attachmentMarkup(
  layer: PopupLayer | PopupOverlayLayer,
  project: PopupEditorProject,
  scope:
    | { readonly kind: "award"; readonly tierId: AwardTierId }
    | { readonly kind: "spine-popup" },
  owner: "layer" | "overlay",
) {
  let spineTargets: ReturnType<typeof getPopupSpineAttachmentTargets> = [];
  try {
    spineTargets = getPopupSpineAttachmentTargets(project, scope);
  } catch {
    // Project diagnostics reports the exact Spine resource failure.
  }
  const attachment = resolvePopupLayerAttachment(layer);
  const selected =
    attachment.kind === "popup-root"
      ? "popup-root"
      : attachment.kind === "vni-text-layer"
        ? `vni:${encodeURIComponent(attachment.vniLayerId)}:${encodeURIComponent(attachment.textLayerId)}`
        : `spine:${encodeURIComponent(attachment.target.kind === "main-spine" ? "main-spine" : attachment.target.layerId)}`;
  const options = [
    `<option value="popup-root">Popup 根节点</option>`,
    ...(scope.kind === "award" && layer.kind === "image-string"
      ? (() => {
          try {
            return getPopupVniTextLayerTargets(project, scope.tierId).map(
              ({ vniLayerId, textLayerId, textLayerName }) => {
                const value = `vni:${encodeURIComponent(vniLayerId)}:${encodeURIComponent(textLayerId)}`;
                return `<option value="${value}" ${value === selected ? "selected" : ""}>VNI 文字层：${vniLayerId} / ${textLayerName} (${textLayerId})</option>`;
              },
            );
          } catch {
            return [];
          }
        })()
      : []),
    ...spineTargets.map((target) => {
      const value = `spine:${encodeURIComponent(target.key)}`;
      return `<option value="${value}" ${value === selected ? "selected" : ""}>${target.label}</option>`;
    }),
  ];
  const targetKey =
    attachment.kind === "spine-slot"
      ? attachment.target.kind === "main-spine"
        ? "main-spine"
        : attachment.target.layerId
      : null;
  const slotTarget = spineTargets.find(({ key }) => key === targetKey);
  const slot = attachment.kind === "spine-slot" ? attachment.slot : "";
  const slotMarkup =
    attachment.kind === "spine-slot"
      ? `<label>Spine slot<select data-attachment-owner="${owner}" data-attachment-slot-id="${layer.id}"><option value="">请选择 exact slot</option>${(slotTarget?.slotNames ?? []).map((name) => `<option value="${name}" ${name === slot ? "selected" : ""}>${name}</option>`).join("")}</select></label>`
      : "";
  return `<fieldset class="attachment-editor"><legend>挂接</legend><label>父节点<select data-attachment-owner="${owner}" data-attachment-target-id="${layer.id}">${options.join("")}</select></label>${slotMarkup}<p class="amount-layer-note">挂接后 transform 为父节点局部坐标；order 只控制同一父节点下的兄弟顺序。</p></fieldset>`;
}

function findAttachmentLayer(
  project: PopupEditorProject,
  tierId: AwardTierId,
  owner: string,
  layerId: string,
): PopupLayer | PopupOverlayLayer {
  const layer =
    owner === "overlay"
      ? project.spine.overlays.find(({ id }) => id === layerId)
      : project.tiers.get(tierId)?.layers.find(({ id }) => id === layerId);
  if (!layer) throw new Error(`挂接图层不存在：${layerId}`);
  return layer;
}

function candidateBindingSummary(candidate: PopupImportReviewCandidate) {
  if (candidate.kind === "image-string")
    return "建议绑定：base / standard / bigwin / superwin / megawin";
  if (candidate.suggestedTierBindings?.length)
    return `建议绑定：${candidate.suggestedTierBindings
      .map(
        ({ tierId, countDurationSeconds, playback }) =>
          `${tierId}（总时长 ${countDurationSeconds}s；start 0–${playback.loopStartTime}s / loop ${playback.loopStartTime}–${playback.loopEndTime}s / end ${playback.loopEndTime}–${countDurationSeconds}s）`,
      )
      .join("；")}`;
  return "建议绑定：无（仅建立资源）";
}

function resourceImportNotice(
  project: PopupEditorProject,
  candidates: readonly PopupImportReviewCandidate[],
) {
  const unbound = candidates
    .filter(({ rootKey }) => resourceReferenceCount(project, rootKey) === 0)
    .map(({ rootKey }) => rootKey);
  if (project.type === "spine")
    return `资源导入成功。${unbound.length ? `尚未绑定：${unbound.join("、")}。` : "Spine 资源已绑定。"}`;
  const incompleteTiers = TIERS.filter(
    (tierId) => !project.tiers.get(tierId)?.layers.length,
  );
  const binding =
    unbound.length > 0
      ? `未绑定档位：${unbound.join("、")}。`
      : "建议绑定已应用。";
  const completion =
    incompleteTiers.length > 0
      ? `项目仍待配置：${incompleteTiers.join("、")}。`
      : "项目五档图层已完整。";
  return `资源导入成功。${binding}${completion}`;
}

function vniTimingSummary(
  project: PopupEditorProject,
  layer: Extract<PopupLayer, { kind: "vni" }>,
) {
  if (!layer.resource) return "";
  const resource = project.resources.get(layer.resource);
  if (!resource || resource.spec.kind !== "vni") return "";
  const bytes = project.assets.get(resource.spec.project)?.bytes;
  if (!bytes) return "";
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as {
      stage?: { duration?: unknown };
    };
    const duration = value.stage?.duration;
    if (typeof duration !== "number" || !Number.isFinite(duration)) return "";
    if (layer.playback.mode === "once")
      return `<p class="segment-summary"><strong>VNI 总时长 ${duration}s</strong><span>完整单次 0–${duration}s</span><span>完成后保持最后一帧</span></p>`;
    return `<p class="segment-summary"><strong>VNI 总时长 ${duration}s</strong><span>start 0–${layer.playback.loopStartTime}s</span><span>loop ${layer.playback.loopStartTime}–${layer.playback.loopEndTime}s</span><span>end ${layer.playback.loopEndTime}–${duration}s</span></p>`;
  } catch {
    return "";
  }
}
function projectMarkup(project: PopupEditorProject, errors: readonly string[]) {
  let manifest = "";
  try {
    manifest = JSON.stringify(projectToManifest(project), null, 2);
  } catch {
    manifest = "尚未形成合法 production manifest";
  }
  const amountInput = (
    field: keyof typeof project.amountFormat,
    type = "text",
  ) =>
    `<label>${field}<input data-project-field="${field}" type="${type}" value="${project.amountFormat[field]}" ${type === "checkbox" && project.amountFormat[field] ? "checked" : ""}/></label>`;
  const preset = detectPopupAmountFormatPreset(project.amountFormat);
  const idError = popupIdValidationError(project.id);
  const backdropStates = popupEditorVisibilityStates(project.type)
    .map(
      (state) =>
        `<label>${state}<input data-project-field="backdrop-state-${state}" type="checkbox" ${project.backdrop.visibleStates.includes(state) ? "checked" : ""}/></label>`,
    )
    .join("");
  const common = `<div class="project-actions"><button id="export-project">导出 Popup ZIP</button><button id="close-project">关闭项目</button></div><h2>项目</h2><p>格式 v${project.formatVersion} · ${project.type === "award-celebration" ? "获奖庆祝" : "Spine 弹窗"}</p><label>项目名<input data-project-field="project-name" value="${project.name}"/></label><label class="field-stack">project id<input id="project-id" value="${project.id}" aria-invalid="${String(Boolean(idError))}" aria-describedby="project-id-error" class="${idError ? "invalid" : ""}"/><small id="project-id-error" class="field-error" ${idError ? "" : "hidden"}>${idError}</small></label><h3>重点区域</h3><p>以 Popup 原点为基准向四边扩展；坐标平面无边界，预览中的绿色框显示必须完整可见的区域。</p><div class="threshold-grid">${(["left", "right", "top", "bottom"] as const).map((side) => `<label>${side}<input data-project-field="focus-${side}" type="number" min="0.001" step="1" value="${project.adaptation.focus[side]}"/></label>`).join("")}</div><h3>全屏压暗底</h3><label><input data-project-field="backdrop-enabled" type="checkbox" ${project.backdrop.enabled ? "checked" : ""}/>启用</label><label>颜色<input data-project-field="backdrop-color" type="color" value="${project.backdrop.color}"/></label><label>透明度<input data-project-field="backdrop-alpha" type="number" min="0" max="1" step="0.05" value="${project.backdrop.alpha}"/></label><div class="threshold-grid">${backdropStates}</div>`;
  const commonWithColorEditor = common.replace(
    `<label>颜色<input data-project-field="backdrop-color" type="color" value="${project.backdrop.color}"/></label>`,
    `<label>颜色<span class="color-control"><input type="color" data-project-color-picker="backdrop-color" value="${project.backdrop.color.slice(0, 7)}"/><input data-project-field="backdrop-color" type="text" value="${project.backdrop.color}"/></span></label>`,
  );
  const amount =
    project.type === "award-celebration"
      ? `<h3>金额合同</h3><label>preset<select id="amount-format-preset"><option value="integer" ${preset === "integer" ? "selected" : ""}>纯数字整数（raw 100 → 100）</option><option value="decimal" ${preset === "decimal" ? "selected" : ""}>纯数字两位小数（raw 100 → 1.00）</option><option value="custom" ${preset === "custom" ? "selected" : ""}>自定义</option></select></label><p class="preset-help">整数预设使用 rawScale=1，只要求 glyph 0–9；两位小数预设使用 rawScale=100，要求 glyph 0–9 和 .。两者均不输出货币符号或千分位。</p>${amountInput("rawScale", "number")}${amountInput("fractionDigits", "number")}${amountInput("useGrouping", "checkbox")}${amountInput("groupSeparator")}${amountInput("decimalSeparator")}${amountInput("prefix")}${amountInput("suffix")}<p>rounding: floor（strict contract）</p>`
      : "";
  const audio = `<h3>音效</h3><p>音效在“动画 / 档位”页的具体状态中配置；每个状态可添加多条。局部名称在导入 Game Layout 后由 Popup binding 名聚合，例如 award.coin。</p><p>当前共 ${project.audio.cues.length} 条状态音效。</p>`;
  return `${commonWithColorEditor}${amount}${audio}<h3>配置 diagnostics</h3><pre>${errors.join("\n") || "通过"}</pre><h3>Production manifest preview</h3><pre>${manifest}</pre>`;
}

function popupStateAudioMarkup(
  project: PopupEditorProject,
  target: PopupAudioCueV1["target"],
  title: string,
): string {
  const targetKey = popupAudioTargetKey(target);
  const effects = new Map(
    project.audio.effects.map((effect) => [effect.name, effect]),
  );
  const cards = project.audio.cues
    .filter((cue) => popupAudioTargetKey(cue.target) === targetKey)
    .map((cue) => effects.get(cue.effect))
    .filter((effect) => Boolean(effect))
    .map(
      (effect) =>
        `<article class="card" data-popup-audio-card="${effect!.name}"><code>${effect!.name}</code><label>播放<select data-popup-audio-field="playback" data-popup-audio-name="${effect!.name}" data-popup-audio-target="${targetKey}"><option value="once" ${effect!.playback === "once" ? "selected" : ""}>once</option><option value="loop" ${effect!.playback === "loop" ? "selected" : ""}>loop</option></select></label><label>延迟秒<input type="number" min="0" step="0.01" value="${effect!.offsetSeconds}" data-popup-audio-field="offsetSeconds" data-popup-audio-name="${effect!.name}" data-popup-audio-target="${targetKey}"></label><label>BGM<select data-popup-audio-field="bgm" data-popup-audio-name="${effect!.name}" data-popup-audio-target="${targetKey}"><option value="keep" ${effect!.bgm.kind === "keep" ? "selected" : ""}>keep</option><option value="duck" ${effect!.bgm.kind === "duck" ? "selected" : ""}>duck</option><option value="pause" ${effect!.bgm.kind === "pause" ? "selected" : ""}>pause</option></select></label><button type="button" data-remove-popup-audio-cue="${effect!.name}" data-popup-audio-target="${targetKey}">删除</button></article>`,
    )
    .join("");
  return `<section class="audio-config state-audio-config"><h4>${title}</h4><p>进入此状态时按各自延迟触发。</p>${cards || "<p>尚未配置音效。</p>"}<label>添加音效<input data-import-popup-audio data-popup-audio-target="${targetKey}" type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/aac,audio/webm" multiple></label></section>`;
}

function popupAudioTargetKey(target: PopupAudioCueV1["target"]): string {
  return target.kind === "segment"
    ? `segment:${target.segment}`
    : `award-tier:${target.tier}`;
}

function parsePopupAudioTarget(
  type: PopupEditorProject["type"],
  value: string,
): PopupAudioCueV1["target"] {
  const [kind, state, extra] = value.split(":");
  if (extra !== undefined) throw new Error(`未知 Popup 音效状态：${value}`);
  if (
    type === "spine" &&
    kind === "segment" &&
    (state === "start" || state === "loop" || state === "end")
  )
    return { kind, segment: state };
  if (
    type === "award-celebration" &&
    kind === "award-tier" &&
    TIERS.includes(state as AwardTierId)
  )
    return { kind, tier: state as AwardTierId };
  throw new Error(`Popup 类型不支持音效状态：${value}`);
}

function allocatePopupAudioName(
  names: ReadonlySet<string>,
  base: string,
): string {
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function ensureOwnedPopupAudioEffect(
  project: PopupEditorProject,
  effectName: string,
  target: PopupAudioCueV1["target"],
): string {
  const references = project.audio.cues.filter(
    (cue) => cue.effect === effectName,
  );
  if (references.length <= 1) return effectName;
  const source = project.audio.effects.find(
    (effect) => effect.name === effectName,
  );
  if (!source) throw new Error(`Popup 音效不存在：${effectName}`);
  const ownedName = allocatePopupAudioName(
    new Set(project.audio.effects.map((effect) => effect.name)),
    `${effectName}-${popupAudioTargetKey(target).replace(":", "-")}`,
  );
  const targetKey = popupAudioTargetKey(target);
  project.audio = {
    ...project.audio,
    effects: [
      ...project.audio.effects,
      { ...structuredClone(source), name: ownedName },
    ],
    cues: project.audio.cues.map((cue) =>
      cue.effect === effectName && popupAudioTargetKey(cue.target) === targetKey
        ? { ...cue, effect: ownedName }
        : cue,
    ),
  };
  return ownedName;
}

function popupIdValidationError(value: string): string {
  try {
    validatePopupId(value, "project id");
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function syncProjectIdValidity(input: HTMLInputElement): void {
  const error = popupIdValidationError(input.value);
  input.classList.toggle("invalid", Boolean(error));
  input.setAttribute("aria-invalid", String(Boolean(error)));
  input.setCustomValidity(error);
  const output =
    input.ownerDocument.querySelector<HTMLElement>("#project-id-error");
  if (!output) return;
  output.textContent = error;
  output.hidden = !error;
}

import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import { normalizeEditorPackageZipEntries } from "@slotclientengine/editorresource";
import { formatPopupAmount } from "@slotclientengine/rendercore/popup";
import type {
  AwardTierId,
  PopupLayer,
  PopupOverlayLayer,
} from "@slotclientengine/rendercore/popup";
import {
  addLayer,
  applyImportedResourceBindings,
  clonePopupEditorProject,
  createPopupAmountFormat,
  detectPopupAmountFormatPreset,
  getPopupVniTextLayerTargets,
  removePopupResource,
  PopupEditorStore,
  projectToManifest,
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
      this.renderWorkspace(project);
    });
    this.renderWorkspace(this.#store.project);
  }
  destroy() {
    this.#preview?.destroy();
  }
  private renderWorkspace(project: PopupEditorProject) {
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-tab]")
      .forEach((button) => {
        const active = button.dataset.tab === this.#tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    const host = this.required("workspace");
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
  private bindGlobal() {
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-tab]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#tab = button.dataset.tab as "resources" | "tiers" | "project";
          this.renderWorkspace(this.#store.project);
        }),
      );
    this.required("preview-build").addEventListener(
      "click",
      () =>
        void this.action(async () =>
          this.#preview!.rebuild(this.#store.project),
        ),
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
    const previewPrompt = this.required<HTMLInputElement>("preview-prompt");
    previewPrompt.addEventListener("change", () =>
      this.#preview?.setPromptText(
        previewPrompt.value.length ? previewPrompt.value : undefined,
      ),
    );
    const nodeKind = this.required<HTMLSelectElement>("preview-node-kind");
    const nodeSelector = this.required<HTMLInputElement>(
      "preview-node-selector",
    );
    const nodeText = this.required<HTMLInputElement>("preview-node-text");
    const selectorValue = () =>
      /^\d+$/u.test(nodeSelector.value)
        ? Number(nodeSelector.value)
        : nodeSelector.value;
    this.required("preview-node-apply").addEventListener("click", () =>
      this.safe(() =>
        this.#preview!.setNodeText(
          nodeKind.value as "text" | "image-string",
          selectorValue(),
          nodeText.value,
        ),
      ),
    );
    this.required("preview-node-reset").addEventListener("click", () =>
      this.safe(() =>
        this.#preview!.resetNodeText(
          nodeKind.value as "text" | "image-string",
          selectorValue(),
        ),
      ),
    );
    this.required("preview-advance").addEventListener("click", () =>
      this.#preview?.advance(),
    );
    this.required("preview-dismiss").addEventListener("click", () =>
      this.#preview?.dismiss(),
    );
    this.required("preview-clear").addEventListener("click", () =>
      this.#preview?.dismissImmediately(),
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
    const files = this.#root.querySelector<HTMLInputElement>("#import-assets");
    files?.addEventListener(
      "change",
      () => void this.reviewFiles([...(files.files ?? [])]),
    );
    this.#root
      .querySelector<HTMLButtonElement>("#export-project")
      ?.addEventListener("click", () => void this.exportProject());
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-tier]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#tier = button.dataset.tier as AwardTierId;
          this.renderWorkspace(project);
        }),
      );
    const promptEnabled = this.#root.querySelector<HTMLInputElement>(
      "#spine-prompt-enabled",
    );
    promptEnabled?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.spine.prompt.enabled = promptEnabled.checked;
      }),
    );
    const promptFont =
      this.#root.querySelector<HTMLSelectElement>("#spine-prompt-font");
    promptFont?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.spine.prompt.font = promptFont.value || null;
      }),
    );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-spine-prompt-field]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const field = input.dataset.spinePromptField!;
            if (["defaultText", "fill"].includes(field))
              (draft.spine.prompt as any)[field] = input.value;
            else if (field === "order")
              draft.spine.prompt.order = Number(input.value);
            else (draft.spine.prompt.area as any)[field] = Number(input.value);
          }),
        ),
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
              !["image", "font", "image-string", "spine", "vni"].includes(
                resource.kind,
              )
            )
              throw new Error(
                "请选择 image、font、ImgNumber、Spine 或 VNI overlay resource。",
              );
            const order = draft.spine.overlays.length
              ? Math.max(...draft.spine.overlays.map((item) => item.order)) + 1
              : 0;
            const base = {
              id: `overlay-${order}`,
              order,
              resource: resource.rootKey,
              transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            };
            const overlay: PopupOverlayLayer =
              resource.kind === "image"
                ? {
                    ...base,
                    kind: "image",
                    anchor: { x: 0.5, y: 0.5 },
                    visibleSegments: ["start", "loop", "end"],
                  }
                : resource.kind === "image-string"
                  ? {
                      ...base,
                      kind: "image-string",
                      name: `imgnumber-${order}`,
                      binding: "manual",
                      defaultText: "0",
                      anchor: { x: 0.5, y: 0.5 },
                      visibleSegments: ["start", "loop", "end"],
                    }
                  : resource.kind === "font"
                    ? {
                        ...base,
                        kind: "text",
                        name: `text-${order}`,
                        defaultText: "CONGRATULATIONS!",
                        anchor: { x: 0.5, y: 0.5 },
                        style: {
                          fontSize: 72,
                          letterSpacing: 0,
                          fill: { kind: "solid", color: "#ffffff" },
                          stroke: { color: "#a40000", width: 6 },
                          shadow: {
                            color: "#000000",
                            alpha: 0.65,
                            blur: 4,
                            distance: 6,
                            angleDegrees: 90,
                          },
                          arcDegrees: 0,
                        },
                        visibleSegments: ["start", "loop", "end"],
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
      .querySelectorAll<HTMLButtonElement>("[data-delete-overlay]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.#store.transact((draft) => {
            draft.spine.overlays = draft.spine.overlays.filter(
              ({ id }) => id !== button.dataset.deleteOverlay,
            );
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-overlay-field]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const overlay = draft.spine.overlays.find(
              ({ id }) => id === input.dataset.overlayId,
            );
            if (!overlay) throw new Error("overlay 不存在。");
            const field = input.dataset.overlayField!;
            if (["x", "y", "scale", "rotation"].includes(field))
              (overlay.transform as any)[field] = Number(input.value);
            else if (field === "order")
              (overlay as any).order = Number(input.value);
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
            else if (field.startsWith("segment-")) {
              const segments = new Set((overlay as any).visibleSegments);
              const segment = field.slice("segment-".length);
              input.checked ? segments.add(segment) : segments.delete(segment);
              (overlay as any).visibleSegments = [
                "start",
                "loop",
                "end",
              ].filter((item) => segments.has(item));
            }
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-overlay-fill-kind]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const overlay = draft.spine.overlays.find(
              ({ id }) => id === select.dataset.overlayFillKind,
            );
            if (!overlay || overlay.kind !== "text")
              throw new Error("系统文字 overlay 不存在。");
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
            tier.layers = tier.layers.filter(
              (layer) => layer.id !== button.dataset.deleteLayer,
            );
          }),
        ),
      );
    const duration =
      this.#root.querySelector<HTMLInputElement>("#tier-duration");
    duration?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.tiers.get(this.#tier)!.countDurationSeconds = Number(
          duration.value,
        );
      }),
    );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-threshold-tier]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.#store.transact((draft) => {
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
        input.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const tier = draft.tiers.get(this.#tier)!;
            const layer = tier.layers.find(
              (item) => item.id === input.dataset.layerId,
            )!;
            const field = input.dataset.layerField!;
            if (["x", "y", "scale", "rotation"].includes(field))
              (layer.transform as any)[field] = Number(input.value);
            else if (field === "order")
              (layer as any).order = Number(input.value);
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
            else if (field.startsWith("segment-")) {
              const segment = field.slice("segment-".length);
              const segments = new Set((layer as any).visibleSegments);
              input.checked ? segments.add(segment) : segments.delete(segment);
              (layer as any).visibleSegments = ["start", "loop", "end"].filter(
                (item) => segments.has(item),
              );
            }
          }),
        ),
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
              throw new Error("系统文字 layer 不存在。");
            setTextFillKind(layer as any, select.value);
          }),
        ),
      );
    this.#root
      .querySelectorAll<HTMLSelectElement>("[data-image-string-parent]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const layer = draft.tiers
              .get(this.#tier)!
              .layers.find((item) => item.id === select.dataset.layerId);
            if (!layer || layer.kind !== "image-string")
              throw new Error("ImgNumber layer 不存在。");
            if (select.value === "popup-root") {
              (layer as any).parent = { kind: "popup-root" };
              return;
            }
            const [vniLayerId, textLayerId] = select.value
              .split(":", 2)
              .map(decodeURIComponent);
            if (!vniLayerId || !textLayerId)
              throw new Error("VNI 文字层选择无效。");
            (layer as any).parent = {
              kind: "vni-text-layer",
              vniLayerId,
              textLayerId,
            };
          }),
        ),
      );
    const id = this.#root.querySelector<HTMLInputElement>("#project-id");
    id?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.id = id.value;
      }),
    );
    const projectType =
      this.#root.querySelector<HTMLSelectElement>("#project-type");
    projectType?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.type = projectType.value as "award-celebration" | "spine";
      }),
    );
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
          this.#store.transact((draft) => {
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
      .querySelectorAll<HTMLInputElement>("[data-project-field]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.#store.transact((draft) => {
            const field = input.dataset.projectField!;
            if (field === "viewport-width" || field === "viewport-height")
              draft.designViewport[
                field === "viewport-width" ? "width" : "height"
              ] = Number(input.value);
            else {
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
  private async reviewFiles(files: readonly File[]) {
    await this.action(async () => {
      if (files.length === 1 && files[0]!.name.toLowerCase().endsWith(".zip")) {
        const bytes = new Uint8Array(await files[0]!.arrayBuffer());
        const entries = normalizeEditorPackageZipEntries(
          extractBoundedZip(bytes, { limits: POPUP_ZIP_LIMITS }),
          ["popup.manifest.json", "image-string.manifest.json"],
        );
        if (entries.has("popup.manifest.json")) {
          const imported = await importPopupZip(bytes);
          if (
            globalThis.window?.confirm?.(
              `导入资源审查\n${files[0]!.name} · popup project · ${files[0]!.size} bytes\n\n确认原子替换当前项目？`,
            ) !== false
          )
            this.#store.replace(imported);
          return;
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
      `<pre>${transaction.assets.items.map((item) => `${item.targetKey} · ${item.action}${item.references.length ? ` · 影响 ${item.references.map(({ location }) => location).join(", ")}` : ""}`).join("\n")}</pre>`;
    this.required("review-confirm").onclick = () =>
      void this.action(async () => {
        const draft = clonePopupEditorProject(this.#store.project);
        await commitImportReview(draft, candidates);
        if (draft.type === "award-celebration")
          for (const candidate of candidates)
            applyImportedResourceBindings(
              draft,
              candidate.rootKey,
              candidate.suggestedTierBindings,
            );
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
  return `<header><h1>Popup Editor</h1><nav class="primary-tabs" role="tablist" aria-label="编辑区域"><button role="tab" data-tab="resources">资源</button><button role="tab" data-tab="tiers">动画 / 档位</button><button role="tab" data-tab="project">项目</button></nav></header><main><section class="left"><div id="workspace" role="tabpanel"></div><pre id="diagnostics"></pre></section><aside><div class="preview-controls"><select id="preview-resolution"><option value="1920x1080">1920×1080</option><option value="1080x1920" selected>1080×1920</option><option value="2000x2000">2000×2000</option><option value="custom">custom</option></select><label>width<input id="preview-width" type="number" min="1" value="1080"/></label><label>height<input id="preview-height" type="number" min="1" value="1920"/></label><select id="preview-zoom"><option value="fit">fit</option>${[0.25, 0.5, 0.75, 1, 1.5, 2].map((v) => `<option value="${v}">${v * 100}%</option>`)}</select><label><input id="preview-guides" type="checkbox" checked/>guides</label><label>bet raw<input id="preview-bet" type="number" value="100"/></label><label>win raw<input id="preview-win" type="number" value="5000"/></label><label>Prompt preview（留空用默认）<input id="preview-prompt" value=""/></label><label>小数位数（仅预览）<input id="preview-fraction-digits" type="number" min="0" max="6" step="1" value="0"/></label><label><input id="preview-use-grouping" type="checkbox"/>千位分隔（仅预览）</label><button id="preview-build">Build preview</button><button id="preview-play">Play / Replay</button><label>节点类型<select id="preview-node-kind"><option value="text">系统文字</option><option value="image-string">ImgNumber</option></select></label><label>节点 name 或 index<input id="preview-node-selector" value="congratulations"/></label><label>节点预览 string<input id="preview-node-text" value="CONGRATULATIONS!"/></label><button id="preview-node-apply">Set string</button><button id="preview-node-reset">Reset string</button><button id="preview-advance">Advance</button><button id="preview-dismiss">Click / Dismiss</button><button id="preview-clear">Dismiss immediately</button></div><div id="preview-canvas"></div><output id="preview-status"></output></aside></main><dialog id="vni-runtime-choice"><h2>选择 VNI runtime</h2><p id="vni-runtime-description"></p><label class="vni-runtime-options">运行版本<select id="vni-runtime-select"></select></label><button id="vni-runtime-confirm">确认 runtime</button><button id="vni-runtime-cancel">取消导入</button></dialog><dialog id="import-review"><h2>Import review</h2><div id="review-body"></div><button id="review-confirm">确认导入</button><button id="review-cancel">取消</button></dialog>`;
}
function resourcesMarkup(project: PopupEditorProject) {
  return `<section class="resource-import-panel"><h2>扁平资源库</h2><p>图片、字体、Spine、VNI、ImgNumber ZIP 与 Popup ZIP 统一从这里导入；filename key 保留原始拼写，同名不同 bytes 默认覆盖。普通资源导入只入库，不会根据文件名猜测用途；请在导入后到“动画 / 档位”页显式绑定。</p><div class="resource-actions"><label class="file-action">导入资源<input id="import-assets" type="file" accept="image/png,image/webp,image/jpeg,.json,.atlas,.zip,.woff2,.woff,.ttf,.otf" multiple/></label></div></section><div class="resource-list">${[...project.resources.values()].map((resource) => `<article class="card"><strong>${resource.rootKey}</strong><span>${resource.kind}</span><details><summary>${resource.keys.length} filename keys</summary><code>${resource.keys.join("\n")}</code></details><span>${resourceReferenceCount(project, resource.rootKey)} 个图层绑定</span><button data-delete-resource="${resource.rootKey}">删除</button></article>`).join("") || '<p class="empty-state">尚无资源</p>'}</div>`;
}

function spineMarkup(project: PopupEditorProject) {
  const resources = [...project.resources.values()].filter(
    (resource) => resource.spec.kind === "spine",
  );
  const animations = spineAnimationNames(project);
  const fonts = [...project.resources.values()].filter(
    (resource) => resource.kind === "font",
  );
  const overlayResources = [...project.resources.values()].filter((resource) =>
    ["image", "font", "image-string", "spine", "vni"].includes(resource.kind),
  );
  const animationSelect = (
    field: "startAnimation" | "loopAnimation" | "endAnimation",
    label: string,
  ) => {
    const selected = project.spine.playback[field];
    return `<label>${label}<select data-spine-popup-field="${field}"><option value="">请选择动画</option>${animations.map((name) => `<option value="${name}" ${name === selected ? "selected" : ""}>${name}</option>`).join("")}</select></label>`;
  };
  const prompt = project.spine.prompt;
  return `<section class="tier-editor"><h2>普通 Spine 弹窗</h2><p>播放 start 后进入 loop；用户点击会锁存关闭请求，并在当前 loop 播放到边界后进入 end。</p><label>Spine 资源<select id="spine-resource"><option value="">请选择资源</option>${resources.map((resource) => `<option value="${resource.rootKey}" ${resource.rootKey === project.spine.resource ? "selected" : ""}>${resource.rootKey}</option>`).join("")}</select></label><div class="threshold-grid">${(["x", "y", "scale"] as const).map((field) => `<label>${field}<input data-spine-popup-field="${field}" type="number" step="0.1" value="${project.spine.transform[field]}"/></label>`).join("")}</div>${animationSelect("startAnimation", "开始动画")}${animationSelect("loopAnimation", "循环动画")}${animationSelect("endAnimation", "结束动画")}<p class="segment-summary">${project.spine.resource ? (animations.length ? `已从 skeleton JSON 读取 ${animations.length} 个动画。` : "所选 skeleton JSON 没有可用动画。") : "导入并选择一组 Spine JSON、atlas 与 PNG 后配置动画。"}</p><h3>单行点击提示</h3><label><input id="spine-prompt-enabled" type="checkbox" ${prompt.enabled ? "checked" : ""}/>启用提示</label><label>字体<select id="spine-prompt-font"><option value="">请选择字体</option>${fonts.map((font) => `<option value="${font.rootKey}" ${font.rootKey === prompt.font ? "selected" : ""}>${font.rootKey}</option>`).join("")}</select></label><label>默认文案<input data-spine-prompt-field="defaultText" value="${prompt.defaultText}"/></label><label>颜色<input data-spine-prompt-field="fill" value="${prompt.fill}"/></label><div class="threshold-grid">${(["order", "x", "y", "width", "height"] as const).map((field) => `<label>${field}<input data-spine-prompt-field="${field}" type="number" step="0.1" value="${field === "order" ? prompt.order : prompt.area[field]}"/></label>`).join("")}</div><p>文字始终单行，根据区域自动缩放；进入 end 时隐藏。</p><h3>Overlay 图层</h3><div class="layer-add"><select id="spine-overlay-resource">${overlayResources.map((resource) => `<option value="${resource.rootKey}">${resource.rootKey} (${resource.kind})</option>`).join("")}</select><button id="add-spine-overlay" ${overlayResources.length ? "" : "disabled"}>添加 overlay</button></div>${project.spine.overlays.map(overlayMarkup).join("")}</section>`;
}

function overlayMarkup(layer: PopupOverlayLayer) {
  const input = (field: string, value: string | number, type = "number") =>
    `<label>${field}<input data-overlay-id="${layer.id}" data-overlay-field="${field}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${value}"/></label>`;
  const playback =
    layer.kind === "image"
      ? `${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${(["start", "loop", "end"] as const).map((segment) => `<label>${segment}<input data-overlay-id="${layer.id}" data-overlay-field="segment-${segment}" type="checkbox" ${layer.visibleSegments.includes(segment) ? "checked" : ""}/></label>`).join("")}`
      : layer.kind === "image-string"
        ? `${input("name", layer.name, "text")}${input("defaultText", layer.defaultText, "text")}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${segmentControls("overlay", layer.id, layer.visibleSegments)}`
        : layer.kind === "text"
          ? `${input("name", layer.name, "text")}${input("defaultText", layer.defaultText, "text")}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${textStyleMarkup("overlay", layer.id, layer.style)}${segmentControls("overlay", layer.id, layer.visibleSegments)}`
          : layer.kind === "spine"
            ? (["startAnimation", "loopAnimation", "endAnimation"] as const)
                .map((field) => input(field, layer.playback[field], "text"))
                .join("")
            : `${`<label>mode<select data-overlay-vni-mode="${layer.id}"><option value="segmented" ${layer.playback.mode === "segmented" ? "selected" : ""}>segmented</option><option value="once" ${layer.playback.mode === "once" ? "selected" : ""}>once</option></select></label>`}${
                layer.playback.mode === "segmented"
                  ? `${input("loopStartTime", layer.playback.loopStartTime)}${input("loopEndTime", layer.playback.loopEndTime)}<label>keepParticlesAlive<input data-overlay-id="${layer.id}" data-overlay-field="keepParticlesAlive" type="checkbox" ${layer.playback.keepParticlesAlive ? "checked" : ""}/></label>`
                  : `<p>VNI once</p>`
              }`;
  return `<article class="card"><strong>${layer.id}</strong><span>${layer.kind} / ${layer.resource}</span>${input("order", layer.order)}${(["x", "y", "scale", "rotation"] as const).map((field) => input(field, layer.transform[field])).join("")}${playback}<button data-delete-overlay="${layer.id}">删除 overlay</button></article>`;
}

function segmentControls(
  owner: "overlay" | "layer",
  id: string,
  segments: readonly string[],
) {
  const idAttribute = owner === "overlay" ? "data-overlay-id" : "data-layer-id";
  const fieldAttribute =
    owner === "overlay" ? "data-overlay-field" : "data-layer-field";
  return (["start", "loop", "end"] as const)
    .map(
      (segment) =>
        `<label>${segment}<input ${idAttribute}="${id}" ${fieldAttribute}="segment-${segment}" type="checkbox" ${segments.includes(segment) ? "checked" : ""}/></label>`,
    )
    .join("");
}

function updateTextStyleField(
  layer: Extract<PopupOverlayLayer | PopupLayer, { kind: "text" }>,
  field: string,
  input: HTMLInputElement,
): boolean {
  const mutable = layer as any;
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
    mutable.style.stroke = input.checked
      ? (mutable.style.stroke ?? { color: "#000000", width: 4 })
      : undefined;
    return true;
  }
  if (field === "shadowEnabled") {
    mutable.style.shadow = input.checked
      ? (mutable.style.shadow ?? {
          color: "#000000",
          alpha: 0.6,
          blur: 4,
          distance: 6,
          angleDegrees: 90,
        })
      : undefined;
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
  return `${input("fontSize", style.fontSize)}${input("letterSpacing", style.letterSpacing)}${input("arcDegrees", style.arcDegrees)}<label>fill<select ${fillKindAttribute}="${id}"><option value="solid" ${style.fill.kind === "solid" ? "selected" : ""}>纯色</option><option value="linear-gradient" ${style.fill.kind === "linear-gradient" ? "selected" : ""}>线性渐变</option></select></label>${input("fillColor", style.fill.kind === "solid" ? style.fill.color : style.fill.stops[0]!.color, "text")}${input("gradientEndColor", gradient.stops.at(-1)!.color, "text")}${input("gradientAngle", gradient.angleDegrees)}<label><input ${idAttribute}="${id}" ${fieldAttribute}="strokeEnabled" type="checkbox" ${style.stroke ? "checked" : ""}/>描边</label>${input("strokeColor", style.stroke?.color ?? "#000000", "text")}${input("strokeWidth", style.stroke?.width ?? 0)}<label><input ${idAttribute}="${id}" ${fieldAttribute}="shadowEnabled" type="checkbox" ${style.shadow ? "checked" : ""}/>投影</label>${input("shadowColor", style.shadow?.color ?? "#000000", "text")}${input("shadowAlpha", style.shadow?.alpha ?? 0.6)}${input("shadowBlur", style.shadow?.blur ?? 4)}${input("shadowDistance", style.shadow?.distance ?? 6)}${input("shadowAngle", style.shadow?.angleDegrees ?? 90)}`;
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
  return `<nav class="tier-tabs" role="tablist" aria-label="获奖档位">${TIERS.map((id) => `<button role="tab" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}" data-tier="${id}" class="${id === active ? "active" : ""}"><span>${id}</span><small>${project.tiers.get(id)!.layers.length} 层</small></button>`).join("")}</nav><section class="tier-contract"><h2>累计档位合同</h2><p>base：0 &lt; win ≤ 1×bet；standard：1×bet &lt; win &lt; bigwin。达到某个阈值时进入该档，已达到的前序档位会依次累计播放。</p><div class="threshold-grid">${(["bigwin", "superwin", "megawin"] as const).map((id) => `<label><span>${id}</span><input data-threshold-tier="${id}" type="number" min="2" step="1" value="${project.tiers.get(id)!.thresholdMultiplier}"/><small>× bet</small></label>`).join("")}</div><p class="contract-example">当前倍数边界：1× / ${project.tiers.get("bigwin")!.thresholdMultiplier}× / ${project.tiers.get("superwin")!.thresholdMultiplier}× / ${project.tiers.get("megawin")!.thresholdMultiplier}×；等于阈值时进入对应档。</p><p id="tier-boundaries" class="raw-boundaries">${tierBoundarySummary(project, betRaw)}</p></section><section class="tier-editor"><h2>${active}</h2><p class="layer-order-help">order 数值越小越靠下，只控制当前档位内的图层顺序。</p><label>金额计数时长<input id="tier-duration" type="number" step="0.1" min="0" value="${tier.countDurationSeconds}"/><small>秒</small></label><div class="layer-add"><select id="layer-resource">${[...project.resources.values()].map((resource) => `<option value="${resource.rootKey}">${resource.rootKey} (${resource.kind})</option>`)}</select><button data-add-layer ${project.resources.size ? "" : "disabled"}>新增 / 切换图层</button></div>${tier.layers.map((layer) => layerMarkup(layer, project, active)).join("")}</section>`;
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
          ? `${input("name", layer.name ?? "win-amount", "text")}${layer.binding === "manual" ? input("defaultText", layer.defaultText ?? "", "text") : ""}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${imageStringParentMarkup(layer, project, tierId)}${layer.binding === "manual" ? segmentControls("layer", layer.id, layer.visibleSegments ?? ["start", "loop", "end"]) : '<p class="amount-layer-note">win-amount 全程显示；五档共享一个 runtime，跨档只切换 resource、transform 和文本。</p>'}`
          : layer.kind === "text"
            ? `${input("name", layer.name, "text")}${input("defaultText", layer.defaultText, "text")}${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${textStyleMarkup("layer", layer.id, layer.style)}${segmentControls("layer", layer.id, layer.visibleSegments)}`
            : `${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${(["start", "loop", "end"] as const).map((segment) => `<label>${segment}<input data-layer-id="${layer.id}" data-layer-field="segment-${segment}" type="checkbox" ${layer.visibleSegments.includes(segment) ? "checked" : ""}/></label>`).join("")}`;
  return `<article class="card"><strong>${layer.id}</strong><span>${layer.kind} / ${layer.resource}</span>${input("order", layer.order)}${(["x", "y", "scale"] as const).map((field) => input(field, layer.transform[field])).join("")}${layer.kind === "text" || layer.kind === "image-string" ? input("rotation", layer.transform.rotation ?? 0) : ""}${playback}<button data-delete-layer="${layer.id}">删除图层</button></article>`;
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

function imageStringParentMarkup(
  layer: Extract<PopupLayer, { kind: "image-string" }>,
  project: PopupEditorProject,
  tierId: AwardTierId,
) {
  let targets: ReturnType<typeof getPopupVniTextLayerTargets> = [];
  try {
    targets = getPopupVniTextLayerTargets(project, tierId);
  } catch {
    // Diagnostics reports the concrete VNI parse failure.
  }
  const selected =
    layer.parent.kind === "popup-root"
      ? "popup-root"
      : `${encodeURIComponent(layer.parent.vniLayerId)}:${encodeURIComponent(layer.parent.textLayerId)}`;
  const options = [
    `<option value="popup-root">Popup 根节点</option>`,
    ...targets.map(({ vniLayerId, textLayerId, textLayerName }) => {
      const value = `${encodeURIComponent(vniLayerId)}:${encodeURIComponent(textLayerId)}`;
      return `<option value="${value}" ${value === selected ? "selected" : ""}>${vniLayerId} / ${textLayerName} (${textLayerId})</option>`;
    }),
  ];
  return `<label>父节点<select data-image-string-parent data-layer-id="${layer.id}">${options.join("")}</select></label><p class="amount-layer-note">选择 VNI 文字层后，x/y/scale 相对该文字层；渲染顺序由 VNI 文字层决定。</p>`;
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
  const common = `<div class="project-actions"><button id="export-project">导出 Popup ZIP</button></div><h2>项目</h2><label>弹窗类型<select id="project-type"><option value="award-celebration" ${project.type === "award-celebration" ? "selected" : ""}>获奖庆祝</option><option value="spine" ${project.type === "spine" ? "selected" : ""}>普通 Spine</option></select></label><label>project id<input id="project-id" value="${project.id}"/></label><label>viewport width<input data-project-field="viewport-width" type="number" value="${project.designViewport.width}"/></label><label>viewport height<input data-project-field="viewport-height" type="number" value="${project.designViewport.height}"/></label>`;
  const amount =
    project.type === "award-celebration"
      ? `<h3>金额合同</h3><label>preset<select id="amount-format-preset"><option value="integer" ${preset === "integer" ? "selected" : ""}>纯数字整数（raw 100 → 100）</option><option value="decimal" ${preset === "decimal" ? "selected" : ""}>纯数字两位小数（raw 100 → 1.00）</option><option value="custom" ${preset === "custom" ? "selected" : ""}>自定义</option></select></label><p class="preset-help">整数预设使用 rawScale=1，只要求 glyph 0–9；两位小数预设使用 rawScale=100，要求 glyph 0–9 和 .。两者均不输出货币符号或千分位。</p>${amountInput("rawScale", "number")}${amountInput("fractionDigits", "number")}${amountInput("useGrouping", "checkbox")}${amountInput("groupSeparator")}${amountInput("decimalSeparator")}${amountInput("prefix")}${amountInput("suffix")}<p>rounding: floor（strict contract）</p>`
      : "";
  return `${common}${amount}<h3>配置 diagnostics</h3><pre>${errors.join("\n") || "通过"}</pre><h3>Production manifest preview</h3><pre>${manifest}</pre>`;
}

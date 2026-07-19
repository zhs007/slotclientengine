import {
  addLayer,
  removeLogicalResource,
  PopupEditorStore,
  projectToManifest,
  resourceReferenceCount,
  type PopupEditorProject,
} from "../model/project.js";
import {
  commitImportReview,
  discoverPopupResources,
  replaceResourceFromReview,
  type PopupImportReviewCandidate,
} from "../io/resource-import.js";
import { exportPopupZip, importPopupZip } from "../io/popup-zip.js";
import { PopupPreview } from "../preview/popup-preview.js";
import type {
  AwardTierId,
  PopupLayer,
} from "@slotclientengine/rendercore/popup";

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
  #errors: readonly string[] = [];
  #notice = "";
  constructor(root: HTMLElement) {
    this.#root = root;
  }
  async init() {
    this.#root.innerHTML = shell();
    this.bindGlobal();
    this.#preview = new PopupPreview(
      this.required("preview-canvas"),
      this.required("preview-status"),
    );
    await this.#preview.init();
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
    const host = this.required("workspace");
    host.innerHTML =
      this.#tab === "resources"
        ? resourcesMarkup(project)
        : this.#tab === "tiers"
          ? tiersMarkup(project, this.#tier)
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
    const files = this.required<HTMLInputElement>("upload-files");
    const folder = this.required<HTMLInputElement>("upload-folder");
    files.addEventListener(
      "change",
      () => void this.reviewFiles([...(files.files ?? [])], "files"),
    );
    folder.addEventListener(
      "change",
      () => void this.reviewFiles([...(folder.files ?? [])], "directory"),
    );
    this.required<HTMLInputElement>("import-project").addEventListener(
      "change",
      (event) =>
        void this.importProject(
          (event.currentTarget as HTMLInputElement).files?.[0],
        ),
    );
    this.required("export-project").addEventListener(
      "click",
      () => void this.exportProject(),
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
    const sync = () =>
      this.#preview?.setInput(Number(bet.value), Number(win.value));
    bet.addEventListener("change", sync);
    win.addEventListener("change", sync);
    sync();
    this.required("preview-play").addEventListener("click", () =>
      this.safe(() => this.#preview!.play()),
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
    this.#root
      .querySelectorAll<HTMLButtonElement>("[data-tier]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#tier = button.dataset.tier as AwardTierId;
          this.renderWorkspace(project);
        }),
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
              const id = button.dataset.deleteResource!;
              removeLogicalResource(draft, id);
            }),
          ),
        ),
      );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-replace-resource]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          const id = input.dataset.replaceResource!;
          void this.action(async () => {
            const candidates = await discoverPopupResources([
              ...(input.files ?? []),
            ]);
            if (candidates.length !== 1)
              throw new Error("替换操作必须唯一识别一个 resource。");
            this.showReview(candidates, id);
          });
        }),
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
    const threshold =
      this.#root.querySelector<HTMLInputElement>("#tier-threshold");
    threshold?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.tiers.get(this.#tier)!.thresholdMultiplier = Number(
          threshold.value,
        );
      }),
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
            if (["x", "y", "scale"].includes(field))
              (layer.transform as any)[field] = Number(input.value);
            else if (field === "order")
              (layer as any).order = Number(input.value);
            else if (field === "anchor-x" || field === "anchor-y")
              (layer as any).anchor[field.at(-1)!] = Number(input.value);
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
    const id = this.#root.querySelector<HTMLInputElement>("#project-id");
    id?.addEventListener("change", () =>
      this.#store.transact((draft) => {
        draft.id = id.value;
      }),
    );
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
  private async reviewFiles(
    files: readonly File[],
    sourceKind: "files" | "directory",
  ) {
    await this.action(async () => {
      const candidates = await discoverPopupResources(files, sourceKind);
      this.showReview(candidates);
    });
  }
  private showReview(
    candidates: readonly PopupImportReviewCandidate[],
    replacementId?: string,
  ) {
    const dialog = this.required<HTMLDialogElement>("import-review");
    const body = this.required("review-body");
    body.innerHTML = candidates
      .map(
        (candidate, index) =>
          `<article><label>Logical id <input data-review-id="${index}" value="${replacementId ?? candidate.proposedId}" ${replacementId ? "disabled" : ""}/></label><strong>${candidate.kind}</strong><span>${candidate.primarySource}</span><span>${candidate.summary}</span><span>${candidate.dependencyCount} dependencies / ${candidate.files.size} files / ${[...candidate.files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0)} bytes</span></article>`,
      )
      .join("");
    this.required("review-confirm").onclick = () =>
      this.safe(() => {
        body
          .querySelectorAll<HTMLInputElement>("[data-review-id]")
          .forEach((input) => {
            candidates[Number(input.dataset.reviewId)]!.proposedId =
              input.value;
          });
        this.#store.transact((draft) => {
          if (replacementId)
            replaceResourceFromReview(draft, replacementId, candidates[0]!);
          else commitImportReview(draft, candidates);
        });
        dialog.close();
      });
    this.required("review-cancel").onclick = () => dialog.close();
    dialog.showModal();
  }
  private async importProject(file?: File) {
    if (!file) return;
    await this.action(async () => {
      this.#store.replace(
        importPopupZip(new Uint8Array(await file.arrayBuffer())),
      );
    });
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
    try {
      await work();
      this.#notice = "操作成功";
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
  return `<header><h1>Popup Award Celebration Editor</h1><nav><button data-tab="resources">资源</button><button data-tab="tiers">档位</button><button data-tab="project">项目</button></nav><div class="actions"><label>上传资源<input id="upload-files" type="file" multiple/></label><label>上传文件夹<input id="upload-folder" type="file" webkitdirectory multiple/></label><label>导入项目<input id="import-project" type="file" accept=".zip"/></label><button id="export-project">导出 Popup ZIP</button></div></header><main><section class="left"><div id="workspace"></div><pre id="diagnostics"></pre></section><aside><div class="preview-controls"><select id="preview-resolution"><option value="1920x1080">1920×1080</option><option value="1080x1920" selected>1080×1920</option><option value="2000x2000">2000×2000</option><option value="custom">custom</option></select><label>width<input id="preview-width" type="number" min="1" value="1080"/></label><label>height<input id="preview-height" type="number" min="1" value="1920"/></label><select id="preview-zoom"><option value="fit">fit</option>${[0.25, 0.5, 0.75, 1, 1.5, 2].map((v) => `<option value="${v}">${v * 100}%</option>`)}</select><label><input id="preview-guides" type="checkbox" checked/>guides</label><label>bet raw<input id="preview-bet" type="number" value="100"/></label><label>win raw<input id="preview-win" type="number" value="5000"/></label><button id="preview-build">Build preview</button><button id="preview-play">Play / Replay</button><button id="preview-advance">Advance</button><button id="preview-dismiss">Dismiss</button><button id="preview-clear">Dismiss immediately</button></div><div id="preview-canvas"></div><output id="preview-status"></output></aside></main><dialog id="import-review"><h2>Import review</h2><div id="review-body"></div><button id="review-confirm">确认，一次提交</button><button id="review-cancel">取消</button></dialog>`;
}
function resourcesMarkup(project: PopupEditorProject) {
  return `<h2>Logical resources</h2><p>上传只建立资源，不自动绑定图层。</p>${[...project.resources.values()].map((resource) => `<article class="card"><strong>${resource.id}</strong><span>${resource.kind}</span><small>${resource.provenance.sourceNames.join(", ") || "package import"}</small><code>${resource.paths.join("\n")}</code><span>${resourceReferenceCount(project, resource.id)} refs</span><label>同类替换<input data-replace-resource="${resource.id}" type="file" multiple/></label><button data-delete-resource="${resource.id}">删除</button></article>`).join("") || "<p>尚无资源</p>"}`;
}
function tiersMarkup(project: PopupEditorProject, active: AwardTierId) {
  const tier = project.tiers.get(active)!;
  return `<div class="tiers">${TIERS.map((id) => `<button data-tier="${id}" class="${id === active ? "active" : ""}">${id}<small>${project.tiers.get(id)!.layers.length} layers</small></button>`).join("")}</div><h2>${active}</h2><label>countDurationSeconds<input id="tier-duration" type="number" step="0.1" min="0" value="${tier.countDurationSeconds}"/></label>${tier.thresholdMultiplier ? `<label>thresholdMultiplier<input id="tier-threshold" type="number" min="2" value="${tier.thresholdMultiplier}"/></label>` : ""}<div><select id="layer-resource">${[...project.resources.values()].map((resource) => `<option value="${resource.id}">${resource.id} (${resource.kind})</option>`)}</select><button data-add-layer ${project.resources.size ? "" : "disabled"}>新增图层</button></div>${tier.layers.map(layerMarkup).join("")}`;
}
function layerMarkup(layer: PopupLayer) {
  const input = (field: string, value: string | number, type = "number") =>
    `<label>${field}<input data-layer-id="${layer.id}" data-layer-field="${field}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${value}"/></label>`;
  const playback =
    layer.kind === "vni"
      ? `${input("loopStartTime", layer.playback.loopStartTime)}${input("loopEndTime", layer.playback.loopEndTime)}<label>keepParticlesAlive<input data-layer-id="${layer.id}" data-layer-field="keepParticlesAlive" type="checkbox" ${layer.playback.keepParticlesAlive ? "checked" : ""}/></label>`
      : layer.kind === "spine"
        ? (["startAnimation", "loopAnimation", "endAnimation"] as const)
            .map((field) => input(field, layer.playback[field], "text"))
            .join("")
        : `${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${(["start", "loop", "end"] as const).map((segment) => `<label>${segment}<input data-layer-id="${layer.id}" data-layer-field="segment-${segment}" type="checkbox" ${layer.visibleSegments.includes(segment) ? "checked" : ""}/></label>`).join("")}`;
  return `<article class="card"><strong>${layer.id}</strong><span>${layer.kind} / ${layer.resource}</span>${input("order", layer.order)}${(["x", "y", "scale"] as const).map((field) => input(field, layer.transform[field])).join("")}${playback}<button data-delete-layer="${layer.id}">删除图层</button></article>`;
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
  return `<h2>项目</h2><label>project id<input id="project-id" value="${project.id}"/></label><label>viewport width<input data-project-field="viewport-width" type="number" value="${project.designViewport.width}"/></label><label>viewport height<input data-project-field="viewport-height" type="number" value="${project.designViewport.height}"/></label>${amountInput("rawScale", "number")}${amountInput("fractionDigits", "number")}${amountInput("useGrouping", "checkbox")}${amountInput("groupSeparator")}${amountInput("decimalSeparator")}${amountInput("prefix")}${amountInput("suffix")}<p>rounding: floor（strict contract）</p><h3>五档/三段 coverage diagnostics</h3><pre>${errors.join("\n") || "通过"}</pre><h3>Production manifest preview</h3><pre>${manifest}</pre>`;
}

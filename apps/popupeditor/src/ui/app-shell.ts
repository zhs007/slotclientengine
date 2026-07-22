import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import { formatPopupAmount } from "@slotclientengine/rendercore/popup";
import type {
  AwardTierId,
  PopupLayer,
} from "@slotclientengine/rendercore/popup";
import {
  addLayer,
  applyImportedResourceBindings,
  clonePopupEditorProject,
  createPopupAmountFormat,
  detectPopupAmountFormatPreset,
  removePopupResource,
  PopupEditorStore,
  projectToManifest,
  resourceReferenceCount,
  type PopupEditorProject,
} from "../model/project.js";
import {
  commitImportReview,
  discoverPopupResources,
  inspectVniBundleProfiles,
  POPUP_ZIP_LIMITS,
  reviewPopupImportTransaction,
  type PopupImportReviewCandidate,
} from "../io/resource-import.js";
import { exportPopupZip, importPopupZip } from "../io/popup-zip.js";
import { PopupPreview } from "../preview/popup-preview.js";

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
          ? tiersMarkup(project, this.#tier, this.#previewBetRaw)
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
        const entries = extractBoundedZip(bytes, { limits: POPUP_ZIP_LIMITS });
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
        const selected = globalThis.window?.prompt?.(
          `${file.name} 包含多个 VNI profile，必须输入本次导入的 profile id：\n${profiles
            .map(
              ({ id, label, byteLength }) =>
                `${id} · ${label} · ${byteLength} bytes`,
            )
            .join("\n")}`,
        );
        if (!selected || !profiles.some(({ id }) => id === selected))
          throw new Error(`${file.name} 未明确选择有效 VNI profile。`);
        profileSelections.set(file.name, selected);
      }
      const candidates = await discoverPopupResources(files, {
        vniProfileSelections: profileSelections,
      });
      await this.showReview(candidates);
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
        for (const candidate of candidates)
          applyImportedResourceBindings(
            draft,
            candidate.rootKey,
            candidate.suggestedTierBindings,
          );
        this.#store.replace(draft);
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
  return `<header><h1>Popup Award Celebration Editor</h1><nav class="primary-tabs" role="tablist" aria-label="编辑区域"><button role="tab" data-tab="resources">资源</button><button role="tab" data-tab="tiers">档位</button><button role="tab" data-tab="project">项目</button></nav></header><main><section class="left"><div id="workspace" role="tabpanel"></div><pre id="diagnostics"></pre></section><aside><div class="preview-controls"><select id="preview-resolution"><option value="1920x1080">1920×1080</option><option value="1080x1920" selected>1080×1920</option><option value="2000x2000">2000×2000</option><option value="custom">custom</option></select><label>width<input id="preview-width" type="number" min="1" value="1080"/></label><label>height<input id="preview-height" type="number" min="1" value="1920"/></label><select id="preview-zoom"><option value="fit">fit</option>${[0.25, 0.5, 0.75, 1, 1.5, 2].map((v) => `<option value="${v}">${v * 100}%</option>`)}</select><label><input id="preview-guides" type="checkbox" checked/>guides</label><label>bet raw<input id="preview-bet" type="number" value="100"/></label><label>win raw<input id="preview-win" type="number" value="5000"/></label><button id="preview-build">Build preview</button><button id="preview-play">Play / Replay</button><button id="preview-advance">Advance</button><button id="preview-dismiss">Dismiss</button><button id="preview-clear">Dismiss immediately</button></div><div id="preview-canvas"></div><output id="preview-status"></output></aside></main><dialog id="import-review"><h2>Import review</h2><div id="review-body"></div><button id="review-confirm">确认并应用建议绑定</button><button id="review-cancel">取消</button></dialog>`;
}
function resourcesMarkup(project: PopupEditorProject) {
  return `<section class="resource-import-panel"><h2>扁平资源库</h2><p>图片、Spine、VNI、ImgNumber ZIP 与 Popup ZIP 统一从这里导入；filename key 保留原始拼写，同名不同 bytes 默认覆盖。</p><div class="resource-actions"><label class="file-action">导入资源<input id="import-assets" type="file" accept="image/png,image/webp,image/jpeg,.json,.atlas,.zip" multiple/></label></div></section><div class="resource-list">${[...project.resources.values()].map((resource) => `<article class="card"><strong>${resource.rootKey}</strong><span>${resource.kind}</span><details><summary>${resource.keys.length} filename keys</summary><code>${resource.keys.join("\n")}</code></details><span>${resourceReferenceCount(project, resource.rootKey)} 个图层绑定</span><button data-delete-resource="${resource.rootKey}">删除</button></article>`).join("") || '<p class="empty-state">尚无资源</p>'}</div>`;
}
function tiersMarkup(
  project: PopupEditorProject,
  active: AwardTierId,
  betRaw: number,
) {
  const tier = project.tiers.get(active)!;
  return `<nav class="tier-tabs" role="tablist" aria-label="获奖档位">${TIERS.map((id) => `<button role="tab" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}" data-tier="${id}" class="${id === active ? "active" : ""}"><span>${id}</span><small>${project.tiers.get(id)!.layers.length} 层</small></button>`).join("")}</nav><section class="tier-contract"><h2>累计档位合同</h2><p>base：0 &lt; win ≤ 1×bet；standard：1×bet &lt; win &lt; bigwin。达到某个阈值时进入该档，已达到的前序档位会依次累计播放。</p><div class="threshold-grid">${(["bigwin", "superwin", "megawin"] as const).map((id) => `<label><span>${id}</span><input data-threshold-tier="${id}" type="number" min="2" step="1" value="${project.tiers.get(id)!.thresholdMultiplier}"/><small>× bet</small></label>`).join("")}</div><p class="contract-example">当前倍数边界：1× / ${project.tiers.get("bigwin")!.thresholdMultiplier}× / ${project.tiers.get("superwin")!.thresholdMultiplier}× / ${project.tiers.get("megawin")!.thresholdMultiplier}×；等于阈值时进入对应档。</p><p id="tier-boundaries" class="raw-boundaries">${tierBoundarySummary(project, betRaw)}</p></section><section class="tier-editor"><h2>${active}</h2><p class="layer-order-help">order 数值越小越靠下，只控制当前档位内的图层顺序。</p><label>金额计数时长<input id="tier-duration" type="number" step="0.1" min="0" value="${tier.countDurationSeconds}"/><small>秒</small></label><div class="layer-add"><select id="layer-resource">${[...project.resources.values()].map((resource) => `<option value="${resource.rootKey}">${resource.rootKey} (${resource.kind})</option>`)}</select><button data-add-layer ${project.resources.size ? "" : "disabled"}>新增 / 切换图层</button></div>${tier.layers.map((layer) => layerMarkup(layer, project)).join("")}</section>`;
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
function layerMarkup(layer: PopupLayer, project: PopupEditorProject) {
  const input = (field: string, value: string | number, type = "number") =>
    `<label>${field}<input data-layer-id="${layer.id}" data-layer-field="${field}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} value="${value}"/></label>`;
  const playback =
    layer.kind === "vni"
      ? `${vniTimingSummary(project, layer)}${input("loopStartTime", layer.playback.loopStartTime)}${input("loopEndTime", layer.playback.loopEndTime)}<label>keepParticlesAlive<input data-layer-id="${layer.id}" data-layer-field="keepParticlesAlive" type="checkbox" ${layer.playback.keepParticlesAlive ? "checked" : ""}/></label>`
      : layer.kind === "spine"
        ? (["startAnimation", "loopAnimation", "endAnimation"] as const)
            .map((field) => input(field, layer.playback[field], "text"))
            .join("")
        : layer.kind === "image-string"
          ? `${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}<p class="amount-layer-note">金额全程显示；五档共享一个 runtime，跨档只切换 resource、transform 和文本。</p>`
          : `${input("anchor-x", layer.anchor.x)}${input("anchor-y", layer.anchor.y)}${(["start", "loop", "end"] as const).map((segment) => `<label>${segment}<input data-layer-id="${layer.id}" data-layer-field="segment-${segment}" type="checkbox" ${layer.visibleSegments.includes(segment) ? "checked" : ""}/></label>`).join("")}`;
  return `<article class="card"><strong>${layer.id}</strong><span>${layer.kind} / ${layer.resource}</span>${input("order", layer.order)}${(["x", "y", "scale"] as const).map((field) => input(field, layer.transform[field])).join("")}${playback}<button data-delete-layer="${layer.id}">删除图层</button></article>`;
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
  return `<div class="project-actions"><button id="export-project">导出 Popup ZIP</button></div><h2>项目</h2><label>project id<input id="project-id" value="${project.id}"/></label><label>viewport width<input data-project-field="viewport-width" type="number" value="${project.designViewport.width}"/></label><label>viewport height<input data-project-field="viewport-height" type="number" value="${project.designViewport.height}"/></label><h3>金额合同</h3><label>preset<select id="amount-format-preset"><option value="integer" ${preset === "integer" ? "selected" : ""}>纯数字整数（raw 100 → 100）</option><option value="decimal" ${preset === "decimal" ? "selected" : ""}>纯数字两位小数（raw 100 → 1.00）</option><option value="custom" ${preset === "custom" ? "selected" : ""}>自定义</option></select></label><p class="preset-help">整数预设使用 rawScale=1，只要求 glyph 0–9；两位小数预设使用 rawScale=100，要求 glyph 0–9 和 .。两者均不输出货币符号或千分位。</p>${amountInput("rawScale", "number")}${amountInput("fractionDigits", "number")}${amountInput("useGrouping", "checkbox")}${amountInput("groupSeparator")}${amountInput("decimalSeparator")}${amountInput("prefix")}${amountInput("suffix")}<p>rounding: floor（strict contract）</p><h3>五档金额与图层 diagnostics</h3><pre>${errors.join("\n") || "通过"}</pre><h3>Production manifest preview</h3><pre>${manifest}</pre>`;
}

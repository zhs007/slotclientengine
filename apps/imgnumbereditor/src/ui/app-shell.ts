import {
  createImageStringResourceFromFiles,
  type ImageStringResource,
} from "@slotclientengine/rendercore/image-string";
import {
  confirmGlyphMapping,
  cloneEditorProject,
  createDefaultEditorProject,
  createManifestFromProject,
  DEFAULT_STATIC_TEMPLATES,
  maxGroupVisualWidth,
  removeUnmappedImage,
  unmapGlyph,
  type FixedAdvanceGroupDraft,
  type ImageStringEditorProject,
  type UploadedImageDraft,
} from "../model/editor-project.js";
import { ImageStringEditorStore } from "../model/editor-store.js";
import { decodeUploadedImage } from "../io/image-decoder.js";
import {
  createImageStringPackageFiles,
  exportImageStringZip,
  importImageStringZip,
} from "../io/image-string-zip.js";
import { CounterTemplateDriver } from "../preview/counter-template.js";
import { ImageStringPreview } from "../preview/image-string-preview.js";
import { createBoundedSourceIndex } from "@slotclientengine/browserartifactio";
import {
  commitEditorAssetImport,
  createEmptyEditorAssetWorkspace,
  editorAssetKeyCollisionToken,
  reviewEditorAssetImport,
  type EditorAssetRewriteAdapter,
  type EditorAssetWorkspace,
  type EditorImportReview,
} from "@slotclientengine/editorresource";

const SOURCE_LIMITS = Object.freeze({
  maxEntries: 4096,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
});

interface PreviewHandle {
  setText(text: string): void;
  setZoom(zoom: number): void;
  getSnapshot(): unknown;
  destroy(): void;
}

export interface AppShellDependencies {
  readonly decodeFile?: (file: File) => Promise<UploadedImageDraft>;
  readonly exportZip?: typeof exportImageStringZip;
  readonly importZip?: typeof importImageStringZip;
  readonly createPreview?: (
    host: HTMLElement,
    resource: ImageStringResource,
    text: string,
  ) => Promise<PreviewHandle>;
  readonly createResource?: typeof createImageStringResourceFromFiles;
  readonly saveFile?: (filename: string, bytes: Uint8Array) => void;
}

export interface ImageStringAppShell {
  readonly store: ImageStringEditorStore;
  destroy(): Promise<void>;
}

export function createImageStringAppShell(
  root: HTMLElement,
  dependencies: AppShellDependencies = {},
): ImageStringAppShell {
  const store = new ImageStringEditorStore();
  root.innerHTML = `
    <header><div><p class="eyebrow">PIXI.JS V8 RESOURCE TOOL</p><h1>图片字符串资源编辑器</h1></div><div class="actions"><button data-action="new">新建</button><button data-action="export" class="primary">导出 ZIP</button></div></header>
    <div data-role="error" class="error" hidden></div>
    <main>
      <section class="panel project"><h2>项目合同</h2><label>ID<input data-field="id"></label><div class="inline"><label>行高<input data-field="lineHeight" type="number" min="1"></label><label>字符间距<input data-field="letterSpacing" type="number" min="0"></label></div><div class="actions"><label class="button upload">导入资源<input data-role="import-assets" type="file" accept="image/png,image/webp,.zip" multiple hidden></label></div><p class="hint">资源库使用原始 filename key；导入审查默认覆盖同名文件，成功后仍需显式映射字符。</p></section>
      <section class="panel library"><h2>待映射美术</h2><div data-role="unmapped" class="cards empty"></div><h2>Glyph 配置</h2><div data-role="glyphs" class="glyph-list empty"></div></section>
      <section class="panel groups"><h2>等距字符组</h2><div class="inline"><label>组 ID<input data-group="id" value="digits"></label><label>成员<input data-group="characters" value="0123456789"></label></div><div class="inline"><label>Advance<input data-group="advance" type="number" min="1" value="64"></label><label>对齐<select data-group="align"><option>center</option><option>start</option><option>end</option></select></label></div><div class="actions"><button data-action="group-max">使用成员最大宽度</button><button data-action="group-save" class="primary">保存组</button></div><div data-role="groups"></div></section>
      <section class="panel preview"><h2>实时预览</h2><div class="inline"><label>字符串<input data-role="preview-text" value="0123456789"></label><label>Zoom<input data-role="zoom" type="range" min="0.5" max="4" step="0.1" value="2"></label></div><div data-role="templates" class="template-list"></div><div data-role="canvas" class="canvas"><p>映射 glyph 后生成 Pixi 预览</p></div><pre data-role="snapshot"></pre></section>
      <section class="panel counter"><h2>计数变化模板</h2><div class="counter-fields"><label>Start<input data-counter="start" value="001"></label><label>End<input data-counter="end" value="100"></label><label>Step<input data-counter="step" type="number" value="1"></label><label>Interval ms<input data-counter="interval" type="number" value="50"></label><label class="check"><input data-counter="repeat" type="checkbox" checked>Repeat</label></div><div class="actions"><button data-action="counter-play" class="primary">播放</button><button data-action="counter-pause">暂停</button><button data-action="counter-reset">重置</button></div></section>
    </main>`;

  const errorBox = required<HTMLElement>(root, "[data-role=error]");
  const previewHost = required<HTMLElement>(root, "[data-role=canvas]");
  const previewInput = required<HTMLInputElement>(
    root,
    "[data-role=preview-text]",
  );
  const snapshot = required<HTMLElement>(root, "[data-role=snapshot]");
  let preview: PreviewHandle | null = null;
  let resource: ImageStringResource | null = null;
  let counter: CounterTemplateDriver | null = null;
  let refreshVersion = 0;

  const showError = (error: unknown): void => {
    errorBox.textContent =
      error instanceof Error ? error.message : String(error);
    errorBox.hidden = false;
  };
  const clearError = (): void => {
    errorBox.hidden = true;
    errorBox.textContent = "";
  };
  const run = (action: () => void | Promise<void>): void => {
    clearError();
    Promise.resolve().then(action).catch(showError);
  };

  function renderProject(project: ImageStringEditorProject): void {
    required<HTMLInputElement>(root, "[data-field=id]").value = project.id;
    required<HTMLInputElement>(root, "[data-field=lineHeight]").value = String(
      project.metrics.lineHeight,
    );
    required<HTMLInputElement>(root, "[data-field=letterSpacing]").value =
      String(project.metrics.letterSpacing);
    renderUnmapped(project);
    renderGlyphs(project);
    const groupsHost = required<HTMLElement>(root, "[data-role=groups]");
    groupsHost.replaceChildren(
      ...project.fixedAdvanceGroups.map((group) => {
        const chip = document.createElement("div");
        chip.className = "group-chip";
        chip.innerHTML = `<b></b><span></span><button>删除</button>`;
        chip.querySelector("b")!.textContent = group.id;
        chip.querySelector("span")!.textContent =
          `${group.characters.join("")} · ${group.advanceWidth}px · ${group.align}`;
        chip.querySelector("button")!.addEventListener("click", () =>
          run(() =>
            store.transact((draft) => {
              const groups =
                draft.fixedAdvanceGroups as FixedAdvanceGroupDraft[];
              groups.splice(
                groups.findIndex((candidate) => candidate.id === group.id),
                1,
              );
            }, createManifestFromProject),
          ),
        );
        return chip;
      }),
    );
    void refreshPreview(project);
  }

  function renderUnmapped(project: ImageStringEditorProject): void {
    const unmapped = required<HTMLElement>(root, "[data-role=unmapped]");
    unmapped.replaceChildren(
      ...[...project.unmappedFiles.values()].map((image) => {
        const card = document.createElement("article");
        card.className = "asset-card";
        const url = URL.createObjectURL(
          new Blob([copyBuffer(image.bytes)], { type: image.mediaType }),
        );
        card.innerHTML = `<img alt=""><div><strong></strong><small></small><div class="inline"><input maxlength="2" data-map-input><button data-map>确认映射</button><button data-remove>删除</button></div></div>`;
        const img = card.querySelector("img")!;
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url);
        img.onerror = () => URL.revokeObjectURL(url);
        card.querySelector("strong")!.textContent = image.key;
        card.querySelector("small")!.textContent =
          `${image.width} × ${image.height}px · 建议 ${image.suggestedCharacter ?? "无"} · SHA-256 ${image.sha256.slice(0, 12)}…`;
        const input = card.querySelector<HTMLInputElement>("[data-map-input]")!;
        input.value = image.suggestedCharacter ?? "";
        card
          .querySelector("[data-map]")!
          .addEventListener("click", () =>
            run(() =>
              store.replace(
                confirmGlyphMapping(store.project, image.key, input.value),
              ),
            ),
          );
        card
          .querySelector("[data-remove]")!
          .addEventListener("click", () =>
            run(() =>
              store.replace(removeUnmappedImage(store.project, image.key)),
            ),
          );
        return card;
      }),
    );
    unmapped.classList.toggle("empty", project.unmappedFiles.size === 0);
  }

  function renderGlyphs(project: ImageStringEditorProject): void {
    const glyphs = required<HTMLElement>(root, "[data-role=glyphs]");
    glyphs.replaceChildren(
      ...[...project.glyphs.values()].map((glyph) => {
        const row = document.createElement("div");
        row.className = "glyph-row";
        row.innerHTML = `<b></b><code></code><span></span><label>offset x<input type="number" data-offset="x"></label><label>y<input type="number" data-offset="y"></label><button data-unmap>取消映射</button>`;
        row.querySelector("b")!.textContent = glyph.character;
        row.querySelector("code")!.textContent = glyph.key;
        row.querySelector("span")!.textContent =
          `${glyph.width}×${glyph.height}`;
        for (const axis of ["x", "y"] as const) {
          const input = row.querySelector<HTMLInputElement>(
            `[data-offset=${axis}]`,
          )!;
          input.value = String(glyph.offset[axis]);
          input.addEventListener("change", () =>
            run(() =>
              store.transact((draft) => {
                const map = draft.glyphs as Map<string, typeof glyph>;
                const current = map.get(glyph.character)!;
                map.set(glyph.character, {
                  ...current,
                  offset: { ...current.offset, [axis]: Number(input.value) },
                });
              }, createManifestFromProject),
            ),
          );
        }
        row
          .querySelector("[data-unmap]")!
          .addEventListener("click", () =>
            run(() =>
              store.replace(unmapGlyph(store.project, glyph.character)),
            ),
          );
        return row;
      }),
    );
    glyphs.classList.toggle("empty", project.glyphs.size === 0);
  }

  async function refreshPreview(
    project: ImageStringEditorProject,
  ): Promise<void> {
    const version = ++refreshVersion;
    preview?.destroy();
    preview = null;
    const previousResource = resource;
    resource = null;
    snapshot.textContent = "";
    try {
      await previousResource?.destroy();
    } catch (error) {
      previewHost.innerHTML = `<p class="preview-error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
      return;
    }
    if (project.glyphs.size === 0) {
      previewHost.innerHTML = "<p>映射 glyph 后生成 Pixi 预览</p>";
      return;
    }
    try {
      const nextResource = await (
        dependencies.createResource ?? createImageStringResourceFromFiles
      )({
        files: await createImageStringPackageFiles(project),
      });
      if (version !== refreshVersion) {
        await nextResource.destroy();
        return;
      }
      const nextPreview = await (
        dependencies.createPreview ??
        ((host, value, text) => ImageStringPreview.create(host, value, text))
      )(previewHost, nextResource, previewInput.value);
      if (version !== refreshVersion) {
        nextPreview.destroy();
        await nextResource.destroy();
        return;
      }
      resource = nextResource;
      preview = nextPreview;
      preview.setZoom(
        Number(required<HTMLInputElement>(root, "[data-role=zoom]").value),
      );
      updateSnapshot();
    } catch (error) {
      previewHost.innerHTML = `<p class="preview-error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    }
  }

  function updateSnapshot(): void {
    snapshot.textContent = preview
      ? JSON.stringify(preview.getSnapshot(), null, 2)
      : "";
  }

  store.subscribe(renderProject);
  renderProject(store.project);
  bindProjectControls();
  bindGroupControls();
  bindPreviewControls();
  bindCounterControls();

  function bindProjectControls(): void {
    required<HTMLInputElement>(root, "[data-field=id]").addEventListener(
      "change",
      (event) =>
        run(() =>
          store.transact(
            (draft) =>
              Object.assign(draft, {
                id: (event.target as HTMLInputElement).value,
              }),
            createManifestFromProject,
          ),
        ),
    );
    for (const field of ["lineHeight", "letterSpacing"] as const)
      required<HTMLInputElement>(
        root,
        `[data-field=${field}]`,
      ).addEventListener("change", (event) =>
        run(() =>
          store.transact(
            (draft) =>
              Object.assign(draft.metrics, {
                [field]: Number((event.target as HTMLInputElement).value),
              }),
            createManifestFromProject,
          ),
        ),
      );
    const importAssets = (event: Event): void =>
      run(async () => {
        const files = [...((event.target as HTMLInputElement).files ?? [])];
        createBoundedSourceIndex(files, SOURCE_LIMITS);
        const zipFiles = files.filter((file) =>
          file.name.toLowerCase().endsWith(".zip"),
        );
        if (zipFiles.length) {
          if (files.length !== 1)
            throw new Error("ImgNumber project ZIP 必须单独导入。");
          const imported = await (
            dependencies.importZip ?? importImageStringZip
          )(new Uint8Array(await files[0]!.arrayBuffer()));
          if (!confirmProjectImportReview(imported, files[0]!)) return;
          store.replace(imported);
          return;
        }
        const decoded = await Promise.all(
          files.map((file) =>
            (dependencies.decodeFile ?? decodeUploadedImage)(file),
          ),
        );
        const workspace = await createProjectAssetWorkspace(store.project);
        const review = await reviewEditorAssetImport({
          workspace,
          incoming: decoded,
          references: projectReferenceGraph(store.project),
        });
        if (!review.canCommit)
          throw new Error(review.blockingErrors.join("\n"));
        if (!confirmImageImportReview(review, decoded, files)) return;
        await commitEditorAssetImport({
          workspace,
          project: store.project,
          review,
          adapter: imageStringProjectAdapter,
        });
        store.transact(
          (draft) => {
            const map = draft.unmappedFiles as Map<string, UploadedImageDraft>;
            for (const item of review.items) {
              if (item.action === "noop") continue;
              const decodedImage = decoded.find(
                ({ key }) =>
                  editorAssetKeyCollisionToken(key) ===
                  editorAssetKeyCollisionToken(item.incoming.key),
              )!;
              const replacement: UploadedImageDraft = {
                ...decodedImage,
                ...item.incoming,
                key: item.targetKey,
                mediaType: decodedImage.mediaType,
              };
              let replaced = false;
              for (const [character, glyph] of draft.glyphs) {
                if (
                  editorAssetKeyCollisionToken(glyph.key) ===
                  editorAssetKeyCollisionToken(item.targetKey)
                ) {
                  (draft.glyphs as Map<string, typeof glyph>).set(character, {
                    ...replacement,
                    character,
                    offset: { ...glyph.offset },
                  });
                  replaced = true;
                }
              }
              for (const key of [...map.keys()])
                if (
                  editorAssetKeyCollisionToken(key) ===
                  editorAssetKeyCollisionToken(item.targetKey)
                ) {
                  map.delete(key);
                  map.set(item.targetKey, replacement);
                  replaced = true;
                }
              if (!replaced) map.set(item.targetKey, replacement);
            }
          },
          (project) => {
            if (project.glyphs.size) createManifestFromProject(project);
          },
        );
      });
    required<HTMLInputElement>(
      root,
      "[data-role=import-assets]",
    ).addEventListener("change", importAssets);
    root
      .querySelector("[data-action=new]")!
      .addEventListener("click", () =>
        store.replace(createDefaultEditorProject()),
      );
    root.querySelector("[data-action=export]")!.addEventListener("click", () =>
      run(async () => {
        const result = await (dependencies.exportZip ?? exportImageStringZip)(
          store.project,
        );
        (dependencies.saveFile ?? saveDownload)(result.filename, result.bytes);
      }),
    );
  }

  function bindGroupControls(): void {
    root
      .querySelector("[data-action=group-max]")!
      .addEventListener("click", () =>
        run(() => {
          const characters = Array.from(
            required<HTMLInputElement>(root, "[data-group=characters]").value,
          );
          required<HTMLInputElement>(root, "[data-group=advance]").value =
            String(maxGroupVisualWidth(store.project, characters));
        }),
      );
    root
      .querySelector("[data-action=group-save]")!
      .addEventListener("click", () =>
        run(() => {
          const group: FixedAdvanceGroupDraft = {
            id: required<HTMLInputElement>(root, "[data-group=id]").value,
            characters: Array.from(
              required<HTMLInputElement>(root, "[data-group=characters]").value,
            ).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!),
            advanceWidth: Number(
              required<HTMLInputElement>(root, "[data-group=advance]").value,
            ),
            align: required<HTMLSelectElement>(root, "[data-group=align]")
              .value as FixedAdvanceGroupDraft["align"],
          };
          store.transact((draft) => {
            const groups = draft.fixedAdvanceGroups as FixedAdvanceGroupDraft[];
            const index = groups.findIndex((item) => item.id === group.id);
            if (index >= 0) groups[index] = group;
            else groups.push(group);
          }, createManifestFromProject);
        }),
      );
  }

  function bindPreviewControls(): void {
    previewInput.addEventListener("input", () =>
      run(() => {
        preview?.setText(previewInput.value);
        updateSnapshot();
      }),
    );
    required<HTMLInputElement>(root, "[data-role=zoom]").addEventListener(
      "input",
      (event) =>
        run(() =>
          preview?.setZoom(Number((event.target as HTMLInputElement).value)),
        ),
    );
    const templates = required<HTMLElement>(root, "[data-role=templates]");
    for (const text of DEFAULT_STATIC_TEMPLATES) {
      const button = document.createElement("button");
      button.textContent = text;
      button.addEventListener("click", () => {
        previewInput.value = text;
        previewInput.dispatchEvent(new Event("input"));
      });
      templates.append(button);
    }
  }

  function bindCounterControls(): void {
    const createCounter = (): CounterTemplateDriver =>
      new CounterTemplateDriver(
        {
          startText: required<HTMLInputElement>(root, "[data-counter=start]")
            .value,
          endText: required<HTMLInputElement>(root, "[data-counter=end]").value,
          step: Number(
            required<HTMLInputElement>(root, "[data-counter=step]").value,
          ),
          intervalMs: Number(
            required<HTMLInputElement>(root, "[data-counter=interval]").value,
          ),
          repeat: required<HTMLInputElement>(root, "[data-counter=repeat]")
            .checked,
        },
        (text) => {
          previewInput.value = text;
          try {
            preview?.setText(text);
            updateSnapshot();
          } catch (error) {
            showError(error);
          }
        },
      );
    root
      .querySelector("[data-action=counter-play]")!
      .addEventListener("click", () =>
        run(() => {
          counter?.destroy();
          counter = createCounter();
          counter.play();
        }),
      );
    root
      .querySelector("[data-action=counter-pause]")!
      .addEventListener("click", () => counter?.pause());
    root
      .querySelector("[data-action=counter-reset]")!
      .addEventListener("click", () => {
        counter?.destroy();
        counter = createCounter();
        counter.reset();
      });
  }

  return Object.freeze({
    store,
    async destroy(): Promise<void> {
      refreshVersion += 1;
      counter?.destroy();
      preview?.destroy();
      await resource?.destroy();
      root.replaceChildren();
    },
  });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`缺少 UI 节点：${selector}`);
  return value;
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function saveDownload(filename: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(
    new Blob([copyBuffer(bytes)], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function confirmImageImportReview(
  review: EditorImportReview,
  images: readonly UploadedImageDraft[],
  files: readonly File[],
): boolean {
  const confirm = globalThis.window?.confirm;
  if (typeof confirm !== "function") return true;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return confirm.call(
    globalThis.window,
    `导入资源审查\n${review.items
      .map((item) => {
        const image = images.find(
          ({ key }) =>
            editorAssetKeyCollisionToken(key) ===
            editorAssetKeyCollisionToken(item.incoming.key),
        )!;
        const action =
          item.action === "overwrite"
            ? "覆盖同名文件（默认）"
            : item.action === "noop"
              ? "相同 bytes，不变"
              : "新增";
        const impacts = item.references.length
          ? ` · 影响 ${item.references.map(({ location }) => location).join(", ")}`
          : "";
        return `${item.targetKey} · ${action} · ${image.width}×${image.height} · ${item.incoming.byteLength} bytes${impacts}`;
      })
      .join(
        "\n",
      )}\n${files.length} files · ${total} bytes\n\n确认单次事务提交？`,
  );
}

function confirmProjectImportReview(
  project: ImageStringEditorProject,
  file: File,
): boolean {
  const confirm = globalThis.window?.confirm;
  if (typeof confirm !== "function") return true;
  return confirm.call(
    globalThis.window,
    `导入资源审查\n${file.name} · ${file.size} bytes\n${project.glyphs.size} glyph filename keys\n\n确认原子替换当前项目？`,
  );
}

function projectReferenceGraph(
  project: ImageStringEditorProject,
): ReturnType<
  EditorAssetRewriteAdapter<ImageStringEditorProject>["collectReferences"]
> {
  return {
    references: [...project.glyphs].map(([character, glyph]) => ({
      key: glyph.key,
      location: `glyphs.${JSON.stringify(character)}.path`,
      kind: "glyph",
    })),
  };
}

const imageStringProjectAdapter: EditorAssetRewriteAdapter<ImageStringEditorProject> =
  {
    cloneProject: cloneEditorProject,
    collectReferences: projectReferenceGraph,
    renameReferences(project, from, to) {
      for (const [character, glyph] of project.glyphs)
        if (glyph.key === from)
          (project.glyphs as Map<string, typeof glyph>).set(character, {
            ...glyph,
            key: to,
          });
      const unmapped = project.unmappedFiles as Map<string, UploadedImageDraft>;
      const image = unmapped.get(from);
      if (image) {
        unmapped.delete(from);
        unmapped.set(to, { ...image, key: to });
      }
      return project;
    },
    validateProject(project) {
      if (project.glyphs.size) createManifestFromProject(project);
    },
  };

async function createProjectAssetWorkspace(
  project: ImageStringEditorProject,
): Promise<EditorAssetWorkspace> {
  const unique = new Map<string, UploadedImageDraft>();
  for (const image of [
    ...project.unmappedFiles.values(),
    ...project.glyphs.values(),
  ]) {
    const token = editorAssetKeyCollisionToken(image.key);
    const existing = unique.get(token);
    if (existing && existing.sha256 !== image.sha256)
      throw new Error(`project 同名 asset bytes 不一致：${image.key}`);
    unique.set(token, image);
  }
  if (!unique.size) return createEmptyEditorAssetWorkspace();
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({
    workspace: empty,
    incoming: [...unique.values()],
  });
  return (
    await commitEditorAssetImport({
      workspace: empty,
      project: null,
      review,
      adapter: {
        cloneProject: () => null,
        collectReferences: () => ({ references: [] }),
        renameReferences: () => null,
      },
    })
  ).workspace;
}

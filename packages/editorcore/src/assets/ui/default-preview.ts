import { Application } from "pixi.js";
import {
  createImageStringResourceFromResolvedFiles,
  createRenderImageString,
} from "@slotclientengine/rendercore/image-string/editor";
import {
  createOfficialSpinePlayer,
  validateOfficialSpineResource,
} from "@slotclientengine/rendercore";
import { assertVNIProject } from "@slotclientengine/vnicore/data";
import { VNIViewer } from "@slotclientengine/vnicore/viewer";
import type {
  EditorAssetCatalog,
  EditorAssetRoot,
  EditorAssetsSnapshot,
} from "../data/index.js";

export interface EditorAssetPreviewHandle {
  destroy(): void | Promise<void>;
}

export type EditorAssetPreviewFactory<TProject> = (options: {
  readonly snapshot: EditorAssetsSnapshot<TProject>;
  readonly rootKey: string;
  readonly element: HTMLElement;
}) => Promise<EditorAssetPreviewHandle>;

export async function createDefaultEditorAssetPreview<TProject>(options: {
  readonly snapshot: EditorAssetsSnapshot<TProject>;
  readonly rootKey: string;
  readonly element: HTMLElement;
}): Promise<EditorAssetPreviewHandle> {
  const root = options.snapshot.catalog.roots.get(options.rootKey);
  if (!root) throw new Error(`preview root 不存在：${options.rootKey}`);
  if (["image", "audio", "video"].includes(root.kind))
    return createNativePreview(options, root);
  if (root.kind === "spine") return createSpinePreview(options, root);
  if (root.kind === "vni") return createVniPreview(options, root);
  if (root.kind === "image-string")
    return createImageStringPreview(options, root);
  const message = document.createElement("p");
  message.className = "editor-assets-preview-unavailable";
  message.textContent = ["popup", "symbols", "game-layout"].includes(root.kind)
    ? "此类型暂不支持预览。"
    : "此类型没有预览。";
  options.element.replaceChildren(message);
  return Object.freeze({ destroy: () => message.remove() });
}

function createNativePreview<TProject>(
  options: {
    readonly snapshot: EditorAssetsSnapshot<TProject>;
    readonly element: HTMLElement;
  },
  root: EditorAssetRoot,
): EditorAssetPreviewHandle {
  const entry = requiredEntry(options.snapshot, root.key);
  const url = URL.createObjectURL(
    new Blob([copyBuffer(entry.bytes)], { type: entry.mediaType }),
  );
  const preview = document.createElement(
    root.kind === "image" ? "img" : root.kind,
  ) as HTMLImageElement | HTMLAudioElement | HTMLVideoElement;
  preview.className = "editor-assets-preview";
  preview.src = url;
  if (preview instanceof HTMLImageElement) preview.alt = "";
  else preview.controls = true;
  options.element.replaceChildren(preview);
  let destroyed = false;
  return Object.freeze({
    destroy() {
      if (destroyed) return;
      destroyed = true;
      preview.removeAttribute("src");
      preview.remove();
      URL.revokeObjectURL(url);
    },
  });
}

async function createSpinePreview<TProject>(
  options: {
    readonly snapshot: EditorAssetsSnapshot<TProject>;
    readonly element: HTMLElement;
  },
  root: EditorAssetRoot,
): Promise<EditorAssetPreviewHandle> {
  const skeleton = parseJson(
    requiredEntry(options.snapshot, root.key).bytes,
    root.key,
  );
  const atlasEdge = options.snapshot.catalog.relations.find(
    ({ kind, from }) =>
      kind === "uses-atlas" &&
      reachableFromRoot(options.snapshot.catalog, root, from),
  );
  if (!atlasEdge) throw new Error(`Spine preview 缺少 atlas：${root.key}`);
  const atlasNode = options.snapshot.catalog.nodes.get(atlasEdge.to);
  if (!atlasNode) throw new Error(`Spine atlas node 不存在：${atlasEdge.to}`);
  const atlasText = decodeText(
    requiredEntry(options.snapshot, atlasNode.key).bytes,
    atlasNode.key,
  );
  const urls = new ObjectUrlSet();
  const textureUrls: Record<string, string> = {};
  for (const edge of options.snapshot.catalog.relations.filter(
    ({ kind, from }) => kind === "uses-texture" && from === atlasNode.id,
  )) {
    if (!edge.label)
      throw new Error("Spine texture relation 缺少 atlas page。");
    const node = options.snapshot.catalog.nodes.get(edge.to);
    if (!node) throw new Error(`Spine texture node 不存在：${edge.to}`);
    const entry = requiredEntry(options.snapshot, node.key);
    textureUrls[edge.label] = urls.create(entry.bytes, entry.mediaType);
  }
  const resource = { skeleton, atlasText, textureUrls };
  const metadata = validateOfficialSpineResource({
    resource,
    requiredAnimations: [],
  });
  const shell = createCanvasShell("Spine 动画");
  const select = document.createElement("select");
  select.setAttribute("aria-label", "选择 Spine 动画");
  select.innerHTML = `<option value="">请选择动画</option>${metadata.animationNames
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`,
    )
    .join("")}`;
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "播放";
  play.disabled = true;
  shell.controls.append(select, play);
  options.element.replaceChildren(shell.element);
  const application = await createApplication(shell.canvasHost, 520, 300);
  const player = createOfficialSpinePlayer({ resource });
  try {
    await player.init();
    application.stage.addChild(player.view);
    fitDisplayObject(
      player.view,
      application.screen.width,
      application.screen.height,
    );
    const tick = (ticker: { deltaMS: number }) =>
      player.update(ticker.deltaMS / 1000);
    application.ticker.add(tick);
    const onSelect = () => {
      play.disabled = select.value.length === 0;
    };
    const onPlay = () => {
      if (!select.value) return;
      player.play({ animationName: select.value, loop: true });
    };
    select.addEventListener("change", onSelect);
    play.addEventListener("click", onPlay);
    let destroyed = false;
    return Object.freeze({
      destroy() {
        if (destroyed) return;
        destroyed = true;
        select.removeEventListener("change", onSelect);
        play.removeEventListener("click", onPlay);
        application.ticker.remove(tick);
        player.destroy();
        application.destroy({ removeView: true });
        urls.destroy();
        shell.element.remove();
      },
    });
  } catch (error) {
    player.destroy();
    application.destroy({ removeView: true });
    urls.destroy();
    shell.element.remove();
    throw error;
  }
}

async function createVniPreview<TProject>(
  options: {
    readonly snapshot: EditorAssetsSnapshot<TProject>;
    readonly element: HTMLElement;
  },
  root: EditorAssetRoot,
): Promise<EditorAssetPreviewHandle> {
  const project = assertVNIProject(
    parseJson(requiredEntry(options.snapshot, root.key).bytes, root.key),
  );
  const urls = new ObjectUrlSet();
  const assetUrls: Record<string, string> = {};
  for (const asset of project.assets) {
    const entry = requiredEntry(options.snapshot, asset.path);
    assetUrls[asset.path] = urls.create(entry.bytes, entry.mediaType);
  }
  const shell = createCanvasShell("VNI 播放");
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "播放 / 重播";
  shell.controls.append(play);
  options.element.replaceChildren(shell.element);
  const application = await createApplication(shell.canvasHost, 520, 300);
  const scale = Math.min(520 / project.stage.width, 300 / project.stage.height);
  const profile = project.exportProfile;
  const viewer = new VNIViewer({
    parent: application.stage,
    viewport: { width: 520, height: 300 },
    viewportScale: scale,
    requestRender: () => application.render(),
    projectId: project.name,
    bundleId: root.owner,
    profileId: profile?.id ?? "standalone",
    profilePurpose: profile?.purpose ?? "runtime",
    assetScale: profile?.assetScale ?? 1,
    project,
    assetUrls,
  });
  try {
    await viewer.init();
    const onPlay = () => {
      viewer.restart();
      viewer.play();
    };
    play.addEventListener("click", onPlay);
    let destroyed = false;
    return Object.freeze({
      destroy() {
        if (destroyed) return;
        destroyed = true;
        play.removeEventListener("click", onPlay);
        viewer.destroy();
        application.destroy({ removeView: true });
        urls.destroy();
        shell.element.remove();
      },
    });
  } catch (error) {
    viewer.destroy();
    application.destroy({ removeView: true });
    urls.destroy();
    shell.element.remove();
    throw error;
  }
}

async function createImageStringPreview<TProject>(
  options: {
    readonly snapshot: EditorAssetsSnapshot<TProject>;
    readonly element: HTMLElement;
  },
  root: EditorAssetRoot,
): Promise<EditorAssetPreviewHandle> {
  const manifestBytes = requiredEntry(options.snapshot, root.key).bytes;
  const manifest = parseJson(manifestBytes, root.key) as {
    readonly glyphs?: Readonly<Record<string, { readonly path: string }>>;
  };
  const glyphs = Object.keys(manifest.glyphs ?? {});
  const sample =
    glyphs.filter((value) => /^\d$/u.test(value)).join("") ||
    glyphs.slice(0, 8).join("");
  const files = new Map<string, Uint8Array>([
    ["image-string.manifest.json", manifestBytes.slice()],
  ]);
  for (const glyph of Object.values(manifest.glyphs ?? {}))
    files.set(
      glyph.path,
      requiredEntry(options.snapshot, glyph.path).bytes.slice(),
    );
  const shell = createCanvasShell("ImgNumber 文字");
  const input = document.createElement("input");
  input.type = "text";
  input.value = sample;
  input.setAttribute("aria-label", "ImgNumber preview text");
  shell.controls.append(input);
  options.element.replaceChildren(shell.element);
  const application = await createApplication(shell.canvasHost, 520, 260);
  let resource: Awaited<
    ReturnType<typeof createImageStringResourceFromResolvedFiles>
  > | null = null;
  let renderer: ReturnType<typeof createRenderImageString> | null = null;
  try {
    resource = await createImageStringResourceFromResolvedFiles({
      manifest,
      files,
    });
    renderer = createRenderImageString({ resource, text: sample });
    renderer.container.position.set(260, 130);
    application.stage.addChild(renderer.container);
    const onInput = () => {
      try {
        renderer!.setText(input.value);
        input.setCustomValidity("");
      } catch (error) {
        input.setCustomValidity(formatError(error));
        input.reportValidity();
      }
    };
    input.addEventListener("input", onInput);
    let destroyed = false;
    return Object.freeze({
      async destroy() {
        if (destroyed) return;
        destroyed = true;
        input.removeEventListener("input", onInput);
        renderer!.destroy();
        await resource!.destroy();
        application.destroy({ removeView: true });
        shell.element.remove();
      },
    });
  } catch (error) {
    renderer?.destroy();
    await resource?.destroy();
    application.destroy({ removeView: true });
    shell.element.remove();
    throw error;
  }
}

async function createApplication(
  host: HTMLElement,
  width: number,
  height: number,
): Promise<Application> {
  const application = new Application();
  await application.init({
    width,
    height,
    background: "#080d16",
    antialias: true,
    autoDensity: true,
    resolution: globalThis.devicePixelRatio || 1,
  });
  host.replaceChildren(application.canvas);
  return application;
}

function createCanvasShell(label: string): {
  element: HTMLElement;
  controls: HTMLElement;
  canvasHost: HTMLElement;
} {
  const element = document.createElement("div");
  element.className = "editor-assets-runtime-preview";
  const controls = document.createElement("div");
  controls.className = "editor-assets-preview-controls";
  controls.setAttribute("aria-label", label);
  const canvasHost = document.createElement("div");
  canvasHost.className = "editor-assets-preview-canvas";
  element.append(controls, canvasHost);
  return { element, controls, canvasHost };
}

function fitDisplayObject(
  view: import("pixi.js").Container,
  width: number,
  height: number,
): void {
  const bounds = view.getLocalBounds();
  const sourceWidth = Math.max(1, bounds.width);
  const sourceHeight = Math.max(1, bounds.height);
  const scale = Math.min(width / sourceWidth, height / sourceHeight) * 0.85;
  view.scale.set(scale);
  view.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  view.position.set(width / 2, height / 2);
}

function reachableFromRoot(
  catalog: EditorAssetCatalog,
  root: EditorAssetRoot,
  target: string,
): boolean {
  const pending = [root.nodeId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const relation of catalog.relations)
      if (relation.from === current) pending.push(relation.to);
  }
  return false;
}

function requiredEntry<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  key: string,
) {
  const entry = snapshot.workspace.entries.get(key);
  if (!entry) throw new Error(`preview 缺少 asset entry：${key}`);
  return entry;
}

class ObjectUrlSet {
  readonly #urls = new Set<string>();
  create(bytes: Uint8Array, mediaType: string): string {
    const url = URL.createObjectURL(
      new Blob([copyBuffer(bytes)], { type: mediaType }),
    );
    this.#urls.add(url);
    return url;
  }
  destroy(): void {
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls.clear();
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decodeText(bytes, label));
  } catch (error) {
    throw new Error(`${label} JSON 无效：${formatError(error)}`);
  }
}

function decodeText(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} UTF-8 无效：${formatError(error)}`);
  }
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

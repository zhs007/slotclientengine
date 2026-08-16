import {
  ephemeralContentFingerprint,
  ObjectUrlRegistry,
} from "@slotclientengine/browserartifactio";
import { createOfficialSpinePlayer } from "@slotclientengine/rendercore";
import { VNIRuntime } from "@slotclientengine/vnicore/core";
import { Application } from "pixi.js";
import type { EditorProject } from "../model/editor-project.js";
import {
  editorResourcePaths,
  type EditorLayoutResource,
} from "../model/editor-resource.js";

interface PreparedPickerPreview {
  readonly element: HTMLElement;
  destroy(): void;
}

const previewByteFingerprints = new WeakMap<Uint8Array, string>();

export class ResourcePickerPreview {
  #request = 0;
  #identity = "";
  #prepared: PreparedPickerPreview | null = null;
  #application: Application | null = null;
  #applicationQueue: Promise<void> = Promise.resolve();
  #destroyed = false;

  async show(options: {
    readonly host: HTMLElement;
    readonly project: EditorProject;
    readonly resource: EditorLayoutResource | undefined;
    readonly animation: string;
  }): Promise<void> {
    if (this.#destroyed) return;
    const identity = options.resource
      ? `${options.resource.kind}:${options.resource.id}:${options.animation}:${resourceFingerprint(options.project, options.resource)}`
      : "";
    if (identity && identity === this.#identity && this.#prepared) {
      options.host.replaceChildren(this.#prepared.element);
      return;
    }
    const request = ++this.#request;
    this.disposePrepared();
    this.#identity = identity;
    if (!options.resource) {
      options.host.replaceChildren(emptyPreview("选择资源后显示预览。"));
      return;
    }
    options.host.replaceChildren(emptyPreview("正在准备资源预览…", "loading"));
    try {
      const resource = options.resource;
      let prepared: PreparedPickerPreview | null;
      if (resource.kind === "spine" && options.animation)
        prepared = await this.prepareAnimated(request, (app) =>
          prepareSpine(app, options.project, resource, options.animation),
        );
      else if (resource.kind === "vni")
        prepared = await this.prepareAnimated(request, (app) =>
          prepareVni(app, options.project, resource),
        );
      else
        prepared = await preparePreview(
          options.project,
          resource,
          options.animation,
        );
      if (!prepared) return;
      if (this.#destroyed || request !== this.#request) {
        prepared.destroy();
        return;
      }
      this.#prepared = prepared;
      options.host.replaceChildren(prepared.element);
    } catch (error) {
      if (this.#destroyed || request !== this.#request) return;
      this.#identity = "";
      options.host.replaceChildren(
        emptyPreview(
          `资源预览失败：${error instanceof Error ? error.message : String(error)}`,
          "error",
        ),
      );
    }
  }

  clear(): void {
    this.#request += 1;
    this.#identity = "";
    this.disposePrepared();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.clear();
    void this.#applicationQueue.finally(() => {
      const app = this.#application;
      this.#application = null;
      if (app) app.destroy(true, { children: true, texture: false });
    });
  }

  private disposePrepared(): void {
    this.#prepared?.destroy();
    this.#prepared = null;
  }

  private prepareAnimated(
    request: number,
    prepare: (app: Application) => Promise<PreparedPickerPreview>,
  ): Promise<PreparedPickerPreview | null> {
    const result = this.#applicationQueue
      .catch(() => undefined)
      .then(async () => {
        if (this.#destroyed || request !== this.#request) return null;
        const app = await this.requireApplication();
        if (this.#destroyed || request !== this.#request) return null;
        const prepared = await prepare(app);
        if (this.#destroyed || request !== this.#request) {
          prepared.destroy();
          return null;
        }
        return prepared;
      });
    this.#applicationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async requireApplication(): Promise<Application> {
    if (this.#application) return this.#application;
    const app = new Application();
    await app.init(previewApplicationOptions());
    if (this.#destroyed) {
      app.destroy(true, { children: true, texture: false });
      throw new Error("资源预览已销毁。");
    }
    this.#application = app;
    return app;
  }
}

async function preparePreview(
  project: EditorProject,
  resource: EditorLayoutResource,
  animation: string,
): Promise<PreparedPickerPreview> {
  if (resource.kind === "image")
    return prepareImage(project, resource.path, resource.id);
  if (resource.kind === "image-string")
    return prepareContactSheet(
      project,
      Object.entries(resource.manifest.glyphs).map(([character, glyph]) => ({
        label: character,
        path: glyph.path,
      })),
      `${resource.id} glyphs`,
    );
  if (resource.kind === "spine" && !animation)
    return prepareContactSheet(
      project,
      Object.entries(resource.textures).map(([page, path]) => ({
        label: page,
        path,
      })),
      `${resource.id} atlas pages`,
    );
  return {
    element: emptyPreview("video 资源不属于普通图层候选。"),
    destroy() {},
  };
}

function prepareImage(
  project: EditorProject,
  path: string,
  label: string,
): PreparedPickerPreview {
  const urls = new ObjectUrlRegistry();
  const bytes = requireAsset(project, path);
  const image = document.createElement("img");
  image.alt = `${label} 预览`;
  image.src = urls.create(
    new Blob([bytes as BlobPart], { type: mediaType(path) }),
  );
  const element = document.createElement("div");
  element.className = "picker-preview-image";
  element.append(image);
  return {
    element,
    destroy: () => {
      image.removeAttribute("src");
      urls.destroy();
      element.remove();
    },
  };
}

function prepareContactSheet(
  project: EditorProject,
  items: readonly { readonly label: string; readonly path: string }[],
  title: string,
): PreparedPickerPreview {
  const urls = new ObjectUrlRegistry();
  const element = document.createElement("div");
  element.className = "picker-preview-contact";
  element.setAttribute("aria-label", title);
  try {
    for (const item of items) {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.alt = "";
      image.src = urls.create(
        new Blob([requireAsset(project, item.path) as BlobPart], {
          type: mediaType(item.path),
        }),
      );
      const caption = document.createElement("figcaption");
      caption.textContent = item.label;
      figure.append(image, caption);
      element.append(figure);
    }
  } catch (error) {
    for (const image of element.querySelectorAll("img"))
      image.removeAttribute("src");
    urls.destroy();
    element.remove();
    throw error;
  }
  return {
    element,
    destroy: () => {
      for (const image of element.querySelectorAll("img"))
        image.removeAttribute("src");
      urls.destroy();
      element.remove();
    },
  };
}

async function prepareSpine(
  app: Application,
  project: EditorProject,
  resource: Extract<EditorLayoutResource, { readonly kind: "spine" }>,
  animation: string,
): Promise<PreparedPickerPreview> {
  if (!resource.animationNames.includes(animation))
    throw new Error(`Spine animation 不存在：${animation}`);
  const urls = new ObjectUrlRegistry();
  let player: ReturnType<typeof createOfficialSpinePlayer> | null = null;
  try {
    const skeleton = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        requireAsset(project, resource.skeleton),
      ),
    );
    player = createOfficialSpinePlayer({
      resource: {
        skeleton,
        atlasText: new TextDecoder("utf-8", { fatal: true }).decode(
          requireAsset(project, resource.atlas),
        ),
        textureUrls: Object.fromEntries(
          Object.entries(resource.textures).map(([page, path]) => [
            page,
            urls.create(
              new Blob([requireAsset(project, path) as BlobPart], {
                type: mediaType(path),
              }),
            ),
          ]),
        ),
      },
    });
    await player.init();
    player.play({ animationName: animation, loop: true });
    player.update(1 / 60);
    app.stage.addChild(player.view);
    fitDisplayObject(player.view, app.canvas.width, app.canvas.height);
    const activePlayer = player;
    const updatePlayer = (ticker: { readonly deltaMS: number }) =>
      activePlayer.update(ticker.deltaMS / 1000);
    app.ticker.add(updatePlayer);
    app.ticker.start();
    const element = canvasPreview(app, `${resource.id} · ${animation}`);
    return {
      element,
      destroy: () => {
        app.ticker.stop();
        app.ticker.remove(updatePlayer);
        app.stage.removeChild(activePlayer.view);
        activePlayer.destroy();
        app.canvas.remove();
        urls.destroy();
        element.remove();
      },
    };
  } catch (error) {
    player?.destroy();
    urls.destroy();
    throw error;
  }
}

async function prepareVni(
  app: Application,
  project: EditorProject,
  resource: Extract<EditorLayoutResource, { readonly kind: "vni" }>,
): Promise<PreparedPickerPreview> {
  const profile = resource.project.exportProfile;
  if (!profile || profile.purpose !== "runtime")
    throw new Error("VNI resource 缺少 runtime export profile。");
  const urls = new ObjectUrlRegistry();
  let player: VNIRuntime | null = null;
  try {
    const assetUrls = Object.fromEntries(
      resource.project.assets.map((asset) => [
        asset.path,
        urls.create(
          new Blob([requireAsset(project, asset.path) as BlobPart], {
            type: mediaType(asset.path),
          }),
        ),
      ]),
    );
    player = new VNIRuntime({
      parent: app.stage,
      project: resource.project,
      assetUrls,
    });
    await player.init();
    player.setLoop(true);
    player.play();
    const activePlayer = player;
    const updatePlayer = (ticker: { readonly deltaMS: number }) =>
      activePlayer.update(ticker.deltaMS / 1000);
    app.ticker.add(updatePlayer);
    app.ticker.start();
    const element = canvasPreview(app, `${resource.id} timeline`);
    return {
      element,
      destroy: () => {
        app.ticker.stop();
        app.ticker.remove(updatePlayer);
        activePlayer.destroy();
        app.canvas.remove();
        urls.destroy();
        element.remove();
      },
    };
  } catch (error) {
    player?.destroy();
    urls.destroy();
    throw error;
  }
}

function canvasPreview(app: Application, label: string): HTMLElement {
  app.canvas.setAttribute("aria-label", label);
  const element = document.createElement("div");
  element.className = "picker-preview-canvas";
  element.append(app.canvas);
  return element;
}

function previewApplicationOptions() {
  return {
    width: 360,
    height: 280,
    background: "#080d15",
    antialias: true,
    autoStart: false,
  } as const;
}

function fitDisplayObject(
  view: ReturnType<typeof createOfficialSpinePlayer>["view"],
  width: number,
  height: number,
): void {
  const bounds = view.getLocalBounds();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const scale = Math.min(
    (width * 0.9) / bounds.width,
    (height * 0.9) / bounds.height,
  );
  view.scale.set(scale);
  view.position.set(
    width / 2 - (bounds.x + bounds.width / 2) * scale,
    height / 2 - (bounds.y + bounds.height / 2) * scale,
  );
}

function resourceFingerprint(
  project: EditorProject,
  resource: EditorLayoutResource,
): string {
  return editorResourcePaths(resource)
    .map((path) => {
      const bytes = project.assets.get(path);
      if (!bytes) return `${path}:missing`;
      let fingerprint = previewByteFingerprints.get(bytes);
      if (!fingerprint) {
        fingerprint = ephemeralContentFingerprint(bytes);
        previewByteFingerprints.set(bytes, fingerprint);
      }
      return `${path}:${fingerprint}`;
    })
    .join("|");
}

function requireAsset(project: EditorProject, path: string): Uint8Array {
  const bytes = project.assets.get(path);
  if (!bytes) throw new Error(`资源预览缺少 bytes：${path}`);
  return bytes;
}

function mediaType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function emptyPreview(
  message: string,
  status: "empty" | "loading" | "error" = "empty",
): HTMLElement {
  const element = document.createElement("p");
  element.className = `picker-preview-status picker-preview-${status}`;
  element.textContent = message;
  return element;
}

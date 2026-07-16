import {
  AtlasAttachmentLoader,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import { Assets, Container, type Texture } from "pixi.js";
import { readSupportedSpineSkeletonVersion } from "./version.js";

export interface RendercoreSpinePlayer {
  readonly view: Container;
  init(): Promise<void> | void;
  play(options: {
    readonly animationName: string;
    readonly loop: boolean;
  }): void;
  update(deltaSeconds: number): {
    readonly completed: boolean;
    readonly loopCompleted?: boolean;
  };
  reset(): void;
  destroy(): void;
}

export interface RendercoreSpineSlotPlayer extends RendercoreSpinePlayer {
  attachSlotObject(options: {
    readonly slot: string;
    readonly object: Container;
    readonly followSlotColor?: boolean;
  }): void;
  removeSlotObject(object: Container): void;
}

export interface OfficialSpinePlayerResource {
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly textureUrls: Readonly<Record<string, string>>;
}

export interface ValidatedSpineResource {
  readonly atlasPages: readonly string[];
  readonly animationNames: readonly string[];
  readonly animationDurations: Readonly<Record<string, number>>;
  readonly slotNames: readonly string[];
}

export function validateOfficialSpineResource(options: {
  readonly resource: OfficialSpinePlayerResource;
  readonly requiredAnimations: readonly string[];
  readonly requiredSlots?: readonly string[];
}): ValidatedSpineResource {
  readSupportedSpineSkeletonVersion(options.resource.skeleton);
  const atlas = createTextureAtlas(options.resource.atlasText);
  const atlasPages = Object.freeze(atlas.pages.map((page) => page.name));
  if (atlasPages.length === 0 || atlasPages.some((page) => !page)) {
    throw new Error("Spine atlas must contain at least one named page.");
  }
  assertExactTexturePageClosure(
    atlasPages,
    Object.keys(options.resource.textureUrls),
  );
  let skeletonData: ReturnType<SkeletonJson["readSkeletonData"]>;
  try {
    skeletonData = new SkeletonJson(
      new AtlasAttachmentLoader(atlas),
    ).readSkeletonData(options.resource.skeleton);
  } catch (error) {
    throw new Error(`Spine skeleton failed to parse: ${formatError(error)}.`);
  }
  for (const animationName of options.requiredAnimations) {
    if (!skeletonData.findAnimation(animationName)) {
      throw new Error(`Spine animation "${animationName}" was not found.`);
    }
  }
  for (const slotName of options.requiredSlots ?? []) {
    if (!skeletonData.findSlot(slotName)) {
      throw new Error(`Spine slot "${slotName}" was not found.`);
    }
  }
  return Object.freeze({
    atlasPages,
    animationNames: Object.freeze(
      skeletonData.animations.map((animation) => animation.name),
    ),
    animationDurations: Object.freeze(
      Object.fromEntries(
        skeletonData.animations.map((animation) => [
          animation.name,
          animation.duration,
        ]),
      ),
    ),
    slotNames: Object.freeze(skeletonData.slots.map((slot) => slot.name)),
  });
}

export function createOfficialSpinePlayer(options: {
  readonly resource: OfficialSpinePlayerResource;
  readonly createError?: (message: string) => Error;
}): RendercoreSpineSlotPlayer {
  readSupportedSpineSkeletonVersion(options.resource.skeleton);
  return new OfficialSpinePlayer(options);
}

class OfficialSpinePlayer implements RendercoreSpineSlotPlayer {
  readonly view = new Container();
  readonly #resource: OfficialSpinePlayerResource;
  readonly #createError: (message: string) => Error;
  #spine: Spine | null = null;
  #completed = false;
  #loopCompleted = false;
  #destroyed = false;
  #initialized = false;

  constructor(options: {
    readonly resource: OfficialSpinePlayerResource;
    readonly createError?: (message: string) => Error;
  }) {
    this.#resource = options.resource;
    this.#createError =
      options.createError ?? ((message) => new Error(message));
  }

  async init(): Promise<void> {
    this.assertNotDestroyed();
    if (this.#initialized || this.#spine) {
      throw this.#createError("Spine player is already initialized.");
    }
    const textureEntries = Object.entries(this.#resource.textureUrls);
    const textures =
      textureEntries.length === 1 && textureEntries[0]
        ? ([
            [
              textureEntries[0][0],
              await Assets.load<Texture>(textureEntries[0][1]),
            ] as const,
          ] as const)
        : await Promise.all(
            textureEntries.map(async ([page, url]) => {
              const texture = await Assets.load<Texture>(url);
              return [page, texture] as const;
            }),
          );
    this.assertNotDestroyed();
    const atlas = createTextureAtlas(this.#resource.atlasText);
    assertExactTexturePageClosure(
      atlas.pages.map((page) => page.name),
      textures.map(([page]) => page),
    );
    const texturesByPage = new Map(textures);
    for (const page of atlas.pages) {
      const texture = texturesByPage.get(page.name);
      if (!texture) {
        throw this.#createError(
          `Spine texture for atlas page "${page.name}" was not loaded.`,
        );
      }
      page.setTexture(SpineTexture.from(texture.source));
    }
    let skeletonData: ReturnType<SkeletonJson["readSkeletonData"]>;
    try {
      skeletonData = new SkeletonJson(
        new AtlasAttachmentLoader(atlas),
      ).readSkeletonData(this.#resource.skeleton);
    } catch (error) {
      throw this.#createError(
        `Spine skeleton failed to parse: ${formatError(error)}.`,
      );
    }
    const spine = new Spine({
      skeletonData,
      autoUpdate: false,
      darkTint: false,
    });
    spine.autoUpdate = false;
    this.#spine = spine;
    this.#initialized = true;
    this.view.addChild(spine);
  }

  play(options: { readonly animationName: string; readonly loop: boolean }) {
    this.assertNotDestroyed();
    const spine = this.getSpine();
    const animation = spine.skeleton.data.findAnimation(options.animationName);
    if (!animation) {
      throw this.#createError(
        `Spine animation "${options.animationName}" was not found.`,
      );
    }
    this.#completed = false;
    this.#loopCompleted = false;
    spine.state.clearTracks();
    spine.state.clearListeners();
    spine.skeleton.setupPose();
    const entry = spine.state.setAnimation(
      0,
      options.animationName,
      options.loop,
    );
    entry.listener = {
      complete: (completedEntry) => {
        if (completedEntry === entry) {
          if (options.loop) this.#loopCompleted = true;
          else this.#completed = true;
        }
      },
    };
    spine.update(0);
  }

  update(deltaSeconds: number): {
    readonly completed: boolean;
    readonly loopCompleted?: boolean;
  } {
    assertValidSpineDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    this.getSpine().update(deltaSeconds);
    const loopCompleted = this.#loopCompleted;
    this.#loopCompleted = false;
    return Object.freeze({
      completed: this.#completed,
      ...(loopCompleted ? { loopCompleted: true } : {}),
    });
  }

  attachSlotObject(options: {
    readonly slot: string;
    readonly object: Container;
    readonly followSlotColor?: boolean;
  }): void {
    this.assertNotDestroyed();
    if (typeof options.slot !== "string" || options.slot.trim().length === 0) {
      throw this.#createError("Spine slot name must be non-empty.");
    }
    this.getSpine().addSlotObject(options.slot, options.object, {
      followAttachmentTimeline: false,
      followSlotColor: options.followSlotColor ?? true,
    });
  }

  removeSlotObject(object: Container): void {
    this.assertNotDestroyed();
    this.getSpine().removeSlotObject(object);
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#completed = false;
    this.#loopCompleted = false;
    if (this.#spine) {
      this.#spine.state.clearTracks();
      this.#spine.state.clearListeners();
      this.#spine.skeleton.setupPose();
      this.#spine.update(0);
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#spine?.state.clearListeners();
    this.#spine?.destroy();
    this.#spine = null;
    this.view.removeChildren();
    this.view.parent?.removeChild(this.view);
  }

  private getSpine(): Spine {
    if (!this.#spine) {
      throw this.#createError("Spine player has not initialized.");
    }
    return this.#spine;
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw this.#createError("Spine player was destroyed.");
    }
  }
}

export function assertValidSpineDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error("deltaSeconds must be a finite non-negative number.");
  }
}

function createTextureAtlas(atlasText: string): TextureAtlas {
  if (typeof atlasText !== "string" || atlasText.trim().length === 0) {
    throw new Error("Spine atlas must be non-empty raw text.");
  }
  try {
    return new TextureAtlas(atlasText);
  } catch (error) {
    throw new Error(`Spine atlas failed to parse: ${formatError(error)}.`);
  }
}

function assertExactTexturePageClosure(
  atlasPages: readonly string[],
  texturePages: readonly string[],
): void {
  const sortedAtlasPages = [...atlasPages].sort();
  const sortedTexturePages = [...texturePages].sort();
  if (
    new Set(sortedAtlasPages).size !== sortedAtlasPages.length ||
    JSON.stringify(sortedAtlasPages) !== JSON.stringify(sortedTexturePages)
  ) {
    throw new Error(
      `Spine atlas page contract changed: pages must exactly match texture pages; atlas=${sortedAtlasPages.join(
        ",",
      )}, textures=${sortedTexturePages.join(",")}.`,
    );
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

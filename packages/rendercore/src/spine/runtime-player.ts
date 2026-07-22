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
    readonly events: readonly RendercoreSpinePlaybackEvent[];
  };
  reset(): void;
  destroy(): void;
}

export interface RendercoreSpinePlaybackEvent {
  readonly name: string;
}

export interface RendercoreSpineAnimationEventOccurrence {
  readonly name: string;
  readonly time: number;
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
  readonly animationEvents: Readonly<
    Record<string, readonly RendercoreSpineAnimationEventOccurrence[]>
  >;
  readonly slotNames: readonly string[];
}

export function validateOfficialSpineResource(options: {
  readonly resource: OfficialSpinePlayerResource;
  readonly requiredAnimations: readonly string[];
  readonly requiredSlots?: readonly string[];
  readonly requiredAnimationEvents?: Readonly<
    Record<string, readonly string[]>
  >;
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
  const animationEvents = readSpineAnimationEvents(options.resource.skeleton);
  for (const [animationName, eventNames] of Object.entries(
    options.requiredAnimationEvents ?? {},
  )) {
    if (!skeletonData.findAnimation(animationName)) {
      throw new Error(`Spine animation "${animationName}" was not found.`);
    }
    for (const eventName of eventNames) {
      const occurrences = (animationEvents[animationName] ?? []).filter(
        (event) => event.name === eventName,
      );
      if (occurrences.length !== 1) {
        throw new Error(
          `Spine animation "${animationName}" event "${eventName}" must occur exactly once; found ${occurrences.length}.`,
        );
      }
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
    animationEvents,
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
  readonly #slotObjects = new Map<
    Container,
    { readonly slot: string; readonly wrapper: Container }
  >();
  readonly #slotOwners = new Map<string, Container>();
  #spine: Spine | null = null;
  #completed = false;
  #loopCompleted = false;
  #events: RendercoreSpinePlaybackEvent[] = [];
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
    const textureLoadsByUrl = new Map<string, Promise<Texture>>();
    const textures = await Promise.all(
      textureEntries.map(async ([page, url]) => {
        let loading = textureLoadsByUrl.get(url);
        if (!loading) {
          loading = loadOfficialSpineTexture(url, this.#createError);
          textureLoadsByUrl.set(url, loading);
        }
        return [page, await loading] as const;
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
    this.#events = [];
    spine.state.clearTracks();
    spine.state.clearListeners();
    spine.skeleton.setupPose();
    const entry = spine.state.setAnimation(
      0,
      options.animationName,
      options.loop,
    );
    entry.listener = {
      event: (eventEntry, event) => {
        if (eventEntry === entry)
          this.#events.push(Object.freeze({ name: event.data.name }));
      },
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
    readonly events: readonly RendercoreSpinePlaybackEvent[];
  } {
    assertValidSpineDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    this.getSpine().update(deltaSeconds);
    const loopCompleted = this.#loopCompleted;
    this.#loopCompleted = false;
    const events = Object.freeze(this.#events.slice());
    this.#events = [];
    return Object.freeze({
      completed: this.#completed,
      ...(loopCompleted ? { loopCompleted: true } : {}),
      events,
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
    const slot = options.slot.trim();
    this.detachSlotObject(options.object);
    const previous = this.#slotOwners.get(slot);
    if (previous) this.detachSlotObject(previous);

    // spine-pixi overwrites the transform of the object passed to
    // addSlotObject() on every update. Keep the content one level below that
    // object so its authored offset, scale, pivot and dynamic centering remain
    // local to the slot instead of being replaced by the slot bone matrix.
    const wrapper = new Container();
    wrapper.label = `rendercore-spine-slot:${slot}`;
    wrapper.addChild(options.object);
    try {
      this.getSpine().addSlotObject(slot, wrapper, {
        followAttachmentTimeline: false,
        followSlotColor: options.followSlotColor ?? true,
      });
    } catch (error) {
      wrapper.removeChild(options.object);
      wrapper.destroy();
      throw error;
    }
    this.#slotObjects.set(options.object, { slot, wrapper });
    this.#slotOwners.set(slot, options.object);
  }

  removeSlotObject(object: Container): void {
    this.assertNotDestroyed();
    this.detachSlotObject(object);
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#completed = false;
    this.#loopCompleted = false;
    this.#events = [];
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
    for (const object of [...this.#slotObjects.keys()]) {
      this.detachSlotObject(object);
    }
    this.#events = [];
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

  private detachSlotObject(object: Container): void {
    const attachment = this.#slotObjects.get(object);
    if (!attachment) return;
    this.#spine?.removeSlotObject(attachment.wrapper);
    if (object.parent === attachment.wrapper) {
      attachment.wrapper.removeChild(object);
    }
    attachment.wrapper.destroy();
    this.#slotObjects.delete(object);
    if (this.#slotOwners.get(attachment.slot) === object) {
      this.#slotOwners.delete(attachment.slot);
    }
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw this.#createError("Spine player was destroyed.");
    }
  }
}

export function readSpineAnimationEvents(
  skeleton: unknown,
): Readonly<
  Record<string, readonly RendercoreSpineAnimationEventOccurrence[]>
> {
  readSupportedSpineSkeletonVersion(skeleton);
  const animations =
    isRecord(skeleton) && isRecord(skeleton.animations)
      ? skeleton.animations
      : {};
  const result: Record<
    string,
    readonly RendercoreSpineAnimationEventOccurrence[]
  > = {};
  for (const [animationName, animationValue] of Object.entries(animations)) {
    const rawEvents =
      isRecord(animationValue) && Array.isArray(animationValue.events)
        ? animationValue.events
        : [];
    result[animationName] = Object.freeze(
      rawEvents.map((raw, index) => {
        if (
          !isRecord(raw) ||
          typeof raw.name !== "string" ||
          raw.name.length === 0
        ) {
          throw new Error(
            `Spine animation "${animationName}" event[${index}] must have a non-empty name.`,
          );
        }
        const time = raw.time === undefined ? 0 : raw.time;
        if (typeof time !== "number" || !Number.isFinite(time) || time < 0) {
          throw new Error(
            `Spine animation "${animationName}" event[${index}] time must be finite and non-negative.`,
          );
        }
        return Object.freeze({ name: raw.name, time });
      }),
    );
  }
  return Object.freeze(result);
}

async function loadOfficialSpineTexture(
  url: string,
  createError: (message: string) => Error,
): Promise<Texture> {
  let texture: Texture | null | undefined;
  try {
    texture = (await Assets.load({
      src: url,
      parser: "loadTextures",
    })) as Texture | null | undefined;
  } catch (error) {
    throw createError(
      `Spine texture failed to load from "${url}": ${formatError(error)}.`,
    );
  }
  if (!texture?.source) {
    throw createError(
      `Spine texture failed to load a valid Pixi texture from "${url}".`,
    );
  }
  return texture;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

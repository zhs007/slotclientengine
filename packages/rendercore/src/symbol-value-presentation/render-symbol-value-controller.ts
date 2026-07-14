import type { Container } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import type {
  RenderSymbol,
  RenderSymbolValueController,
} from "../symbol/index.js";
import { createOfficialSpinePlayer } from "../spine/runtime-player.js";
import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import type { SymbolValuePresentationResource } from "./types.js";
import { createSymbolValueDisplay } from "./value-display.js";

export function createRenderSymbolValueController(options: {
  readonly root: RenderSymbol;
  readonly resource: SymbolValuePresentationResource;
  readonly playerFactory?: RenderSymbolValuePlayerFactory;
}): RenderSymbolValueController {
  return new RenderSymbolValueControllerModel(options);
}

export type RenderSymbolValuePlayerFactory = (options: {
  readonly tier: SymbolValuePresentationResource["tiers"][number];
}) => RendercoreSpineSlotPlayer;

class RenderSymbolValueControllerModel implements RenderSymbolValueController {
  readonly #root: RenderSymbol;
  readonly #resource: SymbolValuePresentationResource;
  readonly #playerFactory: RenderSymbolValuePlayerFactory;
  #value: number | null = null;
  #player: ReturnType<typeof createOfficialSpinePlayer> | null = null;
  #tier: SymbolValuePresentationResource["tiers"][number] | null = null;
  #label: Container | null = null;
  #initializationError: unknown = null;
  #requestId = 0;
  #initialized = false;
  #landingAppearActive = false;
  #destroyed = false;

  constructor(options: {
    readonly root: RenderSymbol;
    readonly resource: SymbolValuePresentationResource;
    readonly playerFactory?: RenderSymbolValuePlayerFactory;
  }) {
    this.#root = options.root;
    this.#resource = options.resource;
    this.#playerFactory =
      options.playerFactory ??
      (({ tier }) =>
        createOfficialSpinePlayer({
          resource: {
            skeleton: tier.skeleton,
            atlasText: tier.atlasText,
            textureUrls: { [tier.atlasPage]: tier.textureUrl },
          },
        }));
  }

  setValue(value: number | null): void {
    this.assertNotDestroyed();
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(
        "Render symbol presentation value must be a positive safe integer or null.",
      );
    }
    if (value === this.#value) return;
    this.clearActive();
    this.#value = null;
    if (value === null) return;

    const tier = this.#resource.tiers.find(
      (candidate) =>
        candidate.maxExclusive === undefined || value < candidate.maxExclusive,
    );
    if (!tier) {
      throw new Error(`No valuePresentation tier covers ${value}.`);
    }
    let player: RendercoreSpineSlotPlayer | null = null;
    let label: Container | null = null;
    try {
      player = this.#playerFactory({ tier });
      label = createSymbolValueDisplay({
        value,
        resource: this.#resource,
      });
    } catch (error) {
      label?.destroy();
      player?.destroy();
      throw error;
    }
    const requestId = ++this.#requestId;
    this.#value = value;
    this.#player = player;
    this.#tier = tier;
    this.#label = label;
    const transform = tier.spec.transform;
    player.view.position.set(transform?.x ?? 0, transform?.y ?? 0);
    player.view.scale.set(transform?.scale ?? 1);
    void Promise.resolve(player.init()).then(
      () => {
        if (
          this.#destroyed ||
          this.#requestId !== requestId ||
          this.#player !== player ||
          this.#label !== label
        ) {
          return;
        }
        this.playCurrentAnimation();
        player.attachSlotObject({
          slot: this.#resource.text.slot,
          object: label,
          followSlotColor: true,
        });
        this.#root.overlayLayer.addChild(player.view);
        this.#initialized = true;
        this.syncVisibility();
      },
      (error: unknown) => {
        if (this.#requestId === requestId && this.#player === player) {
          this.#initializationError = error;
        }
      },
    );
  }

  getValue(): number | null {
    return this.#value;
  }

  requestLandingAppear(): boolean {
    this.assertNotDestroyed();
    if (this.#value === null || !this.#tier || !this.#player) return false;
    this.#landingAppearActive = true;
    if (this.#initialized) {
      this.playCurrentAnimation();
      this.syncPresentationView();
    }
    return true;
  }

  isLandingAppearActive(): boolean {
    return this.#landingAppearActive;
  }

  update(deltaSeconds: number): void {
    assertValidDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    if (this.#initializationError) throw this.#initializationError;
    if (this.#initialized && this.#player) {
      const result = this.#player.update(deltaSeconds);
      if (this.#landingAppearActive && result.completed) {
        this.#landingAppearActive = false;
        this.playCurrentAnimation();
      }
      this.syncPresentationView();
    }
  }

  resetForPoolRelease(): void {
    this.assertNotDestroyed();
    this.clearActive();
    this.#value = null;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.clearActive();
    this.#destroyed = true;
  }

  private syncVisibility(): void {
    this.#root.baseLayer.visible = false;
    this.#root.stateSprite.visible = false;
  }

  private syncPresentationView(): void {
    const player = this.#player;
    if (!this.#initialized || !player) return;
    if (player.view.parent !== this.#root.overlayLayer) {
      this.#root.overlayLayer.addChild(player.view);
    }
    this.syncVisibility();
  }

  private playCurrentAnimation(): void {
    const player = this.#player;
    const tier = this.#tier;
    if (!player || !tier) return;
    const playback = this.#landingAppearActive
      ? this.#resource.appearPlayback
      : tier.spec.playback;
    player.play({
      animationName: playback.animationName,
      loop: playback.loop,
    });
  }

  private clearActive(): void {
    this.#requestId += 1;
    const wasInitialized = this.#initialized;
    this.#initialized = false;
    this.#initializationError = null;
    this.#landingAppearActive = false;
    const player = this.#player;
    const label = this.#label;
    this.#player = null;
    this.#tier = null;
    this.#label = null;
    if (wasInitialized && player && label) player.removeSlotObject(label);
    label?.destroy();
    player?.destroy();
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error("Render symbol value controller was destroyed.");
    }
  }
}

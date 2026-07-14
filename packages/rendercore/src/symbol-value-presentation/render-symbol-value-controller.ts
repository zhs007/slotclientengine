import { Text } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import type {
  RenderSymbol,
  RenderSymbolValueController,
} from "../symbol/index.js";
import { createOfficialSpinePlayer } from "../spine/runtime-player.js";
import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import type { SymbolValuePresentationResource } from "./types.js";

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
  #label: Text | null = null;
  #initializationError: unknown = null;
  #requestId = 0;
  #initialized = false;
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
    this.#value = value;
    if (value === null) return;

    const tier = this.#resource.tiers.find(
      (candidate) =>
        candidate.maxExclusive === undefined || value < candidate.maxExclusive,
    );
    if (!tier) {
      throw new Error(`No valuePresentation tier covers ${value}.`);
    }
    const player = this.#playerFactory({ tier });
    const label = createValueLabel(String(value), this.#resource);
    const requestId = ++this.#requestId;
    this.#player = player;
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
        player.play({
          animationName: tier.spec.playback.animationName,
          loop: true,
        });
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

  update(deltaSeconds: number): void {
    assertValidDeltaSeconds(deltaSeconds);
    this.assertNotDestroyed();
    if (this.#initializationError) throw this.#initializationError;
    if (this.#initialized && this.#player) {
      this.#player.update(deltaSeconds);
      this.syncVisibility();
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

  private clearActive(): void {
    this.#requestId += 1;
    const wasInitialized = this.#initialized;
    this.#initialized = false;
    this.#initializationError = null;
    const player = this.#player;
    const label = this.#label;
    this.#player = null;
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

function createValueLabel(
  value: string,
  resource: SymbolValuePresentationResource,
): Text {
  const text = resource.text;
  const label = new Text({
    text: value,
    style: {
      fontFamily: text.fontFamily,
      fontSize: text.fontSize,
      fontWeight: text.fontWeight as never,
      fill: text.fill,
      stroke: { color: text.stroke, width: text.strokeWidth },
      align: "center",
    },
  });
  label.anchor.set(0.5);
  label.position.set(text.x, text.y);
  return label;
}

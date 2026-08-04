import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import type { Container } from "pixi.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import type { RenderSymbol } from "../symbol/render-symbol.js";
import type { RenderSymbolImageStringController } from "../symbol/types.js";
import type {
  SymbolImageStringNodeResource,
  SymbolImageStringResourceMap,
} from "./types.js";
import { createRenderMappedImageString } from "./mapped-display.js";

interface ActiveNode {
  readonly definition: SymbolImageStringNodeResource;
  readonly renderer: ReturnType<typeof createRenderMappedImageString>;
}

const controllers = new WeakMap<Container, SymbolImageStringController>();

export class SymbolImageStringController implements RenderSymbolImageStringController {
  readonly #root: RenderSymbol;
  readonly #nodes: readonly ActiveNode[];
  readonly #byName: ReadonlyMap<string, ActiveNode>;
  readonly #names: readonly string[];
  readonly #attached = new Set<ActiveNode>();
  #player: RendercoreSpineSlotPlayer | null = null;
  #owner: object | null = null;
  #state: string | null = null;
  #stateSynchronized = false;
  #destroyed = false;

  constructor(options: {
    readonly root: RenderSymbol;
    readonly nodes: readonly SymbolImageStringNodeResource[];
  }) {
    this.#root = options.root;
    this.#nodes = Object.freeze(
      options.nodes.map((definition) => {
        const renderer = createRenderMappedImageString({
          resource: definition.resource,
          text: definition.spec.initialText,
          anchor: definition.spec.anchor,
          specialValueImages: definition.specialValueImages,
        });
        renderer.container.position.set(
          definition.spec.transform.x,
          definition.spec.transform.y,
        );
        renderer.container.scale.set(definition.spec.transform.scale);
        return Object.freeze({ definition, renderer });
      }),
    );
    this.#byName = new Map(
      this.#nodes.map((node) => [node.definition.spec.name, node]),
    );
    this.#names = Object.freeze(
      this.#nodes.map((node) => node.definition.spec.name),
    );
    controllers.set(this.#root, this);
  }

  getNodeNames(): readonly string[] {
    this.assertUsable();
    return this.#names;
  }

  setText(name: string, text: string): void {
    this.assertUsable();
    this.requireNode(name).renderer.setText(text);
  }

  getText(name: string): string {
    this.assertUsable();
    return this.requireNode(name).renderer.getText();
  }

  syncState(state: string): void {
    this.assertUsable();
    const player = this.#player;
    const owner = this.#owner;
    this.#state = state;
    this.#stateSynchronized = true;
    this.detachSlot();
    this.#root.imageStringOverlayLayer.removeChildren();
    for (const node of this.#nodes) {
      const direct = node.definition.spec.targets.some(
        (target) => target.state === state && target.slot === undefined,
      );
      if (direct)
        this.#root.imageStringOverlayLayer.addChild(node.renderer.container);
    }
    if (player && owner) this.activate(state, player, owner);
  }

  activate(
    state: string,
    player: RendercoreSpineSlotPlayer,
    owner: object,
  ): void {
    this.assertUsable();
    if (this.#stateSynchronized && state !== this.#state) return;
    this.#state = state;
    const slotNodes = this.#nodes.flatMap((node) => {
      const target = node.definition.spec.targets.find(
        (candidate) =>
          candidate.state === state && candidate.slot !== undefined,
      );
      return target?.slot ? [{ node, slot: target.slot }] : [];
    });
    if (slotNodes.length === 0) return;
    this.detachSlot();
    this.#root.imageStringOverlayLayer.removeChildren();
    this.#player = player;
    this.#owner = owner;
    for (const { node, slot } of slotNodes) {
      player.attachSlotObject({
        slot,
        object: node.renderer.container,
        followSlotColor: node.definition.spec.followSlotColor,
      });
      this.#attached.add(node);
    }
  }

  deactivate(player: RendercoreSpineSlotPlayer, owner: object): void {
    if (this.#destroyed || this.#player !== player || this.#owner !== owner)
      return;
    this.detachSlot();
  }

  resetForPoolRelease(): void {
    this.assertUsable();
    this.#state = null;
    this.#stateSynchronized = false;
    this.detachSlot();
    this.#root.imageStringOverlayLayer.removeChildren();
    for (const node of this.#nodes) {
      node.renderer.setText(node.definition.spec.initialText);
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#state = null;
    this.#stateSynchronized = false;
    this.detachSlot();
    this.#root.imageStringOverlayLayer.removeChildren();
    this.#destroyed = true;
    controllers.delete(this.#root);
    for (const node of this.#nodes) node.renderer.destroy();
  }

  private detachSlot(): void {
    const player = this.#player;
    if (!player) return;
    for (const node of this.#attached) {
      player.removeSlotObject(node.renderer.container);
    }
    this.#attached.clear();
    this.#player = null;
    this.#owner = null;
  }

  private requireNode(name: string): ActiveNode {
    const node = this.#byName.get(name);
    if (!node) {
      throw new SymbolAnimationError(
        `Render symbol "${this.#root.symbol}" has no image-string node named "${name}".`,
      );
    }
    return node;
  }

  private assertUsable(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError(
        `Image-string controller for symbol "${this.#root.symbol}" was destroyed.`,
      );
    }
  }
}

export function notifySymbolImageStringSpineActive(
  root: Container,
  state: string,
  player: RendercoreSpineSlotPlayer,
  owner: object = player,
): void {
  controllers.get(root)?.activate(state, player, owner);
}

export function hasSymbolImageStringController(root: Container): boolean {
  return controllers.has(root);
}

export function notifySymbolImageStringSpineInactive(
  root: Container,
  player: RendercoreSpineSlotPlayer,
  owner: object = player,
): void {
  controllers.get(root)?.deactivate(player, owner);
}

export function createSymbolImageStringControllerFactories(
  resources: SymbolImageStringResourceMap,
): Readonly<
  Record<string, (root: RenderSymbol) => RenderSymbolImageStringController>
> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(resources).map(([symbol, nodes]) => [
        symbol,
        (root: RenderSymbol) =>
          new SymbolImageStringController({ root, nodes }),
      ]),
    ),
  );
}

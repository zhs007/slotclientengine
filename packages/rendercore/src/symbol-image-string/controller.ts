import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import type { Container } from "pixi.js";
import { createRenderImageString } from "../image-string/render-image-string.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import type { RenderSymbol } from "../symbol/render-symbol.js";
import type { RenderSymbolImageStringController } from "../symbol/types.js";
import type {
  SymbolImageStringNodeResource,
  SymbolImageStringResourceMap,
} from "./types.js";

interface ActiveNode {
  readonly definition: SymbolImageStringNodeResource;
  readonly renderer: ReturnType<typeof createRenderImageString>;
}

const controllers = new WeakMap<Container, SymbolImageStringController>();

export class SymbolImageStringController implements RenderSymbolImageStringController {
  readonly #root: RenderSymbol;
  readonly #nodes: readonly ActiveNode[];
  readonly #byName: ReadonlyMap<string, ActiveNode>;
  readonly #names: readonly string[];
  readonly #attached = new Set<ActiveNode>();
  #player: RendercoreSpineSlotPlayer | null = null;
  #destroyed = false;

  constructor(options: {
    readonly root: RenderSymbol;
    readonly nodes: readonly SymbolImageStringNodeResource[];
  }) {
    this.#root = options.root;
    this.#nodes = Object.freeze(
      options.nodes.map((definition) => {
        const renderer = createRenderImageString({
          resource: definition.resource,
          text: definition.spec.initialText,
          anchor: definition.spec.anchor,
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
    return this.requireNode(name).renderer.getSnapshot().text;
  }

  activate(state: string, player: RendercoreSpineSlotPlayer): void {
    this.assertUsable();
    this.detach();
    this.#player = player;
    for (const node of this.#nodes) {
      if (node.definition.spec.target.state !== state) continue;
      player.attachSlotObject({
        slot: node.definition.spec.target.slot,
        object: node.renderer.container,
        followSlotColor: node.definition.spec.followSlotColor,
      });
      this.#attached.add(node);
    }
  }

  deactivate(player: RendercoreSpineSlotPlayer): void {
    if (this.#destroyed || this.#player !== player) return;
    this.detach();
  }

  resetForPoolRelease(): void {
    this.assertUsable();
    this.detach();
    for (const node of this.#nodes) {
      node.renderer.setText(node.definition.spec.initialText);
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.detach();
    this.#destroyed = true;
    controllers.delete(this.#root);
    for (const node of this.#nodes) node.renderer.destroy();
  }

  private detach(): void {
    const player = this.#player;
    if (!player) return;
    for (const node of this.#attached) {
      player.removeSlotObject(node.renderer.container);
    }
    this.#attached.clear();
    this.#player = null;
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
): void {
  controllers.get(root)?.activate(state, player);
}

export function hasSymbolImageStringController(root: Container): boolean {
  return controllers.has(root);
}

export function notifySymbolImageStringSpineInactive(
  root: Container,
  player: RendercoreSpineSlotPlayer,
): void {
  controllers.get(root)?.deactivate(player);
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

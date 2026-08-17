import type { RendercoreSpineSlotPlayer } from "../spine/runtime-player.js";
import { Container } from "pixi.js";
import { SymbolAnimationError } from "../symbol/errors.js";
import type { SymbolPlayer } from "../symbol/symbol-player.js";
import type { SymbolPlayerImageStringController } from "../symbol/types.js";
import type {
  SymbolImageStringNodeResource,
  SymbolImageStringResourceMap,
} from "./types.js";
import { createRenderMappedImageString } from "./mapped-display.js";
import {
  createCloneableRenderObject,
  type CloneableRenderObject,
} from "../presentation/render-object.js";

interface ActiveNode {
  readonly definition: SymbolImageStringNodeResource;
  readonly renderer: ReturnType<typeof createRenderMappedImageString>;
}

type ImageStringTextUpdate = Readonly<{ name: string; text: string }>;

const controllers = new WeakMap<Container, SymbolImageStringController>();

export class SymbolImageStringController implements SymbolPlayerImageStringController {
  readonly #root: SymbolPlayer;
  readonly #nodes: readonly ActiveNode[];
  readonly #byName: ReadonlyMap<string, ActiveNode>;
  readonly #names: readonly string[];
  readonly #attached = new Map<ActiveNode, string>();
  #player: RendercoreSpineSlotPlayer | null = null;
  #owner: object | null = null;
  #activeState: string | null = null;
  #state: string | null = null;
  #stateSynchronized = false;
  #destroyed = false;

  constructor(options: {
    readonly root: SymbolPlayer;
    readonly nodes: readonly SymbolImageStringNodeResource[];
  }) {
    this.#root = options.root;
    this.#nodes = Object.freeze(
      options.nodes.map((definition) => {
        const renderer = createRenderMappedImageString({
          resource: definition.resource,
          text: "",
          anchor: definition.spec.anchor,
          specialValueImages: definition.specialValueImages,
        });
        renderer.container.position.set(
          definition.spec.transform.x,
          definition.spec.transform.y,
        );
        renderer.container.scale.set(definition.spec.transform.scale);
        renderer.container.visible = false;
        renderer.container.renderable = false;
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

  validateTexts(values: readonly ImageStringTextUpdate[]): void {
    this.assertUsable();
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value.name)) {
        throw new SymbolAnimationError(
          `Render symbol "${this.#root.symbol}" image-string text batch contains duplicate node "${value.name}".`,
        );
      }
      seen.add(value.name);
      this.requireNode(value.name).renderer.validateText(value.text);
    }
  }

  setTexts(values: readonly ImageStringTextUpdate[]): void {
    this.validateTexts(values);
    for (const value of values)
      this.requireNode(value.name).renderer.setText(value.text);
  }

  setText(name: string, text: string): void {
    this.assertUsable();
    this.setTexts([{ name, text }]);
  }

  getText(name: string): string {
    this.assertUsable();
    return this.requireNode(name).renderer.getText();
  }

  cloneText(name: string): CloneableRenderObject {
    this.assertUsable();
    const node = this.requireNode(name);
    const profile =
      this.#state === "spinBlur" && node.definition.spinBlurProfile
        ? node.definition.spinBlurProfile
        : node.definition;
    const text = node.renderer.getText();
    const createClone = (): CloneableRenderObject => {
      const renderer = createRenderMappedImageString({
        resource: profile.resource,
        text,
        anchor: node.definition.spec.anchor,
        specialValueImages: profile.specialValueImages,
      });
      renderer.container.position.set(
        node.definition.spec.transform.x,
        node.definition.spec.transform.y,
      );
      renderer.container.scale.set(node.definition.spec.transform.scale);
      const root = new Container();
      root.addChild(renderer.container);
      return createCloneableRenderObject({
        view: root,
        clone: createClone,
        destroy: () => {
          renderer.destroy();
          root.destroy({ children: false });
        },
      });
    };
    return createClone();
  }

  getTextView(name: string): Container {
    this.assertUsable();
    return this.requireNode(name).renderer.container;
  }

  syncState(state: string): void {
    this.assertUsable();
    const player = this.#player;
    const owner = this.#owner;
    this.#state = state;
    this.#stateSynchronized = true;
    const canKeepSharedAttachment =
      this.#player !== null &&
      this.#attached.size > 0 &&
      [...this.#attached.keys()].every(
        (node) =>
          node.definition.spec.spineSlot !== undefined &&
          node.definition.spineStates?.has(state) === true,
      );
    if (this.#activeState !== state && !canKeepSharedAttachment)
      this.detachSlot();
    else if (canKeepSharedAttachment) this.#activeState = state;
    this.#root.imageStringOverlayLayer.removeChildren();
    for (const node of this.#nodes) {
      const profile =
        state === "spinBlur" && node.definition.spinBlurProfile
          ? node.definition.spinBlurProfile
          : node.definition;
      node.renderer.setProfile({
        resource: profile.resource,
        specialValueImages: profile.specialValueImages,
      });
      const direct = node.definition.spec.targets.some(
        (target) => target.state === state && target.slot === undefined,
      );
      node.renderer.container.visible = direct || this.#attached.has(node);
      node.renderer.container.renderable = direct || this.#attached.has(node);
      if (direct && !this.#attached.has(node))
        this.#root.imageStringOverlayLayer.addChild(node.renderer.container);
    }
    if (player && owner && this.#activeState === state)
      this.activate(state, player, owner);
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
      const slot =
        (node.definition.spec.spineSlot !== undefined &&
        node.definition.spineStates?.has(state) === true
          ? node.definition.spec.spineSlot
          : undefined) ??
        node.definition.spec.targets.find(
          (candidate) =>
            candidate.state === state && candidate.slot !== undefined,
        )?.slot;
      return slot ? [{ node, slot }] : [];
    });
    if (slotNodes.length === 0) {
      if (this.#activeState === state) this.detachSlot();
      return;
    }
    const samePlayer = this.#player === player;
    const sameAttachments =
      samePlayer &&
      this.#attached.size === slotNodes.length &&
      slotNodes.every(({ node, slot }) => this.#attached.get(node) === slot);
    if (sameAttachments) {
      this.#owner = owner;
      this.#activeState = state;
      for (const { node } of slotNodes) {
        node.renderer.container.visible = true;
        node.renderer.container.renderable = true;
      }
      return;
    }
    this.detachSlot();
    this.#root.imageStringOverlayLayer.removeChildren();
    this.#player = player;
    this.#owner = owner;
    this.#activeState = state;
    for (const { node, slot } of slotNodes) {
      node.renderer.container.visible = true;
      node.renderer.container.renderable = true;
      player.attachSlotObject({
        slot,
        object: node.renderer.container,
        followSlotColor: node.definition.spec.followSlotColor,
      });
      this.#attached.set(node, slot);
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
    this.#activeState = null;
    this.detachSlot();
    this.#root.imageStringOverlayLayer.removeChildren();
    for (const node of this.#nodes) {
      node.renderer.container.visible = false;
      node.renderer.container.renderable = false;
      node.renderer.setProfile({
        resource: node.definition.resource,
        specialValueImages: node.definition.specialValueImages,
      });
      node.renderer.setText("");
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#state = null;
    this.#stateSynchronized = false;
    this.#activeState = null;
    this.detachSlot();
    this.#root.imageStringOverlayLayer.removeChildren();
    this.#destroyed = true;
    controllers.delete(this.#root);
    for (const node of this.#nodes) node.renderer.destroy();
  }

  private detachSlot(): void {
    const player = this.#player;
    if (!player) return;
    for (const node of this.#attached.keys()) {
      player.removeSlotObject(node.renderer.container);
      node.renderer.container.visible = false;
      node.renderer.container.renderable = false;
    }
    this.#attached.clear();
    this.#player = null;
    this.#owner = null;
    this.#activeState = null;
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
  Record<string, (root: SymbolPlayer) => SymbolPlayerImageStringController>
> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(resources).map(([symbol, nodes]) => [
        symbol,
        (root: SymbolPlayer) =>
          new SymbolImageStringController({ root, nodes }),
      ]),
    ),
  );
}

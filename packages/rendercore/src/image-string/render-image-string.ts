import { Container, Sprite } from "pixi.js";
import { ImageStringError } from "./errors.js";
import { layoutImageString, validateImageStringAnchor } from "./layout.js";
import type {
  ImageStringResource,
  ImageStringSnapshot,
  RenderImageString,
} from "./types.js";

export function createRenderImageString(options: {
  readonly resource: ImageStringResource;
  readonly text: string;
  readonly anchor?: { readonly x: number; readonly y: number };
}): RenderImageString {
  options.resource.assertUsable();
  let snapshot = layoutImageString({
    manifest: options.resource.manifest,
    text: options.text,
    anchor: options.anchor,
  });
  const container = new Container();
  const active: Sprite[] = [];
  const pool: Sprite[] = [];
  let destroyed = false;

  function commit(next: ImageStringSnapshot): void {
    while (active.length > next.occurrences.length) {
      const sprite = active.pop()!;
      container.removeChild(sprite);
      sprite.visible = false;
      pool.push(sprite);
    }
    for (let index = 0; index < next.occurrences.length; index += 1) {
      const occurrence = next.occurrences[index];
      let sprite = active[index];
      if (!sprite) {
        sprite = pool.pop() ?? new Sprite();
        active.push(sprite);
        container.addChild(sprite);
      }
      sprite.texture = options.resource.textures[occurrence.path];
      sprite.position.set(occurrence.x, occurrence.y);
      sprite.width = occurrence.width;
      sprite.height = occurrence.height;
      sprite.visible = true;
      container.setChildIndex(sprite, index);
    }
    container.pivot.set(
      next.logicalBounds.width * next.anchor.x,
      next.logicalBounds.height * next.anchor.y,
    );
    snapshot = next;
  }

  commit(snapshot);
  return Object.freeze({
    container,
    setText(text: string): void {
      assertUsable();
      const next = layoutImageString({
        manifest: options.resource.manifest,
        text,
        anchor: snapshot.anchor,
      });
      options.resource.assertUsable();
      commit(next);
    },
    setAnchor(anchor: { readonly x: number; readonly y: number }): void {
      assertUsable();
      const validated = validateImageStringAnchor(anchor);
      commit(Object.freeze({ ...snapshot, anchor: validated }));
    },
    getSnapshot(): ImageStringSnapshot {
      assertUsable();
      return snapshot;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const sprite of [...active, ...pool])
        sprite.destroy({
          children: false,
          texture: false,
          textureSource: false,
        });
      active.length = 0;
      pool.length = 0;
      container.destroy({ children: false });
    },
  });

  function assertUsable(): void {
    if (destroyed) throw new ImageStringError("RenderImageString 已销毁。");
    options.resource.assertUsable();
  }
}

import { Container, Sprite } from "pixi.js";
import { ImageStringError } from "../data/errors.js";
import { getCompiledImageStringResource } from "./compiled.js";
import {
  createImageStringLayoutBuffer,
  layoutCompiledImageString,
  snapshotImageStringGeometry,
  snapshotImageStringLayout,
  validateImageStringAnchor,
  type ImageStringLayoutBuffer,
} from "./layout.js";
import type {
  ImageStringResource,
  ImageStringSnapshot,
  RenderImageString,
} from "./types.js";

const MAX_SPARE_ENTRIES = 16;

interface RendererState {
  resource: ImageStringResource;
  current: ImageStringLayoutBuffer;
  scratch: ImageStringLayoutBuffer;
  readonly active: Sprite[];
  readonly spare: Sprite[];
  destroyed: boolean;
}

const states = new WeakMap<RenderImageString, RendererState>();

export function createRenderImageString(options: {
  readonly resource: ImageStringResource;
  readonly text: string;
  readonly anchor?: { readonly x: number; readonly y: number };
}): RenderImageString {
  options.resource.assertUsable();
  const container = new Container();
  const state: RendererState = {
    resource: options.resource,
    current: createImageStringLayoutBuffer(),
    scratch: createImageStringLayoutBuffer(),
    active: [],
    spare: [],
    destroyed: false,
  };
  layoutCompiledImageString({
    compiled: getCompiledImageStringResource(options.resource),
    text: options.text,
    anchor: options.anchor ?? { x: 0.5, y: 0.5 },
    output: state.scratch,
  });
  commit(container, state, options.resource);

  let renderer!: RenderImageString;
  renderer = Object.freeze({
    container,
    setResource(
      nextResource: ImageStringResource,
      text: string = state.current.text,
    ): void {
      assertRendererUsable(state);
      nextResource.assertUsable();
      if (nextResource === state.resource) {
        if (text !== state.current.text) renderer.setText(text);
        return;
      }
      layoutCompiledImageString({
        compiled: getCompiledImageStringResource(nextResource),
        text,
        anchor: { x: state.current.anchorX, y: state.current.anchorY },
        output: state.scratch,
      });
      commit(container, state, nextResource);
      state.resource = nextResource;
    },
    setText(text: string): void {
      assertUsable(state);
      if (text === state.current.text) return;
      layoutCompiledImageString({
        compiled: getCompiledImageStringResource(state.resource),
        text,
        anchor: { x: state.current.anchorX, y: state.current.anchorY },
        output: state.scratch,
      });
      state.resource.assertUsable();
      commit(container, state, state.resource);
    },
    setAnchor(anchor: { readonly x: number; readonly y: number }): void {
      assertUsable(state);
      const validated = validateImageStringAnchor(anchor);
      if (
        validated.x === state.current.anchorX &&
        validated.y === state.current.anchorY
      )
        return;
      state.current.anchorX = validated.x;
      state.current.anchorY = validated.y;
      applyPivot(container, state.current);
    },
    getText(): string {
      assertUsable(state);
      return state.current.text;
    },
    getGeometry() {
      assertUsable(state);
      return snapshotImageStringGeometry(state.current);
    },
    destroy(): void {
      if (state.destroyed) return;
      state.destroyed = true;
      for (const sprite of state.active) destroySprite(sprite);
      for (const sprite of state.spare) destroySprite(sprite);
      state.active.length = 0;
      state.spare.length = 0;
      state.current.occurrences.length = 0;
      state.scratch.occurrences.length = 0;
      container.destroy({ children: false });
    },
  });
  states.set(renderer, state);
  return renderer;
}

export function inspectRenderImageString(
  renderer: RenderImageString,
): ImageStringSnapshot {
  const state = states.get(renderer);
  if (!state) throw new ImageStringError("未知 RenderImageString instance。");
  assertUsable(state);
  return snapshotImageStringLayout(state.current);
}

function commit(
  container: Container,
  state: RendererState,
  nextResource: ImageStringResource,
): void {
  while (state.active.length > state.scratch.glyphCount) {
    const sprite = state.active.pop()!;
    container.removeChild(sprite);
    sprite.visible = false;
    if (state.spare.length < MAX_SPARE_ENTRIES) state.spare.push(sprite);
    else destroySprite(sprite);
  }
  for (let index = 0; index < state.scratch.glyphCount; index += 1) {
    const occurrence = state.scratch.occurrences[index]!;
    let sprite = state.active[index];
    if (!sprite) {
      sprite = state.spare.pop() ?? new Sprite();
      state.active.push(sprite);
      container.addChild(sprite);
    }
    sprite.texture = nextResource.textures[occurrence.path]!;
    sprite.position.set(occurrence.x, occurrence.y);
    sprite.width = occurrence.width;
    sprite.height = occurrence.height;
    sprite.visible = true;
    container.setChildIndex(sprite, index);
  }
  const previous = state.current;
  state.current = state.scratch;
  state.scratch = previous;
  state.current.occurrences.length = Math.min(
    state.current.occurrences.length,
    state.current.glyphCount + MAX_SPARE_ENTRIES,
  );
  state.scratch.occurrences.length = Math.min(
    state.scratch.occurrences.length,
    MAX_SPARE_ENTRIES,
  );
  applyPivot(container, state.current);
}

function applyPivot(
  container: Container,
  layout: ImageStringLayoutBuffer,
): void {
  const x = layout.glyphCount === 0 ? 0 : layout.visualLeft;
  const y = layout.glyphCount === 0 ? 0 : layout.visualTop;
  const width =
    layout.glyphCount === 0 ? layout.logicalWidth : layout.visualWidth;
  const height =
    layout.glyphCount === 0 ? layout.logicalHeight : layout.visualHeight;
  container.pivot.set(x + width * layout.anchorX, y + height * layout.anchorY);
}

function destroySprite(sprite: Sprite): void {
  sprite.destroy({ children: false, texture: false, textureSource: false });
}

function assertUsable(state: RendererState): void {
  assertRendererUsable(state);
  state.resource.assertUsable();
}

function assertRendererUsable(state: RendererState): void {
  if (state.destroyed) throw new ImageStringError("RenderImageString 已销毁。");
}

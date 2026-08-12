import { Text, type TextStyleOptions } from "pixi.js";
import {
  createCloneableRenderObject,
  getRenderObjectAdapter,
  registerRenderObjectAlias,
  type CloneableRenderObject,
} from "./render-object.js";

export interface TextRenderObject extends CloneableRenderObject {
  setText(text: string): void;
  getText(): string;
  clone(): TextRenderObject;
}

export interface CreateTextRenderObjectOptions {
  readonly text: string;
  readonly style?: TextStyleOptions;
  readonly anchor?: { readonly x: number; readonly y: number };
}

export function createTextRenderObject(
  options: CreateTextRenderObjectOptions,
): TextRenderObject {
  const text = new Text({ text: options.text, style: options.style });
  text.anchor.set(options.anchor?.x ?? 0.5, options.anchor?.y ?? 0.5);
  let object!: TextRenderObject;
  const base = createCloneableRenderObject({
    view: text,
    clone: () =>
      createTextRenderObject({
        text: text.text,
        style: text.style,
        anchor: { x: text.anchor.x, y: text.anchor.y },
      }),
    destroy: () => text.destroy(),
  });
  object = Object.freeze({
    ...base,
    setText: (value: string) => {
      text.text = value;
    },
    getText: () => text.text,
    clone: () =>
      createTextRenderObject({
        text: text.text,
        style: text.style,
        anchor: { x: text.anchor.x, y: text.anchor.y },
      }),
  }) satisfies TextRenderObject;
  registerRenderObjectAlias(object, getRenderObjectAdapter(base));
  return object;
}

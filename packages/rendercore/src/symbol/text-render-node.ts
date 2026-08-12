import { Text, type TextStyleOptions } from "pixi.js";
import {
  createRenderNode,
  getRenderNodeAdapter,
  registerRenderNodeAlias,
  type RenderNode,
} from "./render-node.js";

export interface TextRenderNode extends RenderNode {
  setText(text: string): void;
  getText(): string;
}

export interface CreateTextRenderNodeOptions {
  readonly text: string;
  readonly style?: TextStyleOptions;
  readonly anchor?: { readonly x: number; readonly y: number };
}

export function createTextRenderNode(
  options: CreateTextRenderNodeOptions,
): TextRenderNode {
  const text = new Text({ text: options.text, style: options.style });
  text.anchor.set(options.anchor?.x ?? 0.5, options.anchor?.y ?? 0.5);
  const base = createRenderNode({
    view: text,
    destroy: () => text.destroy(),
  });
  const node = Object.freeze({
    ...base,
    setText: (value: string) => {
      text.text = value;
    },
    getText: () => text.text,
  });
  registerRenderNodeAlias(node, getRenderNodeAdapter(base));
  return node;
}

import { Container, Sprite, type Texture } from "pixi.js";
import {
  createRenderImageString,
  validateImageStringText,
  type ImageStringResource,
} from "../image-string/index.js";

export interface SymbolImageStringSpecialImageResource {
  readonly path: string;
  readonly texture: Texture;
}

export interface RenderMappedImageString {
  readonly container: Container;
  setProfile(options: {
    readonly resource: ImageStringResource;
    readonly specialValueImages?: Readonly<
      Record<string, SymbolImageStringSpecialImageResource>
    >;
  }): void;
  setText(text: string): void;
  getText(): string;
  destroy(): void;
}

export function createRenderMappedImageString(options: {
  readonly resource: ImageStringResource;
  readonly text: string;
  readonly anchor: Readonly<{ x: number; y: number }>;
  readonly specialValueImages?: Readonly<
    Record<string, SymbolImageStringSpecialImageResource>
  >;
}): RenderMappedImageString {
  let resource = options.resource;
  let specialValueImages: Readonly<
    Record<string, SymbolImageStringSpecialImageResource>
  > = options.specialValueImages ?? Object.freeze({});
  const glyphs = createRenderImageString({
    resource: options.resource,
    text: resolveInitialGlyphText(options.text, specialValueImages),
    anchor: options.anchor,
  });
  const container = glyphs.container;
  const special = new Sprite();
  let text = options.text;
  let destroyed = false;

  commit(text);

  return Object.freeze({
    container,
    setProfile(next: {
      readonly resource: ImageStringResource;
      readonly specialValueImages?: Readonly<
        Record<string, SymbolImageStringSpecialImageResource>
      >;
    }): void {
      assertUsable();
      const nextSpecialValueImages =
        next.specialValueImages ?? Object.freeze({});
      if (
        next.resource === resource &&
        nextSpecialValueImages === specialValueImages
      )
        return;
      const glyphText = resolveInitialGlyphText(text, nextSpecialValueImages);
      validateImageStringText(glyphText, next.resource.manifest);
      glyphs.setResource(next.resource, glyphText);
      resource = next.resource;
      specialValueImages = nextSpecialValueImages;
      commit(text);
    },
    setText(nextText: string): void {
      assertUsable();
      if (nextText === text) return;
      validateImageStringText(nextText);
      const mapped = specialValueImages[nextText];
      if (!mapped) glyphs.setText(nextText);
      text = nextText;
      commit(nextText);
    },
    getText(): string {
      assertUsable();
      return text;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      container.removeChild(special);
      special.destroy({
        children: false,
        texture: false,
        textureSource: false,
      });
      glyphs.destroy();
    },
  });

  function commit(nextText: string): void {
    const mapped = specialValueImages[nextText];
    if (mapped) {
      glyphs.setText("");
      special.texture = mapped.texture;
      if (special.parent !== container) container.addChild(special);
      container.pivot.set(
        special.width * options.anchor.x,
        special.height * options.anchor.y,
      );
      return;
    }
    if (special.parent === container) container.removeChild(special);
  }

  function assertUsable(): void {
    if (destroyed)
      throw new Error("Mapped image-string display was destroyed.");
    resource.assertUsable();
  }
}

function resolveInitialGlyphText(
  text: string,
  specialValueImages: Readonly<
    Record<string, SymbolImageStringSpecialImageResource>
  >,
): string {
  validateImageStringText(text);
  return specialValueImages[text] ? "" : text;
}

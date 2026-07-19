import { Assets, Sprite, Text, type Texture } from "pixi.js";
import {
  createRenderImageString,
  validateImageStringText,
} from "../image-string/index.js";
import { SymbolAssetError } from "../symbol/errors.js";
import type {
  SymbolValueDisplayHandle,
  SymbolValuePresentationResource,
} from "./types.js";

export async function createSymbolValueDisplay(options: {
  readonly value: number;
  readonly tierIndex: number;
  readonly resource: SymbolValuePresentationResource;
}): Promise<SymbolValueDisplayHandle> {
  const text = String(options.value);
  const spec = options.resource.text;
  if (spec.type === "image-string") {
    const binding = requireImageStringBinding(options);
    validateImageStringText(text, binding.resource.manifest);
    const renderer = createRenderImageString({
      resource: binding.resource,
      text,
      anchor: binding.anchor,
    });
    renderer.container.position.set(binding.transform.x, binding.transform.y);
    renderer.container.scale.set(binding.transform.scale);
    let currentText = text;
    return Object.freeze({
      container: renderer.container,
      type: "image-string" as const,
      get text(): string {
        return currentText;
      },
      resourcePath: binding.resourcePath,
      setText(next: string): void {
        validateImageStringText(next, binding.resource.manifest);
        renderer.setText(next);
        currentText = next;
      },
      destroy(): void {
        renderer.destroy();
      },
    });
  }

  if (spec.type === "image") {
    const url = assertSymbolValueDisplayResource(options);
    if (url === null) {
      throw new SymbolAssetError(
        `Symbol "${options.resource.symbol}" image display resource is invalid.`,
      );
    }
    const sprite = new Sprite(await Assets.load<Texture>(url));
    sprite.anchor.set(0.5);
    sprite.position.set(spec.x, spec.y);
    return createStaticHandle({
      container: sprite,
      type: "image",
      text,
    });
  }

  const label = new Text({
    text,
    style: {
      fontFamily: spec.fontFamily,
      fontSize: spec.fontSize,
      fontWeight: spec.fontWeight as never,
      fill: spec.fill,
      stroke: { color: spec.stroke, width: spec.strokeWidth },
      align: "center",
    },
  });
  label.anchor.set(0.5);
  label.position.set(spec.x, spec.y);
  let currentText = text;
  return Object.freeze({
    container: label,
    type: "font" as const,
    get text(): string {
      return currentText;
    },
    setText(next: string): void {
      label.text = next;
      currentText = next;
    },
    destroy(): void {
      label.destroy();
    },
  });
}

export function assertSymbolValueDisplayResource(options: {
  readonly value: number;
  readonly tierIndex?: number;
  readonly resource: SymbolValuePresentationResource;
}): string | null {
  if (options.resource.text.type === "image-string") {
    const tierIndex =
      options.tierIndex ?? resolveTierIndex(options.resource, options.value);
    const binding = options.resource.imageStringTierBindings?.[tierIndex];
    if (!binding) {
      throw new SymbolAssetError(
        `Symbol "${options.resource.symbol}" value ${options.value} has no image-string tier binding.`,
      );
    }
    try {
      validateImageStringText(String(options.value), binding.resource.manifest);
    } catch (error) {
      throw new SymbolAssetError(
        `Symbol "${options.resource.symbol}" value ${options.value} cannot be rendered by image-string tier ${tierIndex}: ${formatError(error)}.`,
      );
    }
    return null;
  }
  if (options.resource.text.type !== "image") return null;
  const url = options.resource.textImageUrls[options.value];
  if (!url) {
    throw new SymbolAssetError(
      `Symbol "${options.resource.symbol}" value ${options.value} has no configured image resource.`,
    );
  }
  return url;
}

function requireImageStringBinding(options: {
  readonly value: number;
  readonly tierIndex: number;
  readonly resource: SymbolValuePresentationResource;
}) {
  const binding = options.resource.imageStringTierBindings?.[options.tierIndex];
  if (!binding) {
    throw new SymbolAssetError(
      `Symbol "${options.resource.symbol}" value ${options.value} has no image-string tier binding ${options.tierIndex}.`,
    );
  }
  return binding;
}

function resolveTierIndex(
  resource: SymbolValuePresentationResource,
  value: number,
): number {
  const index = resource.tiers.findIndex(
    (tier) => tier.maxExclusive === undefined || value < tier.maxExclusive,
  );
  if (index < 0)
    throw new SymbolAssetError(`No valuePresentation tier covers ${value}.`);
  return index;
}

function createStaticHandle(options: {
  readonly container: Sprite;
  readonly type: "image";
  readonly text: string;
}): SymbolValueDisplayHandle {
  return Object.freeze({
    ...options,
    setText(next: string): void {
      if (next !== options.text) {
        throw new SymbolAssetError(
          "A complete value image display cannot change text in place.",
        );
      }
    },
    destroy(): void {
      options.container.destroy();
    },
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

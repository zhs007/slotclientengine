import { Assets, Sprite, Text, type Texture } from "pixi.js";
import { validateImageStringText } from "../image-string/index.js";
import { createRenderMappedImageString } from "../symbol-image-string/mapped-display.js";
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
    const renderer = createRenderMappedImageString({
      resource: binding.resource,
      text,
      anchor: binding.anchor,
      specialValueImages: binding.specialValueImages,
    });
    renderer.container.position.set(binding.transform.x, binding.transform.y);
    renderer.container.scale.set(binding.transform.scale);
    let currentText = text;
    let currentProfile: "normal" | "spinBlur" = "normal";
    const createHandle = (): SymbolValueDisplayHandle =>
      Object.freeze({
        container: renderer.container,
        type: "image-string" as const,
        get text(): string {
          return currentText;
        },
        resourcePath: binding.resourcePath,
        setProfile(profile: "normal" | "spinBlur"): void {
          if (profile === currentProfile) return;
          if (profile === "spinBlur" && !binding.spinBlurProfile) {
            throw new SymbolAssetError(
              `Symbol "${options.resource.symbol}" image-string tier ${options.tierIndex} has no spinBlur profile.`,
            );
          }
          const next =
            profile === "spinBlur" ? binding.spinBlurProfile! : binding;
          renderer.setProfile({
            resource: next.resource,
            specialValueImages: next.specialValueImages,
          });
          currentProfile = profile;
        },
        setText(next: string): void {
          renderer.setText(next);
          currentText = next;
        },
        clone(): SymbolValueDisplayHandle {
          const cloneRenderer = createRenderMappedImageString({
            resource:
              currentProfile === "spinBlur"
                ? binding.spinBlurProfile!.resource
                : binding.resource,
            text: currentText,
            anchor: binding.anchor,
            specialValueImages:
              currentProfile === "spinBlur"
                ? binding.spinBlurProfile!.specialValueImages
                : binding.specialValueImages,
          });
          cloneRenderer.container.position.copyFrom(
            renderer.container.position,
          );
          cloneRenderer.container.scale.copyFrom(renderer.container.scale);
          let cloneText = currentText;
          return Object.freeze({
            container: cloneRenderer.container,
            type: "image-string" as const,
            get text(): string {
              return cloneText;
            },
            resourcePath:
              currentProfile === "spinBlur"
                ? binding.spinBlurProfile!.resourcePath
                : binding.resourcePath,
            setText(next: string): void {
              cloneRenderer.setText(next);
              cloneText = next;
            },
            clone(): SymbolValueDisplayHandle {
              throw new SymbolAssetError(
                "A detached symbol value clone cannot be cloned again.",
              );
            },
            destroy(): void {
              cloneRenderer.destroy();
            },
          });
        },
        destroy(): void {
          renderer.destroy();
        },
      });
    return createHandle();
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
  const createFontHandle = (textValue: string): SymbolValueDisplayHandle => {
    const cloneLabel = new Text({
      text: textValue,
      style: label.style,
    });
    cloneLabel.anchor.copyFrom(label.anchor);
    cloneLabel.position.copyFrom(label.position);
    let cloneText = textValue;
    return Object.freeze({
      container: cloneLabel,
      type: "font" as const,
      get text(): string {
        return cloneText;
      },
      setText(next: string): void {
        cloneLabel.text = next;
        cloneText = next;
      },
      clone(): SymbolValueDisplayHandle {
        return createFontHandle(cloneText);
      },
      destroy(): void {
        cloneLabel.destroy();
      },
    });
  };
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
    clone(): SymbolValueDisplayHandle {
      return createFontHandle(currentText);
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
      const valueText = String(options.value);
      validateImageStringText(valueText);
      if (!binding.specialValueImages?.[valueText]) {
        validateImageStringText(valueText, binding.resource.manifest);
      }
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
    clone(): SymbolValueDisplayHandle {
      const clone = new Sprite(options.container.texture);
      clone.anchor.copyFrom(options.container.anchor);
      clone.position.copyFrom(options.container.position);
      clone.scale.copyFrom(options.container.scale);
      return createStaticHandle({
        container: clone,
        type: "image",
        text: options.text,
      });
    },
    destroy(): void {
      options.container.destroy();
    },
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

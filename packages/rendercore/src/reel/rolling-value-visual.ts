import { Container } from "pixi.js";
import { createRenderMappedImageString } from "../symbol-image-string/mapped-display.js";
import type { SymbolValuePresentationResource } from "../symbol-value-presentation/types.js";
import { formatSymbolValueDisplayText } from "../symbol-value-presentation/value-text-formatter.js";
import type { SymbolValueTextFormatter } from "../symbol/types.js";
import { ReelError } from "./errors.js";
import type { ReelRollingValueVisual } from "./types.js";

export function resolveRollingValueTier(
  resource: SymbolValuePresentationResource,
  value: number,
): number {
  assertRollingValue(value);
  const tierIndex = resource.tiers.findIndex(
    (tier) => tier.maxExclusive === undefined || value < tier.maxExclusive,
  );
  if (tierIndex < 0) {
    throw new ReelError(
      `Symbol "${resource.symbol}" has no valuePresentation tier for rolling value ${value}.`,
    );
  }
  return tierIndex;
}

export function createRollingValueVisual(options: {
  readonly resource: SymbolValuePresentationResource;
  readonly value: number;
  readonly valueTextFormatter?: SymbolValueTextFormatter;
}): ReelRollingValueVisual | null {
  const { resource, value } = options;
  const tierIndex = resolveRollingValueTier(resource, value);
  if (resource.text.type !== "image-string") return null;
  const binding = resource.imageStringTierBindings?.[tierIndex];
  if (!binding) {
    throw new ReelError(
      `Symbol "${resource.symbol}" is missing prepared image-string rolling resources for tier ${tierIndex}.`,
    );
  }
  const profile = binding.spinBlurProfile ?? binding;
  const text = formatSymbolValueDisplayText({
    value,
    tierIndex,
    resource,
    ...(options.valueTextFormatter
      ? { formatter: options.valueTextFormatter }
      : {}),
  });
  const renderer = createRenderMappedImageString({
    resource: profile.resource,
    text,
    anchor: binding.anchor,
    specialValueImages: profile.specialValueImages,
  });
  renderer.container.position.set(binding.transform.x, binding.transform.y);
  renderer.container.scale.set(binding.transform.scale);
  const container = new Container();
  container.addChild(renderer.container);
  let currentValue = value;

  return Object.freeze({
    container,
    tierIndex,
    setValue(nextValue: number): void {
      assertRollingValue(nextValue);
      const nextTier = resolveRollingValueTier(resource, nextValue);
      if (nextTier !== tierIndex) {
        throw new ReelError(
          `Rolling value visual tier ${tierIndex} cannot display tier ${nextTier}.`,
        );
      }
      if (nextValue === currentValue) return;
      const nextText = formatSymbolValueDisplayText({
        value: nextValue,
        tierIndex: nextTier,
        resource,
        ...(options.valueTextFormatter
          ? { formatter: options.valueTextFormatter }
          : {}),
      });
      renderer.setText(nextText);
      currentValue = nextValue;
    },
    destroy(): void {
      renderer.destroy();
      container.destroy({ children: false });
    },
  });
}

function assertRollingValue(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ReelError(
      "Rolling presentation value must be a positive safe integer.",
    );
  }
}

import { getComponentWinResultGroups } from "@slotclientengine/logiccore";
import type { WinResultPosition } from "@slotclientengine/logiccore";
import type {
  CreateSymbolWinCarouselOptions,
  SymbolWinCarouselGroup,
  SymbolWinCarouselStartInput,
} from "../symbol-win-carousel/index.js";
import type { SymbolCascadeGroup } from "./types.js";

export function prepareSymbolWinGroups(
  options: Pick<
    CreateSymbolWinCarouselOptions,
    "resolveAmount" | "validateComponent"
  >,
  input: SymbolWinCarouselStartInput,
): readonly SymbolWinCarouselGroup[] {
  const componentNames = parseComponentNames(input.componentNames);
  const step = input.logic.getStep(input.stepIndex);
  const groups: SymbolWinCarouselGroup[] = [];
  for (const componentName of componentNames) {
    if (!step.hasComponent(componentName)) continue;
    const component = step.getComponent(componentName);
    if (!component || !component.hasBasicComponentData) {
      throw new Error(
        `symbol win component "${componentName}" must include basicComponentData.`,
      );
    }
    const componentGroups = getComponentWinResultGroups(step, componentName, {
      scene: input.scene,
    }).map((group) => {
      const amount = options.resolveAmount({
        componentName,
        stepIndex: group.stepIndex,
        resultIndex: group.resultIndex,
        result: group.result,
      });
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(
          `symbol win component "${componentName}" result[${group.resultIndex}] amount must be finite and positive.`,
        );
      }
      return Object.freeze({
        componentName,
        stepIndex: group.stepIndex,
        resultIndex: group.resultIndex,
        result: group.result,
        positions: group.positions,
        amount,
      });
    });
    options.validateComponent?.({
      logic: input.logic,
      step,
      componentName,
      component,
      groups: componentGroups,
    });
    groups.push(...componentGroups);
  }
  return Object.freeze(groups);
}

export function createLastUseRemoveGroups(
  groups: readonly SymbolWinCarouselGroup[],
  options: {
    readonly canRemovePosition?: (context: {
      readonly groupIndex: number;
      readonly group: SymbolWinCarouselGroup;
      readonly position: WinResultPosition;
    }) => boolean;
  } = {},
): readonly SymbolCascadeGroup[] {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("symbol cascade groups must not be empty.");
  }
  const lastUse = new Map<string, number>();
  groups.forEach((group, groupIndex) => {
    const seen = new Set<string>();
    for (const position of group.positions) {
      const key = `${position.x},${position.y}`;
      if (seen.has(key)) {
        throw new Error(
          `symbol cascade group ${groupIndex} contains duplicate position ${key}.`,
        );
      }
      seen.add(key);
      lastUse.set(key, groupIndex);
    }
  });
  return Object.freeze(
    groups.map((group, groupIndex) =>
      Object.freeze({
        ...group,
        removePositions: Object.freeze(
          group.positions.filter(
            (position: WinResultPosition) =>
              lastUse.get(`${position.x},${position.y}`) === groupIndex &&
              (options.canRemovePosition?.({ groupIndex, group, position }) ??
                true),
          ),
        ),
      }),
    ),
  );
}

function parseComponentNames(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("symbol win componentNames must not be empty.");
  }
  const seen = new Set<string>();
  return Object.freeze(
    value.map((name, index) => {
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new Error(`symbol win componentNames[${index}] is invalid.`);
      }
      if (seen.has(name)) {
        throw new Error(
          `symbol win componentNames contains duplicate "${name}".`,
        );
      }
      seen.add(name);
      return name;
    }),
  );
}

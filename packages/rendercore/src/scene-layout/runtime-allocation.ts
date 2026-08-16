import { SceneLayoutError } from "./errors.js";
import type {
  SceneLayoutManifestModern,
  SceneLayoutRuntimeAllocationV1,
  SceneLayoutVariantId,
} from "./types.js";

export const LEGACY_SCENE_LAYOUT_SYMBOL_PACKAGE_OWNER = "$legacy";

export function sceneLayoutTransitionOwnerId(from: string, to: string): string {
  return `${encodeURIComponent(from)}=>${encodeURIComponent(to)}`;
}

export function createSceneLayoutRuntimeAllocation(
  manifest: SceneLayoutManifestModern,
): SceneLayoutRuntimeAllocationV1 {
  const backgroundNodes = new Set(
    manifest.gameModes.modes.flatMap((mode) =>
      Object.values(mode.backgroundNodes),
    ),
  );
  const orderedNodes = [...manifest.nodes].sort(
    (left, right) => left.order - right.order,
  );
  const modes = Object.fromEntries(
    manifest.gameModes.modes.map((mode) => {
      const variants = activeVariants(mode.adaptation.mode);
      const effectivePlacements = new Map<string, Set<SceneLayoutVariantId>>();
      for (const node of orderedNodes) {
        const exact = variants.filter((variant) => node.placements[variant]);
        if (exact.length > 0) {
          effectivePlacements.set(node.id, new Set(exact));
          continue;
        }
        if (Object.values(node.placements).some(Boolean))
          effectivePlacements.set(node.id, new Set([variants[0]!]));
      }
      return [
        mode.id,
        {
          variants: Object.fromEntries(
            variants.map((variant) => [
              variant,
              {
                activeNodes: Object.freeze(
                  orderedNodes.flatMap((node) => {
                    if (backgroundNodes.has(node.id))
                      return mode.backgroundNodes[variant] === node.id
                        ? [node.id]
                        : [];
                    if (
                      node.gameMode !== undefined &&
                      node.gameMode !== mode.id
                    )
                      return [];
                    return effectivePlacements.get(node.id)?.has(variant)
                      ? [node.id]
                      : [];
                  }),
                ),
              },
            ]),
          ),
          symbolPackage: manifest.symbolPackage
            ? LEGACY_SCENE_LAYOUT_SYMBOL_PACKAGE_OWNER
            : (mode.symbolPackage ?? null),
          awardCelebrationPopup: mode.awardCelebrationPopup ?? null,
        },
      ];
    }),
  );
  return deepFreeze({
    version: 1,
    package: {
      nodes: orderedNodes.map((node) => node.id),
      symbolPackages: manifest.symbolPackage
        ? [LEGACY_SCENE_LAYOUT_SYMBOL_PACKAGE_OWNER]
        : Object.keys(manifest.symbolPackages ?? {}).sort(compareText),
      popups: Object.keys(manifest.popups ?? {}).sort(compareText),
    },
    onDemand: {
      transitions: (manifest.gameModes.transitions ?? [])
        .map((transition) =>
          sceneLayoutTransitionOwnerId(transition.from, transition.to),
        )
        .sort(compareText),
      runtimeResources: Object.keys(manifest.runtimeResources ?? {}).sort(
        compareText,
      ),
    },
    modes,
  });
}

export function parseSceneLayoutRuntimeAllocation(
  value: unknown,
  manifest: SceneLayoutManifestModern,
): SceneLayoutRuntimeAllocationV1 {
  const expected = createSceneLayoutRuntimeAllocation(manifest);
  assertExact(value, expected, "scene layout runtimeAllocation");
  return expected;
}

function activeVariants(
  mode: "maximized-focus" | "orientation-focus",
): readonly SceneLayoutVariantId[] {
  return mode === "maximized-focus" ? ["default"] : ["landscape", "portrait"];
}

function assertExact(value: unknown, expected: unknown, path: string): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(value))
      throw new SceneLayoutError(`${path} must be an array.`);
    if (value.length !== expected.length)
      throw new SceneLayoutError(
        `${path} must contain exactly ${expected.length} entries.`,
      );
    for (let index = 0; index < expected.length; index += 1)
      assertExact(value[index], expected[index], `${path}[${index}]`);
    return;
  }
  if (expected && typeof expected === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new SceneLayoutError(`${path} must be an object.`);
    const actual = value as Record<string, unknown>;
    const template = expected as Record<string, unknown>;
    const expectedKeys = Object.keys(template).sort(compareText);
    const actualKeys = Object.keys(actual).sort(compareText);
    if (
      expectedKeys.length !== actualKeys.length ||
      expectedKeys.some((key, index) => key !== actualKeys[index])
    )
      throw new SceneLayoutError(
        `${path} keys must exactly match: ${expectedKeys.join(", ")}.`,
      );
    for (const key of expectedKeys)
      assertExact(actual[key], template[key], `${path}.${key}`);
    return;
  }
  if (value !== expected)
    throw new SceneLayoutError(
      `${path} must be ${JSON.stringify(expected)}; actual ${JSON.stringify(value)}.`,
    );
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

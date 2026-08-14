import type { RenderObjectLayer } from "../presentation/index.js";
import { SceneLayoutError } from "./errors.js";
import type {
  SceneLayoutLayerId,
  SceneLayoutNodeRenderLayerPlacement,
  SceneLayoutRenderLayerRef,
} from "./types.js";

const STABLE_REFS = new Set<SceneLayoutLayerId>([
  "layout",
  "reel",
  "transition",
  "popup",
]);
const AREA_PLACEMENTS = new Set(["bottom", "top", "win"] as const);
const NODE_PLACEMENTS = new Set<SceneLayoutNodeRenderLayerPlacement>([
  "child",
  "before",
  "after",
]);
const CANONICAL_NODE_ID = /^[a-z0-9][a-z0-9-]*$/u;

export function resolveSceneLayoutRenderLayerRef(
  ref: SceneLayoutRenderLayerRef,
  resolvers: {
    readonly stable: (id: SceneLayoutLayerId) => RenderObjectLayer;
    readonly area: (
      areaId: string,
      placement: "bottom" | "top" | "win",
    ) => RenderObjectLayer;
    readonly node: (
      nodeId: string,
      placement: SceneLayoutNodeRenderLayerPlacement,
    ) => RenderObjectLayer;
  },
): RenderObjectLayer {
  if (typeof ref !== "string" || ref.length === 0)
    throw new SceneLayoutError(
      "Scene layout render layer ref must be non-empty.",
    );
  if (STABLE_REFS.has(ref as SceneLayoutLayerId))
    return resolvers.stable(ref as SceneLayoutLayerId);

  if (ref.startsWith("node:")) {
    const explicit = ref.slice("node:".length);
    if (!explicit)
      throw new SceneLayoutError(
        `Invalid scene layout render layer ref "${ref}".`,
      );
    const separator = explicit.lastIndexOf(":");
    if (separator < 0) return resolvers.node(explicit, "child");
    const nodeId = explicit.slice(0, separator);
    const placement = explicit.slice(separator + 1);
    if (
      !nodeId ||
      !NODE_PLACEMENTS.has(placement as SceneLayoutNodeRenderLayerPlacement)
    )
      throw new SceneLayoutError(
        `Invalid scene layout render layer ref "${ref}".`,
      );
    return resolvers.node(
      nodeId,
      placement as SceneLayoutNodeRenderLayerPlacement,
    );
  }

  const dot = ref.lastIndexOf(".");
  if (dot >= 0) {
    const ownerId = ref.slice(0, dot);
    const placement = ref.slice(dot + 1);
    if (!ownerId)
      throw new SceneLayoutError(
        `Invalid scene layout render layer ref "${ref}".`,
      );
    if (AREA_PLACEMENTS.has(placement as "bottom" | "top" | "win"))
      return resolvers.area(ownerId, placement as "bottom" | "top" | "win");
    if (NODE_PLACEMENTS.has(placement as SceneLayoutNodeRenderLayerPlacement)) {
      if (!CANONICAL_NODE_ID.test(ownerId))
        throw new SceneLayoutError(
          `Invalid canonical scene node ref "${ref}".`,
        );
      return resolvers.node(
        ownerId,
        placement as SceneLayoutNodeRenderLayerPlacement,
      );
    }
    throw new SceneLayoutError(
      `Invalid scene layout render layer ref "${ref}".`,
    );
  }

  if (!CANONICAL_NODE_ID.test(ref))
    throw new SceneLayoutError(
      `Invalid canonical scene node ref "${ref}"; use node:<legacyId> for legacy ids.`,
    );
  return resolvers.node(ref, "child");
}

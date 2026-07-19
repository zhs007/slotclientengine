import type { Container } from "pixi.js";
import type { ImageStringResource } from "../image-string/index.js";
import type { SymbolPackageResource } from "../symbol/package.js";
import type {
  FocusedArtViewport,
  RenderViewportMargin,
  RenderViewportRect,
  RenderViewportSize,
} from "../viewport/index.js";

export type SceneLayoutVariantId = "default" | "landscape" | "portrait";
export type SceneLayoutOrientationVariantId = Exclude<
  SceneLayoutVariantId,
  "default"
>;

export interface SceneLayoutNodePlacement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface SceneLayoutImageResourceSpec {
  readonly kind: "image";
  readonly path: string;
  readonly size: RenderViewportSize;
}

export interface SceneLayoutSpineStateMachine {
  readonly initialState: string;
  readonly states: Readonly<Record<string, { readonly animation: string }>>;
  readonly transitions: readonly {
    readonly from: string;
    readonly to: string;
    readonly animation: string;
  }[];
}

export interface SceneLayoutSpineLoopResourceSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly textures: Readonly<Record<string, string>>;
  readonly defaultAnimation: string;
  readonly loop: true;
}

export interface SceneLayoutSpineStateMachineResourceSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly textures: Readonly<Record<string, string>>;
  readonly stateMachine: SceneLayoutSpineStateMachine;
}

export type SceneLayoutSpineResourceSpec =
  | SceneLayoutSpineLoopResourceSpec
  | SceneLayoutSpineStateMachineResourceSpec;

export interface SceneLayoutImageStringResourceSpec {
  readonly kind: "image-string";
  readonly manifest: string;
  readonly text: string;
  readonly anchor: { readonly x: number; readonly y: number };
}

export type SceneLayoutNodeResourceSpec =
  | SceneLayoutImageResourceSpec
  | SceneLayoutSpineResourceSpec
  | SceneLayoutImageStringResourceSpec;

export interface SceneLayoutNode {
  readonly id: string;
  readonly order: number;
  readonly resource: SceneLayoutNodeResourceSpec;
  readonly placements: Readonly<
    Partial<Record<SceneLayoutVariantId, SceneLayoutNodePlacement>>
  >;
}

export interface SceneLayoutReelGrid {
  readonly order?: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: RenderViewportSize;
  readonly gap: { readonly x: number; readonly y: number };
  readonly placements: Readonly<
    Partial<
      Record<SceneLayoutVariantId, { readonly x: number; readonly y: number }>
    >
  >;
}

export interface SceneLayoutSymbolPackageBinding {
  readonly manifest: string;
  readonly reel: "main";
  readonly reelSet: string;
  readonly renderMode: "standard" | "grid-cell";
}

export interface MaximizedFocusSceneLayoutAdaptation {
  readonly mode: "maximized-focus";
  readonly artSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly backgroundNode: string;
}

export interface OrientationFocusSceneLayoutVariant {
  readonly artSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly frameFocusRect: RenderViewportSize;
  readonly minFocusMargin?: RenderViewportMargin;
  readonly backgroundNode: string;
}

export interface OrientationFocusSceneLayoutAdaptation {
  readonly mode: "orientation-focus";
  readonly variants: Readonly<
    Record<SceneLayoutOrientationVariantId, OrientationFocusSceneLayoutVariant>
  >;
}

export type SceneLayoutAdaptation =
  | MaximizedFocusSceneLayoutAdaptation
  | OrientationFocusSceneLayoutAdaptation;

export interface SceneLayoutManifestV1 {
  readonly version: 1;
  readonly kind: "scene-layout";
  readonly id: string;
  readonly adaptation: SceneLayoutAdaptation;
  readonly nodes: readonly SceneLayoutNode[];
  readonly reels: Readonly<Record<string, SceneLayoutReelGrid>>;
  readonly symbolPackage?: SceneLayoutSymbolPackageBinding;
}

export interface SceneLayoutResource {
  readonly manifest: SceneLayoutManifestV1;
  readonly imageUrls: Readonly<Record<string, string>>;
  readonly spineResources: Readonly<
    Record<
      string,
      {
        readonly skeleton: unknown;
        readonly atlasText: string;
        readonly textureUrls: Readonly<Record<string, string>>;
      }
    >
  >;
  readonly imageStringResources: Readonly<Record<string, ImageStringResource>>;
  destroy(): void;
}

export interface SceneLayoutPackageResource {
  readonly manifest: SceneLayoutManifestV1;
  readonly layout: SceneLayoutResource;
  readonly imageStrings: Readonly<Record<string, ImageStringResource>>;
  readonly symbolPackage: SymbolPackageResource | null;
  destroy(): Promise<void> | void;
}

export interface ResolvedSceneLayoutReelGrid {
  readonly id: string;
  readonly variantId: SceneLayoutVariantId;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: RenderViewportSize;
  readonly gap: { readonly x: number; readonly y: number };
  readonly stride: RenderViewportSize;
  readonly artRect: RenderViewportRect;
}

export interface SceneLayoutSnapshot extends FocusedArtViewport {
  readonly variantId: SceneLayoutVariantId;
  readonly reels: Readonly<
    Record<
      string,
      ResolvedSceneLayoutReelGrid & {
        readonly viewportRect: RenderViewportRect;
      }
    >
  >;
}

export interface SceneLayoutFrameViewport {
  readonly pageSize: RenderViewportSize;
  readonly frameDesignSize: RenderViewportSize;
  readonly scale: number;
  readonly cssSize: RenderViewportSize;
  readonly offsetX: number;
  readonly offsetY: number;
}

export type SceneLayoutFramePolicy =
  | {
      readonly mode: "maximized-focus";
      resolveViewportSize(pageSize: RenderViewportSize): RenderViewportSize;
    }
  | {
      readonly mode: "orientation-focus";
      readonly variants: Readonly<
        Record<
          SceneLayoutOrientationVariantId,
          {
            readonly maxDesignSize: RenderViewportSize;
            readonly focusRect: RenderViewportSize;
            readonly minFocusMargin?: RenderViewportMargin;
          }
        >
      >;
    };

export interface AttachChildOptions {
  readonly nodeId: string;
  readonly object: Container;
}

export interface AttachRelativeOptions extends AttachChildOptions {
  readonly placement: "before" | "after";
}

export interface SceneLayoutRuntime {
  readonly container: Container;
  init(): Promise<void>;
  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot;
  update(deltaSeconds: number): void;
  getSnapshot(): SceneLayoutSnapshot;
  getNode(id: string): Container;
  attachChild(options: AttachChildOptions): () => void;
  attachRelative(options: AttachRelativeOptions): () => void;
  getReelGrid(id: string): ResolvedSceneLayoutReelGrid;
  getImageStringNodeNames(): readonly string[];
  setImageStringText(nodeId: string, text: string): void;
  getImageStringText(nodeId: string): string;
  requestNodeState(nodeId: string, state: string): Promise<void>;
  getNodeStateSnapshot(nodeId: string): SceneLayoutNodeStateSnapshot;
  destroy(): void;
}

export interface SceneLayoutNodeStateSnapshot {
  readonly stableState: string;
  readonly targetState: string | null;
  readonly phase: "stable" | "transitioning";
}

export interface SceneLayoutInitialReelScene {
  readonly scene: readonly (readonly number[])[];
  readonly localPhaseYs: readonly number[];
  readonly presentationValues?: readonly (readonly (number | null)[])[];
}

export interface SceneLayoutPackageRuntime extends SceneLayoutRuntime {
  init(options?: {
    readonly reels?: Readonly<
      Partial<Record<"main", SceneLayoutInitialReelScene>>
    >;
  }): Promise<void>;
  resetReelScene(reelId: "main", input: SceneLayoutInitialReelScene): void;
  getReelPresentation(reelId: "main"): Container;
}

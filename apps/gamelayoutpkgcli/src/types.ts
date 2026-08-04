import type {
  EditorAssetsMapEntry,
  EditorAssetsMapV1,
} from "@slotclientengine/editorresource";
import type { SceneLayoutManifestV1 } from "@slotclientengine/rendercore/scene-layout";

export interface ValidatedLayoutPackage {
  readonly zipBytes: Uint8Array;
  readonly manifest: SceneLayoutManifestV1;
  readonly assetsMap: EditorAssetsMapV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly sourceEntries: ReadonlyMap<
    string,
    EditorAssetsMapEntry & { readonly bytes: Uint8Array }
  >;
}

export interface OptimizedLogicalAsset {
  readonly key: string;
  readonly sourceKey: string;
  readonly bytes: Uint8Array;
  readonly sourceByteLength: number;
  readonly converted: boolean;
  readonly mediaType: string;
}

export interface ImageOptimizationResult {
  readonly cwebpVersion: string;
  readonly keyMapping: ReadonlyMap<string, string>;
  readonly assets: ReadonlyMap<string, OptimizedLogicalAsset>;
  readonly convertedImageCount: number;
}

export interface WrittenOptimizedPackage {
  readonly zipBytes: Uint8Array;
  readonly assetsMap: EditorAssetsMapV1;
  readonly assets: ReadonlyMap<string, OptimizedLogicalAsset>;
}

export interface CwebpRunner {
  version(executable: string): Promise<string>;
  encode(options: {
    readonly executable: string;
    readonly quality: number;
    readonly inputPath: string;
    readonly outputPath: string;
  }): Promise<void>;
}

export interface AssetGroupAsset {
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly sourceKey: string;
  readonly sourceByteLength: number;
  readonly converted: boolean;
}

export type AssetGroupRecord =
  | {
      readonly id: "shared";
      readonly kind: "shared";
      readonly requiredAssets: readonly string[];
      readonly incrementalAssets: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "runtime-resource";
      readonly resourceKey: string;
      readonly resourceKind: string;
      readonly requiredAssets: readonly string[];
      readonly incrementalAssets: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "mode";
      readonly modeId: string;
      readonly initial: boolean;
      readonly requiredAssets: readonly string[];
      readonly incrementalAssets: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "transition";
      readonly ownerMode: string;
      readonly from: string;
      readonly to: string;
      readonly requiredAssets: readonly string[];
      readonly incrementalAssets: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "symbols";
      readonly packageId: string;
      readonly usedByModes: readonly string[];
      readonly requiredAssets: readonly string[];
      readonly incrementalAssets: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "award-celebration";
      readonly popupId: string;
      readonly usedByModes: readonly string[];
      readonly requiredAssets: readonly string[];
      readonly incrementalAssets: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "spine-popup";
      readonly popupId: string;
      readonly requiredAssets: readonly string[];
      readonly incrementalAssets: readonly string[];
    };

export interface SceneLayoutAssetGroupsV1 {
  readonly version: 1;
  readonly kind: "scene-layout-asset-groups";
  readonly layoutId: string;
  readonly initialMode: string;
  readonly optimization: {
    readonly imageCodec: "webp";
    readonly quality: number;
    readonly cwebpVersion: string;
    readonly inputZipBytes: number;
    readonly outputZipBytes: number;
    readonly convertedImageCount: number;
  };
  readonly controlFiles: readonly ["assets.map.json", "layout.manifest.json"];
  readonly assets: Readonly<Record<string, AssetGroupAsset>>;
  readonly initialAssets: readonly string[];
  readonly groups: readonly AssetGroupRecord[];
}

export interface GamelayoutPkgCliOptions {
  readonly inputPath: string;
  readonly outputPath?: string;
  readonly assetsJsonPath?: string;
  readonly quality: number;
  readonly cwebpExecutable: string;
}

export interface ResolvedGamelayoutPkgCliOptions {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly assetsJsonPath: string;
  readonly quality: number;
  readonly cwebpExecutable: string;
}

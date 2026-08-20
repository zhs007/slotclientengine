export * from "./default-adapters.js";

import {
  createEditorAssetsController,
  type EditorAssetsController,
} from "../core/index.js";
import type {
  EditorAssetHostAdapter,
  EditorAssetsSnapshot,
} from "../data/index.js";
import { ingestAndDiscoverDefaultEditorAssets } from "./default-adapters.js";
import { exportDefaultEditorAsset } from "./default-export.js";

export * from "./default-export.js";

export function createDefaultEditorAssetsController<TProject>(options: {
  readonly project: TProject;
  readonly host: EditorAssetHostAdapter<TProject>;
  readonly initial?: EditorAssetsSnapshot<TProject>;
}): EditorAssetsController<TProject> {
  return createEditorAssetsController({
    ...options,
    discoverAssets: (files, profileSelections) =>
      ingestAndDiscoverDefaultEditorAssets({ files, profileSelections }),
    exportAsset: exportDefaultEditorAsset,
  });
}

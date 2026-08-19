import type {
  EditorAssetInput,
  EditorAssetWorkspace,
  EditorImportReview,
} from "@slotclientengine/editorresource";

export type EditorAssetRootKind =
  | "image"
  | "audio"
  | "video"
  | "spine"
  | "vni"
  | "image-string"
  | "popup"
  | "symbols";

export type EditorAssetNodeKind =
  | EditorAssetRootKind
  | "manifest"
  | "skeleton"
  | "atlas"
  | "texture"
  | "project"
  | "game-config"
  | "payload";

export type EditorAssetRelationKind =
  | "contains"
  | "uses-atlas"
  | "uses-texture"
  | "uses-project"
  | "uses-manifest"
  | "uses-payload";

export interface EditorAssetNode {
  readonly id: string;
  readonly kind: EditorAssetNodeKind;
  readonly key: string;
  readonly label: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface EditorAssetRelation {
  readonly from: string;
  readonly to: string;
  readonly kind: EditorAssetRelationKind;
  readonly label?: string;
}

export interface EditorAssetRoot {
  readonly key: string;
  readonly kind: EditorAssetRootKind;
  readonly nodeId: string;
  readonly owner: string;
  readonly exactKeys: readonly string[];
}

export interface EditorAssetCatalog {
  readonly roots: ReadonlyMap<string, EditorAssetRoot>;
  readonly nodes: ReadonlyMap<string, EditorAssetNode>;
  readonly relations: readonly EditorAssetRelation[];
}

export interface EditorAssetRootDraft extends EditorAssetRoot {
  readonly inputs: readonly EditorAssetInput[];
  readonly nodes: readonly EditorAssetNode[];
  readonly relations: readonly EditorAssetRelation[];
}

export interface EditorAssetTreeOccurrence {
  readonly id: string;
  readonly node: EditorAssetNode;
  readonly rootKey: string;
  readonly depth: number;
  readonly relation?: EditorAssetRelation;
  readonly hasChildren: boolean;
}

export interface EditorAssetHostReference {
  readonly rootKey: string;
  readonly location: string;
  readonly kind?: string;
}

export interface EditorAssetProgramBinding {
  readonly rootKey: string;
  readonly name: string;
  readonly location: string;
}

export interface EditorAssetUsage {
  readonly directReferences: readonly EditorAssetHostReference[];
  readonly programBindings: readonly EditorAssetProgramBinding[];
  readonly inheritedFromRoots: readonly string[];
  readonly exported: boolean;
}

export interface EditorAssetUsageSnapshot {
  readonly byNodeId: ReadonlyMap<string, EditorAssetUsage>;
  readonly byRootKey: ReadonlyMap<string, EditorAssetUsage>;
}

export interface EditorAssetHostAdapter<TProject> {
  readonly cloneProject: (project: TProject) => TProject;
  readonly collectReferences: (
    project: TProject,
  ) => readonly EditorAssetHostReference[];
  readonly collectProgramBindings: (
    project: TProject,
  ) => readonly EditorAssetProgramBinding[];
  readonly renameReferences: (
    project: TProject,
    from: string,
    to: string,
  ) => TProject | Promise<TProject>;
  readonly setProgramBinding: (
    project: TProject,
    rootKey: string,
    name: string | null,
  ) => TProject | Promise<TProject>;
  readonly validateProject?: (
    project: TProject,
    catalog: EditorAssetCatalog,
    workspace: EditorAssetWorkspace,
  ) => void | Promise<void>;
}

export interface EditorAssetImportProfile {
  readonly containerName: string;
  readonly id: string;
  readonly label: string;
  readonly byteLength: number;
}

export interface EditorAssetImportPreparation {
  readonly drafts: readonly EditorAssetRootDraft[];
  readonly review: EditorImportReview;
  readonly profiles: readonly EditorAssetImportProfile[];
  readonly blockingErrors: readonly string[];
}

export interface EditorAssetImportResolution {
  readonly itemIndex: number;
  readonly resolution: "overwrite" | "keep-both";
}

export interface EditorAssetsSnapshot<TProject> {
  readonly workspace: EditorAssetWorkspace;
  readonly catalog: EditorAssetCatalog;
  readonly project: TProject;
}

export interface EditorAssetFilter {
  readonly query?: string;
  readonly kinds?: ReadonlySet<EditorAssetRootKind>;
  readonly status?: "all" | "used" | "programmatic" | "unused";
}

export interface EditorAssetExportPlan {
  readonly rootKeys: readonly string[];
  readonly assetKeys: readonly string[];
  readonly workspace: EditorAssetWorkspace;
}

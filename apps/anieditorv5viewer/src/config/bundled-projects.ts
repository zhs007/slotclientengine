import projectData from "../assets/project.json";
import bigwinData from "../assets/projects/bigwin.json";
import megawinData from "../assets/projects/megawin.json";
import superwinData from "../assets/projects/superwin.json";
import {
  bundledAssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
} from "../runtime/asset-manifest";
import { assertV5GProject, validateV5GProject } from "../runtime/validation";
import type { V5GProjectConfig } from "../v5g/types";

export type BundledProjectId = "project" | "bigwin" | "megawin" | "superwin";

export interface BundledV5GProject {
  id: BundledProjectId;
  label: string;
  sourcePath: string;
  project: V5GProjectConfig;
  assetUrls: AssetUrlManifest;
}

interface BundledProjectDefinition {
  id: BundledProjectId;
  filename: string;
  sourcePath: string;
  data: unknown;
}

const bundledProjectDefinitions: readonly BundledProjectDefinition[] = [
  {
    id: "project",
    filename: "project.json",
    sourcePath: "docs/anieditor5/export/project.json",
    data: projectData,
  },
  {
    id: "bigwin",
    filename: "bigwin.json",
    sourcePath: "docs/anieditor5/export/bigwin.json",
    data: bigwinData,
  },
  {
    id: "megawin",
    filename: "megawin.json",
    sourcePath: "docs/anieditor5/export/megawin.json",
    data: megawinData,
  },
  {
    id: "superwin",
    filename: "superwin.json",
    sourcePath: "docs/anieditor5/export/superwin.json",
    data: superwinData,
  },
];

export const bundledProjects: readonly BundledV5GProject[] = Object.freeze(
  bundledProjectDefinitions.map((definition) => {
    const project = assertV5GProject(definition.data);
    validateV5GProject(project);
    return Object.freeze({
      id: definition.id,
      label: `${project.name} (${definition.filename})`,
      sourcePath: definition.sourcePath,
      project,
      assetUrls: resolveProjectAssetUrls(project, bundledAssetUrlManifest),
    });
  }),
);

export function getBundledProject(id: string): BundledV5GProject {
  const project = bundledProjects.find((item) => item.id === id);
  if (!project) {
    throw new Error(`Unknown bundled V5G project: ${id}`);
  }
  return project;
}

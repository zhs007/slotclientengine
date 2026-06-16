import projectData from "../assets/project.json";
import {
  bundledAssetUrlManifest,
  resolveProjectAssetUrls,
} from "../runtime/asset-manifest";
import { assertV5GProject, validateV5GProject } from "../runtime/validation";

const project = assertV5GProject(projectData);
validateV5GProject(project);

export const bundledProject = project;
export const bundledProjectAssetUrls = resolveProjectAssetUrls(
  project,
  bundledAssetUrlManifest,
);

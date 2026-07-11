import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";

type FixtureZipName = "roundreel.zip" | "megawin.zip";

interface FixtureProject {
  readonly schemaVersion: string;
  readonly name: string;
  readonly assets: readonly { readonly path: string }[];
  readonly exportProfile: {
    readonly id: string;
    readonly purpose: "editing" | "runtime";
    readonly assetScale: number;
    readonly label?: string;
  };
  readonly [key: string]: unknown;
}

const EXPORT_ROOT = join("../../docs/anieditor5/export");

export function createFixtureZip(name: FixtureZipName): Uint8Array {
  return name === "roundreel.zip"
    ? createRoundreelFixtureZip()
    : createMegawinFixtureZip();
}

function createRoundreelFixtureZip(): Uint8Array {
  const runtimeProject = readFixtureProject("roundreel.json");
  const editProject = cloneProject(runtimeProject, {
    id: "edit_full",
    purpose: "editing",
    assetScale: 1,
    label: "100% 完整编辑备份",
  });
  const entries: Record<string, Uint8Array> = {
    "manifest.json": encodeJson({
      type: "vni_export_bundle",
      version: runtimeProject.schemaVersion,
      exports: [
        {
          id: "edit_full",
          purpose: "editing",
          assetScale: 1,
          path: "edit_full/roundreel.json",
          label: "100% 完整编辑备份",
        },
        {
          id: "runtime_100",
          purpose: "runtime",
          assetScale: 1,
          path: "runtime_100/roundreel.json",
          label: "100% 运行发布包",
        },
      ],
    }),
  };
  addProjectEntries(entries, "edit_full", "roundreel.json", editProject);
  addProjectEntries(entries, "runtime_100", "roundreel.json", runtimeProject);
  return zipSync(entries);
}

function createMegawinFixtureZip(): Uint8Array {
  const project = readFixtureProject("megawin.json");
  const entries: Record<string, Uint8Array> = {
    "project.json": encodeJson(project),
    "__MACOSX/._project.json": new Uint8Array([0]),
  };
  addAssetEntries(entries, "", project);
  return zipSync(entries);
}

function addProjectEntries(
  entries: Record<string, Uint8Array>,
  directory: string,
  projectFileName: string,
  project: FixtureProject,
): void {
  entries[`${directory}/${projectFileName}`] = encodeJson(project);
  addAssetEntries(entries, directory, project);
}

function addAssetEntries(
  entries: Record<string, Uint8Array>,
  directory: string,
  project: FixtureProject,
): void {
  for (const asset of project.assets) {
    const sourcePath = join(EXPORT_ROOT, asset.path);
    const entryPath = directory ? `${directory}/${asset.path}` : asset.path;
    entries[entryPath] = readFileSync(sourcePath);
  }
}

function readFixtureProject(fileName: string): FixtureProject {
  const parsed = JSON.parse(
    readFileSync(join(EXPORT_ROOT, fileName), "utf8"),
  ) as FixtureProject;
  if (!parsed.exportProfile) {
    throw new Error(`Fixture project ${fileName} is missing exportProfile.`);
  }
  return parsed;
}

function cloneProject(
  project: FixtureProject,
  exportProfile: FixtureProject["exportProfile"],
): FixtureProject {
  return JSON.parse(
    JSON.stringify({ ...project, exportProfile }),
  ) as FixtureProject;
}

function encodeJson(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

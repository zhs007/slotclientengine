import type { EditorAssetHostAdapter } from "@slotclientengine/editorcore/assets/data";

export interface DemoProject {
  readonly version: 1;
  readonly kind: "editorcore-assets-demo-project";
  readonly references: readonly DemoProjectReference[];
  readonly programs: Readonly<Record<string, string>>;
}

export interface DemoProjectReference {
  readonly rootKey: string;
  readonly location: string;
}

export function createEmptyDemoProject(): DemoProject {
  return Object.freeze({
    version: 1,
    kind: "editorcore-assets-demo-project",
    references: Object.freeze([]),
    programs: Object.freeze({}),
  });
}

export const demoProjectHost: EditorAssetHostAdapter<DemoProject> = {
  cloneProject: (project) => structuredClone(project),
  collectReferences: (project) => project.references,
  collectProgramBindings: (project) =>
    Object.entries(project.programs).map(([name, rootKey]) => ({
      name,
      rootKey,
      location: `programs.${name}`,
    })),
  renameReferences: (project, from, to) =>
    freezeDemoProject({
      ...project,
      references: project.references.map((reference) => ({
        ...reference,
        rootKey: reference.rootKey === from ? to : reference.rootKey,
      })),
      programs: Object.fromEntries(
        Object.entries(project.programs).map(([name, key]) => [
          name,
          key === from ? to : key,
        ]),
      ),
    }),
  setProgramBinding: (project, rootKey, name) => {
    const programs = Object.fromEntries(
      Object.entries(project.programs).filter(([, key]) => key !== rootKey),
    );
    if (name) programs[name] = rootKey;
    return freezeDemoProject({ ...project, programs });
  },
  validateProject(project, catalog) {
    parseDemoProject(project);
    for (const reference of project.references)
      if (!catalog.roots.has(reference.rootKey))
        throw new Error(
          `demo project reference 缺少 root：${reference.rootKey}`,
        );
    for (const [name, rootKey] of Object.entries(project.programs))
      if (!catalog.roots.has(rootKey))
        throw new Error(`demo program ${name} 缺少 root：${rootKey}`);
  },
};

export function parseDemoProject(value: unknown): DemoProject {
  const root = record(value, "demo project");
  exactKeys(
    root,
    ["version", "kind", "references", "programs"],
    "demo project",
  );
  if (root.version !== 1 || root.kind !== "editorcore-assets-demo-project")
    throw new Error("demo project version/kind 无效。");
  if (!Array.isArray(root.references))
    throw new Error("demo project references 必须是 array。");
  const references = root.references.map((value, index) => {
    const reference = record(value, `demo project references[${index}]`);
    exactKeys(
      reference,
      ["rootKey", "location"],
      `demo project references[${index}]`,
    );
    if (typeof reference.rootKey !== "string" || !reference.rootKey)
      throw new Error(`demo project references[${index}].rootKey 无效。`);
    if (typeof reference.location !== "string" || !reference.location)
      throw new Error(`demo project references[${index}].location 无效。`);
    return Object.freeze({
      rootKey: reference.rootKey,
      location: reference.location,
    });
  });
  const rawPrograms = record(root.programs, "demo project programs");
  const programs: Record<string, string> = {};
  for (const [name, rootKey] of Object.entries(rawPrograms)) {
    if (!name || typeof rootKey !== "string" || !rootKey)
      throw new Error(`demo project program ${name || "<empty>"} 无效。`);
    programs[name] = rootKey;
  }
  return freezeDemoProject({
    version: 1,
    kind: "editorcore-assets-demo-project",
    references,
    programs,
  });
}

function freezeDemoProject(project: DemoProject): DemoProject {
  return Object.freeze({
    ...project,
    references: Object.freeze(
      project.references.map((item) => Object.freeze({ ...item })),
    ),
    programs: Object.freeze({ ...project.programs }),
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 object。`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new Error(`${label} fields 无效：${actual.join(", ")}`);
}

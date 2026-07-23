import { LogicParseError } from "./errors";
import {
  assertArray,
  assertFiniteNumber,
  assertNonEmptyString,
  assertRecord,
  cloneAndFreeze,
  isRecord,
} from "./validation";

export type ServerComponentRole =
  | "spin"
  | "win"
  | "value-update"
  | "cascade-remove"
  | "cascade-step"
  | "cascade-dropdown"
  | "cascade-refill"
  | "unsupported";

export interface ServerAuthoringParameter {
  readonly name: string;
  readonly value?: string | number | boolean;
}

export interface ServerComponentCatalogEntry {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly componentName: string;
  readonly role: ServerComponentRole;
  readonly configuration: Readonly<Record<string, unknown>>;
}

export interface ServerBetMethodSummary {
  readonly id: string;
  readonly label: string;
  readonly bet: number;
  readonly totalBetInWins: number;
  readonly components: readonly ServerComponentCatalogEntry[];
}

export interface ServerGameAuthoringSummary {
  readonly gameName: string;
  readonly gamecode: string;
  readonly parameters: readonly ServerAuthoringParameter[];
  readonly betMethods: readonly ServerBetMethodSummary[];
}

export interface SlotRoundFlowSuggestions {
  readonly betMethodId: string;
  readonly requiresReview: true;
  readonly components: {
    readonly spin?: string;
    readonly wins: readonly string[];
    readonly valueUpdates: readonly string[];
  };
  readonly cascade?: {
    readonly remove?: string;
    readonly stepMarker?: string;
    readonly dropdown?: string;
    readonly refill?: string;
    readonly emptyCode?: number;
    readonly removeExcludedSymbols: readonly string[];
    readonly dropHeldSymbols: readonly string[];
    readonly valueSymbols: readonly string[];
  };
  readonly unsupported: readonly {
    readonly nodeId: string;
    readonly nodeType: string;
    readonly componentName: string;
  }[];
}

const ROLE_BY_NODE_TYPE: Readonly<Record<string, ServerComponentRole>> =
  Object.freeze({
    BasicReels2: "spin",
    ClusterTrigger: "win",
    GenSymbolVals2: "value-update",
    RemoveSymbols: "cascade-remove",
    Respin: "cascade-step",
    DropDownSymbols2: "cascade-dropdown",
    RefillSymbols2: "cascade-refill",
  });

export function parseServerGameAuthoringSummary(
  input: unknown,
): ServerGameAuthoringSummary {
  const root = assertRecord(input, "serverAuthoring");
  const gameName = trimmedString(root.gameName, "serverAuthoring.gameName");
  const gamecode = trimmedString(root.gamecode, "serverAuthoring.gamecode");
  const parameters = parseParameters(root.parameter);
  const methods = assertArray(root.betMethod, "serverAuthoring.betMethod").map(
    (value, index) => parseBetMethod(value, index),
  );
  if (methods.length === 0)
    throw new LogicParseError(
      "serverAuthoring.betMethod must contain at least one item.",
    );
  const methodIds = new Set<string>();
  for (const method of methods) {
    if (methodIds.has(method.id))
      throw new LogicParseError(
        `serverAuthoring.betMethod contains duplicate id "${method.id}".`,
      );
    methodIds.add(method.id);
  }
  return cloneAndFreeze({
    gameName,
    gamecode,
    parameters,
    betMethods: methods,
  });
}

export function getServerBetMethodComponentCatalog(
  summary: ServerGameAuthoringSummary,
  betMethodId: string,
): ServerBetMethodSummary {
  const id = betMethodId.trim();
  const method = summary.betMethods.find((candidate) => candidate.id === id);
  if (!method) throw new LogicParseError(`Unknown server bet method "${id}".`);
  return method;
}

export function suggestSlotRoundFlow(
  catalog: ServerBetMethodSummary,
): SlotRoundFlowSuggestions {
  const byRole = (role: ServerComponentRole) =>
    catalog.components.filter((component) => component.role === role);
  const firstName = (role: ServerComponentRole) =>
    byRole(role)[0]?.componentName;
  const remove = byRole("cascade-remove")[0];
  const dropdown = byRole("cascade-dropdown")[0];
  const value = byRole("value-update")[0];
  const refill = byRole("cascade-refill")[0];
  const cascadePresent = Boolean(remove || dropdown || refill);
  const cascade = cascadePresent
    ? {
        remove: remove?.componentName,
        stepMarker: firstName("cascade-step"),
        dropdown: dropdown?.componentName,
        refill: refill?.componentName,
        emptyCode: firstInteger(
          remove?.configuration.emptySymbolVal,
          dropdown?.configuration.emptySymbolVal,
          refill?.configuration.emptySymbolVal,
        ),
        removeExcludedSymbols: stringList(remove?.configuration.ignoreSymbols),
        dropHeldSymbols: stringList(dropdown?.configuration.holdSymbols),
        valueSymbols: stringList(value?.configuration.srcSymbols),
      }
    : undefined;
  return cloneAndFreeze({
    betMethodId: catalog.id,
    requiresReview: true as const,
    components: {
      spin: firstName("spin"),
      wins: byRole("win").map((component) => component.componentName),
      valueUpdates: byRole("value-update").map(
        (component) => component.componentName,
      ),
    },
    ...(cascade ? { cascade } : {}),
    unsupported: byRole("unsupported").map((component) => ({
      nodeId: component.nodeId,
      nodeType: component.nodeType,
      componentName: component.componentName,
    })),
  });
}

function parseParameters(value: unknown): readonly ServerAuthoringParameter[] {
  const parameters = assertArray(value, "serverAuthoring.parameter").map(
    (item, index) => {
      const path = `serverAuthoring.parameter[${index}]`;
      const record = assertRecord(item, path);
      const name = trimmedString(record.name, `${path}.name`);
      const parameterValue = record.value;
      if (
        parameterValue !== undefined &&
        typeof parameterValue !== "string" &&
        typeof parameterValue !== "number" &&
        typeof parameterValue !== "boolean"
      )
        throw new LogicParseError(
          `${path}.value must be a string, number, boolean, or absent.`,
        );
      return parameterValue === undefined
        ? { name }
        : { name, value: parameterValue };
    },
  );
  const names = new Set<string>();
  for (const parameter of parameters) {
    if (names.has(parameter.name))
      throw new LogicParseError(
        `serverAuthoring.parameter contains duplicate name "${parameter.name}".`,
      );
    names.add(parameter.name);
  }
  return parameters;
}

function parseBetMethod(value: unknown, index: number): ServerBetMethodSummary {
  const path = `serverAuthoring.betMethod[${index}]`;
  const record = assertRecord(value, path);
  const label = trimmedString(record.label, `${path}.label`);
  const bet = positiveFinite(record.bet, `${path}.bet`);
  const totalBetInWins = positiveFinite(
    record.totalBetInWins,
    `${path}.totalBetInWins`,
  );
  const graph = assertRecord(record.graph, `${path}.graph`);
  const cells = assertArray(graph.cells, `${path}.graph.cells`);
  const components: ServerComponentCatalogEntry[] = [];
  const nodeIds = new Set<string>();
  const componentNames = new Set<string>();
  for (const [cellIndex, item] of cells.entries()) {
    const cellPath = `${path}.graph.cells[${cellIndex}]`;
    const cell = assertRecord(item, cellPath);
    if (cell.shape !== "custom-node") continue;
    const nodeId = trimmedString(cell.id, `${cellPath}.id`);
    const nodeType = trimmedString(cell.label, `${cellPath}.label`);
    const data = assertRecord(cell.data, `${cellPath}.data`);
    const componentName = trimmedString(data.label, `${cellPath}.data.label`);
    if (nodeIds.has(nodeId))
      throw new LogicParseError(
        `${path} contains duplicate node id "${nodeId}".`,
      );
    if (componentNames.has(componentName))
      throw new LogicParseError(
        `${path} contains duplicate component name "${componentName}".`,
      );
    nodeIds.add(nodeId);
    componentNames.add(componentName);
    const configuration =
      data.configuration === undefined
        ? {}
        : assertRecord(data.configuration, `${cellPath}.data.configuration`);
    components.push({
      nodeId,
      nodeType,
      componentName,
      role: ROLE_BY_NODE_TYPE[nodeType] ?? "unsupported",
      configuration: sanitizeConfiguration(configuration),
    });
  }
  return {
    id: label,
    label,
    bet,
    totalBetInWins,
    components,
  };
}

function sanitizeConfiguration(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      result[key] = item;
      continue;
    }
    if (
      Array.isArray(item) &&
      item.every(
        (entry) =>
          entry === null ||
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean",
      )
    )
      result[key] = [...item];
  }
  return cloneAndFreeze(result);
}

function trimmedString(value: unknown, path: string): string {
  const parsed = assertNonEmptyString(value, path).trim();
  if (!parsed) throw new LogicParseError(`${path} must not be blank.`);
  return parsed;
}

function positiveFinite(value: unknown, path: string): number {
  const parsed = assertFiniteNumber(value, path);
  if (parsed <= 0) throw new LogicParseError(`${path} must be positive.`);
  return parsed;
}

function stringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstInteger(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => Number.isInteger(value));
}

export function isServerAuthoringSummary(
  value: unknown,
): value is ServerGameAuthoringSummary {
  return isRecord(value) && value.betMethods !== undefined;
}

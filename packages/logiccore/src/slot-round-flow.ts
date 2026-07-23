import { LogicParseError } from "./errors";
import {
  assertArray,
  assertInteger,
  assertNonEmptyString,
  assertRecord,
  cloneAndFreeze,
} from "./validation";
import type {
  ServerBetMethodSummary,
  ServerComponentRole,
} from "./server-authoring-config";

export type SlotCashAmountField = "cashWin64" | "cashWin";
export type SlotCoinAmountField = "coinWin64" | "coinWin";

export interface AmountFieldProfileV1 {
  readonly cashFields: readonly SlotCashAmountField[];
  readonly coinFields?: readonly SlotCoinAmountField[];
  readonly cashUnit: "cents";
}

export interface SlotCascadeBlockProfileV1 {
  readonly kind: "cascade";
  readonly version: 1;
  readonly components: {
    readonly remove: string;
    readonly dropdown: string;
    readonly refill: string;
    readonly stepMarker?: string;
  };
  readonly symbols: {
    readonly emptyCode: number;
    readonly removeExcludedSymbols: readonly string[];
    readonly dropHeldSymbols: readonly string[];
    readonly valueSymbols: readonly string[];
    readonly sequentialWinCompanionSymbols?: readonly string[];
  };
  readonly amount: AmountFieldProfileV1;
}

export interface SlotRoundFlowProfileV1 {
  readonly kind: "slot-round-flow";
  readonly version: 1;
  readonly components: {
    readonly spin: string;
    readonly wins: readonly string[];
    readonly valueUpdates?: readonly string[];
  };
  readonly cascade?: SlotCascadeBlockProfileV1;
  readonly amount: AmountFieldProfileV1;
}

export function parseSlotRoundFlowProfile(
  input: unknown,
): SlotRoundFlowProfileV1 {
  const root = strictRecord(input, "round", [
    "kind",
    "version",
    "components",
    "cascade",
    "amount",
  ]);
  literal(root.kind, "slot-round-flow", "round.kind");
  literal(root.version, 1, "round.version");
  const components = strictRecord(root.components, "round.components", [
    "spin",
    "wins",
    "valueUpdates",
  ]);
  const spin = componentName(components.spin, "round.components.spin");
  const wins = uniqueComponentList(components.wins, "round.components.wins", {
    allowEmpty: true,
  });
  const valueUpdates =
    components.valueUpdates === undefined
      ? undefined
      : uniqueComponentList(
          components.valueUpdates,
          "round.components.valueUpdates",
          { allowEmpty: true },
        );
  const amount = parseAmount(root.amount, "round.amount");
  const cascade =
    root.cascade === undefined
      ? undefined
      : parseCascade(root.cascade, "round.cascade");
  const allComponents = [
    spin,
    ...wins,
    ...(valueUpdates ?? []),
    ...(cascade
      ? [
          cascade.components.remove,
          cascade.components.dropdown,
          cascade.components.refill,
          ...(cascade.components.stepMarker
            ? [cascade.components.stepMarker]
            : []),
        ]
      : []),
  ];
  const duplicates = duplicateItems(allComponents);
  if (duplicates.length > 0)
    throw new LogicParseError(
      `round component roles must be unique; duplicate "${duplicates[0]}".`,
    );
  return cloneAndFreeze({
    kind: "slot-round-flow" as const,
    version: 1 as const,
    components: {
      spin,
      wins,
      ...(valueUpdates ? { valueUpdates } : {}),
    },
    ...(cascade ? { cascade } : {}),
    amount,
  });
}

export function validateSlotRoundFlowCatalogCompatibility(options: {
  readonly profile: SlotRoundFlowProfileV1;
  readonly catalog: ServerBetMethodSummary;
}): void {
  const entries = new Map(
    options.catalog.components.map((entry) => [entry.componentName, entry]),
  );
  const check = (
    name: string,
    path: string,
    allowedRoles: readonly ServerComponentRole[],
  ) => {
    const entry = entries.get(name);
    if (!entry)
      throw new LogicParseError(
        `${path} component "${name}" is not in bet method "${options.catalog.id}".`,
      );
    if (!allowedRoles.includes(entry.role))
      throw new LogicParseError(
        `${path} component "${name}" has incompatible server node type "${entry.nodeType}".`,
      );
  };
  check(options.profile.components.spin, "round.components.spin", ["spin"]);
  options.profile.components.wins.forEach((name, index) =>
    check(name, `round.components.wins[${index}]`, ["win"]),
  );
  options.profile.components.valueUpdates?.forEach((name, index) =>
    check(name, `round.components.valueUpdates[${index}]`, ["value-update"]),
  );
  const cascade = options.profile.cascade;
  if (!cascade) return;
  check(cascade.components.remove, "round.cascade.components.remove", [
    "cascade-remove",
  ]);
  check(cascade.components.dropdown, "round.cascade.components.dropdown", [
    "cascade-dropdown",
  ]);
  check(cascade.components.refill, "round.cascade.components.refill", [
    "cascade-refill",
  ]);
  if (cascade.components.stepMarker)
    check(
      cascade.components.stepMarker,
      "round.cascade.components.stepMarker",
      ["cascade-step"],
    );
}

function parseCascade(value: unknown, path: string): SlotCascadeBlockProfileV1 {
  const root = strictRecord(value, path, [
    "kind",
    "version",
    "components",
    "symbols",
    "amount",
  ]);
  literal(root.kind, "cascade", `${path}.kind`);
  literal(root.version, 1, `${path}.version`);
  const components = strictRecord(root.components, `${path}.components`, [
    "remove",
    "dropdown",
    "refill",
    "stepMarker",
  ]);
  const symbols = strictRecord(root.symbols, `${path}.symbols`, [
    "emptyCode",
    "removeExcludedSymbols",
    "dropHeldSymbols",
    "valueSymbols",
    "sequentialWinCompanionSymbols",
  ]);
  const emptyCode = assertInteger(
    symbols.emptyCode,
    `${path}.symbols.emptyCode`,
  );
  if (!Number.isSafeInteger(emptyCode))
    throw new LogicParseError(
      `${path}.symbols.emptyCode must be a safe integer.`,
    );
  const parsed = {
    kind: "cascade" as const,
    version: 1 as const,
    components: {
      remove: componentName(components.remove, `${path}.components.remove`),
      dropdown: componentName(
        components.dropdown,
        `${path}.components.dropdown`,
      ),
      refill: componentName(components.refill, `${path}.components.refill`),
      ...(components.stepMarker === undefined
        ? {}
        : {
            stepMarker: componentName(
              components.stepMarker,
              `${path}.components.stepMarker`,
            ),
          }),
    },
    symbols: {
      emptyCode,
      removeExcludedSymbols: uniqueStringList(
        symbols.removeExcludedSymbols,
        `${path}.symbols.removeExcludedSymbols`,
      ),
      dropHeldSymbols: uniqueStringList(
        symbols.dropHeldSymbols,
        `${path}.symbols.dropHeldSymbols`,
      ),
      valueSymbols: uniqueStringList(
        symbols.valueSymbols,
        `${path}.symbols.valueSymbols`,
      ),
      ...(symbols.sequentialWinCompanionSymbols === undefined
        ? {}
        : {
            sequentialWinCompanionSymbols: uniqueStringList(
              symbols.sequentialWinCompanionSymbols,
              `${path}.symbols.sequentialWinCompanionSymbols`,
            ),
          }),
    },
    amount: parseAmount(root.amount, `${path}.amount`),
  };
  return parsed;
}

function parseAmount(value: unknown, path: string): AmountFieldProfileV1 {
  const record = strictRecord(value, path, [
    "cashFields",
    "coinFields",
    "cashUnit",
  ]);
  literal(record.cashUnit, "cents", `${path}.cashUnit`);
  const cashFields = enumList(
    record.cashFields,
    `${path}.cashFields`,
    ["cashWin64", "cashWin"] as const,
    false,
  );
  const coinFields =
    record.coinFields === undefined
      ? undefined
      : enumList(
          record.coinFields,
          `${path}.coinFields`,
          ["coinWin64", "coinWin"] as const,
          true,
        );
  return {
    cashFields,
    ...(coinFields ? { coinFields } : {}),
    cashUnit: "cents",
  };
}

function strictRecord(
  value: unknown,
  path: string,
  allowed: readonly string[],
): Record<string, unknown> {
  const record = assertRecord(value, path);
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown)
    throw new LogicParseError(`${path}.${unknown} is not supported.`);
  return record;
}

function literal<T extends string | number>(
  value: unknown,
  expected: T,
  path: string,
): asserts value is T {
  if (value !== expected)
    throw new LogicParseError(`${path} must be ${JSON.stringify(expected)}.`);
}

function componentName(value: unknown, path: string): string {
  const name = assertNonEmptyString(value, path).trim();
  if (!name) throw new LogicParseError(`${path} must not be blank.`);
  return name;
}

function uniqueComponentList(
  value: unknown,
  path: string,
  options: { readonly allowEmpty: boolean },
): readonly string[] {
  const values = assertArray(value, path).map((item, index) =>
    componentName(item, `${path}[${index}]`),
  );
  if (!options.allowEmpty && values.length === 0)
    throw new LogicParseError(`${path} must not be empty.`);
  const duplicate = duplicateItems(values)[0];
  if (duplicate)
    throw new LogicParseError(`${path} contains duplicate "${duplicate}".`);
  return values;
}

function uniqueStringList(value: unknown, path: string): readonly string[] {
  return uniqueComponentList(value, path, { allowEmpty: true });
}

function enumList<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  allowEmpty: boolean,
): readonly T[] {
  const parsed = assertArray(value, path).map((item, index) => {
    if (typeof item !== "string" || !allowed.includes(item as T))
      throw new LogicParseError(
        `${path}[${index}] must be one of ${allowed.join(", ")}.`,
      );
    return item as T;
  });
  if (!allowEmpty && parsed.length === 0)
    throw new LogicParseError(`${path} must not be empty.`);
  const duplicate = duplicateItems(parsed)[0];
  if (duplicate)
    throw new LogicParseError(`${path} contains duplicate "${duplicate}".`);
  return parsed;
}

function duplicateItems(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  return duplicates;
}

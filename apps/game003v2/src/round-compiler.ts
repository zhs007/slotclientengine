import {
  createBuiltinSlotOperationDefinitionsV2,
  createSlotOperationSnapshot,
  finalizeSlotOperationPlanV2,
  genSpinOperation,
  genWinOperation,
  getComponentWinResultGroupsByName,
  selectServerComponentSource,
  type GameLogic,
  type LogicGameConfig,
  type SceneMatrix,
  type SlotOperationDefinitionV2,
  type SlotOperationDraftV2,
  type SlotOperationPlanV2,
  type WinResult,
} from "@slotclientengine/gameframeworks";

const COLUMNS = 5;
const ROWS = 5;
const COIN_SYMBOL = "CO";

export interface Game003v2WinGroup {
  readonly componentName: "bg-wins";
  readonly stepIndex: number;
  readonly resultIndex: number;
  readonly result: WinResult;
  readonly positions: readonly { readonly x: number; readonly y: number }[];
  readonly amount: number;
}

export interface Game003v2Compilation {
  readonly plan: SlotOperationPlanV2;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
}

export function compileGame003v2Round(options: {
  readonly logic: GameLogic;
  readonly gameConfig: LogicGameConfig;
  readonly displaySymbols: readonly string[];
}): Game003v2Compilation {
  if (options.logic.getStepCount() !== 1)
    throw new Error("game003v2 BaseGame rounds must contain exactly one step.");
  const symbolCodes = Object.freeze(
    Object.fromEntries(
      options.displaySymbols.map((symbol) => {
        const code = options.gameConfig.getSymbolCode(symbol);
        if (code === undefined)
          throw new Error(
            `display symbol "${symbol}" has no game config code.`,
          );
        return [symbol, code] as const;
      }),
    ),
  );
  const source = selectServerComponentSource({
    logic: options.logic,
    stepIndex: 0,
    bindings: {
      landing: { componentName: "bg-spin" },
      coins: { componentName: "bg-gencoins", cardinality: "zero-or-one" },
    },
  });
  const landing = source.bindings.landing;
  if (!landing || landing.scenes.length !== 1)
    throw new Error("game003v2 bg-spin must select exactly one scene.");
  const scene = validateScene(landing.scenes[0]!.value, "bg-spin scene");
  const values = compilePresentationValues(
    scene,
    source.bindings.coins?.otherScenes.map((selection) => selection.value) ??
      [],
    requireSymbolCode(symbolCodes, COIN_SYMBOL),
  );
  const snapshot = createSlotOperationSnapshot({ scene, values, symbolCodes });
  const drafts: SlotOperationDraftV2[] = [
    genSpinOperation({
      source,
      output: snapshot,
      payload: Object.freeze({ localPhasePolicy: "public-reel-stop" }),
      businessKey: "landing",
    }),
  ];
  const groups = compileWinGroups(options.logic, scene);
  if (groups.length > 0) {
    const winSource = selectServerComponentSource({
      logic: options.logic,
      stepIndex: 0,
      bindings: { wins: { componentName: "bg-wins" } },
    });
    drafts.push(
      genWinOperation({
        kind: "game003:wins",
        source: winSource,
        payload: Object.freeze({ groups }),
        targets: Object.freeze(
          groups.flatMap((group, groupIndex) =>
            group.positions.map((position) => ({
              position,
              role: `group-${groupIndex}`,
            })),
          ),
        ),
        businessKey: "carousel",
      }),
    );
  }
  const betAmountRaw = options.logic.getBet() * options.logic.getLines();
  const winAmountRaw = options.logic.getTotalWin();
  if (!Number.isSafeInteger(betAmountRaw) || betAmountRaw <= 0)
    throw new Error("game003v2 bet amount must be a positive safe integer.");
  if (!Number.isSafeInteger(winAmountRaw) || winAmountRaw < 0)
    throw new Error(
      "game003v2 win amount must be a non-negative safe integer.",
    );
  if (winAmountRaw > 0)
    drafts.push(
      genWinOperation({
        kind: "game003:award",
        source,
        payload: Object.freeze({ betAmountRaw, winAmountRaw }),
        businessKey: "popup",
      }),
    );
  return Object.freeze({
    plan: finalizeSlotOperationPlanV2({
      drafts,
      definitions: definitions(),
      symbolCodes,
      columns: COLUMNS,
      rows: ROWS,
    }),
    betAmountRaw,
    winAmountRaw,
  });
}

function definitions(): readonly SlotOperationDefinitionV2[] {
  return Object.freeze([
    ...createBuiltinSlotOperationDefinitionsV2(),
    Object.freeze({
      kind: "game003:wins",
      version: 2,
      effect: "presentation" as const,
      requiresEstablishedScene: true,
    }),
    Object.freeze({
      kind: "game003:award",
      version: 2,
      effect: "presentation" as const,
      requiresEstablishedScene: true,
    }),
  ]);
}

function compilePresentationValues(
  scene: SceneMatrix,
  otherScenes: readonly SceneMatrix[],
  coinCode: number,
): readonly (readonly (number | null)[])[] {
  if (otherScenes.length > 1)
    throw new Error("game003v2 bg-gencoins accepts at most one otherScene.");
  const values = otherScenes[0];
  if (values) validateScene(values, "bg-gencoins otherScene");
  return Object.freeze(
    scene.map((column, x) =>
      Object.freeze(
        column.map((code, y) => {
          const amount = values?.[x]?.[y] ?? 0;
          if (!Number.isSafeInteger(amount) || amount < 0)
            throw new Error(`coin amount at (${x},${y}) must be non-negative.`);
          if (code === coinCode) {
            if (!values) return null;
            if (amount <= 0)
              throw new Error(
                `CO cell (${x},${y}) requires a positive amount.`,
              );
            return amount;
          }
          if (amount !== 0)
            throw new Error(`non-CO cell (${x},${y}) must have amount 0.`);
          return null;
        }),
      ),
    ),
  );
}

function compileWinGroups(
  logic: GameLogic,
  scene: SceneMatrix,
): readonly Game003v2WinGroup[] {
  const component = logic.getComponent(0, "bg-wins");
  if (!component) return Object.freeze([]);
  if (!component.hasBasicComponentData)
    throw new Error("game003v2 bg-wins requires basicComponentData.");
  const groups = getComponentWinResultGroupsByName(logic, "bg-wins", {
    stepIndex: 0,
    scene,
  }).map((group) =>
    Object.freeze({
      componentName: "bg-wins" as const,
      ...group,
      amount: requiredPositiveAmount(group.result, group.resultIndex),
    }),
  );
  const cashWin = groups.reduce((sum, group) => sum + group.amount, 0);
  const raw = component.basicComponentData as Readonly<Record<string, unknown>>;
  const expected = selectAmount(raw, "cashWin64", "cashWin");
  if (expected !== undefined && expected !== cashWin)
    throw new Error(`bg-wins cashWin ${expected} does not match ${cashWin}.`);
  return Object.freeze(groups);
}

function requiredPositiveAmount(result: WinResult, index: number): number {
  const value = selectAmount(result, "cashWin64", "cashWin");
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`bg-wins result[${index}] cashWin must be positive.`);
  return value;
}

function selectAmount(
  value: Readonly<Record<string, unknown>>,
  modern: string,
  legacy: string,
): unknown {
  return value[modern] !== undefined ? value[modern] : value[legacy];
}

function validateScene(scene: SceneMatrix, label: string): SceneMatrix {
  if (!Array.isArray(scene) || scene.length !== COLUMNS)
    throw new Error(`${label} must contain ${COLUMNS} columns.`);
  for (const [x, column] of scene.entries())
    if (!Array.isArray(column) || column.length !== ROWS)
      throw new Error(`${label}[${x}] must contain ${ROWS} rows.`);
  return scene;
}

function requireSymbolCode(
  codes: Readonly<Record<string, number>>,
  symbol: string,
): number {
  const code = codes[symbol];
  if (code === undefined)
    throw new Error(`game003v2 requires symbol "${symbol}".`);
  return code;
}

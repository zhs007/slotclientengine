import type {
  SlotGameStateSnapshot,
  SlotGameUiCommands,
  SlotGameUiCreateContext,
} from "@slotclientengine/gameframeworks";

export const BET_OPTIONS = Object.freeze([
  Object.freeze({ bet: 100, lines: 30 }),
  Object.freeze({ bet: 200, lines: 30 }),
  Object.freeze({ bet: 500, lines: 30 }),
]);

export function createState(
  overrides: Partial<SlotGameStateSnapshot> = {},
): SlotGameStateSnapshot {
  const betIndex = overrides.betIndex ?? 1;
  return Object.freeze({
    connected: true,
    spinState: "idle" as const,
    balance: 1000,
    win: 0,
    betIndex,
    betOption: BET_OPTIONS[betIndex],
    muted: false,
    fastMode: false,
    autoMode: false,
    error: null,
    ...overrides,
  });
}

export function createCommands() {
  return {
    requestSpin: vi.fn(),
    increaseBet: vi.fn(),
    decreaseBet: vi.fn(),
    setMuted: vi.fn(),
    setFastMode: vi.fn(),
    setAutoMode: vi.fn(),
  } satisfies SlotGameUiCommands;
}

export function createContext(
  options: {
    readonly root?: HTMLElement;
    readonly state?: SlotGameStateSnapshot;
    readonly commands?: ReturnType<typeof createCommands>;
    readonly formatMoney?: (amount: number) => string;
  } = {},
): SlotGameUiCreateContext {
  return Object.freeze({
    root: options.root ?? document.createElement("div"),
    designSize: Object.freeze({ width: 2000, height: 2000 }),
    framePolicy: Object.freeze({ mode: "fixed" as const }),
    betOptions: BET_OPTIONS,
    initialState: options.state ?? createState(),
    brandLabel: "game002",
    currency: "USD",
    locale: "en-US",
    ...(options.formatMoney ? { formatMoney: options.formatMoney } : {}),
    commands: options.commands ?? createCommands(),
  });
}

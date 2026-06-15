import type {
  SlotUiBetOption,
  SlotUiDesignSize,
  SlotUiLiveConfig,
} from "@slotclientengine/uiframeworks";

export type ViewerScenarioId =
  | "default-portrait"
  | "small-mobile"
  | "landscape-letterbox"
  | "long-numbers"
  | "loading-and-disabled"
  | "win-state"
  | "sound-off"
  | "error-state"
  | "auto-active"
  | "buy-bonus-disabled"
  | "no-brand"
  | "clock-disabled"
  | "fast-active";

export interface ViewerScenario {
  readonly id: ViewerScenarioId;
  readonly label: string;
  readonly designSize: SlotUiDesignSize;
  readonly balance: number;
  readonly win: number;
  readonly betIndex: number;
  readonly muted: boolean;
  readonly fastMode: boolean;
  readonly autoMode: boolean;
  readonly brandLabel?: string;
  readonly clockLabel?: string | false;
  readonly buyBonusEnabled: boolean;
  readonly mockTotalWin: number;
  readonly mockBalanceAfterSpin: number;
  readonly mockConnectMode?: "normal" | "pending" | "error";
}

export interface ViewerRuntimeConfig {
  readonly mode: "mock" | "live";
  readonly live: SlotUiLiveConfig;
}

export type ViewerEnv = Readonly<Record<string, string | boolean | undefined>>;

export const VIEWER_BET_OPTIONS: readonly SlotUiBetOption[] = Object.freeze([
  Object.freeze({ bet: 1, lines: 10 }),
  Object.freeze({ bet: 2, lines: 10, times: 2, label: "2.00" }),
  Object.freeze({ bet: 5, lines: 20 }),
  Object.freeze({ bet: 25, lines: 50, label: "25.00 x 50" }),
]);

const DEFAULT_DESIGN_SIZE = Object.freeze({ width: 941, height: 1672 });

export const VIEWER_SCENARIOS: readonly ViewerScenario[] = Object.freeze([
  scenario({
    id: "default-portrait",
    label: "Default portrait",
    balance: 1000,
    win: 0,
    betIndex: 1,
    mockTotalWin: 45,
    mockBalanceAfterSpin: 1043,
  }),
  scenario({
    id: "small-mobile",
    label: "Small mobile",
    balance: 875.25,
    win: 0,
    betIndex: 0,
    mockTotalWin: 5,
    mockBalanceAfterSpin: 879.25,
  }),
  scenario({
    id: "landscape-letterbox",
    label: "Landscape letterbox",
    balance: 6420,
    win: 20,
    betIndex: 2,
    mockTotalWin: 0,
    mockBalanceAfterSpin: 6415,
  }),
  scenario({
    id: "long-numbers",
    label: "Long numbers",
    balance: 9876543210.55,
    win: 123456789.25,
    betIndex: 3,
    mockTotalWin: 987654.25,
    mockBalanceAfterSpin: 9877530839.8,
  }),
  scenario({
    id: "loading-and-disabled",
    label: "Loading disabled",
    balance: 1000,
    win: 0,
    betIndex: 0,
    mockTotalWin: 0,
    mockBalanceAfterSpin: 1000,
    mockConnectMode: "pending",
  }),
  scenario({
    id: "win-state",
    label: "Win state",
    balance: 1400,
    win: 240,
    betIndex: 1,
    mockTotalWin: 240,
    mockBalanceAfterSpin: 1638,
  }),
  scenario({
    id: "sound-off",
    label: "Sound off",
    balance: 510,
    win: 0,
    betIndex: 1,
    muted: true,
    mockTotalWin: 0,
    mockBalanceAfterSpin: 508,
  }),
  scenario({
    id: "error-state",
    label: "Error state",
    balance: 1000,
    win: 0,
    betIndex: 1,
    mockTotalWin: 0,
    mockBalanceAfterSpin: 1000,
    mockConnectMode: "error",
  }),
  scenario({
    id: "auto-active",
    label: "Auto active",
    balance: 3200,
    win: 0,
    betIndex: 2,
    autoMode: true,
    mockTotalWin: 15,
    mockBalanceAfterSpin: 3210,
  }),
  scenario({
    id: "buy-bonus-disabled",
    label: "Buy bonus disabled",
    balance: 1000,
    win: 0,
    betIndex: 1,
    buyBonusEnabled: false,
    mockTotalWin: 0,
    mockBalanceAfterSpin: 998,
  }),
  scenario({
    id: "no-brand",
    label: "No brand",
    balance: 1000,
    win: 0,
    betIndex: 1,
    brandLabel: undefined,
    mockTotalWin: 0,
    mockBalanceAfterSpin: 998,
  }),
  scenario({
    id: "clock-disabled",
    label: "Clock disabled",
    balance: 1000,
    win: 0,
    betIndex: 1,
    clockLabel: false,
    mockTotalWin: 0,
    mockBalanceAfterSpin: 998,
  }),
  scenario({
    id: "fast-active",
    label: "Fast active",
    balance: 1600,
    win: 0,
    betIndex: 2,
    fastMode: true,
    mockTotalWin: 8,
    mockBalanceAfterSpin: 1603,
  }),
]);

export function getViewerScenario(id: string): ViewerScenario {
  const scenarioConfig = VIEWER_SCENARIOS.find((item) => item.id === id);
  if (!scenarioConfig) {
    throw new Error(`Unknown viewer scenario: ${id}.`);
  }
  return scenarioConfig;
}

export function getViewerRuntimeConfig(env: ViewerEnv): ViewerRuntimeConfig {
  const mode = env.VITE_UIFRAMEWORKSVIEWER_MODE === "live" ? "live" : "mock";
  if (mode === "mock") {
    return {
      mode,
      live: {
        serverUrl: "ws://mock.uiframeworksviewer.local",
        token: "mock-token",
        gamecode: "mock-game",
      },
    };
  }

  const serverUrl = readRequiredEnv(env, "VITE_UIFRAMEWORKSVIEWER_SERVER_URL");
  const token = readRequiredEnv(env, "VITE_UIFRAMEWORKSVIEWER_TOKEN");
  const gamecode = readRequiredEnv(env, "VITE_UIFRAMEWORKSVIEWER_GAMECODE");
  return {
    mode,
    live: {
      serverUrl,
      token,
      gamecode,
      businessid: readOptionalEnv(env, "VITE_UIFRAMEWORKSVIEWER_BUSINESSID"),
      clienttype: readOptionalEnv(env, "VITE_UIFRAMEWORKSVIEWER_CLIENTTYPE"),
      jurisdiction: readOptionalEnv(
        env,
        "VITE_UIFRAMEWORKSVIEWER_JURISDICTION",
      ),
      language: readOptionalEnv(env, "VITE_UIFRAMEWORKSVIEWER_LANGUAGE"),
    },
  };
}

function scenario(
  config: Omit<
    ViewerScenario,
    | "designSize"
    | "muted"
    | "fastMode"
    | "autoMode"
    | "brandLabel"
    | "clockLabel"
    | "buyBonusEnabled"
  > &
    Partial<
      Pick<
        ViewerScenario,
        | "designSize"
        | "muted"
        | "fastMode"
        | "autoMode"
        | "brandLabel"
        | "clockLabel"
        | "buyBonusEnabled"
      >
    >,
): ViewerScenario {
  return Object.freeze({
    designSize: DEFAULT_DESIGN_SIZE,
    muted: false,
    fastMode: false,
    autoMode: false,
    brandLabel: "HYPER GAMING",
    clockLabel: "18:25",
    buyBonusEnabled: true,
    ...config,
  });
}

function readRequiredEnv(env: ViewerEnv, key: string): string {
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required in live mode.`);
  }
  return value;
}

function readOptionalEnv(env: ViewerEnv, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

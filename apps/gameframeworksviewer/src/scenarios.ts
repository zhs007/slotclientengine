import type {
  SlotGameBetOption,
  SlotGameLiveConfig,
} from "@slotclientengine/gameframeworks";

export type ViewerScenarioId =
  | "default-win"
  | "no-win"
  | "zero-multi-collect"
  | "delayed-win";

export interface ViewerScenario {
  readonly id: ViewerScenarioId;
  readonly label: string;
  readonly balance: number;
  readonly balanceAfterSpin: number;
  readonly balanceAfterCollect: number;
  readonly totalwin: number;
  readonly results: number;
  readonly betIndex: number;
  readonly spinDelayMs: number;
  readonly componentNames: readonly string[];
}

export interface ViewerRuntimeConfig {
  readonly mode: "mock" | "live";
  readonly live: SlotGameLiveConfig;
  readonly spin: ViewerSpinConfig;
}

export interface ViewerSpinConfig {
  readonly bet: number;
  readonly lines: number;
  readonly times: number;
  readonly autonums: number;
}

export type ViewerEnv = Readonly<Record<string, string | boolean | undefined>>;

export const VIEWER_BET_OPTIONS: readonly SlotGameBetOption[] = Object.freeze([
  Object.freeze({ bet: 1, lines: 10 }),
  Object.freeze({ bet: 2, lines: 20, times: 2, label: "2 x 20" }),
  Object.freeze({ bet: 5, lines: 50 }),
]);

export const VIEWER_PREVIOUS_LIVE_DEFAULTS = Object.freeze({
  serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
  token: "3a820433c341f7932d6654c4f16147a2",
  gamecode: "CqbQ0Y7gtBpO5419j8h02",
  businessid: "guest",
  jurisdiction: "MT",
  clienttype: "web",
  language: "en",
  requestTimeoutMs: 30000,
  bet: 10,
  lines: 10,
  times: 1,
  autonums: -1,
});

export const VIEWER_SCENARIOS: readonly ViewerScenario[] = Object.freeze([
  scenario({
    id: "default-win",
    label: "Default win",
    balance: 1000,
    balanceAfterSpin: 998,
    balanceAfterCollect: 1042,
    totalwin: 44,
    results: 1,
    betIndex: 1,
  }),
  scenario({
    id: "no-win",
    label: "No win",
    balance: 1000,
    balanceAfterSpin: 998,
    balanceAfterCollect: 998,
    totalwin: 0,
    results: 1,
    betIndex: 1,
  }),
  scenario({
    id: "zero-multi-collect",
    label: "Zero multi-result",
    balance: 1000,
    balanceAfterSpin: 998,
    balanceAfterCollect: 998,
    totalwin: 0,
    results: 2,
    betIndex: 1,
  }),
  scenario({
    id: "delayed-win",
    label: "Delayed win",
    balance: 1200,
    balanceAfterSpin: 1198,
    balanceAfterCollect: 1236,
    totalwin: 38,
    results: 1,
    betIndex: 0,
    spinDelayMs: 1000,
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
  const mode = env.VITE_GAMEFRAMEWORKSVIEWER_MODE === "live" ? "live" : "mock";
  if (mode === "mock") {
    return {
      mode,
      live: {
        serverUrl: "ws://mock.gameframeworksviewer.local",
        token: "mock-token",
        gamecode: "mock-game",
      },
      spin: {
        bet: 2,
        lines: 20,
        times: 2,
        autonums: -1,
      },
    };
  }

  const serverUrl = readStringEnv(
    env,
    "VITE_GAMEFRAMEWORKSVIEWER_SERVER_URL",
    VIEWER_PREVIOUS_LIVE_DEFAULTS.serverUrl,
  );
  const token = readStringEnv(
    env,
    "VITE_GAMEFRAMEWORKSVIEWER_TOKEN",
    VIEWER_PREVIOUS_LIVE_DEFAULTS.token,
  );
  const gamecode = readStringEnv(
    env,
    "VITE_GAMEFRAMEWORKSVIEWER_GAMECODE",
    VIEWER_PREVIOUS_LIVE_DEFAULTS.gamecode,
  );
  return {
    mode,
    live: {
      serverUrl,
      token,
      gamecode,
      businessid: readStringEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_BUSINESSID",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.businessid,
      ),
      clienttype: readStringEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_CLIENTTYPE",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.clienttype,
      ),
      jurisdiction: readStringEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_JURISDICTION",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.jurisdiction,
      ),
      language: readStringEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_LANGUAGE",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.language,
      ),
      requestTimeoutMs: readPositiveNumberEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_REQUEST_TIMEOUT_MS",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.requestTimeoutMs,
      ),
    },
    spin: {
      bet: readPositiveNumberEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_BET",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.bet,
      ),
      lines: readPositiveIntegerEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_LINES",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.lines,
      ),
      times: readPositiveIntegerEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_TIMES",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.times,
      ),
      autonums: readIntegerEnv(
        env,
        "VITE_GAMEFRAMEWORKSVIEWER_AUTONUMS",
        VIEWER_PREVIOUS_LIVE_DEFAULTS.autonums,
      ),
    },
  };
}

function scenario(
  config: Omit<ViewerScenario, "componentNames" | "spinDelayMs"> &
    Partial<Pick<ViewerScenario, "componentNames" | "spinDelayMs">>,
): ViewerScenario {
  return Object.freeze({
    componentNames: Object.freeze(["lineWin", "bonus", "freeSpin"]),
    spinDelayMs: 0,
    ...config,
  });
}

function readStringEnv(env: ViewerEnv, key: string, fallback: string): string {
  const value = env[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string when provided.`);
  }
  return value.trim();
}

function readPositiveNumberEnv(
  env: ViewerEnv,
  key: string,
  fallback: number,
): number {
  const parsed = readNumberEnv(env, key, fallback);
  if (parsed <= 0) {
    throw new Error(`${key} must be a positive number when provided.`);
  }
  return parsed;
}

function readPositiveIntegerEnv(
  env: ViewerEnv,
  key: string,
  fallback: number,
): number {
  const parsed = readIntegerEnv(env, key, fallback);
  if (parsed <= 0) {
    throw new Error(`${key} must be a positive integer when provided.`);
  }
  return parsed;
}

function readIntegerEnv(env: ViewerEnv, key: string, fallback: number): number {
  const parsed = readNumberEnv(env, key, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${key} must be an integer when provided.`);
  }
  return parsed;
}

function readNumberEnv(env: ViewerEnv, key: string, fallback: number): number {
  const value = env[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a number when provided.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be finite when provided.`);
  }
  return parsed;
}

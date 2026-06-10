import { RtpCliConfig, SpinRequestConfig } from "./types";

export const DEFAULT_SERVER_URL = "wss://gameserv.rgstest.slammerstudios.com/";
export const DEFAULT_GAME_CODE = "CqbQ0Y7gtBpO5419j8h02";
export const DEFAULT_TOKEN = "3a820433c341f7932d6654c4f16147a2";
export const DEFAULT_BUSINESS_ID = "guest";
export const DEFAULT_JURISDICTION = "MT";
export const DEFAULT_CLIENT_TYPE = "web";
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_BET = 10;
export const DEFAULT_LINES = 10;
export const DEFAULT_TIMES = 1;
export const DEFAULT_AUTONUMS = -1;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
export const DEFAULT_PROGRESS_INTERVAL = 1;

export const DEFAULT_SPIN_CONFIG: SpinRequestConfig = {
  bet: DEFAULT_BET,
  lines: DEFAULT_LINES,
  times: DEFAULT_TIMES,
  autonums: DEFAULT_AUTONUMS,
};

export function createDefaultConfig(): RtpCliConfig {
  return {
    url: DEFAULT_SERVER_URL,
    gamecode: DEFAULT_GAME_CODE,
    token: DEFAULT_TOKEN,
    businessid: DEFAULT_BUSINESS_ID,
    jurisdiction: DEFAULT_JURISDICTION,
    clienttype: DEFAULT_CLIENT_TYPE,
    language: DEFAULT_LANGUAGE,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    progressInterval: DEFAULT_PROGRESS_INTERVAL,
    spin: { ...DEFAULT_SPIN_CONFIG },
    spins: 0,
    verbose: false,
    overrides: [],
  };
}

import {
  ConnectionState,
  DisconnectEventPayload,
  Logger,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";
import type { GameplayStatsSnapshot } from "./gameplay-stats";

export type OutputSink = (line: string) => void;

export interface SpinRequestConfig {
  bet: number;
  lines: number;
  times: number;
  autonums: number;
}

export interface RtpCliConfig {
  url: string;
  gamecode: string;
  token: string;
  businessid: string;
  jurisdiction: string;
  clienttype: string;
  language: string;
  requestTimeoutMs: number;
  progressInterval: number;
  spin: SpinRequestConfig;
  spins: number;
  verbose: boolean;
  overrides: string[];
}

export interface UserSummary {
  pid?: string;
  nickname?: string;
  currency?: string;
  balance: number;
}

export interface SpinOutcome {
  gmi: any;
  totalwin: number;
  results: number;
  replyPlayResultsLength: number;
}

export interface RtpStatsSnapshot {
  completedSpins: number;
  stakePerSpin: number;
  totalStake: number;
  totalWin: number;
  rtp: number;
  rtpPercent: number;
}

export interface RtpRunSummary extends RtpStatsSnapshot {
  initialBalance: number;
  finalBalance: number;
  balanceDelta: number;
  gameplay: GameplayStatsSnapshot;
}

export interface SlotcraftClientLike {
  getState(): ConnectionState;
  getUserInfo(): Readonly<UserInfo>;
  connect(token?: string): Promise<void>;
  enterGame(gamecode?: string): Promise<any>;
  spin(params: SpinParams): Promise<any>;
  collect(playIndex?: number): Promise<any>;
  selectOptional(index: number): Promise<any>;
  disconnect(): void;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
  once(event: string, callback: (...args: any[]) => void): void;
}

export type SlotcraftClientFactory = (
  options: SlotcraftClientOptions,
) => SlotcraftClientLike;

export interface RtpRunnerDependencies {
  createClient?: SlotcraftClientFactory;
  output?: OutputSink;
}

export interface FailFastEventHandlers {
  error: (error: unknown) => void;
  disconnect: (payload: DisconnectEventPayload) => void;
  reconnecting: (payload: unknown) => void;
  message: (message: any) => void;
}

export interface FailFastMonitorLike {
  logger: Logger;
  handlers: FailFastEventHandlers;
  markDisconnectExpected(): void;
  throwIfFailed(): void;
  race<T>(operation: Promise<T>): Promise<T>;
}

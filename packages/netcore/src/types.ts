/**
 * @fileoverview Core type definitions for the network library.
 */

/**
 * Defines the possible states of the network client's connection.
 */
export enum ConnectionState {
  /** The client is idle and not connected. */
  IDLE = 'IDLE',
  /** The client is establishing the WebSocket connection. */
  CONNECTING = 'CONNECTING',
  /** The WebSocket connection is open, but the client is not yet authenticated. */
  CONNECTED = 'CONNECTED',
  /** The client is sending authentication credentials. */
  LOGGING_IN = 'LOGGING_IN',
  /** The client has authenticated successfully and is ready for game commands. */
  LOGGED_IN = 'LOGGED_IN',
  /** The client is in the process of entering a game. */
  ENTERING_GAME = 'ENTERING_GAME',
  /** A transient state indicating that the client is processing a game state that needs to be resumed (e.g., pending wins or choices). */
  RESUMING = 'RESUMING',
  /** The client is in a game and ready to send/receive game messages. */
  IN_GAME = 'IN_GAME',
  /** The client is waiting for the player to make a selection. */
  WAITTING_PLAYER = 'WAITTING_PLAYER',
  /** The client finished a spin and waits for collect decision. */
  SPINEND = 'SPINEND',
  /** A spin (gamectrl3) is in flight. */
  SPINNING = 'SPINNING',
  /** A player selection (gamectrl3) is in flight. */
  PLAYER_CHOICING = 'PLAYER_CHOICING',
  /** A collect command is in flight after a win. */
  COLLECTING = 'COLLECTING',
  /** The client is disconnected and will attempt to reconnect. */
  RECONNECTING = 'RECONNECTING',
  /** The client is permanently disconnected and will not reconnect. */
  DISCONNECTED = 'DISCONNECTED',
}

/**
 * Defines a basic logger interface, compatible with the `console` object.
 */
export interface Logger {
  log(message?: any, ...optionalParams: any[]): void;
  warn(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
}

/**
 * Configuration options for initializing the SlotcraftClient.
 */
export interface SlotcraftClientOptions {
  /** The WebSocket URL of the game server. */
  url: string;
  /** Optional: The login token. Can also be provided to the `connect` method. */
  token?: string;
  /** Optional: The game code to enter. Can also be provided to the `enterGame` method. */
  gamecode?: string;
  /**
   * Optional: The business ID for the client.
   * @default ''
   */
  businessid?: string;
  /**
   * Optional: The type of the client.
   * @default 'web'
   */
  clienttype?: string;
  /**
   * Optional: The jurisdiction for the client.
   * @default 'MT'
   */
  jurisdiction?: string;
  /**
   * Optional: The language for the client.
   * @default 'en'
   */
  language?: string;
  /** Optional: Maximum number of reconnection attempts. Defaults to 10. */
  maxReconnectAttempts?: number;
  /** Optional: Initial reconnection delay in ms. Defaults to 1000. */
  reconnectDelay?: number;
  /** Optional: Timeout for a single request in ms. Defaults to 10000. */
  requestTimeout?: number;
  /**
   * Optional: A custom fetch implementation.
   * Used by Replay Mode in non-browser environments.
   * If not provided, it will default to the global `fetch`.
   */
  fetch?: (url: string, init?: any) => Promise<any>;
  /** Optional: A custom logger. Set to `null` to disable logging. Defaults to `console`. */
  logger?: Logger | null;
}

/**
 * Defines the structure for event listeners.
 */
export type EventCallback = (...args: any[]) => void;

/**
 * Defines the payload for the 'disconnect' event.
 */
export interface DisconnectEventPayload {
  /** The WebSocket close event code. */
  code: number;
  /** A description of why the connection was closed. */
  reason: string;
  /** Indicates if the disconnection was clean or unexpected. */
  wasClean: boolean;
}

/**
 * Defines the payload for the 'raw_message' event.
 */
export interface RawMessagePayload {
  /** The direction of the message. */
  direction: 'SEND' | 'RECV';
  /** The raw message content as a string. */
  message: string;
}

/**
 * Payload for state change notifications.
 */
export interface StateChangePayload {
  previous: ConnectionState;
  current: ConnectionState;
  // Optional contextual data for this transition (e.g., { gmi })
  data?: any;
}

/**
 * Cached user and game-related information.
 */
export interface UserInfo {
  // Session/login
  token?: string;
  businessid?: string;
  clienttype?: string;
  language?: string;
  // Identity
  pid?: string;
  uid?: number;
  nickname?: string;
  // Wallet & jurisdiction
  balance?: number; // from userbaseinfo.gold
  currency?: string;
  jurisdiction?: string;
  // Game context
  gamecode?: string;
  gameid?: number;
  ctrlid?: number;
  lastctrlid?: number;
  // Latest player state payload from 'gameuserinfo'
  playerState?: any;
  // Game config
  defaultLinebet?: number;
  linebets?: number[];
  // Game config versions
  gamecfgVer?: string;
  gamecfgCoreVer?: string;
  // Parsed gamecfg.data (JSON string parsed to object)
  gamecfgData?: any;
  // Allowed lines options (from gamecfg.bets or parsed gamecfgData keys)
  linesOptions?: number[];
  // Last play metadata from gamemoduleinfo
  lastPlayIndex?: number;
  lastPlayWin?: number; // playwin only
  lastTotalWin?: number; // totalwin used to judge win
  lastResultsCount?: number; // replyPlay.results.length
  // Last full gamemoduleinfo payload
  lastGMI?: any;
  // Player choice context
  optionals?: Optional[];
  curSpinParams?: SpinParams;
  // Scene data, simplified into a 2D array
  defaultScene?: number[][];
  // A generic parameter that can be sent from client to server.
  clientParameter?: string;
}

/**
 * Defines the structure for a player's optional choice.
 */
export interface Optional {
  command: string;
  param: string;
}

/**
 * Options for a spin action.
 */
export interface SpinParams {
  bet?: number; // if omitted, use defaultLinebet when available
  lines?: number; // if omitted, use min of linesOptions when available
  times?: number;
  autonums?: number;
  ctrlname?: string; // default: 'spin'
  // Allow extra ctrlparam fields if needed
  [key: string]: any;
}

/**
 * Defines the public interface for a Slotcraft client implementation.
 * This allows for different implementations (e.g., live WebSocket vs. replay from JSON)
 * to be used interchangeably.
 */
export interface ISlotcraftClientImpl {
  getState(): ConnectionState;
  getUserInfo(): Readonly<UserInfo>;
  connect(token?: string): Promise<void>;
  enterGame(gamecode?: string): Promise<any>;
  spin(params: SpinParams): Promise<any>;
  collect(playIndex?: number): Promise<any>;
  selectOptional(index: number): Promise<any>;
  selectSomething(clientParameter: string): Promise<any>;
  disconnect(): void;
  send(cmdid: string, params: any): Promise<any>;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
  once(event: string, callback: (...args: any[]) => void): void;
}

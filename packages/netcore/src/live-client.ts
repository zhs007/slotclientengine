import { transformSceneData } from './utils';
import { Connection } from './connection';
import { EventEmitter } from './event-emitter';
import {
  ConnectionState,
  SlotcraftClientOptions,
  DisconnectEventPayload,
  RawMessagePayload,
  UserInfo,
  SpinParams,
  Logger,
  ISlotcraftClientImpl,
} from './types';

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class SlotcraftClientLive implements ISlotcraftClientImpl {
  private options: SlotcraftClientOptions;
  private connection: Connection;
  private state: ConnectionState = ConnectionState.IDLE;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private emitter = new EventEmitter();
  private pendingRequests = new Map<string, PendingRequest>();
  private logger: Logger;

  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private userInfo: UserInfo = {};
  // No longer needed, as the enqueued operation's promise is returned directly.
  // private loginPromise: { resolve: () => void; reject: (reason?: any) => void } | null = null;

  // --- User Operation Queue ---
  /**
   * @private
   * A queue of functions that execute user operations.
   * Each function in the queue is a "thunk" that returns a Promise.
   * This ensures that all major operations (login, spin, collect, etc.)
   * are executed serially, preventing race conditions.
   */
  private operationQueue: Array<{
    executor: () => Promise<any>;
    reject: (reason?: any) => void;
  }> = [];
  /**
   * @private
   * A flag to prevent the queue from being processed by multiple concurrent triggers.
   * This acts as a lock.
   */
  private isProcessingQueue = false;

  /**
   * Creates an instance of SlotcraftClientLive.
   *
   * @param options - Configuration options for the client.
   */
  constructor(options: SlotcraftClientOptions) {
    this.options = {
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      requestTimeout: 10000,
      ...options,
    };

    // Cache token, gamecode, and other context from constructor options
    this.userInfo.token = options.token;
    this.userInfo.gamecode = options.gamecode;
    this.userInfo.businessid = options.businessid ?? '';
    this.userInfo.clienttype = options.clienttype ?? 'web';
    this.userInfo.jurisdiction = options.jurisdiction ?? 'MT';
    this.userInfo.language = options.language ?? 'en';
    this.userInfo.clientParameter = '';

    if (options.logger === null) {
      // If logger is explicitly null, use a no-op logger
      this.logger = { log: () => {}, warn: () => {}, error: () => {} };
    } else {
      // Otherwise, use the provided logger or default to the console
      this.logger = options.logger || console;
    }

    this.connection = new Connection(this.options.url);
    this.setupConnectionHandlers();
  }

  // --- Public API ---

  public getState(): ConnectionState {
    return this.state;
  }

  private setState(next: ConnectionState, data?: any): void {
    if (this.state === next) {
      // Allow emitting a state event with data even if state doesn't change
      if (data !== undefined) {
        const prev = this.state;
        this.emitter.emit('state', { previous: prev, current: next, data });
      }
      return;
    }
    const prev = this.state;
    this.state = next;
    this.emitter.emit('state', { previous: prev, current: next, data });
  }

  public getUserInfo(): Readonly<UserInfo> {
    return this.userInfo;
  }

  public connect(token?: string): Promise<void> {
    return this._enqueueOperation(async () => {
      if (this.state !== ConnectionState.IDLE && this.state !== ConnectionState.DISCONNECTED) {
        throw new Error(`Cannot connect in state: ${this.state}`);
      }

      const tokenToUse = token || this.userInfo.token;
      if (!tokenToUse) {
        throw new Error('Token must be provided either in the constructor or to connect()');
      }
      this.userInfo.token = tokenToUse;

      this.setState(ConnectionState.CONNECTING);

      // This promise wraps the entire connection and login flow.
      await new Promise<void>((resolve, reject) => {
        // If a disconnect happens before we are connected, reject the promise.
        const onDisconnect = (payload: DisconnectEventPayload) => {
          this.emitter.off('connect', onConnect); // Clean up the success listener
          reject(new Error(payload.reason));
        };

        const onConnect = () => {
          this.emitter.off('disconnect', onDisconnect); // Clean up the failure listener
          resolve();
        };

        this.emitter.once('connect', onConnect);
        this.emitter.once('disconnect', onDisconnect);

        this.connection.connect();
      });

      // Once connected, proceed to login. The `_login` method is now also an
      // internally queued operation, but since `connect` is the first one,
      // it will execute immediately after the connection is established.
      await this._login();
    });
  }

  public enterGame(gamecode?: string): Promise<any> {
    return this._enqueueOperation(async () => {
      if (this.state !== ConnectionState.LOGGED_IN) {
        throw new Error(`Cannot enter game in state: ${this.state}`);
      }

      const gamecodeToUse = gamecode || this.userInfo.gamecode;
      if (!gamecodeToUse) {
        throw new Error('Game code must be provided either in the constructor or to enterGame()');
      }
      this.userInfo.gamecode = gamecodeToUse;

      // The client is now entering the game. The final state (IN_GAME, SPINEND, etc.)
      // will be determined by the cmdret handler for 'comeingame3', which processes
      // the server's response and handles any potential "resume" scenarios.
      this.setState(ConnectionState.ENTERING_GAME);
      return this.send('comeingame3', {
        gamecode: gamecodeToUse,
        tableid: '',
        isreconnect: false,
      });
    });
  }

  public spin(params: SpinParams): Promise<any> {
    return this._enqueueOperation(async () => {
      if (this.state !== ConnectionState.IN_GAME) {
        throw new Error(`Cannot spin in state: ${this.state}`);
      }
      const { gameid, ctrlid } = this.userInfo;
      if (!gameid) {
        throw new Error('gameid not available');
      }
      if (!ctrlid) {
        throw new Error('ctrlid not available');
      }

      let { bet, lines, times = 1, autonums = -1, ctrlname = 'spin', ...rest } = params;
      // Default bet from cached game config if not provided
      if (bet == null) {
        if (typeof this.userInfo.defaultLinebet === 'number') {
          bet = this.userInfo.defaultLinebet;
        }
      }
      // Validate bet against allowed linebets when available
      if (typeof bet === 'number' && Array.isArray(this.userInfo.linebets)) {
        if (!this.userInfo.linebets.includes(bet)) {
          throw new Error(`Invalid bet ${bet}. Allowed: [${this.userInfo.linebets.join(',')}]`);
        }
      }
      if (bet == null) {
        throw new Error('bet is required and no default is available');
      }
      // Default lines to smallest allowed if not provided and we have options
      if (lines == null) {
        const opts = this.userInfo.linesOptions;
        if (Array.isArray(opts) && opts.length > 0) {
          lines = Math.min(...opts);
        }
      }
      const ctrlparam = { autonums, bet, lines, times, ...rest };
      // Cache the spin params for potential player choice follow-up
      this.userInfo.curSpinParams = { bet, lines, times };
      this.userInfo.optionals = [];
      this.setState(ConnectionState.SPINNING);

      await this.send('gamectrl3', { gameid, ctrlid, ctrlname, ctrlparam });

      // By protocol, gamemoduleinfo should have arrived before cmdret.
      // Return the latest cached GMI snapshot and simple aggregates.
      const gmi = this.userInfo.lastGMI;
      const totalwin = this.userInfo.lastTotalWin ?? 0;
      const results = this.userInfo.lastResultsCount ?? 0;
      return { gmi, totalwin, results };
    });
  }

  public collect(playIndex?: number): Promise<any> {
    return this._enqueueOperation(async () => {
      // Collect can be called after a spin ends (SPINEND) or at any time while in the game
      // for special cases like acknowledging an auto-collected reward.
      if (this.state !== ConnectionState.SPINEND && this.state !== ConnectionState.IN_GAME) {
        throw new Error(`Cannot collect in state: ${this.state}`);
      }
      const { gameid, lastResultsCount, lastPlayIndex } = this.userInfo;
      if (!gameid) {
        throw new Error('gameid not available');
      }

      let indexToCollect: number | undefined;

      if (typeof playIndex === 'number') {
        // Use the index explicitly provided by the caller (e.g., for auto-collect).
        indexToCollect = playIndex;
      } else if (typeof lastResultsCount === 'number' && lastResultsCount > 0) {
        // If no index is provided, default to collecting the final result.
        // The playIndex is 0-based, so it's `length - 1`.
        indexToCollect = lastResultsCount - 1;
      } else if (typeof lastPlayIndex === 'number') {
        // As a fallback, use the last known playIndex from server messages and
        // increment it to collect the next sequential result.
        indexToCollect = lastPlayIndex + 1;
      }

      if (typeof indexToCollect !== 'number') {
        throw new Error('playIndex is not available and could not be derived.');
      }

      this.setState(ConnectionState.COLLECTING);

      try {
        const res = await this.send('collect', { gameid, playIndex: indexToCollect });
        // On successful collection, always return to the main IN_GAME state.
        this.setState(ConnectionState.IN_GAME);
        return res;
      } catch (err) {
        // If collection fails, revert to the SPINEND state to allow for a retry.
        // This is important for ensuring wins are properly acknowledged.
        this.setState(ConnectionState.SPINEND);
        throw err;
      }
    });
  }

  public selectOptional(index: number): Promise<any> {
    return this._enqueueOperation(async () => {
      if (this.state !== ConnectionState.WAITTING_PLAYER) {
        throw new Error(`Cannot selectOptional in state: ${this.state}`);
      }
      const { gameid, ctrlid, optionals, curSpinParams } = this.userInfo;
      if (!gameid) throw new Error('gameid not available');
      if (!ctrlid) throw new Error('ctrlid not available');
      if (!optionals || !optionals[index]) {
        throw new Error(`Invalid selection index: ${index}`);
      }
      if (!curSpinParams) {
        throw new Error('Missing spin parameters for selection');
      }

      const selection = optionals[index];
      const ctrlparam = {
        ...curSpinParams, // includes bet, lines, times
        command: selection.command,
        commandParam: selection.param,
      };

      // After selection, we are in a new "choicing" state, awaiting the result.
      this.setState(ConnectionState.PLAYER_CHOICING);
      await this.send('gamectrl3', {
        gameid,
        ctrlid,
        ctrlname: 'selectfree',
        ctrlparam,
      });

      // Similar to spin, return the latest GMI info
      const gmi = this.userInfo.lastGMI;
      const totalwin = this.userInfo.lastTotalWin ?? 0;
      const results = this.userInfo.lastResultsCount ?? 0;
      return { gmi, totalwin, results };
    });
  }

  public selectSomething(clientParameter: string): Promise<any> {
    return this._enqueueOperation(async () => {
      if (this.state !== ConnectionState.IN_GAME) {
        throw new Error(`Cannot selectSomething in state: ${this.state}`);
      }
      const { gameid, ctrlid, curSpinParams } = this.userInfo;
      if (!gameid) throw new Error('gameid not available');
      if (!ctrlid) throw new Error('ctrlid not available');

      // Unlike spin, we don't need to guess defaults. We use the last known spin params.
      const { bet, lines, times } = curSpinParams || {};
      if (bet === undefined || lines === undefined || times === undefined) {
        this.logger.warn('Spin parameters are not available for selectSomething. Sending without them.');
      }

      // Cache the new client parameter.
      this.userInfo.clientParameter = clientParameter;

      const ctrlparam = {
        bet,
        lines,
        times,
        clientParameter: clientParameter,
      };

      // We don't introduce a new state for this, as it's a simple command-response.
      // The client remains in IN_GAME unless the response dictates otherwise (which is not expected).
      return this.send('gamectrl3', {
        gameid,
        ctrlid,
        ctrlname: 'selectany',
        ctrlparam,
      });
    });
  }

  public disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();
    // Check if connection exists and is not already closing or closed
    if (this.connection) {
      this.connection.disconnect();
    }
    // Update state immediately for responsiveness
    if (this.state !== ConnectionState.DISCONNECTED) {
      this.setState(ConnectionState.DISCONNECTED);
    }
    // Reject any pending commands and clear the operation queue.
    this.rejectAllPendingRequests('Client disconnected.');
    this._rejectAllQueuedOperations('Client disconnected.');
  }

  public send(cmdid: string, params: any = {}): Promise<any> {
    // P1: Restrict commands during LOGGING_IN state.
    if (this.state === ConnectionState.LOGGING_IN && cmdid !== 'flblogin') {
      return Promise.reject(new Error(`Only 'flblogin' is allowed during LOGGING_IN state.`));
    }

    const allowedStates = [
      ConnectionState.LOGGING_IN,
      ConnectionState.LOGGED_IN,
      ConnectionState.ENTERING_GAME,
      ConnectionState.RESUMING,
      ConnectionState.IN_GAME,
      ConnectionState.SPINNING,
      ConnectionState.PLAYER_CHOICING,
      ConnectionState.SPINEND,
      ConnectionState.COLLECTING,
      ConnectionState.WAITTING_PLAYER,
    ];

    if (!allowedStates.includes(this.state)) {
      return Promise.reject(new Error(`Cannot send message in state: ${this.state}`));
    }

    // P0: Prevent concurrent requests for the same cmdid.
    if (this.pendingRequests.has(cmdid)) {
      return Promise.reject(new Error(`A request with cmdid '${cmdid}' is already pending.`));
    }

    const message = JSON.stringify({ cmdid, ...params });
    this.emitRawMessage('SEND', message);
    this.connection.send(message);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(cmdid);
        reject(new Error(`Request timed out for cmdid: ${cmdid}`));
      }, this.options.requestTimeout);

      this.pendingRequests.set(cmdid, { resolve, reject, timer });
    });
  }

  public on(event: string, callback: (...args: any[]) => void) {
    this.emitter.on(event, callback);
  }
  public off(event: string, callback: (...args: any[]) => void) {
    this.emitter.off(event, callback);
  }
  public once(event: string, callback: (...args: any[]) => void) {
    this.emitter.once(event, callback);
  }

  // --- Private Handlers ---

  private _enqueueOperation<T>(executor: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const op = {
        executor: async () => {
          try {
            const result = await executor();
            resolve(result);
          } catch (error) {
            reject(error);
            // Re-throw to allow the queue processor to log it.
            throw error;
          }
        },
        reject: reject, // Store the reject function
      };

      this.operationQueue.push(op);

      // Start processing the queue if it's not already running.
      this._processQueue();
    });
  }

  private async _processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }
    this.isProcessingQueue = true;

    try {
      while (this.operationQueue.length > 0) {
        const operation = this.operationQueue.shift();
        if (operation) {
          try {
            await operation.executor();
          } catch (error) {
            // The promise rejection is already handled by the `_enqueueOperation` wrapper.
            // We just log it here for visibility and to indicate that the queue is continuing.
            this.logger.error('Operation in queue failed, but queue continues:', error);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private emitRawMessage(direction: 'SEND' | 'RECV', message: string): void {
    const payload: RawMessagePayload = { direction, message };
    this.emitter.emit('raw_message', payload);
  }

  private setupConnectionHandlers(): void {
    this.connection.onOpen = this.handleOpen.bind(this);
    this.connection.onMessage = this.handleMessage.bind(this);
    this.connection.onClose = this.handleClose.bind(this);
    this.connection.onError = this.handleError.bind(this);
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.emitter.emit('connect'); // Crucial for the connect() promise to resolve

    const previousState = this.state;
    this.setState(ConnectionState.CONNECTED);

    // After a RECONNECT, we must automatically log in again.
    // For an initial connection, the login is handled by the `connect()` method.
    // This distinction prevents a double-login race condition on initial connection.
    if (previousState === ConnectionState.RECONNECTING) {
      this._enqueueOperation(() => this._login()).catch((err) => {
        this.logger.error('Automatic re-login after reconnect failed:', err);
        // If login fails, we are effectively disconnected.
        this.disconnect();
      });
    }
  }

  private async _login(): Promise<void> {
    if (!this.userInfo.token) {
      throw new Error('Login failed: token is missing.');
    }

    this.setState(ConnectionState.LOGGING_IN);

    try {
      await this.send('flblogin', {
        token: this.userInfo.token,
        businessid: this.userInfo.businessid,
        clienttype: this.userInfo.clienttype,
        jurisdiction: this.userInfo.jurisdiction,
        language: this.userInfo.language,
        gamecode: this.userInfo.gamecode, // Also pass gamecode here
      });
      this.setState(ConnectionState.LOGGED_IN);
      this.startHeartbeat();
    } catch (error) {
      // If login fails, we disconnect to clean up. The error will be propagated
      // by the promise returned from _enqueueOperation.
      this.disconnect();
      // Re-throw the original error to ensure the caller's promise is rejected.
      throw error;
    }
  }

  private handleMessage(event: MessageEvent): void {
    this.emitRawMessage('RECV', event.data);
    try {
      // P2: Parse JSON only once.
      const parsedData = JSON.parse(event.data);
      const messages = Array.isArray(parsedData) ? parsedData : [parsedData];

      for (const msg of messages) {
        if (msg.msgid === 'cmdret') {
          const promise = this.pendingRequests.get(msg.cmdid);
          if (promise) {
            clearTimeout(promise.timer);
            if (msg.isok) {
              promise.resolve(msg);
            } else {
              promise.reject(new Error(`Command '${msg.cmdid}' failed.`));
            }
            this.pendingRequests.delete(msg.cmdid);
          }
          // Drive state transitions on cmdret where applicable
          switch (msg.cmdid) {
            case 'gamectrl3': {
              const gmi = this.userInfo.lastGMI;
              const totalwin = this.userInfo.lastTotalWin ?? 0;
              const resultsCount = this.userInfo.lastResultsCount ?? 0;

              // Determine if a collect action is required based on the outcome.
              // A collect is needed if:
              //   1. There is a win (totalwin > 0) AND there is at least one result stage.
              //   2. There is no win (totalwin === 0) BUT there are multiple result stages
              //      (e.g., for a multi-stage feature that ends with no prize).
              const needsCollect =
                (totalwin > 0 && resultsCount >= 1) || (totalwin === 0 && resultsCount > 1);

              if (this.state === ConnectionState.SPINNING) {
                // For a standard spin, check if it resulted in a player choice scenario.
                if (gmi?.replyPlay?.finished === false) {
                  this.setState(ConnectionState.WAITTING_PLAYER, { gmi });
                } else if (needsCollect) {
                  this.setState(ConnectionState.SPINEND, gmi ? { gmi } : undefined);
                } else {
                  this.setState(ConnectionState.IN_GAME);
                }
              } else if (this.state === ConnectionState.PLAYER_CHOICING) {
                // After a player choice, a nested choice is not possible.
                // We only need to decide if the outcome requires a collect.
                if (needsCollect) {
                  this.setState(ConnectionState.SPINEND, gmi ? { gmi } : undefined);
                } else {
                  this.setState(ConnectionState.IN_GAME);
                }
              }

              // Auto-collect feature: If a spin or select results in multiple stages,
              // automatically collect the second-to-last one. This confirms to the server
              // that the user has "seen" the intermediate results, reducing the number of
              // required manual `collect` calls and improving protocol efficiency.
              // The last result is left uncollected for the user to manually trigger.
              if (
                this.userInfo.lastResultsCount &&
                this.userInfo.lastResultsCount > 1
              ) {
                const autoCollectIndex = this.userInfo.lastResultsCount - 2;
                this.collect(autoCollectIndex).catch((err) => {
                  // Log the error but do not throw, as auto-collect is a background
                  // optimization and should not disrupt the main game flow.
                  this.logger.warn(
                    `Auto-collect for playIndex ${autoCollectIndex} failed:`,
                    err
                  );
                });
              }
              break;
            }
            case 'comeingame3': {
              // This is the crucial handler for entering a game. After the server
              // acknowledges 'comeingame3', the client might be in a fresh state or might
              // need to resume a previously unfinished game. The logic here is nearly
              // identical to the 'gamectrl3' handler, as both scenarios can result in a
              // win state that needs collection or a state waiting for player input.

              if (this.state !== ConnectionState.ENTERING_GAME) {
                // This handler should only run when entering a game. If we are in
                // another state, something is wrong. Log a warning and do nothing.
                this.logger.warn(
                  `Received cmdret for 'comeingame3' in unexpected state: ${this.state}`
                );
                break;
              }

              const gmi = this.userInfo.lastGMI;
              const totalwin = this.userInfo.lastTotalWin ?? 0;
              const resultsCount = this.userInfo.lastResultsCount ?? 0;

              // This condition determines if the game round has ended and requires a 'collect'
              // action from the user. It's true if there's a win, or if there are multiple
              // result stages (e.g., a feature that ends with no win).
              const needsCollect =
                (totalwin > 0 && resultsCount >= 1) || (totalwin === 0 && resultsCount > 1);

              const isPlayerChoice = gmi?.replyPlay?.finished === false;

              // If the game state is unfinished, it's a resume scenario.
              // Set the transient RESUMING state to clearly signal this event.
              if (isPlayerChoice || needsCollect) {
                this.setState(ConnectionState.RESUMING);
              }

              // Now, transition to the specific state required.
              if (isPlayerChoice) {
                this.setState(ConnectionState.WAITTING_PLAYER, { gmi });
              } else if (needsCollect) {
                // If a collect is needed, transition to SPINEND.
                this.setState(ConnectionState.SPINEND, gmi ? { gmi } : undefined);
              } else {
                // Otherwise, the game is in a standard playable state.
                this.setState(ConnectionState.IN_GAME);
              }

              // Just like after a regular spin, if the resume state includes multiple
              // results, we auto-collect the second-to-last one to streamline the UX.
              if (
                this.userInfo.lastResultsCount &&
                this.userInfo.lastResultsCount > 1
              ) {
                const autoCollectIndex = this.userInfo.lastResultsCount - 2;
                this.collect(autoCollectIndex).catch((err) => {
                  this.logger.warn(
                    `Auto-collect on resume for playIndex ${autoCollectIndex} failed:`,
                    err
                  );
                });
              }
              break;
            }
            case 'collect': {
              // collect() promise chain already handles state; no action here
              break;
            }
            default:
              break;
          }
        } else {
          // Passive messages: update caches where relevant only (no state transitions)
          this.updateCaches(msg);
          this.emitter.emit('message', msg);
        }
      }
    } catch (error) {
      this.logger.error('Failed to parse server message:', event.data);
      this.emitter.emit('error', new Error('Failed to parse server message'));
    }
  }

  /**
   * Update cached user/game info from passive messages.
   */
  private updateCaches(msg: any): void {
    switch (msg.msgid) {
      case 'userbaseinfo': {
        const ub = msg.userbaseinfo || {};
        this.userInfo.pid = ub.pid ?? this.userInfo.pid;
        this.userInfo.uid = ub.uid ?? this.userInfo.uid;
        this.userInfo.nickname = ub.nickname ?? this.userInfo.nickname;
        // gold as balance
        if (typeof ub.gold === 'number') this.userInfo.balance = ub.gold;
        this.userInfo.token = ub.token ?? this.userInfo.token;
        this.userInfo.currency = ub.currency ?? this.userInfo.currency;
        this.userInfo.jurisdiction = ub.jurisdiction ?? this.userInfo.jurisdiction;
        break;
      }
      case 'gamemoduleinfo': {
        if (typeof msg.gameid === 'number') this.userInfo.gameid = msg.gameid;
        // Cache last play index & win if present (support both top-level and nested in gmi)
        const g = msg.gmi || {};
        // Cache full gmi snapshot
        this.userInfo.lastGMI = g;
        const playIndex =
          typeof msg.playIndex === 'number'
            ? msg.playIndex
            : typeof g.playIndex === 'number'
              ? g.playIndex
              : undefined;
        if (typeof playIndex === 'number') this.userInfo.lastPlayIndex = playIndex;
        const playwin =
          typeof msg.playwin === 'number'
            ? msg.playwin
            : typeof g.playwin === 'number'
              ? g.playwin
              : undefined;
        const totalwin =
          typeof msg.totalwin === 'number'
            ? msg.totalwin
            : typeof g.totalwin === 'number'
              ? g.totalwin
              : undefined;
        if (typeof playwin === 'number') this.userInfo.lastPlayWin = playwin;
        if (typeof totalwin === 'number') this.userInfo.lastTotalWin = totalwin;
        // results length
        const resultsArr = Array.isArray(g.replyPlay?.results)
          ? g.replyPlay.results
          : Array.isArray(msg.results)
            ? msg.results
            : undefined;
        if (resultsArr) this.userInfo.lastResultsCount = resultsArr.length;

        // Handle player choice options caching
        const { replyPlay } = g;
        if (replyPlay && replyPlay.finished === false) {
          const { nextCommands, nextCommandParams } = replyPlay;
          if (
            Array.isArray(nextCommands) &&
            Array.isArray(nextCommandParams) &&
            nextCommands.length === nextCommandParams.length &&
            nextCommands.length > 0
          ) {
            this.userInfo.optionals = nextCommands.map((command, i) => ({
              command,
              param: nextCommandParams[i],
            }));

            // If we enter a player choice state AND the spin params haven't been set
            // (which happens when resuming), then we must initialize them from the GMI.
            // In a normal spin->choice flow, `curSpinParams` will have already been set by `spin()`.
            if (!this.userInfo.curSpinParams) {
              this.userInfo.curSpinParams = {
                bet: g.bet,
                lines: g.lines,
                times: 1,
              };
            }
          }
        }

        // Cache the default scene if it exists, transforming it into a 2D array.
        if (g.defaultScene) {
          this.userInfo.defaultScene = transformSceneData(g.defaultScene);
        }

        // Handle client parameter caching on resume
        if (typeof g.clientParameter === 'string') {
          this.userInfo.clientParameter = g.clientParameter;
        }
        break;
      }
      case 'gamecfg': {
        if (typeof msg.defaultLinebet === 'number')
          this.userInfo.defaultLinebet = msg.defaultLinebet;
        if (Array.isArray(msg.linebets)) this.userInfo.linebets = msg.linebets;
        if (typeof msg.ver === 'string') this.userInfo.gamecfgVer = msg.ver;
        if (typeof msg.coreVer === 'string') this.userInfo.gamecfgCoreVer = msg.coreVer;
        if (typeof msg.data === 'string') {
          try {
            this.userInfo.gamecfgData = JSON.parse(msg.data);
            // If no explicit bets array for lines, derive from gamecfgData keys
            if (!Array.isArray((msg as any).bets) && this.userInfo.gamecfgData) {
              const keys = Object.keys(this.userInfo.gamecfgData)
                .map((k) => Number(k))
                .filter((n) => Number.isFinite(n));
              if (keys.length) this.userInfo.linesOptions = keys.sort((a, b) => a - b);
            }
          } catch {
            // keep as undefined if parse fails
            this.userInfo.gamecfgData = undefined;
          }
        }
        // If server provides bets array, prefer it as lines options
        if (Array.isArray((msg as any).bets)) {
          const betsArr = (msg as any).bets.filter((n: any) => typeof n === 'number');
          if (betsArr.length) this.userInfo.linesOptions = [...betsArr].sort((a, b) => a - b);
        }
        break;
      }
      case 'gameuserinfo': {
        if (typeof msg.ctrlid === 'number') this.userInfo.ctrlid = msg.ctrlid;
        if (typeof msg.lastctrlid === 'number') this.userInfo.lastctrlid = msg.lastctrlid;
        // Cache the latest playerState object as-is
        if (msg.playerState !== undefined) this.userInfo.playerState = msg.playerState;
        break;
      }
      default:
        break;
    }
  }

  private handleClose(event?: CloseEvent): void {
    this.stopHeartbeat();
    const payload: DisconnectEventPayload = {
      code: event?.code || 0,
      reason: event?.reason || 'Unknown',
      wasClean: event?.wasClean || false,
    };
    this.emitter.emit('disconnect', payload);

    // On an unclean disconnect, we reject any pending operations and then try to reconnect.
    // The 'reconnecting' state is now the primary indicator of this situation.
    if (this.state !== ConnectionState.DISCONNECTED && !payload.wasClean) {
      this._rejectAllQueuedOperations('Connection closed unexpectedly.');
      this.tryReconnect();
    } else {
      this.setState(ConnectionState.DISCONNECTED);
    }
  }

  private handleError(event: Event): void {
    this.logger.error('WebSocket error observed:', event);
    this.emitter.emit('error', event);
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts!) {
      this.logger.error('Max reconnection attempts reached. Giving up.');
      this.setState(ConnectionState.DISCONNECTED);
      this.rejectAllPendingRequests('Reconnection failed.');
      return;
    }

    this.setState(ConnectionState.RECONNECTING);
    this.emitter.emit('reconnecting', { attempt: this.reconnectAttempts + 1 });

    const delay = this.options.reconnectDelay! * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(
      () => {
        this.logger.log(`Attempting to reconnect... (attempt ${this.reconnectAttempts})`);
        this.connection.connect();
      },
      Math.min(delay, 30000)
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send('keepalive').catch((err) => {
        this.logger.warn('Heartbeat failed:', err);
      });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private rejectAllPendingRequests(reason: string): void {
    for (const request of this.pendingRequests.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  private _rejectAllQueuedOperations(reason: string): void {
    while (this.operationQueue.length > 0) {
      const op = this.operationQueue.shift();
      if (op) {
        op.reject(new Error(reason));
      }
    }
  }
}

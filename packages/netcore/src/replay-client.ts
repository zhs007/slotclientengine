import { EventEmitter } from './event-emitter';
import {
  ConnectionState,
  ISlotcraftClientImpl,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
  StateChangePayload,
  RawMessagePayload,
  Logger,
} from './types';
import { transformSceneData } from './utils';

export class SlotcraftClientReplay implements ISlotcraftClientImpl {
  private options: SlotcraftClientOptions;
  private state: ConnectionState = ConnectionState.IDLE;
  private emitter = new EventEmitter();
  private logger: Logger;
  private userInfo: UserInfo = {};
  private replayData: any = null;

  constructor(options: SlotcraftClientOptions) {
    this.options = { ...options };

    this.userInfo.token = options.token;
    this.userInfo.gamecode = options.gamecode;
    this.userInfo.businessid = options.businessid ?? '';
    this.userInfo.clienttype = options.clienttype ?? 'web';
    this.userInfo.jurisdiction = options.jurisdiction ?? 'MT';
    this.userInfo.language = options.language ?? 'en';
    this.userInfo.clientParameter = '';

    if (options.logger === null) {
      this.logger = { log: () => {}, warn: () => {}, error: () => {} };
    } else {
      this.logger = options.logger || console;
    }
  }

  // --- Public API ---

  public getState(): ConnectionState {
    return this.state;
  }

  private setState(next: ConnectionState, data?: any): void {
    if (this.state === next) {
      if (data !== undefined) {
        this.emitter.emit('state', { previous: this.state, current: next, data });
      }
      return;
    }
    const prev = this.state;
    this.state = next;
    const payload: StateChangePayload = { previous: prev, current: next, data };
    this.emitter.emit('state', payload);
  }

  public getUserInfo(): Readonly<UserInfo> {
    return this.userInfo;
  }

  public async connect(token?: string): Promise<void> {
    if (this.state !== ConnectionState.IDLE && this.state !== ConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect in state: ${this.state}`);
    }

    const tokenToUse = token || this.userInfo.token;
    if (!tokenToUse) {
      throw new Error('Token must be provided either in the constructor or to connect()');
    }
    this.userInfo.token = tokenToUse;

    const fetchImpl = this.options.fetch ?? (typeof window !== 'undefined' ? window.fetch : undefined);
    if (!fetchImpl) {
      throw new Error(
        'A fetch implementation must be provided in options.fetch in non-browser environments.'
      );
    }

    this.setState(ConnectionState.CONNECTING);

    try {
      const response = await fetchImpl(this.options.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch replay file: ${(response as any).statusText}`);
      }
      this.replayData = await response.json();
      this.emitRawMessage('RECV', JSON.stringify(this.replayData));

      this.setState(ConnectionState.CONNECTED);
      this.emitter.emit('connect');

      // Simulate login
      this.setState(ConnectionState.LOGGING_IN);
      this.userInfo.balance = this.replayData.playCtrlParam?.balance ?? 0;
      this.setState(ConnectionState.LOGGED_IN);
    } catch (error) {
      this.setState(ConnectionState.DISCONNECTED);
      this.emitter.emit('error', error);
      throw error;
    }
  }

  public async enterGame(gamecode?: string): Promise<any> {
    if (this.state !== ConnectionState.LOGGED_IN) {
      throw new Error(`Cannot enter game in state: ${this.state}`);
    }
    if (!this.replayData) {
      throw new Error('Replay data not loaded. Call connect() first.');
    }

    const gamecodeToUse = gamecode || this.userInfo.gamecode;
    if (!gamecodeToUse) {
      throw new Error('Game code must be provided either in the constructor or to enterGame()');
    }
    this.userInfo.gamecode = gamecodeToUse;

    this.setState(ConnectionState.ENTERING_GAME);

    // In replay mode, enterGame pre-caches configuration data and then
    // puts the client in the ready state.
    this._updateConfigCaches(this.replayData);
    this.setState(ConnectionState.IN_GAME);

    return Promise.resolve({ isok: true, cmdid: 'comeingame3' });
  }

  public async spin(params: SpinParams): Promise<any> {
    if (this.state !== ConnectionState.IN_GAME) {
      this.logger.warn(`Spin called in non-standard state: ${this.state}.`);
    }
    if (!this.replayData) {
      // This should not happen if connect() was called, but as a safeguard:
      throw new Error('Replay data not loaded. Call connect() and enterGame() first.');
    }

    this.setState(ConnectionState.SPINNING);

    // The "spin" processes the result-specific parts of the pre-loaded JSON file.
    this.updateCaches(this.replayData);
    this.emitter.emit('message', this.replayData);

    const gmi = this.userInfo.lastGMI;
    const totalwin = this.userInfo.lastTotalWin ?? 0;
    const resultsCount = this.userInfo.lastResultsCount ?? 0;
    const finished = this.userInfo.lastGMI?.replyPlay?.finished ?? true;

    if (!finished) {
      this.setState(ConnectionState.WAITTING_PLAYER, { gmi });
    } else {
      const needsCollect =
        (totalwin > 0 && resultsCount >= 1) || (totalwin === 0 && resultsCount > 1);
      if (needsCollect) {
        this.setState(ConnectionState.SPINEND, { gmi });
      } else {
        this.setState(ConnectionState.IN_GAME);
      }
    }

    return Promise.resolve({ gmi, totalwin, results: resultsCount });
  }

  public async collect(playIndex?: number): Promise<any> {
    if (this.state !== ConnectionState.SPINEND) {
      throw new Error(`Cannot collect in state: ${this.state}`);
    }
    this.setState(ConnectionState.COLLECTING);
    // Simulate successful collection
    this.setState(ConnectionState.IN_GAME);
    return Promise.resolve({ isok: true, cmdid: 'collect' });
  }

  public async selectOptional(index: number): Promise<any> {
    // The provided example does not have an optional choice scenario.
    // This method can be expanded if needed for more complex replays.
    if (this.state !== ConnectionState.WAITTING_PLAYER) {
      throw new Error(`Cannot selectOptional in state: ${this.state}`);
    }
    // In a real implementation, we would use the index to select from `userInfo.optionals`
    // and then potentially process another stage of the replay data.
    this.logger.log(`Selected option ${index}. In replay, this concludes the action.`);
    this.setState(ConnectionState.IN_GAME);
    return Promise.resolve({ isok: true, cmdid: 'gamectrl3' });
  }

  public async selectSomething(clientParameter: string): Promise<any> {
    // In replay mode, we just log the action and cache the parameter.
    this.logger.log(`[REPLAY] selectSomething called with: "${clientParameter}"`);
    this.userInfo.clientParameter = clientParameter;
    return Promise.resolve({ isok: true, cmdid: 'gamectrl3' });
  }

  public disconnect(): void {
    if (this.state !== ConnectionState.DISCONNECTED) {
      this.setState(ConnectionState.DISCONNECTED);
      this.emitter.emit('disconnect', { code: 1000, reason: 'Client disconnected', wasClean: true });
    }
  }

  public async send(cmdid: string, params: any = {}): Promise<any> {
    // In replay mode, we don't send anything over the network.
    // We can log the attempt for debugging purposes.
    this.logger.log(`[REPLAY] send called for ${cmdid} with params:`, params);
    this.emitRawMessage('SEND', JSON.stringify({ cmdid, ...params }));
    return Promise.resolve({ isok: true, cmdid });
  }

  public on(event: string, callback: (...args: any[]) => void): void {
    this.emitter.on(event, callback);
  }

  public off(event: string, callback: (...args: any[]) => void): void {
    this.emitter.off(event, callback);
  }

  public once(event: string, callback: (...args: any[]) => void): void {
    this.emitter.once(event, callback);
  }

  private emitRawMessage(direction: 'SEND' | 'RECV', message: string): void {
    const payload: RawMessagePayload = { direction, message };
    this.emitter.emit('raw_message', payload);
  }

  /** Caches config-like properties that should be available before the first spin. */
  private _updateConfigCaches(msg: any): void {
    if (msg.msgid !== 'gamemoduleinfo') return;

    if (typeof msg.gameid === 'number') this.userInfo.gameid = msg.gameid;

    const g = msg.gmi || {};
    if (g.defaultScene) {
      this.userInfo.defaultScene = transformSceneData(g.defaultScene);
    }

    if (typeof msg.playCtrlParam?.lines === 'number') {
      this.userInfo.linesOptions = [msg.playCtrlParam.lines];
    }

    // Also cache the client parameter from the replay file's control parameters.
    if (typeof msg.playCtrlParam?.clientParameter === 'string') {
      this.userInfo.clientParameter = msg.playCtrlParam.clientParameter;
    }
  }

  /** Caches properties related to a spin result. */
  private updateCaches(msg: any): void {
    if (msg.msgid !== 'gamemoduleinfo') return;

    const g = msg.gmi || {};
    this.userInfo.lastGMI = g;

    const playIndex =
      typeof msg.playIndex === 'number'
        ? msg.playIndex
        : typeof g.playIndex === 'number'
        ? g.playIndex
        : undefined;
    if (typeof playIndex === 'number') this.userInfo.lastPlayIndex = playIndex;

    const totalwin =
      typeof msg.totalwin === 'number'
        ? msg.totalwin
        : typeof g.totalwin === 'number'
        ? g.totalwin
        : undefined;
    if (typeof totalwin === 'number') this.userInfo.lastTotalWin = totalwin;

    const resultsArr = Array.isArray(g.replyPlay?.results)
      ? g.replyPlay.results
      : Array.isArray(msg.results)
      ? msg.results
      : undefined;
    if (resultsArr) this.userInfo.lastResultsCount = resultsArr.length;
  }
}

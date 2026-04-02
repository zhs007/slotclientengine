import { SlotcraftClientLive } from './live-client';
import { SlotcraftClientReplay } from './replay-client';
import {
  ConnectionState,
  ISlotcraftClientImpl,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from './types';

export class SlotcraftClient implements ISlotcraftClientImpl {
  private implementation: ISlotcraftClientImpl;

  constructor(options: SlotcraftClientOptions) {
    const url = options.url.toLowerCase();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      this.implementation = new SlotcraftClientReplay(options);
    } else if (url.startsWith('ws://') || url.startsWith('wss://')) {
      this.implementation = new SlotcraftClientLive(options);
    } else {
      throw new Error(`Invalid URL protocol. Must be http(s) for replay or ws(s) for live.`);
    }
  }

  public getState(): ConnectionState {
    return this.implementation.getState();
  }

  public getUserInfo(): Readonly<UserInfo> {
    return this.implementation.getUserInfo();
  }

  public connect(token?: string): Promise<void> {
    return this.implementation.connect(token);
  }

  public enterGame(gamecode?: string): Promise<any> {
    return this.implementation.enterGame(gamecode);
  }

  public spin(params: SpinParams): Promise<any> {
    return this.implementation.spin(params);
  }

  public collect(playIndex?: number): Promise<any> {
    return this.implementation.collect(playIndex);
  }

  public selectOptional(index: number): Promise<any> {
    return this.implementation.selectOptional(index);
  }

  public selectSomething(clientParameter: string): Promise<any> {
    return this.implementation.selectSomething(clientParameter);
  }

  public disconnect(): void {
    this.implementation.disconnect();
  }

  public send(cmdid: string, params: any): Promise<any> {
    return this.implementation.send(cmdid, params);
  }

  public on(event: string, callback: (...args: any[]) => void): void {
    this.implementation.on(event, callback);
  }

  public off(event: string, callback: (...args: any[]) => void): void {
    this.implementation.off(event, callback);
  }

  public once(event: string, callback: (...args: any[]) => void): void {
    this.implementation.once(event, callback);
  }
}

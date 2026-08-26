/**
 * @fileoverview A wrapper class for the native WebSocket API.
 */

export class Connection {
  private url: string;
  private ws: WebSocket | null = null;
  private readonly binaryType: BinaryType | null;

  /**
   * Public callbacks to be set by the consumer of this class.
   */
  public onOpen: (() => void) | null = null;
  public onClose: ((event: CloseEvent) => void) | null = null;
  public onMessage: ((event: MessageEvent) => void) | null = null;
  public onError: ((event: Event) => void) | null = null;

  /**
   * Creates an instance of the Connection class.
   * @param url The WebSocket server URL.
   * @param binaryType 可选,显式指定二进制消息的投递格式;
   * 不传则保持浏览器默认('blob')。二进制加密通道时 type为 'arraybuffer'。
   */
  constructor(url: string, binaryType?: BinaryType) {
    this.url = url;
    this.binaryType = binaryType ?? null;
  }

  /** Updates the URL used by the next connection attempt. */
  public setUrl(url: string): void {
    if (this.ws) {
      throw new Error('Cannot change WebSocket URL while a connection is active.');
    }
    this.url = url;
  }

  /**
   * Initiates the WebSocket connection.
   */
  public connect(): void {
    if (this.ws) {
      // Prevent multiple connections
      this.disconnect();
    }

    // Since this library is for the frontend, we assume WebSocket is available globally.
    const ws = new WebSocket(this.url);
    this.ws = ws;
    if (this.binaryType) {
      ws.binaryType = this.binaryType;
    }

    ws.onopen = () => {
      this.onOpen?.();
    };

    ws.onclose = (event: CloseEvent) => {
      if (this.ws === ws) {
        this.ws = null;
      }
      this.onClose?.(event);
    };

    ws.onmessage = (event: MessageEvent) => {
      this.onMessage?.(event);
    };

    ws.onerror = (event: Event) => {
      this.onError?.(event);
    };
  }

  /**
   * Closes the WebSocket connection.
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Sends data over the WebSocket connection.
   * @param data 文本消息(string)或二进制 payload(ArrayBuffer)。
   * @returns {boolean} True if data was sent, false if the connection is not open.
   */
  public send(data: string | ArrayBuffer): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return true;
    }
    return false;
  }
}

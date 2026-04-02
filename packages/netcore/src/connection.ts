/**
 * @fileoverview A wrapper class for the native WebSocket API.
 */

export class Connection {
  private url: string;
  private ws: WebSocket | null = null;

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
   */
  constructor(url: string) {
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
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.onOpen?.();
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.onClose?.(event);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.onMessage?.(event);
    };

    this.ws.onerror = (event: Event) => {
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
   * @param data The string data to send.
   * @returns {boolean} True if data was sent, false if the connection is not open.
   */
  public send(data: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return true;
    }
    return false;
  }
}

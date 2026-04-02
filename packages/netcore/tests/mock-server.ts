import { WebSocketServer, WebSocket } from 'ws';
import { AddressInfo } from 'net';

// A handler function for incoming messages.
// It can optionally send a response back to the client.
type MessageHandler = (msg: any, ws: WebSocket, server: MockServer) => void | Promise<void>;

/**
 * A mock WebSocket server for testing the SlotcraftClient.
 * It allows for defining handlers for specific commands and simulating
 * server-side events like passive messages and disconnections.
 */
export class MockServer {
  public wss: WebSocketServer | null = null;
  private handlers = new Map<string, MessageHandler>(); // cmdid -> handler
  public clients: Set<WebSocket> = new Set();

  /**
   * Starts the WebSocket server on a given or random available port.
   * @param port The port to listen on. If 0 or undefined, a random port is used.
   * @returns {Promise<number>} A promise that resolves with the port number.
   */
  public start(port: number = 0): Promise<number> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port });

      this.wss.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);

        ws.on('message', (message: Buffer) => {
          try {
            const data = JSON.parse(message.toString());
            const handler = this.handlers.get(data.cmdid);
            if (handler) {
              handler(data, ws, this);
            }
          } catch (e) {
            console.error('MockServer: Error parsing message', e);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
        });
      });

      this.wss.on('listening', () => {
        const port = (this.wss?.address() as AddressInfo).port;
        resolve(port);
      });
    });
  }

  /**
   * Stops the server and closes all client connections.
   */
  public stop(): void {
    if (this.wss) {
      for (const client of this.clients) {
        client.close();
      }
      this.wss.close();
      this.wss = null;
      this.handlers.clear();
    }
  }

  /**
   * Defines a handler for a specific command ID (cmdid).
   * @param cmdid The command ID to handle.
   * @param handler The function to execute when a message with this cmdid is received.
   */
  public on(cmdid: string, handler: MessageHandler): void {
    this.handlers.set(cmdid, handler);
  }

  /**
   * Sends a message to a specific client.
   * @param ws The WebSocket client instance.
   * @param message The message object to send (will be stringified).
   */
  public send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcasts a message to all connected clients.
   * @param message The message object to send.
   */
  public broadcast(message: any): void {
    for (const client of this.clients) {
      this.send(client, message);
    }
  }

  /**
   * Forcibly terminates all client connections without a clean close.
   * This is useful for simulating network failures.
   */
  public terminateAll(): void {
    if (this.wss) {
      for (const client of this.clients) {
        client.terminate();
      }
    }
  }

  /**
   * A default "OK" handler for a command, which simply returns a cmdret message.
   * @param cmdid The command ID to respond to.
   */
  public defaultCmdRetHandler(cmdid: string) {
    this.on(cmdid, (msg, ws) => {
      this.send(ws, { msgid: 'cmdret', cmdid: msg.cmdid, isok: true });
    });
  }
}

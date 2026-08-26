import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState, SlotcraftClient } from '../src';
import { SlotcraftClientLive } from '../src/live-client';
import { MockServer } from './mock-server';

const BINARY_TOKEN = '12345678901234567890123456789012';

describe('SlotcraftClient binary WebSocket transport', () => {
  let server: MockServer;
  let client: SlotcraftClient | null;
  let port: number;

  beforeEach(async () => {
    server = new MockServer();
    port = await server.start(0, BINARY_TOKEN);
    client = null;
  });

  afterEach(() => {
    if (client && client.getState() !== ConnectionState.DISCONNECTED) {
      client.disconnect();
    }
    server.stop();
  });

  const connect = async () => {
    server.on('flblogin', async (message, ws) => {
      await server.send(ws, { msgid: 'cmdret', cmdid: message.cmdid, isok: true });
    });
    client = new SlotcraftClient({
      url: `ws://127.0.0.1:${port}/socket?existing=value`,
      isWsBinary: true,
      requestTimeout: 500,
      logger: null,
    });

    await client.connect(BINARY_TOKEN);
  };

  it('uses the connect() token for the binary URL and encrypted login', async () => {
    await connect();

    expect(client?.getState()).toBe(ConnectionState.LOGGED_IN);
    expect(server.lastRequestUrl).toBe(`/socket?existing=value&token=${BINARY_TOKEN}`);
  });

  it('reserves a cmdid before asynchronous encryption starts', async () => {
    await connect();
    const received = vi.fn();
    server.on('test_cmd', received);

    const first = client!.send('test_cmd', { value: 1 });
    const duplicate = client!.send('test_cmd', { value: 2 });

    await expect(duplicate).rejects.toThrow("A request with cmdid 'test_cmd' is already pending.");
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    await server.broadcast({ msgid: 'cmdret', cmdid: 'test_cmd', isok: true });
    await expect(first).resolves.toMatchObject({ cmdid: 'test_cmd', isok: true });
  });

  it('reports malformed ciphertext and continues processing later messages', async () => {
    await connect();
    const errorReceived = new Promise<Error>((resolve) => client!.once('error', resolve));

    for (const socket of server.clients) {
      socket.send(new Uint8Array([1, 2, 3]));
    }
    await expect(errorReceived).resolves.toBeInstanceOf(Error);

    const messageReceived = new Promise<void>((resolve) =>
      client!.once('message', () => resolve())
    );
    await server.broadcast({ msgid: 'collectinfo', gold: 777 });
    await messageReceived;
    expect(client!.getUserInfo().balance).toBe(777);

    const invalidMessageReceived = new Promise<void>((resolve) =>
      client!.once('message', () => resolve())
    );
    await server.broadcast({ msgid: 'collectinfo', gold: 'invalid' });
    await invalidMessageReceived;
    expect(client!.getUserInfo().balance).toBe(777);
  });
});

describe('SlotcraftClient binary message ordering', () => {
  it('waits for one application handler before starting the next', async () => {
    const liveClient = new SlotcraftClientLive({
      url: 'ws://127.0.0.1:1234',
      logger: null,
    });
    const connection = (liveClient as any).connection;
    const order: string[] = [];
    let releaseFirst!: () => void;
    const handleMessage = vi.fn((event: MessageEvent) => {
      if (event.data === 'first') {
        return new Promise<void>((resolve) => {
          releaseFirst = () => {
            order.push('first');
            resolve();
          };
        });
      }
      order.push('second');
      return Promise.resolve();
    });
    (liveClient as any).handleMessage = handleMessage;

    connection.onMessage({ data: 'first' } as MessageEvent);
    connection.onMessage({ data: 'second' } as MessageEvent);

    await vi.waitFor(() => expect(handleMessage).toHaveBeenCalledTimes(1));
    releaseFirst();
    await vi.waitFor(() => expect(order).toEqual(['first', 'second']));
  });
});

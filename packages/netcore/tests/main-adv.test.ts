import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SlotcraftClient, ConnectionState } from '../src/index';
import { MockServer } from './mock-server';
import { SlotcraftClientOptions } from '../src/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SlotcraftClient Advanced Tests', () => {
  it('should throw an error for an invalid URL protocol', () => {
    const options: SlotcraftClientOptions = {
      url: 'ftp://invalid.protocol',
      logger: null,
    };
    expect(() => new SlotcraftClient(options)).toThrow(
      'Invalid URL protocol. Must be http(s) for replay or ws(s) for live.'
    );
  });

  let server: MockServer;
  let client: SlotcraftClient;
  let port: number;

  beforeEach(async () => {
    vi.useRealTimers();
    server = new MockServer();
    port = await server.start();
    const options: SlotcraftClientOptions = {
      url: `ws://localhost:${port}`,
      reconnectDelay: 10,
      requestTimeout: 100,
      logger: null,
    };
    client = new SlotcraftClient(options);
  });

  afterEach(() => {
    if (client.getState() !== ConnectionState.DISCONNECTED) {
      client.disconnect();
    }
    server.stop();
    vi.clearAllMocks();
  });

  const connectAndLogin = async () => {
    server.on('flblogin', (msg, ws) => {
      server.send(ws, { msgid: 'cmdret', cmdid: 'flblogin', isok: true });
    });
    await client.connect('test-token');
  };

  const connectAndEnterGame = async () => {
    await connectAndLogin();
    server.on('comeingame3', (msg, ws) => {
      server.send(ws, { msgid: 'gamemoduleinfo', gameid: 123 });
      server.send(ws, { msgid: 'gameuserinfo', ctrlid: 456 });
      server.send(ws, { msgid: 'cmdret', cmdid: 'comeingame3', isok: true });
    });
    await client.enterGame('test-game');
  };

  it('should reject a concurrent send() with the same cmdid', async () => {
    await connectAndLogin();

    server.on('test_cmd', () => {
      // Don't respond immediately, to simulate a pending request
    });

    // Ensure we are in a state where send is allowed
    await vi.waitFor(() => expect(client.getState()).toBe(ConnectionState.LOGGED_IN));

    const promise1 = client.send('test_cmd', { val: 1 });
    await sleep(10); // give time for the first message to be sent
    const promise2 = client.send('test_cmd', { val: 2 });

    await expect(promise2).rejects.toThrow("A request with cmdid 'test_cmd' is already pending.");

    // Clean up
    server.broadcast({ msgid: 'cmdret', cmdid: 'test_cmd', isok: true });
    await promise1;
  });

  it('should reject non-login commands during LOGGING_IN state', async () => {
    server.on('flblogin', () => {
      // Don't respond immediately, to keep the client in LOGGING_IN state
    });
    const connectPromise = client.connect('test-token');
    await vi.waitFor(() => expect(client.getState()).toBe(ConnectionState.LOGGING_IN));

    const promise = client.send('any_other_command');

    await expect(promise).rejects.toThrow("Only 'flblogin' is allowed during LOGGING_IN state.");

    // Clean up
    server.broadcast({ msgid: 'cmdret', cmdid: 'flblogin', isok: true });
    connectPromise.catch(() => {}); // Handle the expected rejection
  });

  it('should parse incoming JSON data only once', async () => {
    await connectAndLogin();

    const jsonParseSpy = vi.spyOn(JSON, 'parse');

    const singleMessage = { msgid: 'userbaseinfo', gold: 1000 };
    server.broadcast(singleMessage);

    await vi.waitFor(() => {
      // The client's onMessage is where parsing happens.
      // The mock server also parses to route the message, so we expect 2 calls total
      // for the journey from server.broadcast -> client.onMessage
      // But the client itself should only parse it once. We check the implementation.
      const calls = jsonParseSpy.mock.calls;
      // This is a bit brittle, but confirms the client code doesn't double-parse.
      // The client's call is the one inside the message event handler.
      expect(calls.filter((c) => c[0] === JSON.stringify(singleMessage)).length).toBe(1);
    });

    jsonParseSpy.mockRestore();
  });

  it('should auto-collect intermediate results and allow manual collect for the final one', async () => {
    await connectAndEnterGame();

    const collectHandler = vi.fn((msg, ws) => {
      server.send(ws, { msgid: 'cmdret', cmdid: 'collect', isok: true, req: msg });
    });
    server.on('collect', collectHandler);

    server.on('gamectrl3', (msg, ws) => {
      server.send(ws, {
        msgid: 'gamemoduleinfo',
        // With 3 results, auto-collect should trigger for index 1.
        gmi: { replyPlay: { results: [{}, {}, {}] } },
        totalwin: 10,
      });
      server.send(ws, { msgid: 'cmdret', cmdid: 'gamectrl3', isok: true });
    });

    await client.spin({ bet: 1, lines: 1 });

    // Wait for the auto-collect to be triggered and processed.
    await vi.waitFor(() => {
      expect(collectHandler).toHaveBeenCalledTimes(1);
    });

    // Verify the auto-collect call had the correct index (3 - 2 = 1).
    expect(collectHandler.mock.calls[0][0].playIndex).toBe(1);

    // After auto-collect, the state should return to IN_GAME.
    // The sequence is: SPINNING -> SPINEND -> COLLECTING -> IN_GAME
    await vi.waitFor(() => expect(client.getState()).toBe(ConnectionState.IN_GAME));

    // Now, the user manually collects the final result.
    // Note: The state is IN_GAME, but a manual collect is still allowed.
    // Omitting playIndex defaults to lastResultsCount - 1.
    await client.collect();

    // A second call to the handler should have occurred.
    expect(collectHandler).toHaveBeenCalledTimes(2);

    // Verify the manual collect call had the correct index (3 - 1 = 2).
    expect(collectHandler.mock.calls[1][0].playIndex).toBe(2);
  });

  it('should delegate event emitter methods correctly', () => {
    const implementation = (client as any).implementation;
    const onSpy = vi.spyOn(implementation, 'on');
    const offSpy = vi.spyOn(implementation, 'off');
    const onceSpy = vi.spyOn(implementation, 'once');
    const handler = () => {};

    client.on('testOn', handler);
    expect(onSpy).toHaveBeenCalledWith('testOn', handler);

    client.off('testOff', handler);
    expect(offSpy).toHaveBeenCalledWith('testOff', handler);

    client.once('testOnce', handler);
    expect(onceSpy).toHaveBeenCalledWith('testOnce', handler);
  });
});

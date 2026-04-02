import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SlotcraftClient } from '../src/main';
import { ConnectionState, SlotcraftClientOptions } from '../src/types';
import { SlotcraftClientReplay } from '../src/replay-client';
import fetch from 'node-fetch';

// We don't mock node-fetch globally anymore.
// Instead, we will pass a mocked version of it in the client options.

const mockReplayData = {
  msgid: 'gamemoduleinfo',
  gamemodulename: 'hoodlums',
  gameid: 61146,
  playCtrlParam: {
    balance: 730959,
  },
  gmi: {
    defaultScene: { values: [{ values: [1, 2] }] },
    replyPlay: {
      results: [{}, {}], // two results
      finished: true,
    },
    playIndex: 1,
    bet: 1,
    lines: 450,
    totalwin: 1341,
    playwin: 0,
  },
};

// Create a reusable mock fetch function
const mockFetch = vi.fn();

describe('SlotcraftClient Replay Mode', () => {
  let client: SlotcraftClient;

  const getClient = (options: Partial<SlotcraftClientOptions> = {}) => {
    return new SlotcraftClient({
      url: 'https://example.com/replay.json',
      token: 'test-token',
      fetch: mockFetch as any, // Inject the mock fetch
      ...options,
    });
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockFetch.mockClear();
    // Default happy path mock
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReplayData),
    });
  });

  it('should instantiate SlotcraftClientReplay for an HTTP URL', () => {
    const replayClient = getClient();
    expect((replayClient as any).implementation).toBeInstanceOf(SlotcraftClientReplay);
  });

  it('should throw an error if no fetch implementation is available', async () => {
    // This test simulates a non-browser environment with no fetch provided.
    const clientWithoutFetch = new SlotcraftClient({ url: 'http://a.b/c.json', token: 't' });
    // The check for fetch happens in connect(), not the constructor.
    await expect(clientWithoutFetch.connect()).rejects.toThrow(
      'A fetch implementation must be provided'
    );
  });

  it('should use window.fetch if available and no fetch option is provided', async () => {
    // Mock the browser environment
    const mockWindowFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReplayData),
    });
    (global as any).window = {
      fetch: mockWindowFetch,
    };

    // Create client without providing the fetch option
    const browserClient = new SlotcraftClient({ url: 'http://a.b/c.json', token: 't' });
    await browserClient.connect();

    expect(mockWindowFetch).toHaveBeenCalled();

    // Cleanup
    delete (global as any).window;
  });


  describe('with a valid replay client instance', () => {
    beforeEach(() => {
      client = getClient({ gamecode: 'hoodlums' });
    });

    it('should connect, load data, and transition to LOGGED_IN', async () => {
      expect(client.getState()).toBe(ConnectionState.IDLE);
      const stateChanges: ConnectionState[] = [];
      client.on('state', ({ current }) => stateChanges.push(current as ConnectionState));
      await client.connect();
      expect(client.getState()).toBe(ConnectionState.LOGGED_IN);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/replay.json');
    });

    it('should enter game and transition to IN_GAME', async () => {
      await client.connect();
      await client.enterGame();
      expect(client.getState()).toBe(ConnectionState.IN_GAME);
    });

    it('should transition to SPINEND after a spin with a win', async () => {
      await client.connect();
      await client.enterGame();
      await client.spin({ lines: 1 }); // Perform the spin
      expect(client.getState()).toBe(ConnectionState.SPINEND);
    });

    it('should transition to IN_GAME after collect', async () => {
      await client.connect();
      await client.enterGame();
      await client.spin({ lines: 1 }); // Spin to enter SPINEND state
      await client.collect();
      expect(client.getState()).toBe(ConnectionState.IN_GAME);
    });

    it('should return replay data on spin', async () => {
      await client.connect();
      await client.enterGame();
      const spinResult = await client.spin({ lines: 1 });
      // Now, spin should process the data and return it.
      expect(spinResult.totalwin).toBe(mockReplayData.gmi.totalwin);
      expect(spinResult.results).toBe(mockReplayData.gmi.replyPlay.results.length);
    });

    it('should handle disconnect correctly', async () => {
      await client.connect();
      client.disconnect();
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should fail to connect if fetch is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, statusText: 'Not Found' });
      client = getClient();
      await expect(client.connect()).rejects.toThrow('Not Found');
    });

    it('should fail to connect if response is not valid JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });
      client = getClient();
      await expect(client.connect()).rejects.toThrow('Invalid JSON');
    });

    it('should reject connect() if token is missing', async () => {
      client = getClient({ token: undefined });
      await expect(client.connect()).rejects.toThrow('Token must be provided');
    });

    it('should reject enterGame() before connect', async () => {
      client = getClient();
      await expect(client.enterGame()).rejects.toThrow('Cannot enter game in state: IDLE');
    });

    it('should reject enterGame() if gamecode is missing', async () => {
      client = getClient({ gamecode: undefined });
      await client.connect();
      await expect(client.enterGame()).rejects.toThrow('Game code must be provided');
    });

    it('should reject collect() if not in SPINEND state', async () => {
      client = getClient();
      await client.connect();
      await expect(client.collect()).rejects.toThrow('Cannot collect in state');
    });

    it('should reject selectOptional() if not in WAITTING_PLAYER state', async () => {
      client = getClient();
      await client.connect();
      await expect(client.selectOptional(0)).rejects.toThrow('Cannot selectOptional in state');
    });
  });

  describe('Replay Data Parsing', () => {
    it('should handle replay data with missing optional fields', async () => {
      const data = {
        msgid: 'gamemoduleinfo',
        // Omitting gameid, gmi, etc.
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      });
      client = getClient({ gamecode: 'test' });
      await client.connect();
      await client.enterGame();
      await client.spin({ lines: 1 }); // spin to trigger parsing
      const userInfo = client.getUserInfo();
      // Should not have crashed and fields should be undefined or default
      expect(userInfo.gameid).toBeUndefined();
      expect(userInfo.lastGMI).toEqual({});
      expect(userInfo.lastTotalWin).toBeUndefined();
    });

    it('should handle replay data with gmi but missing nested fields', async () => {
      const data = {
        msgid: 'gamemoduleinfo',
        gmi: {
          // no playIndex, totalwin, etc.
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      });
      client = getClient({ gamecode: 'test' });
      await client.connect();
      await client.enterGame();
      await client.spin({ lines: 1 }); // spin to trigger parsing
      const userInfo = client.getUserInfo();
      expect(userInfo.lastPlayIndex).toBeUndefined();
      expect(userInfo.lastTotalWin).toBeUndefined();
      expect(userInfo.lastResultsCount).toBeUndefined();
      expect(userInfo.defaultScene).toBeUndefined();
    });

    it('should ignore messages with incorrect msgid', async () => {
      const data = { msgid: 'some_other_msg' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      });
      client = getClient({ gamecode: 'test' });
      await client.connect();
      await client.enterGame();
      await client.spin({ lines: 1 }); // spin to trigger parsing
      const userInfo = client.getUserInfo();
      // updateCaches should have returned early, so no properties are set
      expect(userInfo.gameid).toBeUndefined();
      expect(userInfo.lastGMI).toBeUndefined();
    });

    it('should transition to IN_GAME if totalwin is 0 and results are missing', async () => {
      const data = {
        msgid: 'gamemoduleinfo',
        gmi: { totalwin: 0 },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      });
      client = getClient({ gamecode: 'test' });
      await client.connect();
      await client.enterGame();
      await client.spin({ lines: 1 }); // spin to trigger state change
      expect(client.getState()).toBe(ConnectionState.IN_GAME);
    });

    it('should populate linesOptions from playCtrlParam.lines after enterGame', async () => {
      const data = {
        msgid: 'gamemoduleinfo',
        playCtrlParam: {
          lines: 123,
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      });
      client = getClient({ gamecode: 'test' });
      await client.connect();
      await client.enterGame(); // Config data should be parsed here.
      const userInfo = client.getUserInfo();
      expect(userInfo.linesOptions).toEqual([123]);
    });

    it('should pre-cache config data like gameid and defaultScene after enterGame', async () => {
      // Using the default mockReplayData which has these fields
      client = getClient({ gamecode: 'test' });
      await client.connect();
      await client.enterGame();
      const userInfo = client.getUserInfo();
      expect(userInfo.gameid).toBe(mockReplayData.gameid);
      expect(userInfo.defaultScene).toEqual([[1, 2]]);
      // Spin-result data should not be present yet
      expect(userInfo.lastGMI).toBeUndefined();
    });

    it('should initialize clientParameter from replay file and allow updating it', async () => {
      const selectReplayData = {
        msgid: 'gamemoduleinfo',
        playCtrlParam: { clientParameter: '[1,2,3]' },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(selectReplayData),
      });

      client = getClient({ url: 'http://a.b/c-select.json', gamecode: 'test' });
      await client.connect();
      await client.enterGame();

      // Verify it was initialized
      let userInfo = client.getUserInfo();
      expect(userInfo.clientParameter).toBe('[1,2,3]');

      // Verify it can be updated by the method call
      await client.selectSomething('[4,5,6]');
      userInfo = client.getUserInfo();
      expect(userInfo.clientParameter).toBe('[4,5,6]');
    });
  });
});

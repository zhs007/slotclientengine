/**
 * @fileoverview Example 001: Connect to the server using the refactored SlotcraftClient.
 *
 * This script demonstrates the following:
 * 1.  Loading configuration from environment variables (`.env` file).
 * 2.  Using the high-level `SlotcraftClient` to manage connection and state.
 * 3.  Logging all raw WebSocket traffic using the `raw_message` event.
 * 4.  Executing a standard sequence: connect -> enter game -> perform action.
 *
 * To Run:
 * 1.  Create a `.env` file in the root directory with the following content:
 *     WEBSOCKET_URL=ws://your-server-url
 *     TOKEN=your-login-token
 *     GAME_CODE=your-game-code
 * 2.  Execute with ts-node: `npx ts-node examples/example001.ts`
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import WebSocket from 'ws';
import fetch from 'node-fetch';
import { SlotcraftClient } from '../src/main';
import { ConnectionState, RawMessagePayload, SlotcraftClientOptions } from '../src/types';

// Polyfill WebSocket for the Connection class, which expects it to be global.
(global as any).WebSocket = WebSocket;

// --- 1. Configuration and Setup ---

dotenv.config();

const { WEBSOCKET_URL, TOKEN, GAME_CODE, BUSINESSID } = process.env;
const LOG_FILE = 'msg001.txt';

if (!WEBSOCKET_URL || !TOKEN || !GAME_CODE) {
  console.error(
    'Error: Missing required environment variables. Please create a .env file with WEBSOCKET_URL, TOKEN, and GAME_CODE.'
  );
  process.exit(1);
}

const logRawMessage = (payload: RawMessagePayload) => {
  const { direction, message } = payload;
  const timestamp = new Date().toISOString();
  const logEntry = `[${direction}] ${timestamp}: ${message}\n\n`;
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (err) {
    console.error(`Failed to write to log file ${LOG_FILE}:`, err);
  }
};

// --- 2. Main Application Logic ---

const main = async () => {
  console.log(`Connecting to ${WEBSOCKET_URL}...`);
  console.log(`Logging communication to ${LOG_FILE}`);

  // Clear the log file at the start.
  fs.writeFileSync(LOG_FILE, '--- WebSocket Communication Log ---\n\n');

  const options: SlotcraftClientOptions = {
    url: WEBSOCKET_URL,
    token: TOKEN,
    gamecode: GAME_CODE,
    businessid: BUSINESSID || 'default',
  };

  // If the URL is for a replay file, inject the fetch implementation.
  if (WEBSOCKET_URL.startsWith('http')) {
    console.log('--- Replay Mode Detected ---');
    options.fetch = fetch as any;
  }

  const client = new SlotcraftClient(options);

  // Setup logging
  client.on('raw_message', logRawMessage);

  // Listen for other events
  client.on('disconnect', (payload) => {
    console.log(`Client disconnected. Reason: ${payload.reason}`);
    process.exit(0);
  });

  client.on('error', (error) => {
    console.error('An error occurred:', error);
  });

  // Persistently log messages only, and print parsed gamecfg data if available
  client.on('message', (msg) => {
    console.log('Received async message:', msg);
    if (msg?.msgid === 'gamecfg' && typeof msg.data === 'string') {
      try {
        const parsed = JSON.parse(msg.data);
        console.log('Parsed gamecfg.data:', parsed);
        // Also show derived lines options
        const info = client.getUserInfo();
        if (Array.isArray(info.linesOptions)) {
          console.log('Derived lines options:', info.linesOptions);
        }
      } catch {
        console.warn('Failed to parse gamecfg.data');
      }
    }
  });

  // Listen to state changes: log state transitions and append to LOG_FILE with a clear marker
  const onState = ({ current, data }: { current: string; data?: any }) => {
    console.log(`State change: ${current}`);
    const ts = new Date().toISOString();
    const entry = `[STATE] ${ts}: ${current}\n\n`;
    try {
      fs.appendFileSync(LOG_FILE, entry);
    } catch (err) {
      console.error(`Failed to write state to log file ${LOG_FILE}:`, err);
    }
  };
  client.on('state', onState as any);

  /**
   * A simple demonstration function that iterates through available line options
   * and performs a set number of spins for each.
   */
  const spinAcrossLines = async () => {
    const opts = client.getUserInfo().linesOptions || [];
    if (!opts.length) {
      console.warn('No linesOptions available; cannot perform spins.');
      return;
    }
    console.log('Starting sequential spins over lines options:', opts);

    for (const lines of opts) {
      console.log(`--- Lines=${lines} ---`);
      for (let i = 0; i < 100; i++) {
        console.log(`Spin #${i + 1}/100 with lines=${lines}...`);
        await client.spin({ lines });

        // After a spin, the game might require a choice or a collect.
        // This inner loop handles those cases before the next spin.
        while (client.getState() !== ConnectionState.IN_GAME) {
          const state = client.getState();
          if (state === ConnectionState.WAITTING_PLAYER) {
            const userInfo = client.getUserInfo();
            if (userInfo.optionals && userInfo.optionals.length > 0) {
              const randomIndex = Math.floor(Math.random() * userInfo.optionals.length);
              console.log(`Spin resulted in a choice. Randomly selecting: ${randomIndex}`);
              await client.selectOptional(randomIndex);
            } else {
              console.error('In WAITTING_PLAYER state but no optionals found; breaking spin loop.');
              return; // Exit the main spin function
            }
          } else if (state === ConnectionState.SPINEND) {
            const { lastTotalWin, lastResultsCount } = client.getUserInfo();
            console.log(
              `Action resulted in a win. totalwin=${lastTotalWin}, results=${lastResultsCount}. Collecting...`
            );
            await client.collect();
            console.log('Collect finished.');
          } else {
            console.error(`Spin resulted in unhandled state ${state}; breaking spin loop.`);
            return; // Exit the main spin function
          }
        }
      }
    }
    console.log('Finished spinning across all lines.');
  };

  try {
    // 1. Connect and log in
    await client.connect();
    console.log('Client connected and logged in successfully.');

    // 2. Enter the game
    await client.enterGame();
    console.log(`Entered game ${GAME_CODE}. Initial state: ${client.getState()}`);

    // 3. Handle Resume Logic
    // Before starting new spins, we must handle any state the game was left in.
    // This loop ensures we 'collect' any pending wins or make any required 'selections'
    // until the client is in the standard 'IN_GAME' state.
    while (client.getState() !== ConnectionState.IN_GAME) {
      const state = client.getState();
      console.log(`Handling resume state: ${state}`);

      if (state === ConnectionState.SPINEND) {
        await client.collect();
      } else if (state === ConnectionState.WAITTING_PLAYER) {
        const userInfo = client.getUserInfo();
        if (userInfo.optionals && userInfo.optionals.length > 0) {
          const randomIndex = Math.floor(Math.random() * userInfo.optionals.length);
          await client.selectOptional(randomIndex);
        } else {
          throw new Error('In WAITTING_PLAYER state on resume, but no optionals found.');
        }
      } else if (state === ConnectionState.RESUMING) {
        // This is a transient state. We wait for the next state change.
        await new Promise((resolve) => client.once('state', resolve));
      } else {
        // This case should ideally not be reached if the library's state machine is correct.
        throw new Error(`Unhandled resume state: ${state}. Cannot proceed.`);
      }
    }

    // 4. Start Main Spin Logic
    // Now that any resume states have been handled, the client is ready for new actions.
    console.log('Resume states handled. Client is IN_GAME. Starting main spin sequence.');
    await spinAcrossLines();

    console.log('Example script finished. Disconnecting.');
    client.disconnect();
  } catch (error) {
    console.error('An error occurred during the client lifecycle:', error);
    if (client.getState() !== ConnectionState.DISCONNECTED) {
      client.disconnect();
    }
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('An unexpected error occurred in main:', err);
  process.exit(1);
});

# Usage Guide

This is a lightweight and reliable frontend network library for WebSocket communication with a game server. It provides automatic reconnection, request caching, and a simple Promise-based API.

## Features

- **Automatic Reconnection**: Automatically attempts to reconnect if the network connection is lost unexpectedly.
- **Request Caching**: Caches outgoing requests during a reconnection attempt and sends them automatically upon success.
- **Promise API**: All asynchronous operations (like `connect`, `send`) return Promises, making them easy to use with `async/await`.
- **Event-Driven**: Listen to client lifecycle events using `on` and `off` methods.
- **Lightweight**: Zero production dependencies.

## Installation

```bash
npm install <package-name>
```

_(Note: `<package-name>` will be determined when publishing to npm)_

## Quick Start

```typescript
import { SlotcraftClient } from '<package-name>';

const options = {
  url: 'ws://your-server.com/ws',
  token: 'user-auth-token',
  gamecode: 'game-101',
};

const client = new SlotcraftClient(options);

// Listen for events
client.on('connect', () => {
  console.log('WebSocket connection established!');
});

client.on('ready', () => {
  console.log('Client is ready to play!');

  // Send a game command
  client
    .send('spin', { bet: 100 })
    .then((response) => {
      console.log('Spin result:', response);
    })
    .catch((error) => {
      console.error('Spin failed:', error);
    });
});

client.on('disconnect', (payload) => {
  console.log(`Connection closed: ${payload.reason} (Code: ${payload.code})`);
});

client.on('reconnecting', (payload) => {
  console.log(`Attempting to reconnect... (Attempt ${payload.attempt})`);
});

client.on('error', (error) => {
  console.error('An error occurred:', error);
});

// Start the connection
async function main() {
  try {
    await client.connect();
    console.log('Connect, login, and game entry complete!');
  } catch (error) {
    console.error('Failed to connect:', error);
  }
}

main();
```

## API Reference

### `new SlotcraftClient(options)`

Creates a new client instance.

- `options`: `SlotcraftClientOptions` object
  - `url: string`: **Required**. The WebSocket server URL.
  - `token: string`: **Required**. The user's authentication token.
  - `gamecode: string`: **Required**. The game code to enter.
  - `maxReconnectAttempts?: number`: _Optional_. The maximum number of reconnect attempts (default: 10).
  - `reconnectDelay?: number`: _Optional_. The initial reconnection delay in milliseconds (default: 1000). The delay increases exponentially.

### `client.connect(): Promise<void>`

Initiates the full connection, login, and game entry sequence. Returns a Promise that resolves when the client enters the `IN_GAME` state.

### `client.send(cmd: string, data?: object): Promise<any>`

Sends a message to the server when in the `IN_GAME` state. `cmd` is the command name, and `data` is the payload. Returns a Promise that resolves with the corresponding response from the server.

### `client.disconnect(): void`

Actively closes the connection.

### `client.on(event: string, callback: Function)`

Subscribes to an event.

### `client.off(event: string, callback: Function)`

Unsubscribes from an event.

### `client.once(event: string, callback: Function)`

Subscribes to an event for a single emission.

## Events

- `connect`: Fired when the physical WebSocket connection is established.
- `disconnect`: Fired when the connection is closed. `payload: { code, reason, wasClean }`
- `ready`: Fired when the client has successfully entered the game and is ready to send messages.
- `reconnecting`: Fired when an unexpected disconnection occurs and the client is attempting to reconnect. `payload: { attempt }`
- `error`: Fired when an error occurs. `payload: Error | Event`
- `data`: Fired for any server-pushed messages that are not handled internally. `payload: object`

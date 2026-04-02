/**
 * @fileoverview A simple, lightweight event emitter implementation.
 */

import { EventCallback } from './types';

export class EventEmitter {
  private listeners: { [event: string]: EventCallback[] } = {};
  private onceMap = new Map<EventCallback, EventCallback>();

  /**
   * Subscribes to an event.
   * @param event The name of the event.
   * @param callback The function to call when the event is emitted.
   */
  public on(event: string, callback: EventCallback): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Unsubscribes from an event.
   * @param event The name of the event.
   * @param callback The callback function to remove. This can be the original
   * callback passed to `on` or `once`, or the wrapper function for a `once` listener.
   */
  public off(event: string, callback: EventCallback): void {
    if (!this.listeners[event]) {
      return;
    }

    // Determine the actual listener to remove. It could be the callback itself
    // or a wrapper created by `once()`.
    const callbackToRemove = this.onceMap.get(callback) || callback;

    this.listeners[event] = this.listeners[event].filter(
      (listener) => listener !== callbackToRemove
    );

    // --- Memory Leak Fix ---
    // If the original callback was for a `once` listener, clean up the map.
    if (this.onceMap.has(callback)) {
      this.onceMap.delete(callback);
    } else {
      // If the callback passed to `off` was the wrapper itself, we need to
      // find the original key in the map and remove it to prevent leaks.
      for (const [key, value] of this.onceMap.entries()) {
        if (value === callback) {
          this.onceMap.delete(key);
          break; // Found and removed, no need to continue iterating.
        }
      }
    }
  }

  /**
   * Emits an event, calling all subscribed listeners with the provided arguments.
   * @param event The name of the event to emit.
   * @param args The arguments to pass to the listeners.
   */
  public emit(event: string, ...args: any[]): void {
    if (!this.listeners[event]) {
      return;
    }
    // Use a copy of the array to prevent issues if a listener calls `off()`
    // during the emission, which would modify the array while it's being iterated.
    [...this.listeners[event]].forEach((listener) => {
      listener(...args);
    });
  }

  /**
   * Subscribes to an event for a single emission.
   * @param event The name of the event.
   * @param callback The function to call once when the event is emitted.
   */
  public once(event: string, callback: EventCallback): void {
    // This wrapper is what's actually stored in the listeners array.
    const onceCallback: EventCallback = (...args: any[]) => {
      // 1. Remove the wrapper from the listeners array for the event.
      this.off(event, onceCallback);
      // 2. Clean up the mapping to prevent memory leaks.
      this.onceMap.delete(callback);
      // 3. Call the original callback.
      callback(...args);
    };

    // Store the mapping from the original callback to the wrapper.
    // This allows `off(event, callback)` to find and remove the wrapper.
    this.onceMap.set(callback, onceCallback);
    this.on(event, onceCallback);
  }
}

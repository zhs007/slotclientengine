import { toSlotOperationKey } from "@slotclientengine/logiccore";
import type {
  SlotOperationHandlerRegistration,
  SlotOperationHandlerRegistry,
} from "./types.js";

export function createSlotOperationHandlerRegistry(): SlotOperationHandlerRegistry {
  return new DefaultSlotOperationHandlerRegistry();
}

class DefaultSlotOperationHandlerRegistry implements SlotOperationHandlerRegistry {
  readonly #registrations = new Map<string, SlotOperationHandlerRegistration>();

  register(registration: SlotOperationHandlerRegistration): void {
    const key = toSlotOperationKey(registration.kind, registration.version);
    if (this.#registrations.has(key))
      throw new Error(`Duplicate slot operation handler ${key}.`);
    this.#registrations.set(key, registration);
  }

  get(
    kind: string,
    version: number,
  ): SlotOperationHandlerRegistration | undefined {
    return this.#registrations.get(toSlotOperationKey(kind, version));
  }

  has(kind: string, version: number): boolean {
    return this.#registrations.has(toSlotOperationKey(kind, version));
  }

  clear(): void {
    this.#registrations.clear();
  }
}

export class SlotUiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotUiConfigError";
  }
}

export class SlotUiRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotUiRuntimeError";
  }
}

export function toSlotUiError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string" && error.length > 0) {
    return new SlotUiRuntimeError(error);
  }
  return new SlotUiRuntimeError(fallback);
}

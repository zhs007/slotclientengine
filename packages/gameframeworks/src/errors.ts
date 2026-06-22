export class SlotGameConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotGameConfigError";
  }
}

export class SlotGameRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotGameRuntimeError";
  }
}

export function toSlotGameError(error: unknown, fallback: string): Error {
  if (
    error instanceof SlotGameConfigError ||
    error instanceof SlotGameRuntimeError
  ) {
    return error;
  }
  if (error instanceof Error) {
    return error;
  }
  return new SlotGameRuntimeError(`${fallback} ${String(error)}`);
}

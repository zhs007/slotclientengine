export class LogicCoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LogicCoreError';
  }
}

export class LogicParseError extends LogicCoreError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LogicParseError';
  }
}

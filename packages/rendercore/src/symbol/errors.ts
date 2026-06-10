export class RenderCoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderCoreError";
  }
}

export class SymbolStateError extends RenderCoreError {
  constructor(message: string) {
    super(message);
    this.name = "SymbolStateError";
  }
}

export class SymbolAnimationError extends RenderCoreError {
  constructor(message: string) {
    super(message);
    this.name = "SymbolAnimationError";
  }
}

export class SymbolAssetError extends RenderCoreError {
  constructor(message: string) {
    super(message);
    this.name = "SymbolAssetError";
  }
}

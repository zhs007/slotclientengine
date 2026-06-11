export class ReelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReelError";
  }
}

export class ReelAssetError extends ReelError {
  constructor(message: string) {
    super(message);
    this.name = "ReelAssetError";
  }
}

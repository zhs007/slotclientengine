export class BackgroundManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundManifestError";
  }
}

export class SpineBackgroundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpineBackgroundError";
  }
}

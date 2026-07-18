export class ImageStringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageStringError";
  }
}

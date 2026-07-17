export class ObjectUrlRegistry {
  readonly #urls = new Set<string>();
  #destroyed = false;

  create(blob: Blob): string {
    if (this.#destroyed) throw new Error("Object URL registry 已销毁。");
    const url = URL.createObjectURL(blob);
    this.#urls.add(url);
    return url;
  }

  revoke(url: string): void {
    if (!this.#urls.delete(url)) return;
    URL.revokeObjectURL(url);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls.clear();
  }

  get size(): number {
    return this.#urls.size;
  }
}

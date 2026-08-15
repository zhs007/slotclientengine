import { Application, Container, Graphics, Text } from "pixi.js";

export class MegalithOverlayUi {
  readonly #app = new Application();
  readonly #title = new Text({
    text: "MEGALITH WALL",
    style: {
      fill: 0xf0dfbd,
      fontFamily: "Georgia, serif",
      fontSize: 30,
      fontWeight: "700",
      letterSpacing: 5,
    },
  });
  readonly #status = new Text({
    text: "LOADING MEGALITHS",
    style: {
      fill: 0xd5c29d,
      fontFamily: "Arial, sans-serif",
      fontSize: 15,
      letterSpacing: 2,
    },
  });
  readonly #sceneText = new Text({
    text: "",
    style: {
      fill: 0xa89878,
      fontFamily: "monospace",
      fontSize: 14,
      lineHeight: 22,
      align: "right",
    },
  });
  readonly #button = new Container();
  #width = 1;
  #height = 1;
  #enabled = false;
  #onDropAgain: (() => void) | null = null;

  async init(host: HTMLElement, onDropAgain: () => void): Promise<void> {
    this.#onDropAgain = onDropAgain;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    await this.#app.init({
      width,
      height,
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 1.5),
    });
    this.#app.canvas.className = "pixi-canvas";
    host.appendChild(this.#app.canvas);

    const buttonBackground = new Graphics()
      .roundRect(0, 0, 208, 56, 28)
      .fill({ color: 0xcda765, alpha: 0.94 });
    const buttonLabel = new Text({
      text: "DROP AGAIN",
      style: {
        fill: 0x17120b,
        fontFamily: "Arial, sans-serif",
        fontSize: 15,
        fontWeight: "700",
        letterSpacing: 2.5,
      },
    });
    buttonLabel.anchor.set(0.5);
    buttonLabel.position.set(104, 28);
    this.#button.addChild(buttonBackground, buttonLabel);
    this.#button.eventMode = "static";
    this.#button.cursor = "pointer";
    this.#button.on("pointertap", () => {
      if (this.#enabled) this.#onDropAgain?.();
    });
    this.#app.stage.addChild(
      this.#title,
      this.#status,
      this.#sceneText,
      this.#button,
    );
    this.setEnabled(false);
    this.resize(width, height);
  }

  setStatus(value: string): void {
    this.#status.text = value;
  }

  setScene(value: string): void {
    this.#sceneText.text = value;
    this.#layout();
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    this.#button.alpha = enabled ? 1 : 0.42;
    this.#button.eventMode = enabled ? "static" : "none";
  }

  resize(width: number, height: number): void {
    this.#width = Math.max(Math.floor(width), 1);
    this.#height = Math.max(Math.floor(height), 1);
    this.#app.renderer.resolution = Math.min(window.devicePixelRatio || 1, 1.5);
    this.#app.renderer.resize(this.#width, this.#height);
    this.#layout();
  }

  destroy(): void {
    this.#onDropAgain = null;
    this.#app.destroy(true, { children: true, texture: false });
  }

  #layout(): void {
    const edge = Math.max(Math.min(this.#width, this.#height) * 0.035, 18);
    this.#title.position.set(edge, edge);
    this.#status.position.set(edge + 2, edge + 44);
    this.#sceneText.anchor.set(1, 0);
    this.#sceneText.position.set(
      this.#width - edge,
      this.#width < 560 ? edge + 78 : edge + 4,
    );
    this.#button.position.set(
      (this.#width - this.#button.width) / 2,
      this.#height - this.#button.height - edge,
    );
  }
}

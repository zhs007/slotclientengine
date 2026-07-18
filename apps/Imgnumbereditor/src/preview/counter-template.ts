export interface CounterTemplate {
  readonly startText: string;
  readonly endText: string;
  readonly step: number;
  readonly intervalMs: number;
  readonly repeat: boolean;
}

export interface ParsedCounterTemplate extends CounterTemplate {
  readonly start: number;
  readonly end: number;
  readonly digitWidth: number;
}

export function parseCounterTemplate(
  template: CounterTemplate,
): ParsedCounterTemplate {
  const start = parseIntegerText(template.startText, "startText");
  const end = parseIntegerText(template.endText, "endText");
  if (!Number.isSafeInteger(template.step) || template.step === 0)
    throw new Error("step 必须是非零安全整数。");
  if ((end > start && template.step < 0) || (end < start && template.step > 0))
    throw new Error("step 方向无法从 start 走向 end。");
  if ((end - start) % template.step !== 0)
    throw new Error("start/end 差值必须能被 step 整除。");
  if (!Number.isFinite(template.intervalMs) || template.intervalMs <= 0)
    throw new Error("intervalMs 必须是有限正数。");
  const digitWidth = Math.max(
    digitCount(template.startText),
    digitCount(template.endText),
  );
  return Object.freeze({ ...template, start, end, digitWidth });
}

export function formatCounterValue(value: number, digitWidth: number): string {
  return `${value < 0 ? "-" : ""}${Math.abs(value).toString().padStart(digitWidth, "0")}`;
}

export class CounterTemplateDriver {
  readonly #template: ParsedCounterTemplate;
  readonly #onText: (text: string) => void;
  readonly #requestFrame: (callback: FrameRequestCallback) => number;
  readonly #cancelFrame: (id: number) => void;
  #value: number;
  #frame: number | null = null;
  #lastTime: number | null = null;
  #accumulated = 0;

  constructor(
    template: CounterTemplate,
    onText: (text: string) => void,
    timing: {
      readonly requestFrame?: (callback: FrameRequestCallback) => number;
      readonly cancelFrame?: (id: number) => void;
    } = {},
  ) {
    this.#template = parseCounterTemplate(template);
    this.#onText = onText;
    this.#value = this.#template.start;
    this.#requestFrame =
      timing.requestFrame ??
      ((callback) => globalThis.requestAnimationFrame(callback));
    this.#cancelFrame =
      timing.cancelFrame ?? ((id) => globalThis.cancelAnimationFrame(id));
    this.#emit();
  }
  play(): void {
    if (this.#frame !== null) return;
    this.#lastTime = null;
    this.#frame = this.#requestFrame(this.#tick);
  }
  pause(): void {
    if (this.#frame !== null) this.#cancelFrame(this.#frame);
    this.#frame = null;
    this.#lastTime = null;
  }
  reset(): void {
    this.pause();
    this.#value = this.#template.start;
    this.#accumulated = 0;
    this.#emit();
  }
  destroy(): void {
    this.pause();
  }
  get value(): number {
    return this.#value;
  }
  get playing(): boolean {
    return this.#frame !== null;
  }
  readonly #tick = (time: number): void => {
    if (this.#lastTime !== null) this.#accumulated += time - this.#lastTime;
    this.#lastTime = time;
    while (this.#accumulated >= this.#template.intervalMs) {
      this.#accumulated -= this.#template.intervalMs;
      if (!this.#advance()) {
        this.pause();
        return;
      }
    }
    this.#frame = this.#requestFrame(this.#tick);
  };
  #advance(): boolean {
    if (this.#value === this.#template.end) {
      if (!this.#template.repeat) return false;
      this.#value = this.#template.start;
    } else this.#value += this.#template.step;
    this.#emit();
    return true;
  }
  #emit(): void {
    this.#onText(formatCounterValue(this.#value, this.#template.digitWidth));
  }
}

function parseIntegerText(value: string, field: string): number {
  if (!/^[+-]?\d+$/u.test(value))
    throw new Error(`${field} 必须是十进制整数文本。`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`${field} 超出安全整数范围。`);
  return parsed;
}
function digitCount(value: string): number {
  return value.replace(/^[+-]/u, "").length;
}

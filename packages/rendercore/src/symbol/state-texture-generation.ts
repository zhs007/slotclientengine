import rawPreset from "./state-texture-generation-preset.v1.json" with { type: "json" };

export type GeneratedSymbolStateTextureId = "spinBlur" | "disabled";

export interface SymbolStateTextureGenerationPresetV1 {
  readonly version: 1;
  readonly states: {
    readonly spinBlur: {
      readonly kind: "verticalBoxBlur";
      readonly kernelWidth: number;
      readonly kernelHeight: number;
    };
    readonly disabled: {
      readonly kind: "grayscale";
      readonly brightness: number;
    };
  };
}

export interface SymbolStateTexturePixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export const SYMBOL_STATE_TEXTURE_GENERATION_PRESET =
  parseSymbolStateTextureGenerationPreset(rawPreset);

export function generateSymbolStateTextureRgba(options: {
  readonly state: GeneratedSymbolStateTextureId;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}): SymbolStateTexturePixels {
  const { width, height, data } = options;
  assertPixels(width, height, data);
  const output =
    options.state === "spinBlur"
      ? generateVerticalBoxBlur(
          width,
          height,
          data,
          SYMBOL_STATE_TEXTURE_GENERATION_PRESET.states.spinBlur.kernelHeight,
        )
      : options.state === "disabled"
        ? generateDisabled(
            data,
            SYMBOL_STATE_TEXTURE_GENERATION_PRESET.states.disabled.brightness,
          )
        : failUnknownState(options.state);
  return Object.freeze({ width, height, data: output });
}

export function parseSymbolStateTextureGenerationPreset(
  value: unknown,
): SymbolStateTextureGenerationPresetV1 {
  const root = record(value, "symbol state texture generation preset");
  keys(root, ["version", "states"], "symbol state texture generation preset");
  if (root.version !== 1)
    throw new Error(
      "symbol state texture generation preset version 必须是 1。",
    );
  const states = record(root.states, "generation preset states");
  keys(states, ["spinBlur", "disabled"], "generation preset states");
  const spinBlur = record(states.spinBlur, "generation preset spinBlur");
  keys(
    spinBlur,
    ["kind", "kernelWidth", "kernelHeight"],
    "generation preset spinBlur",
  );
  if (spinBlur.kind !== "verticalBoxBlur")
    throw new Error("generation preset spinBlur.kind 必须是 verticalBoxBlur。");
  const kernelWidth = positiveOddInteger(
    spinBlur.kernelWidth,
    "generation preset spinBlur.kernelWidth",
  );
  const kernelHeight = positiveOddInteger(
    spinBlur.kernelHeight,
    "generation preset spinBlur.kernelHeight",
  );
  if (kernelWidth !== 3)
    throw new Error("generation preset spinBlur.kernelWidth 当前必须是 3。");
  const disabled = record(states.disabled, "generation preset disabled");
  keys(disabled, ["kind", "brightness"], "generation preset disabled");
  if (disabled.kind !== "grayscale")
    throw new Error("generation preset disabled.kind 必须是 grayscale。");
  if (
    typeof disabled.brightness !== "number" ||
    !Number.isFinite(disabled.brightness) ||
    disabled.brightness < 0 ||
    disabled.brightness > 1
  ) {
    throw new Error(
      "generation preset disabled.brightness 必须是 0 到 1 的有限数。",
    );
  }
  return Object.freeze({
    version: 1,
    states: Object.freeze({
      spinBlur: Object.freeze({
        kind: "verticalBoxBlur",
        kernelWidth,
        kernelHeight,
      }),
      disabled: Object.freeze({
        kind: "grayscale",
        brightness: disabled.brightness,
      }),
    }),
  });
}

function generateVerticalBoxBlur(
  width: number,
  height: number,
  input: Uint8ClampedArray,
  kernelHeight: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input.length);
  const radius = Math.floor(kernelHeight / 2);
  for (let x = 0; x < width; x += 1) {
    const sums = [0, 0, 0, 0];
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sourceY = clamp(offset, 0, height - 1);
      const source = (sourceY * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1)
        sums[channel]! += input[source + channel]!;
    }
    for (let y = 0; y < height; y += 1) {
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1)
        output[target + channel] = Math.round(sums[channel]! / kernelHeight);
      const outgoingY = clamp(y - radius, 0, height - 1);
      const incomingY = clamp(y + radius + 1, 0, height - 1);
      const outgoing = (outgoingY * width + x) * 4;
      const incoming = (incomingY * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! +=
          input[incoming + channel]! - input[outgoing + channel]!;
      }
    }
  }
  return output;
}

function generateDisabled(
  input: Uint8ClampedArray,
  brightness: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input.length);
  for (let offset = 0; offset < input.length; offset += 4) {
    const grayscale =
      input[offset]! * 0.2126 +
      input[offset + 1]! * 0.7152 +
      input[offset + 2]! * 0.0722;
    const channel = Math.round(grayscale * brightness);
    output[offset] = channel;
    output[offset + 1] = channel;
    output[offset + 2] = channel;
    output[offset + 3] = input[offset + 3]!;
  }
  return output;
}

function assertPixels(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): void {
  if (!Number.isSafeInteger(width) || width <= 0)
    throw new Error("state texture width 必须是正安全整数。");
  if (!Number.isSafeInteger(height) || height <= 0)
    throw new Error("state texture height 必须是正安全整数。");
  if (!(data instanceof Uint8ClampedArray))
    throw new Error("state texture data 必须是 Uint8ClampedArray。");
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels * 4 !== data.length)
    throw new Error("state texture RGBA 长度与 width/height 不一致。");
}

function positiveOddInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value % 2 === 0
  ) {
    throw new Error(`${label} 必须是正奇数。`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 object。`);
  return value as Record<string, unknown>;
}

function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !actual.includes(key));
  if (unknown.length || missing.length)
    throw new Error(
      `${label} fields 无效：unknown=${unknown.join(",") || "-"} missing=${missing.join(",") || "-"}`,
    );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function failUnknownState(value: never): never {
  throw new Error(`不支持生成 symbol state texture：${String(value)}。`);
}

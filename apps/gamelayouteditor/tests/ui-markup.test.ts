import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  numberField,
  runtimeAddressMarkup,
  statusText,
} from "../src/ui/ui-markup.js";

describe("ui markup", () => {
  it("escapes every HTML metacharacter and renders number fields", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    expect(numberField("A&B", "x<y", 2)).toContain(
      'step="1" data-number="x&lt;y"',
    );
    expect(numberField("n", "p", 3, 0.1)).toContain('step="0.1"');
    expect(numberField("center", "p", 0.5, 0.01, 0, 1)).toContain(
      'min="0" max="1"',
    );
  });
  it.each([
    ["ready", "就绪"],
    ["incomplete", "不完整"],
    ["error", "错误"],
  ] as const)("maps %s status", (status, text) => {
    expect(statusText(status)).toBe(text);
  });

  it("renders one copyable canonical runtime address", () => {
    const markup = runtimeAddressMarkup(
      "ImgNumber factory",
      "gamelayout:/resource/image-string/win&amount",
    );
    expect(markup).toContain(
      "gamelayout:/resource/image-string/win&amp;amount",
    );
    expect(markup).toContain(
      'data-copy-runtime-address="gamelayout:/resource/image-string/win&amp;amount"',
    );
  });
});

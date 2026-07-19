import { describe, expect, it } from "vitest";
import { escapeHtml, numberField, statusText } from "../src/ui/ui-markup.js";

describe("ui markup", () => {
  it("escapes every HTML metacharacter and renders number fields", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    expect(numberField("A&B", "x<y", 2)).toContain(
      'step="1" data-number="x&lt;y"',
    );
    expect(numberField("n", "p", 3, 0.1)).toContain('step="0.1"');
  });
  it.each([
    ["ready", "就绪"],
    ["incomplete", "不完整"],
    ["error", "错误"],
  ] as const)("maps %s status", (status, text) => {
    expect(statusText(status)).toBe(text);
  });
});

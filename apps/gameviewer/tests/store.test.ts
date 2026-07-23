import { describe, expect, it } from "vitest";
import { GameViewerStore } from "../src/model/store.js";

const layout = {
  fileName: "layout.zip",
  bytes: new Uint8Array([1, 2, 3]),
  summary: {
    sha256: "a".repeat(64),
    id: "layout",
    entryCount: 2,
    totalBytes: 3,
    modes: [],
    symbolPackages: ["symbols"],
    popups: [],
  },
};

describe("GameViewerStore", () => {
  it("invalidates readiness on every input transition and ignores stale commits", () => {
    const store = new GameViewerStore();
    store.replaceLayout(layout);
    const revision = store.getSnapshot().revision;
    const readiness = {
      kind: "scene-layout-template-readiness",
      version: 1,
      layout: layout.summary,
      compatibility: {
        renderMode: "standard",
        reelKind: "standard",
        cascadeEnabled: false,
        capabilities: {
          spinToScene: true,
          visibleSymbolStates: true,
          removeOccurrences: true,
          dropdownOccurrences: true,
          refillOccurrences: true,
          sequentialCollect: false,
        },
        columns: 3,
        rows: 3,
        initialMode: null,
        popupAvailable: false,
      },
      normalizedConfig: {} as never,
      warnings: [],
    } as const;
    expect(store.commitReadiness(readiness, revision)).toBe(true);
    expect(store.getSnapshot().readiness).toBe(readiness);
    store.markEdited();
    expect(store.getSnapshot().readiness).toBeNull();
    expect(store.commitReadiness(readiness, revision)).toBe(false);
  });

  it("requires suggestion review again after switching bet methods", () => {
    const store = new GameViewerStore();
    store.replaceServer({
      fileName: "server.json",
      sha256: "b".repeat(64),
      summary: {
        gameName: "sample",
        gamecode: "code",
        parameters: [],
        betMethods: [
          {
            id: "first",
            label: "first",
            bet: 1,
            totalBetInWins: 1,
            components: [],
          },
          {
            id: "second",
            label: "second",
            bet: 2,
            totalBetInWins: 2,
            components: [],
          },
        ],
      },
    });
    store.confirmSuggestions();
    expect(store.getSnapshot().suggestionsConfirmed).toBe(true);
    store.selectBetMethod("second");
    expect(store.getSnapshot().suggestionsConfirmed).toBe(false);
    expect(() => store.selectBetMethod("missing")).toThrow(/未知下注方式/);
  });
});

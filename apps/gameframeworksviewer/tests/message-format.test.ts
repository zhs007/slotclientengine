import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import { createViewerMockSpinResult } from "../src/mock-client.js";
import { formatLogicMessage } from "../src/message-format.js";

describe("message formatter", () => {
  it("formats spin summary and component lookups", () => {
    const logic = createSlotGameLogicResult(
      createViewerMockSpinResult({
        totalwin: 15,
        results: 1,
        bet: 2,
        lines: 20,
      }),
      {
        bet: { bet: 2, lines: 20 },
        userInfo: {},
      },
    ).logic;
    const message = formatLogicMessage({
      spinId: 3,
      logic,
      betOption: { bet: 2, lines: 20, times: 2 },
      componentNames: ["lineWin", "bonus"],
    });

    expect(message.join("\n")).toContain("#3 bet=2 lines=20 times=2");
    expect(message.join("\n")).toContain("totalwin=15");
    expect(message.join("\n")).toContain(
      "step[0] cashWin=15 coinWin=15 scenes=1 otherScenes=0 results=1",
    );
    expect(message.join("\n")).toContain(
      "component lineWin: steps=0 scenes=1 otherScenes=0 results=1",
    );
    expect(message.join("\n")).toContain("component bonus: steps=none");
  });
});

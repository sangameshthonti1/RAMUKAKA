import { describe, expect, it } from "vitest";
import type { ConnectorCall } from "../src/types/api";
import { gnaniTranscript } from "../src/utils/gnani";

const call = (parsedResponse: unknown, status = "live_succeeded"): ConnectorCall => ({
  id: "GNANI-1",
  case_id: "RK-2048",
  connector: "Gnani",
  operation: "transcribe_audio",
  request: {},
  response: { parsed_response: parsedResponse },
  truth_label: "LIVE_API",
  status,
  created_at: "2026-10-04T09:44:06Z",
});

describe("Gnani transcript extraction", () => {
  it("finds a transcript without depending on one response nesting shape", () => {
    expect(gnaniTranscript(call({ transcript: " मेरा टीवी खराब है " }))).toBe(
      "मेरा टीवी खराब है",
    );
    expect(
      gnaniTranscript(call({ output: [{ result: { recognized_text: "Help me" } }] })),
    ).toBe("Help me");
  });

  it("does not surface text from a failed or transcript-free response", () => {
    expect(gnaniTranscript(call({ transcript: "Ignore" }, "live_failed"))).toBeNull();
    expect(gnaniTranscript(call({ model: "gnani-prisma-v2.5" }))).toBeNull();
  });
});

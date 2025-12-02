import { describe, expect, it } from "vitest";
import { createHandshakeVerifier } from "../src/handshake/handshake-policy.js";

describe("handshake policy verifier", () => {
  it("rejects non-handshake payloads and bad versions", () => {
    const verify = createHandshakeVerifier({ allowedVersions: ["1.0.0"] });
    expect(verify({ type: "other" })).toBe(false);
    expect(verify({ type: "handshake", version: "0.9.0" })).toBe(false);
    expect(verify({ type: "handshake", version: "1.0.0" })).toBe(true);
  });

  it("validates tags", () => {
    const verify = createHandshakeVerifier({
      validateTags: tags => Boolean(tags && (tags as any).role === "agent"),
    });
    expect(verify({ type: "handshake", tags: { role: "agent" } })).toBe(true);
    expect(verify({ type: "handshake", tags: { role: "other" } })).toBe(false);
  });
});

import { describe, it, expect } from "bun:test";
import { cancelPendingExtraction } from "../hooks/knowledge-extractor";

describe("cancelPendingExtraction", () => {
  it("should return false when no timer exists", () => {
    const result = cancelPendingExtraction("non-existent-session");
    expect(result).toBe(false);
  });

  it("should return false for empty session ID", () => {
    const result = cancelPendingExtraction("");
    expect(result).toBe(false);
  });

  it("should return false for multiple non-existent sessions", () => {
    const result1 = cancelPendingExtraction("session-1");
    const result2 = cancelPendingExtraction("session-2");
    const result3 = cancelPendingExtraction("session-3");
    
    expect(result1).toBe(false);
    expect(result2).toBe(false);
    expect(result3).toBe(false);
  });
});

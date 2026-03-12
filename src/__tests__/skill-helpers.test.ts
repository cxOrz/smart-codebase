import { describe, test, expect } from "bun:test";
import { getProjectSkillName, toSkillName } from "../utils/skill-helpers";

describe("getProjectSkillName", () => {
  test("returns basename of project root", () => {
    expect(getProjectSkillName("/home/user/my-project")).toBe("my-project");
  });

  test("handles trailing slash", () => {
    expect(getProjectSkillName("/home/user/my-project/")).toBe("my-project");
  });
});

describe("toSkillName", () => {
  test("converts path separators to dashes", () => {
    expect(toSkillName("src/auth")).toBe("src-auth");
  });

  test("handles deeper paths", () => {
    expect(toSkillName("src/api/routes")).toBe("src-api-routes");
  });
});

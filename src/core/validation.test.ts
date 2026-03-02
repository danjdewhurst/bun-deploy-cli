/**
 * Tests for validation utilities
 */
import { describe, expect, test } from "bun:test";
import {
  shellEscape,
  validateBranchName,
  validateEnvKey,
  validateGitUrl,
  validateName,
  validatePort,
} from "./validation.js";

describe("validateName", () => {
  test("accepts valid names", () => {
    expect(validateName("myapp", "app").valid).toBe(true);
    expect(validateName("my-app", "app").valid).toBe(true);
    expect(validateName("my_app", "app").valid).toBe(true);
    expect(validateName("myApp123", "app").valid).toBe(true);
  });

  test("rejects empty names", () => {
    const result = validateName("", "app");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("app name is required");
  });

  test("rejects names with spaces", () => {
    const result = validateName("my app", "app");
    expect(result.valid).toBe(false);
  });

  test("rejects names with special characters", () => {
    expect(validateName("myapp;rm -rf /", "app").valid).toBe(false);
    expect(validateName("myapp|cat", "app").valid).toBe(false);
    expect(validateName("myapp&&evil", "app").valid).toBe(false);
    expect(validateName('myapp"quote', "app").valid).toBe(false);
  });

  test("rejects names starting with hyphen", () => {
    const result = validateName("-myapp", "app");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("cannot start with a hyphen");
  });

  test("rejects names that are too long", () => {
    const longName = "a".repeat(65);
    const result = validateName(longName, "app");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("64 characters");
  });
});

describe("validateGitUrl", () => {
  test("accepts valid HTTPS URLs", () => {
    expect(validateGitUrl("https://github.com/user/repo.git").valid).toBe(true);
    expect(validateGitUrl("https://github.com/user/repo").valid).toBe(true);
  });

  test("accepts valid SSH URLs", () => {
    expect(validateGitUrl("git@github.com:user/repo.git").valid).toBe(true);
  });

  test("rejects empty URLs", () => {
    const result = validateGitUrl("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Git repository URL is required");
  });

  test("rejects URLs with whitespace", () => {
    expect(validateGitUrl("https://github.com/user/my repo.git").valid).toBe(false);
    expect(validateGitUrl("https://github.com/user/repo.git ").valid).toBe(false);
  });

  test("rejects URLs with shell injection characters", () => {
    expect(validateGitUrl("https://github.com/user/repo;rm -rf /").valid).toBe(false);
    expect(validateGitUrl("https://github.com/user/repo|cat").valid).toBe(false);
    expect(validateGitUrl("https://github.com/user/repo&&evil").valid).toBe(false);
    expect(validateGitUrl("https://github.com/user/repo`whoami`").valid).toBe(false);
    expect(validateGitUrl("https://github.com/user/repo$(whoami)").valid).toBe(false);
  });
});

describe("validateBranchName", () => {
  test("accepts valid branch names", () => {
    expect(validateBranchName("main").valid).toBe(true);
    expect(validateBranchName("feature/my-feature").valid).toBe(true);
    expect(validateBranchName("bugfix-123").valid).toBe(true);
    expect(validateBranchName("v1.0.0").valid).toBe(true);
  });

  test("rejects empty branch names", () => {
    const result = validateBranchName("");
    expect(result.valid).toBe(false);
  });

  test("rejects branch names starting or ending with slash", () => {
    expect(validateBranchName("/feature").valid).toBe(false);
    expect(validateBranchName("feature/").valid).toBe(false);
  });

  test("rejects branch names with shell injection", () => {
    expect(validateBranchName("main;rm -rf /").valid).toBe(false);
    expect(validateBranchName("main|cat /etc/passwd").valid).toBe(false);
  });
});

describe("validatePort", () => {
  test("accepts valid ports", () => {
    expect(validatePort(3000).valid).toBe(true);
    expect(validatePort(8080).valid).toBe(true);
    expect(validatePort(65535).valid).toBe(true);
    expect(validatePort(1024).valid).toBe(true);
  });

  test("rejects ports below 1024", () => {
    const result = validatePort(80);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("root privileges");
  });

  test("rejects ports above 65535", () => {
    expect(validatePort(65536).valid).toBe(false);
    expect(validatePort(100000).valid).toBe(false);
  });

  test("rejects port 0", () => {
    expect(validatePort(0).valid).toBe(false);
  });

  test("rejects negative ports", () => {
    expect(validatePort(-1).valid).toBe(false);
  });

  test("rejects non-integer ports", () => {
    expect(validatePort(3000.5).valid).toBe(false);
  });
});

describe("validateEnvKey", () => {
  test("accepts valid env keys", () => {
    expect(validateEnvKey("DATABASE_URL").valid).toBe(true);
    expect(validateEnvKey("API_KEY").valid).toBe(true);
    expect(validateEnvKey("_PRIVATE_VAR").valid).toBe(true);
    expect(validateEnvKey("PORT").valid).toBe(true);
  });

  test("rejects empty keys", () => {
    expect(validateEnvKey("").valid).toBe(false);
  });

  test("rejects keys starting with number", () => {
    expect(validateEnvKey("123_VAR").valid).toBe(false);
  });

  test("rejects keys with invalid characters", () => {
    expect(validateEnvKey("MY-VAR").valid).toBe(false);
    expect(validateEnvKey("MY VAR").valid).toBe(false);
    expect(validateEnvKey("MY.VAR").valid).toBe(false);
    expect(validateEnvKey("MY;VAR").valid).toBe(false);
  });
});

describe("shellEscape", () => {
  test("wraps simple strings in single quotes", () => {
    expect(shellEscape("hello")).toBe("'hello'");
  });

  test("escapes single quotes", () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
    expect(shellEscape("'quoted'")).toBe("''\\''quoted'\\'''");
  });

  test("handles strings with semicolons", () => {
    expect(shellEscape("hello;world")).toBe("'hello;world'");
  });

  test("handles strings with shell operators", () => {
    expect(shellEscape("a && b || c")).toBe("'a && b || c'");
  });
});

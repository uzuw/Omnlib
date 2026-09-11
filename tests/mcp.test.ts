// Unit tests for the Omnlib MCP server — argv builder (pure) + CLI launch path.
import { describe, expect, it } from "vitest";
import { buildArgs, runCli } from "../scripts/omnlib-mcp";

describe("buildArgs", () => {
  it("appends --json and skips unset flags", () => {
    expect(buildArgs({ command: "list", flags: { status: "planned", type: undefined } }))
      .toEqual(["list", "--status", "planned", "--json"]);
  });
  it("handles positionals + boolean flags", () => {
    expect(buildArgs({ command: "add", positional: "one piece", flags: { yes: true, index: 2 } }))
      .toEqual(["add", "one piece", "--yes", "--index", "2", "--json"]);
  });
  it("supports the two-positional progress form", () => {
    expect(buildArgs({ command: "progress", positional: 20, extraPositional: "+1" }))
      .toEqual(["progress", "20", "+1", "--json"]);
  });
});

describe("runCli", () => {
  it("launches the CLI (help exits 0)", () => {
    expect(runCli(["--help"])).toContain("omnlib");
  });
  it("throws the CLI error on bad usage", () => {
    expect(() => runCli(["add"])).toThrow(/usage/);
  });
});

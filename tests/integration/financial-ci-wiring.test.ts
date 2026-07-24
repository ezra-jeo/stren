import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_FINANCIAL_SUITES } from "../../scripts/financial-suite-contract.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("financial database CI wiring", () => {
  it("runs the mandatory suite after the clean production-shaped reset", () => {
    const workflow = read(".github/workflows/test-suite.yml");
    expect(workflow.indexOf("npm run db:reset:clean")).toBeGreaterThan(-1);
    expect(workflow.indexOf("npm run db:test:financial")).toBeGreaterThan(
      workflow.indexOf("npm run db:reset:clean"),
    );
  });

  it("keeps every named suite wired into the executable runner", () => {
    const runner = read("scripts/run-financial-closure-tests.mjs");
    for (const suite of REQUIRED_FINANCIAL_SUITES) {
      expect(runner).toContain(`\"${suite}\"`);
    }
  });
});

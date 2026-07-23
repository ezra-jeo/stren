import { describe, expect, it } from "vitest";
import {
  REQUIRED_FINANCIAL_SUITES,
  evaluateFinancialSuiteEvidence,
} from "../../scripts/financial-suite-contract.mjs";

describe("financial database suite omission sentinel", () => {
  it("passes only when every required named suite executed", () => {
    expect(evaluateFinancialSuiteEvidence(REQUIRED_FINANCIAL_SUITES)).toEqual({
      ok: true,
      missing: [],
      unexpected: [],
    });
  });

  it("fails when CI skips even one named suite", () => {
    const withoutReversalConcurrency = REQUIRED_FINANCIAL_SUITES.filter(
      (name) => name !== "parallel-reversal-limit",
    );
    expect(
      evaluateFinancialSuiteEvidence(withoutReversalConcurrency),
    ).toEqual({
      ok: false,
      missing: ["parallel-reversal-limit"],
      unexpected: [],
    });
  });
});

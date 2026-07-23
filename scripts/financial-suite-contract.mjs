export const REQUIRED_FINANCIAL_SUITES = Object.freeze([
  "fixture",
  "invalid-discount-and-tenant-constraints",
  "ledger-integrity-rollback-and-reconciliation",
  "closure-idempotency-grants-and-date-semantics",
  "effective-membership-status",
  "monetary-constraints",
  "date-boundaries",
  "development-seed-guard",
  "parallel-membership-payments",
  "parallel-reversal-limit",
  "parallel-direct-overlap",
]);

export function evaluateFinancialSuiteEvidence(executedSuites) {
  const executed = new Set(executedSuites);
  const missing = REQUIRED_FINANCIAL_SUITES.filter((name) => !executed.has(name));
  const unexpected = [...executed].filter(
    (name) => !REQUIRED_FINANCIAL_SUITES.includes(name),
  );
  return {
    ok: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
  };
}

# Strict TDD Module â€” Verify Phase

> **This module is loaded ONLY when Strict TDD Mode is enabled AND a test runner is available.**
> If you are reading this, the orchestrator already verified both conditions. Follow every instruction.

## TDD Verification Philosophy

When Strict TDD Mode is active, verification goes beyond "does the code work?" to "was the code built correctly?" â€” meaning: was TDD actually followed? The apply phase reports TDD evidence; your job is to validate that evidence against reality.

## Step 5a: TDD Compliance Check (includes Assertion Quality Audit)

Read the `apply-progress` artifact and verify that TDD was actually followed:

```
Read apply-progress artifact:
â”œâ”€â”€ Find the "TDD Cycle Evidence" table
â”œâ”€â”€ FOR EACH task row:
â”‚   â”œâ”€â”€ RED column:
â”‚   â”‚   â”œâ”€â”€ Must say "âœ… Written"
â”‚   â”‚   â”œâ”€â”€ Verify: test file EXISTS in the codebase
â”‚   â”‚   â””â”€â”€ Flag: CRITICAL if test file does not exist
â”‚   â”‚
â”‚   â”œâ”€â”€ GREEN column:
â”‚   â”‚   â”œâ”€â”€ Must say "âœ… Passed"
â”‚   â”‚   â”œâ”€â”€ Cross-reference with Step 5b test execution results:
â”‚   â”‚   â”‚   â””â”€â”€ The test file listed must PASS when you run it
â”‚   â”‚   â””â”€â”€ Flag: CRITICAL if test fails now (was it really green?)
â”‚   â”‚
â”‚   â”œâ”€â”€ TRIANGULATE column:
â”‚   â”‚   â”œâ”€â”€ If "âœ… N cases" â†’ verify N test cases exist in the test file
â”‚   â”‚   â”œâ”€â”€ If "âž– Single" â†’ verify spec truly has only one scenario for this task
â”‚   â”‚   â””â”€â”€ Flag: WARNING if spec has multiple scenarios but only 1 test case
â”‚   â”‚
â”‚   â”œâ”€â”€ SAFETY NET column:
â”‚   â”‚   â”œâ”€â”€ If "âœ… N/N" â†’ existing tests were run before modification (good)
â”‚   â”‚   â”œâ”€â”€ If "N/A (new)" â†’ verify the file was actually NEW (not modified)
â”‚   â”‚   â””â”€â”€ Flag: WARNING if file was modified but safety net shows "N/A"
â”‚   â”‚
â”‚   â””â”€â”€ REFACTOR column:
â”‚       â”œâ”€â”€ Not strictly verifiable (subjective quality)
â”‚       â””â”€â”€ Skip verification, trust the report
â”‚
â”œâ”€â”€ If NO "TDD Cycle Evidence" table found:
â”‚   â””â”€â”€ Flag: CRITICAL â€” apply phase did not report TDD evidence
â”‚       (Strict TDD was enabled but apply did not follow the protocol)
â”‚
â””â”€â”€ Summary: "{N}/{total} tasks have complete TDD evidence"
```

## Step 5 Expanded: Test Layer Validation

Classify ALL test files related to this change by their testing layer:

```
Scan test files created/modified by this change:
â”œâ”€â”€ Classify each test file:
â”‚   â”œâ”€â”€ Unit test: tests a single function/class in isolation
â”‚   â”‚   â””â”€â”€ Indicators: no render(), no page., no HTTP calls, mocked dependencies
â”‚   â”œâ”€â”€ Integration test: tests component interaction or user behavior
â”‚   â”‚   â””â”€â”€ Indicators: render(), screen., userEvent., testing-library imports
â”‚   â”œâ”€â”€ E2E test: tests full system through real browser/HTTP
â”‚   â”‚   â””â”€â”€ Indicators: page.goto(), playwright/cypress imports, browser context
â”‚   â””â”€â”€ Unknown: cannot classify â†’ report as-is
â”‚
â”œâ”€â”€ Report distribution:
â”‚   â”œâ”€â”€ Unit: {N} tests across {N} files
â”‚   â”œâ”€â”€ Integration: {N} tests across {N} files
â”‚   â”œâ”€â”€ E2E: {N} tests across {N} files
â”‚   â””â”€â”€ Total: {N} tests
â”‚
â”œâ”€â”€ Cross-reference with capabilities:
â”‚   â”œâ”€â”€ If integration tests exist but tools not in capabilities â†’ how?
â”‚   â”œâ”€â”€ If E2E tests exist but tools not in capabilities â†’ how?
â”‚   â””â”€â”€ Flag: WARNING if tests use tools not detected in capabilities
â”‚
â””â”€â”€ For each spec scenario: note which layer covers it
    â””â”€â”€ Flag: SUGGESTION if critical business logic only has unit tests
        (only if integration/E2E tools are available)
```

## Step 5d Expanded: Changed File Coverage

When coverage tool is available, report coverage for CHANGED files specifically:

```
IF coverage tool available (from cached capabilities):
â”œâ”€â”€ Run: {test_command} --coverage (or equivalent)
â”œâ”€â”€ Parse the coverage report
â”œâ”€â”€ Filter to ONLY files created or modified in this change
â”‚   (get file list from apply-progress "Files Changed" table)
â”œâ”€â”€ Report per-file:
â”‚   â”œâ”€â”€ File path
â”‚   â”œâ”€â”€ Line coverage %
â”‚   â”œâ”€â”€ Branch coverage % (if available)
â”‚   â”œâ”€â”€ Uncovered line ranges (specific lines, not just %)
â”‚   â””â”€â”€ Flag per file:
â”‚       â”œâ”€â”€ â‰¥ 95% â†’ âœ… Excellent
â”‚       â”œâ”€â”€ â‰¥ 80% â†’ âš ï¸ Acceptable
â”‚       â””â”€â”€ < 80% â†’ âš ï¸ Low (list uncovered lines)
â”œâ”€â”€ Report aggregate:
â”‚   â”œâ”€â”€ Average coverage of changed files
â”‚   â”œâ”€â”€ Total uncovered lines in changed files
â”‚   â””â”€â”€ Compare to threshold if configured
â””â”€â”€ Flag: WARNING if any changed file < 80% coverage

IF coverage tool NOT available:
â””â”€â”€ Report: "Coverage analysis skipped â€” no coverage tool detected"
    (NOT a failure â€” just not available)
```

## Step 5e: Quality Metrics (if tools available)

Run quality checks ONLY on changed files, ONLY if tools are available:

```
Read quality tools from cached capabilities:

IF linter available:
â”œâ”€â”€ Run linter on changed files only
â”œâ”€â”€ Report: errors and warnings
â””â”€â”€ Flag: WARNING for errors, SUGGESTION for warnings

IF type checker available:
â”œâ”€â”€ Run type checker (usually whole-project, not per-file)
â”œâ”€â”€ Filter output to changed files
â”œâ”€â”€ Report: type errors in changed files
â””â”€â”€ Flag: WARNING for type errors

IF neither available:
â””â”€â”€ Report: "Quality metrics skipped â€” no tools detected"
```

## Report Template Extension

When Strict TDD Mode is active, your verification report MUST include these additional sections:

```markdown
### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | âœ… / âŒ | {Found in apply-progress / Missing} |
| All tasks have tests | âœ… / âŒ | {N}/{total} tasks have test files |
| RED confirmed (tests exist) | âœ… / âš ï¸ | {N}/{total} test files verified |
| GREEN confirmed (tests pass) | âœ… / âŒ | {N}/{total} tests pass on execution |
| Triangulation adequate | âœ… / âš ï¸ / âž– | {N} tasks triangulated / {N} single-case |
| Safety Net for modified files | âœ… / âš ï¸ | {N}/{total} modified files had safety net |

**TDD Compliance**: {N}/{total} checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | {N} | {N} | {tool} |
| Integration | {N} | {N} | {tool or "not installed"} |
| E2E | {N} | {N} | {tool or "not installed"} |
| **Total** | **{N}** | **{N}** | |

---

### Changed File Coverage
| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `path/to/file.ext` | 95% | 90% | â€” | âœ… Excellent |
| `path/to/other.ext` | 82% | 75% | L45-48, L62 | âš ï¸ Acceptable |
| `path/to/new.ext` | 100% | 100% | â€” | âœ… Excellent |

**Average changed file coverage**: {N}%
{or "Coverage analysis skipped â€” no coverage tool detected"}

---

### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| ... | ... | ... | ... | ... |

**Assertion quality**: {N} CRITICAL, {N} WARNING
{or "âœ… All assertions verify real behavior"}

---

### Quality Metrics
**Linter**: âœ… No errors / âš ï¸ {N} warnings / âŒ {N} errors / âž– Not available
**Type Checker**: âœ… No errors / âŒ {N} errors / âž– Not available
```

## Step 5f: Assertion Quality Audit (MANDATORY)

Scan ALL test files created or modified by this change and check for trivial/meaningless assertions:

```
FOR EACH test file related to the change:
â”œâ”€â”€ Read the file content
â”œâ”€â”€ Scan for BANNED assertion patterns:
â”‚   â”œâ”€â”€ Tautologies: expect(true).toBe(true), assert True, expect(1).toBe(1)
â”‚   â”œâ”€â”€ Orphan empty checks: expect(result).toEqual([]) or assert len(result) == 0
â”‚   â”‚   â””â”€â”€ UNLESS there is a companion test with same setup that asserts NON-EMPTY
â”‚   â”œâ”€â”€ Type-only assertions used alone: toBeDefined(), not.toBeNull(), typeof checks
â”‚   â”‚   â””â”€â”€ These are OK if COMBINED with value assertions in the same test
â”‚   â”œâ”€â”€ Assertions that never call production code (no function call, no render, no request)
â”‚   â”œâ”€â”€ Ghost loops: assertions inside for/forEach over queryAll/filter results
â”‚   â”‚   â””â”€â”€ Check if the collection could be empty â€” if so, the assertions NEVER RUN
â”‚   â”‚       Flag: CRITICAL â€” a loop over an empty array is a test that ALWAYS passes
â”‚   â”œâ”€â”€ Incomplete TDD cycle: test passes because preconditions prevent code from running
â”‚   â”‚   â””â”€â”€ e.g., testing behavior of a component that is never rendered due to state
â”‚   â”‚       Flag: CRITICAL â€” test must set up conditions where the code path IS exercised
â”‚   â”œâ”€â”€ Smoke-test-only: render() + toBeInTheDocument() without behavioral assertions
â”‚   â”‚   â””â”€â”€ "Renders without crash" is NOT a valid test â€” it must assert WHAT was rendered
â”‚   â”‚       Flag: WARNING â€” smoke tests do not count toward TDD coverage
â”‚   â”œâ”€â”€ Implementation detail coupling: assertions on CSS classes, internal state, mock call counts
â”‚   â”‚   â””â”€â”€ expect(el.className).toContain("text-xs") or expect(mock.calls.length).toBe(3)
â”‚   â”‚       Flag: WARNING â€” tests must assert behavior, not implementation
â”‚   â””â”€â”€ Mock/assertion ratio: count vi.mock() calls vs expect() calls per test file
â”‚       â””â”€â”€ If mocks > 2Ã— assertions â†’ Flag: WARNING â€” "Mock-heavy test ({N} mocks, {N} assertions)"
â”‚           Recommend: extract logic to pure function or move to higher test layer
â”‚
â”œâ”€â”€ For each violation found:
â”‚   â”œâ”€â”€ Record: file, line number, the assertion, why it's trivial
â”‚   â””â”€â”€ Classify:
â”‚       â”œâ”€â”€ CRITICAL: tautology (expect(true).toBe(true)) â€” test proves NOTHING
â”‚       â”œâ”€â”€ CRITICAL: assertion without production code call â€” test exercises nothing
â”‚       â”œâ”€â”€ CRITICAL: ghost loop â€” assertions inside loop over possibly-empty collection
â”‚       â”œâ”€â”€ WARNING: empty collection without companion non-empty test
â”‚       â”œâ”€â”€ WARNING: type-only assertion without value assertion
â”‚       â”œâ”€â”€ WARNING: smoke-test-only â€” render + toBeInTheDocument without behavioral check
â”‚       â”œâ”€â”€ WARNING: CSS class / implementation detail assertion
â”‚       â””â”€â”€ WARNING: mock-heavy test (mocks > 2Ã— assertions) â€” wrong test layer
â”‚
â”œâ”€â”€ Check triangulation quality:
â”‚   â”œâ”€â”€ Count distinct test cases per behavior
â”‚   â”œâ”€â”€ If only 1 test case exists for a behavior with multiple spec scenarios:
â”‚   â”‚   â””â”€â”€ Flag: WARNING â€” "Insufficient triangulation for {behavior}"
â”‚   â”œâ”€â”€ If all test cases assert the SAME type of value (e.g., all check empty arrays):
â”‚   â”‚   â””â”€â”€ Flag: WARNING â€” "No variance in test expectations â€” all assert empty/trivial"
â”‚   â””â”€â”€ A well-triangulated behavior has tests asserting DIFFERENT expected values
â”‚
â””â”€â”€ Summary: "{N} trivial assertions found across {N} files"
```

### Assertion Quality Report Table

Include this table in the verification report when any issues are found:

```markdown
### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `path/test.ts` | 15 | `expect(true).toBe(true)` | Tautology â€” proves nothing | CRITICAL |
| `path/test.ts` | 23 | `expect(result).toEqual([])` | Empty without companion non-empty test | WARNING |
| `path/test.ts` | 31 | `expect(result).toBeDefined()` | Type-only â€” no value asserted | WARNING |

**Assertion quality**: {N} CRITICAL, {N} WARNING
```

If zero issues found, report: "**Assertion quality**: âœ… All assertions verify real behavior"

## Rules (Strict TDD Verify specific)

- ALWAYS check the TDD Cycle Evidence table from apply-progress â€” it's the primary artifact
- ALWAYS cross-reference reported test files against actual execution â€” don't trust the report blindly
- ALWAYS run the Assertion Quality Audit (Step 5f) â€” trivial tests are WORSE than missing tests
- If apply-progress has no TDD evidence table, flag as CRITICAL â€” the protocol was not followed
- If tautology assertions are found (expect(true).toBe(true)), flag as CRITICAL â€” these MUST be rewritten
- Coverage and quality metrics are informational, NOT blocking â€” only flag as WARNING, never CRITICAL
- Test layer distribution is informational â€” SUGGESTION level only
- DO NOT fix issues â€” only report. The orchestrator decides.
- If coverage/quality tools are not available, say so cleanly and move on â€” never flag missing tools as failures

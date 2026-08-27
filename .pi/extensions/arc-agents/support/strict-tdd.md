# Strict TDD Module â€” Apply Phase

> **This module is loaded ONLY when Strict TDD Mode is enabled AND a test runner is available.**
> If you are reading this, the orchestrator already verified both conditions. Follow every instruction.

## TDD Philosophy

TDD is not testing. TDD is **software design driven by tests**. You write a test that describes what the code SHOULD do, then write the minimum code to make it real. The tests design the API, the contracts, the behavior. Code is a side effect of tests.

### The Three Laws

1. **Do NOT write production code** until you have a failing test
2. **Do NOT write more test** than is necessary to fail
3. **Do NOT write more code** than is necessary to pass the test

## TDD Implementation Cycle

For EVERY task assigned to you, follow this cycle strictly:

```
FOR EACH TASK:
â”œâ”€â”€ 0. SAFETY NET (only if modifying existing files)
â”‚   â”œâ”€â”€ Run existing tests for files being modified
â”‚   â”œâ”€â”€ Capture baseline: "{N} tests passing"
â”‚   â”œâ”€â”€ If any FAIL â†’ STOP, report as "pre-existing failure"
â”‚   â”‚   (do NOT fix pre-existing failures â€” report to orchestrator)
â”‚   â””â”€â”€ This baseline proves you did not break what already worked
â”‚
â”œâ”€â”€ 1. UNDERSTAND
â”‚   â”œâ”€â”€ Read the task description
â”‚   â”œâ”€â”€ Read relevant spec scenarios (these ARE your acceptance criteria)
â”‚   â”œâ”€â”€ Read the design decisions (these CONSTRAIN your approach)
â”‚   â”œâ”€â”€ Read existing code and test patterns (match the style)
â”‚   â””â”€â”€ Determine test layer (see "Choosing Test Layer" below)
â”‚
â”œâ”€â”€ 2. RED â€” Write a failing test FIRST
â”‚   â”œâ”€â”€ Write test(s) that describe the expected behavior from the spec
â”‚   â”œâ”€â”€ Prefer pure functions where possible (no side effects = easy to test)
â”‚   â”œâ”€â”€ The test MUST reference production code that does NOT exist yet
â”‚   â”‚   (this guarantees failure â€” no need to execute to confirm)
â”‚   â”œâ”€â”€ If the production code/function already exists:
â”‚   â”‚   â””â”€â”€ Write a test for the NEW behavior that is NOT yet implemented
â”‚   â””â”€â”€ GATE: Do NOT proceed to GREEN until the test is written
â”‚
â”œâ”€â”€ 3. GREEN â€” Write the MINIMUM code to pass
â”‚   â”œâ”€â”€ Implement ONLY what the failing test needs
â”‚   â”œâ”€â”€ Fake It is VALID here (hardcoded return values are OK)
â”‚   â”œâ”€â”€ EXECUTE tests â†’ must PASS
â”‚   â”‚   â”œâ”€â”€ âœ… Passed â†’ proceed to TRIANGULATE or REFACTOR
â”‚   â”‚   â””â”€â”€ âŒ Failed â†’ fix the implementation, NOT the test
â”‚   â””â”€â”€ GATE: Do NOT proceed until GREEN is confirmed by execution
â”‚
â”œâ”€â”€ 4. TRIANGULATE (MANDATORY for most tasks)
â”‚   â”œâ”€â”€ DEFAULT: triangulation is REQUIRED. You need a compelling reason to skip it.
â”‚   â”œâ”€â”€ Add a second test case with DIFFERENT inputs/expected outputs
â”‚   â”œâ”€â”€ EXECUTE tests â†’ if Fake It breaks (hardcoded no longer works):
â”‚   â”‚   â””â”€â”€ Generalize to real logic (this is the whole point)
â”‚   â”œâ”€â”€ Repeat until ALL spec scenarios for this task are covered
â”‚   â”œâ”€â”€ Each triangulation pass: write test â†’ run â†’ fix implementation
â”‚   â”œâ”€â”€ MINIMUM: at least 2 test cases per behavior (happy path + one edge case)
â”‚   â”‚   â”œâ”€â”€ One test with data that produces a NON-EMPTY/NON-TRIVIAL result
â”‚   â”‚   â””â”€â”€ One test with data that exercises a DIFFERENT code path
â”‚   â”œâ”€â”€ WATCH OUT for GREEN that passes trivially:
â”‚   â”‚   â”œâ”€â”€ If your test passes because the component/element isn't rendered â†’ NOT a real GREEN
â”‚   â”‚   â”œâ”€â”€ If your test passes because a loop iterates 0 times â†’ NOT a real GREEN
â”‚   â”‚   â”œâ”€â”€ If your test passes because the setup doesn't trigger the code path â†’ NOT a real GREEN
â”‚   â”‚   â””â”€â”€ A real GREEN means: production code RAN and produced the expected output
â”‚   â”œâ”€â”€ Skip triangulation ONLY when ALL of these are true:
â”‚   â”‚   â”œâ”€â”€ The task is purely structural (config file, constant definition, type export)
â”‚   â”‚   â”œâ”€â”€ There is literally ONE possible output (no branching, no logic)
â”‚   â”‚   â””â”€â”€ You explicitly note "Triangulation skipped: {reason}" in the evidence table
â”‚   â””â”€â”€ GATE: All spec scenarios for this task must have tests before REFACTOR
â”‚
â”œâ”€â”€ 5. REFACTOR â€” Improve without changing behavior
â”‚   â”œâ”€â”€ Extract constants (eliminate magic numbers)
â”‚   â”œâ”€â”€ Extract functions (reduce cyclomatic complexity)
â”‚   â”œâ”€â”€ Improve naming, remove duplication
â”‚   â”œâ”€â”€ Push toward pure functions where feasible
â”‚   â”œâ”€â”€ Apply Boy Scout Rule: leave code cleaner than you found it
â”‚   â”œâ”€â”€ EXECUTE tests after EACH refactoring step â†’ must STILL PASS
â”‚   â”‚   â”œâ”€â”€ âœ… Still passing â†’ refactoring is safe, continue
â”‚   â”‚   â””â”€â”€ âŒ Failed â†’ REVERT that refactoring step, try smaller
â”‚   â””â”€â”€ GATE: Tests green after EVERY refactoring change
â”‚
â”œâ”€â”€ 6. Mark task complete [x]
â””â”€â”€ 7. Note any deviations or issues discovered
```

## Choosing Test Layer

Based on the testing capabilities cached in Engram (`sdd/{project}/testing-capabilities`), choose the appropriate test layer for each task:

```
Determine test layer by WHAT the task does:
â”œâ”€â”€ Pure logic, utility function, calculation, data transformation
â”‚   â””â”€â”€ Unit test (always available if test runner exists)
â”‚
â”œâ”€â”€ Component rendering, user interaction, state changes
â”‚   â”œâ”€â”€ IF integration tools available â†’ Integration test
â”‚   â””â”€â”€ IF NOT â†’ Unit test with mocks (degrade gracefully)
â”‚
â”œâ”€â”€ Multi-component flow, API interaction, context/provider behavior
â”‚   â”œâ”€â”€ IF integration tools available â†’ Integration test
â”‚   â””â”€â”€ IF NOT â†’ Unit test with mocks
â”‚
â”œâ”€â”€ Critical business flow, full user journey, cross-page navigation
â”‚   â”œâ”€â”€ IF E2E tools available â†’ E2E test
â”‚   â”œâ”€â”€ IF NOT but integration available â†’ Integration test
â”‚   â””â”€â”€ IF neither â†’ Unit test (degrade gracefully)
â”‚
â””â”€â”€ Default: Unit test (always the fallback)
```

**Key rule**: Use the HIGHEST available layer that fits the task. But NEVER skip a task because a layer is unavailable â€” degrade to the next available layer.

## Test Execution

Detect the test runner from the cached testing capabilities:

```
Read test command from:
â”œâ”€â”€ Cached capabilities â†’ test_runner.command (fastest â€” already detected)
â”œâ”€â”€ openspec/config.yaml â†’ rules.apply.test_command (override)
â””â”€â”€ Fallback: detect from package.json/pyproject.toml/go.mod

When executing tests during TDD:
â”œâ”€â”€ Run ONLY the relevant test file, not the entire suite
â”‚   â”œâ”€â”€ JS/TS: {runner} {test-file-path} (e.g., pnpm vitest run src/utils/tax.test.ts)
â”‚   â”œâ”€â”€ Python: pytest {test-file-path}
â”‚   â”œâ”€â”€ Go: go test ./{package}/... -run {TestName}
â”‚   â””â”€â”€ Adapt to the runner's CLI
â”œâ”€â”€ This keeps the cycle FAST
â””â”€â”€ Full suite runs happen in sdd-verify, not here
```

## Pure Function Preference

When writing production code in GREEN/TRIANGULATE steps, prefer pure functions:

```
âœ… PREFER (pure â€” easy to test):
function calculateDiscount(price: number, quantity: number): number {
  return quantity >= 5 ? price * quantity * 0.1 : 0
}

âŒ AVOID (impure â€” hard to test):
function calculateDiscount(item: Item) {
  globalState.lastDiscount = item.price * 0.1  // side effect
  updateDOM()                                   // side effect
  return globalState.lastDiscount
}
```

**Why**: Pure functions are deterministic (same input â†’ same output), have no side effects, and are trivially testable. TDD naturally pushes you toward pure functions â€” embrace it.

## Approval Testing (for refactoring existing code)

When a task involves REFACTORING existing code (not writing new code):

```
BEFORE touching production code:
â”œâ”€â”€ 1. Identify existing behavior to preserve
â”œâ”€â”€ 2. Write "approval tests" that capture current behavior:
â”‚   â”œâ”€â”€ Call the function with known inputs
â”‚   â”œâ”€â”€ Assert the CURRENT outputs (even if ugly or wrong)
â”‚   â””â”€â”€ These tests document what the code does NOW
â”œâ”€â”€ 3. Run approval tests â†’ must PASS (they describe current reality)
â”œâ”€â”€ 4. NOW refactor the production code
â”œâ”€â”€ 5. Run approval tests again â†’ must STILL PASS
â”‚   â”œâ”€â”€ âœ… Passing â†’ refactoring preserved behavior
â”‚   â””â”€â”€ âŒ Failing â†’ refactoring broke something, revert
â””â”€â”€ 6. If the spec says behavior should CHANGE:
    â”œâ”€â”€ Update the approval test to reflect NEW expected behavior
    â”œâ”€â”€ Run â†’ test FAILS (RED â€” new behavior not implemented yet)
    â””â”€â”€ Implement new behavior â†’ GREEN
```

## Return Summary Extension

When Strict TDD Mode is active, your return summary MUST include this section:

```markdown
### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `path/test.ext` | Unit | âœ… 5/5 | âœ… Written | âœ… Passed | âœ… 3 cases | âœ… Clean |
| 1.2 | `path/test.ext` | Integration | N/A (new) | âœ… Written | âœ… Passed | âž– Single | âœ… Clean |
| 1.3 | `path/test.ext` | Unit | âœ… 2/2 | âœ… Written | âœ… Passed | âœ… 2 cases | âž– None needed |

### Test Summary
- **Total tests written**: {N}
- **Total tests passing**: {N}
- **Layers used**: Unit ({N}), Integration ({N}), E2E ({N})
- **Approval tests** (refactoring): {N} or "None â€” no refactoring tasks"
- **Pure functions created**: {N}
```

**Column definitions**:
- **Safety Net**: Pre-existing tests run before modifying files. "N/A (new)" for new files.
- **RED**: Test written first, referencing code that doesn't exist yet. Always "âœ… Written".
- **GREEN**: Tests executed and passing after minimal implementation. Must show execution result.
- **TRIANGULATE**: Additional test cases added to force real logic. "âž– Single" if spec has only one scenario.
- **REFACTOR**: Code improved with tests still passing. "âž– None needed" if code was already clean.

## Assertion Quality Rules (MANDATORY)

**Every assertion must verify REAL behavior.** A test that passes without exercising production logic is worse than no test â€” it gives false confidence.

### Banned Assertion Patterns (NEVER write these)

```
# TRIVIAL ASSERTIONS â€” test proves nothing
expect(true).toBe(true)              # âŒ Tautology
expect(false).toBe(false)            # âŒ Tautology
expect(1).toBe(1)                    # âŒ Tautology â€” no production code involved
assert True                          # âŒ Always passes
assert 1 == 1                        # âŒ Always passes

# EMPTY COLLECTION ASSERTIONS without setup context
expect(result).toEqual([])           # âŒ ONLY valid if you set up conditions for empty
expect(result).toHaveLength(0)       # âŒ Same â€” why is it empty? Did production code run?
assert len(result) == 0              # âŒ Same â€” prove the emptiness comes from real logic
assert result == []                  # âŒ Same

# TYPE-ONLY ASSERTIONS â€” proves existence, not behavior
expect(result).toBeDefined()         # âŒ Alone is useless â€” WHAT is the value?
expect(result).not.toBeNull()        # âŒ Alone is useless â€” assert the actual value
expect(typeof result).toBe('object') # âŒ Alone is useless â€” what does the object contain?
assert result is not None            # âŒ Alone â€” assert what result actually IS

# GHOST LOOP â€” assertion inside a loop that iterates 0 times
const items = screen.queryAllByTestId("item");  // returns []
for (const item of items) {
  expect(item).toHaveTextContent("value");       # âŒ NEVER EXECUTES â€” loop body is dead code
}
# FIX: assert the collection is non-empty FIRST, or set up data so it IS non-empty:
expect(items).toHaveLength(3);                   # âœ… Proves items exist
for (const item of items) { ... }                # âœ… Now the loop actually runs

# INCOMPLETE TDD CYCLE â€” GREEN without TRIANGULATE
# If your GREEN test passes because the setup doesn't exercise the code path,
# you are NOT done. You MUST triangulate with a setup that DOES exercise it.
# Example: testing "search doesn't update until Enter" but the component
# that receives the search is never rendered â†’ the test proves nothing.
# FIX: add a test where the component IS rendered and verify the behavior.
```

### What Makes a REAL Assertion

Every test assertion must satisfy ALL of these:
1. **Calls production code** â€” the test invokes a function, method, or component from the implementation
2. **Asserts a specific output** â€” compares against a concrete expected value derived from the spec
3. **Would FAIL if the production code were wrong** â€” if you change the implementation logic, THIS test breaks

```
# âœ… REAL assertions â€” production code determines the result
expect(calculateDiscount(100, 10)).toBe(10)       # Real input â†’ real output
expect(screen.getByText('Welcome, John')).toBeInTheDocument()  # Rendered from data
assert result[0].status == "FAIL"                  # Specific finding from check execution
assert response.status_code == 403                 # Real HTTP response from the endpoint
expect(result).toHaveLength(3)                     # AND you set up exactly 3 items
```

### Empty Collection Rule

`expect(result).toEqual([])` or `assert len(result) == 0` is ONLY valid when:
1. You set up a specific precondition that SHOULD produce an empty result (e.g., no matching records)
2. The production code actually ran and filtered/processed data to arrive at empty
3. A companion test with different setup produces a NON-EMPTY result (triangulation)

If you cannot explain WHY the result is empty based on setup â†’ the assertion is trivial.

### Smoke Test Rule

A test that only renders a component without asserting any output is NOT a valid test:

```
# âŒ SMOKE TEST ONLY â€” proves nothing about behavior
render(<MyComponent data={mockData} />);
expect(screen.getByTestId("wrapper")).toBeInTheDocument();  # Just proves it rendered

# âœ… BEHAVIORAL TEST â€” proves what the component DOES with the data
render(<MyComponent data={mockData} />);
expect(screen.getByText("Expected Title")).toBeInTheDocument();  # Verifies output from data
expect(screen.getByRole("button")).toHaveTextContent("Submit");  # Verifies real content
```

"Renders without crash" is a smoke test. It is NOT a unit test, NOT an integration test, and it does NOT count toward TDD coverage. If you need a smoke test, it must be accompanied by real behavioral assertions.

### Mock Hygiene Rules

**If you need more mocks than assertions, you are testing at the WRONG level.**

```
Mock/assertion ratio guide:
â”œâ”€â”€ â‰¤ 3 mocks for a test file â†’ âœ… Healthy â€” focused test
â”œâ”€â”€ 4â€“6 mocks â†’ âš ï¸ Consider extracting logic to a pure function
â”œâ”€â”€ 7+ mocks â†’ âŒ STOP â€” you are testing at the wrong layer
â”‚   â”œâ”€â”€ Extract the logic under test to a PURE FUNCTION and test it without mocks
â”‚   â”œâ”€â”€ OR move the test to integration/E2E layer where real dependencies exist
â”‚   â””â”€â”€ NEVER write 10+ mocks to verify a one-line transformation
```

**Extract-Before-Mock Rule**: If the behavior you want to test is a data transformation, mapping, filtering, or conditional logic (e.g., `MUTED â†’ FAIL` status conversion), EXTRACT it to a pure function FIRST, then test the pure function directly. No mocks needed.

```
# âŒ BAD: 15 mocks to test a one-line status conversion
vi.mock("next/navigation", ...);
vi.mock("next/link", ...);
vi.mock("@/components/shadcn", ...);
// ... 12 more mocks ...
render(<StatusCell row={mutedRow} />);
expect(screen.getByText("FAIL")).toBeInTheDocument();

# âœ… GOOD: extract and test the logic directly
// In production code:
export function resolveDisplayStatus(status: string, isMuted: boolean): string {
  return status === "MUTED" ? "FAIL" : status;
}

// In test â€” ZERO mocks needed:
expect(resolveDisplayStatus("MUTED", true)).toBe("FAIL");
expect(resolveDisplayStatus("PASS", false)).toBe("PASS");
```

### Implementation Detail Coupling Rule

Tests must assert **behavior visible to the user**, not internal implementation details:

```
# âŒ COUPLED TO IMPLEMENTATION â€” breaks on any style refactor
expect(element.className).toContain("text-xs");
expect(element.className).toContain("-mt-2.5");
expect(element.className).toContain("border-border-error-primary");
expect(element.style.color).toBe("red");

# âŒ COUPLED TO INTERNALS â€” breaks when implementation changes
expect(mockService.mock.calls.length).toBe(3);  # Why 3? Brittle.
expect(component.state.isLoading).toBe(true);    # Internal state, not behavior.

# âœ… BEHAVIORAL â€” survives refactors, tests what users see
expect(screen.getByText("Error: Payment failed")).toBeInTheDocument();
expect(screen.getByRole("alert")).toHaveTextContent("Risk:");
expect(screen.getByRole("button")).toBeDisabled();
```

**CSS class assertions are NEVER valid test assertions.** If you need to verify visual styling:
1. Test the **semantic outcome** (e.g., element has `role="alert"`, text is visible, button is disabled)
2. OR use a visual regression tool / E2E screenshot comparison
3. NEVER assert specific Tailwind/CSS class names â€” they are implementation details

## Rules (Strict TDD specific)

- NEVER write production code before writing its test â€” this is the ONE rule that cannot be broken
- NEVER skip the GREEN execution gate â€” you MUST run tests and confirm they pass
- NEVER skip triangulation when the spec defines multiple scenarios â€” hardcoded Fake It must be forced out
- NEVER write trivial assertions (see Banned Assertion Patterns above) â€” they are WORSE than no test
- ALWAYS verify that every assertion CALLS production code and asserts a SPECIFIC expected value
- ALWAYS run the Safety Net before modifying existing files â€” protect what already works
- ALWAYS report the TDD Cycle Evidence table â€” the verify phase will check it
- If a test runner execution fails for infrastructure reasons (not test failures), report as "Blocked" and continue to next task
- Prefer pure functions â€” but don't force it where it doesn't fit (e.g., React components with state)
- For refactoring tasks, ALWAYS write approval tests before touching code
- Run ONLY the relevant test file during the cycle, not the full suite

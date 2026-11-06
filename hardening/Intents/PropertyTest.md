# PropertyTest

Property-based tests in fast-check for functions in the user's codebase whose shape supports a universal claim, landed as property rows in the project's spec or test plan (when it keeps one) or as shrunk counterexamples that become new example-based regression tests.

## Ideal State

- Every function given a property test matches at least one candidate shape under Inputs (pure function, parser/serializer pair, data transform, math or accumulator, collection operation, two implementations of the same thing, state machine with legal-sequence invariants); when none applies, no property test is written and the criterion keeps its example test.
- Each property is written down in prose as a universal claim ("for all X, P(X) holds") and is the strongest of the ten property categories that apply to the function, since often two or three apply.
- Each generator's constraints reflect the function's actual valid input domain, no wider and no narrower, and `numRuns` follows the budget: 1000 by default, 10000 for invariant-critical properties, 100 for slow generators.
- A landed property lives in one new test file beside the project's existing tests, following its layout (for example `test/<surface>/<name>.property.test.ts`), runs under the project's test runner (with `bun test`, use the `./` path prefix), and has one new property row in the project's spec or test plan pointing at that file when the project keeps one.
- A failing property ends with its shrunk counterexample and seed captured and with either the code fixed (the counterexample revealed a bug) or the property fixed (the counterexample revealed the property was wrong).
- A counterexample found and fixed has one new learning note (format under Output format) in the project's spec, changelog or the final report; a counterexample kept as a regression example is an example test with the seed pinned in a `// fc seed: 0x...` comment, paired with the property row.

## Anti-criteria

- Never property-tests a function that is not pure: properties require determinism, so a function that touches disk, network or clock is unfit unless its side effects are mocked or its pure core is extracted.
- Never leaves the empty case unchecked: when shrinking returns `""`, `0` or `[]`, that is the classic "empty case missed" finding, not a cherry-picked fluke.
- Never replaces the existing example tests: properties express the universal claim, and examples are sampled instances of it.
- Never adds `fast-check` (or any dependency) to the project without asking the user first.

## Output format

The learning note uses a four-field format: `conjectured` = property as written, `refuted by` = shrunk counterexample, `learned` = missing case, `criterion now` = the tightened property.

### Spec or test-plan row shape

When the project's spec or acceptance-criteria document has a verification table, add one row per property in this shape (adapt the column names to the table the project already uses):

```
| criterion | anchors_to | type          | property                                    | generator                              | runs  | command |
| AC-N      | literal    | property      | parse(serialize(x)) ≡ x                     | fc.constantFrom(field) × fc.stringMatching(value) | 1000  | bun test ./test/lib/frontmatter.property.test.ts -t "returns the value written" |
```

## Inputs

### Candidate shapes and the ten property categories

A pure function (no side effects, deterministic output given input) is a candidate on its own. The other shapes name the categories they usually support; a dash means no shape points there by default.

| # | Category | Form | Candidate shape | Example |
|---|----------|------|-----------------|--------------------|
| 1 | **Round-trip** | `decode(encode(x)) === x` | parser ↔ serializer pair | `parseFrontmatter(serializeFrontmatter(x)) ≡ x` |
| 2 | **Idempotency** | `f(f(x)) === f(x)` | data transform (sort, dedup, normalize) | `removeTrailingNewline(removeTrailingNewline(s)) ≡ removeTrailingNewline(s)` |
| 3 | **Commutativity** | `f(a, b) === f(b, a)` | math or accumulator | `mergeTaskLists(a, b) ≡ mergeTaskLists(b, a)` |
| 4 | **Associativity** | `f(f(a, b), c) === f(a, f(b, c))` | math or accumulator | config merge across three layers |
| 5 | **Identity** | `f(x, identity) === x` | — | `renderTemplate(t, {}) ≡ t` |
| 6 | **Conservation** | invariants preserved | collection operation (count, sum, set-membership preserved) | `idsAfter(reconcile(master, patch)) ⊇ idsBefore(master)` |
| 7 | **Model-based** | code matches trivial reference impl | two implementations of the same thing | `parseFrontmatter ≡ yaml.load + body-split` |
| 8 | **Metamorphic** | "if input grows, output should grow" | — | a relevance score is monotone in evidence count |
| 9 | **State-machine** | any legal sequence preserves invariants | state machine with legal-sequence invariants | an order-status machine never goes backward except via an explicit reopen |
| 10 | **Oracle** | result matches trusted alternative | — | a classifier vs a deterministic rule table |

### Finding candidates in the codebase

- Search the source for exported functions with names like `parse*`, `serialize*`, `encode*`/`decode*`, `normalize*`, `format*`, `merge*`, `sort*`, `dedup*`, `slug*`, `escape*`/`unescape*`, `diff*`/`apply*`, and reducers.
- Pair each with its existing tests: functions with only one or two example tests and no generated inputs are the candidates to list for "what bugs are my example tests missing?".
- Skip functions that read the clock, disk, network or random state unless their pure core can be extracted or the effect mocked.

## Tool contract

- **Generators:** `fc.integer`, `fc.string`, `fc.array`, `fc.record`, etc.
- **Test shape:** `fc.assert(fc.property(gen, pred), { numRuns })`.
- **Run:** with bun, `bun test ./test/.../foo.property.test.ts`. The `./` prefix is required: on Bun 1.3.6 a bare relative path silently drops every child process's captured output. With vitest or jest, `npx vitest run <path>` / `npx jest <path>`.
- **Regression example:** a counterexample copied into an example test carries `// fc seed: 0x...` in a comment.

## Gotchas

- **fast-check shrinking is deterministic only when the seed is captured.** Pin it in a comment when a property fails: `// fc seed: 0xdeadbeef`.
- **Generator over-constraint** hides bugs (`fc.integer({min: 0, max: 100})` for code that handles all integers). Use full domain unless the function explicitly forbids inputs.
- **Generator under-constraint** produces invalid inputs and spurious failures (`fc.string()` when the function only accepts ASCII). Constrain integer ranges, string lengths and record nesting depth to the actual valid domain, no wider.
- **Shrinker convergence** — fast-check shrinks until removing any byte makes the test pass again. That output is the regression seed.

## Examples

### Integration with fast-check

```ts
import { test, expect } from "bun:test";
import * as fc from "fast-check";
import { parseFrontmatter, writeFrontmatterField } from "../../src/lib/frontmatter";

// Example module in the user's project: src/lib/frontmatter.ts exports parseFrontmatter and
// writeFrontmatterField. Read the real exports before writing the property; do not assume a
// serializer exists because a parser does.
const BASE = "---\nstatus: draft\nprogress: 0/3\nslug: demo\n---\n# body\n";

test("writeFrontmatterField then parseFrontmatter returns the value written", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("status", "progress", "slug"),
      fc.stringMatching(/^[a-z0-9][a-z0-9\/-]{0,29}$/),
      (field, value) => {
        const written = writeFrontmatterField(BASE, field, value);
        expect(parseFrontmatter(written)?.[field]).toBe(value);
      },
    ),
    { numRuns: 1000 },
  );
});
```

## References

- SKILL.md § Integration Points — the project's test runner, the spec or test-plan row, where verification elects property depth
- fast-check documentation — <https://fast-check.dev/>
- John Hughes original QuickCheck paper — <https://www.cs.tufts.edu/~nr/cs257/archive/john-hughes/quick.pdf>

---
name: hardening
description: "Hardens the tests of the user's codebase with property-based testing in fast-check: turns the universal claim behind example tests into a property, runs it over generated inputs, and shrinks any failure to a minimal counterexample. USE WHEN harden, hardening, property test, property based testing, PBT, fast-check, strengthen tests, find bugs example tests miss, universal quantified claim, shrink counterexample, what bugs am I missing, test the tests. NOT FOR new feature tests (write them with the project's test runner directly), grading agent output (use `assay`), UI verification (use the agent's browser tools), finding security vulnerabilities, or building new functionality."
license: MIT (see LICENSE.txt)
---

# Hardening Skill

Hardening sharpens tests that already exist in the user's codebase without adding new functionality: it turns the universal claim behind a set of example tests into a fast-check property, runs it across generated inputs, and shrinks any failure to the minimal counterexample.

One intent ships. Mutation testing, complexity scoring, duplication scanning, and acceptance-test mutation were once listed upstream as planned; none is built, and this file does not advertise them (a routing table that promises unbuilt intents is the "confidently documented, never existed" class).

## Ideal State

- Every property written states the universal claim behind existing example tests, runs across generated inputs drawn from the function's real input domain, and keeps the examples it sharpens.
- Every failure ends shrunk to a minimal counterexample with its seed, and ends in either a fixed bug or a corrected property.
- What hardening lands is recorded where the project tracks verification: when the project keeps a spec, test plan or acceptance-criteria document, it gets a property row (property, generator, runs, command) for each landed property, and a short learning note (conjectured / refuted by / learned / criterion now) when a counterexample taught something. A project with no such document gets the same facts in the final report to the user.
- Functions that cannot carry a universal claim (impure, or no candidate shape) are left to example tests rather than forced into a property.

## Setup

- The project needs `fast-check` as a dev dependency. Check `package.json` first; when it is missing, ask the user before adding it (`bun add -d fast-check`, `npm i -D fast-check`, `pnpm add -D fast-check`).
- fast-check runs under any JavaScript/TypeScript test runner (`bun test`, vitest, jest, node:test). Use the runner the project already uses; the examples here use `bun test`.
- For other languages, the same method applies with the language's property-testing library (Hypothesis for Python, proptest or quickcheck for Rust, jqwik for Java, rapid or gopter for Go). The generator, shrinking and seed rules below carry over.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| PropertyTest | property test, property based testing, PBT, fast-check, universal quantified claim, shrink counterexample — pure functions, parsers, serializers, data transforms, invariants | `Intents/PropertyTest.md` |

## Integration Points

- **The project's test runner** — property tests live beside the existing tests and run with the same command (`bun test ./<path>`, `npx vitest run <path>`, `npx jest <path>`), so CI picks them up without new wiring.
- **The project's spec or acceptance criteria** — when the project keeps a spec, test plan or acceptance-criteria document with a verification table, a landed property is one row in it (`property | generator | runs | command`), and a criterion that names a pure function on a core or security surface should name a property, not a single example, because one example proves one input, not the class.
- **Verification** — hardening is chosen during verification when the work's criteria warrant property depth (parsers, serializers, auth or identity helpers, money math, release gates); spend is discovered from the work.
- **Eval of model output** — judged output is graded with the `assay` skill if it is installed; hardening covers deterministic code only.

## Gotchas

_No skill-wide gotchas; the fast-check ones live in `Intents/PropertyTest.md` § Gotchas._

## Examples

- "Property-test the slug parser" → PropertyTest → round-trip and idempotence properties in a `.property.test.ts` file at 1000 runs, a property row in the project's spec or test plan (or the final report when there is none), and any failure shrunk with its seed pinned.
- "What bugs are my example tests missing?" → PropertyTest → the pure functions (parsers, serializers, transforms) that have only example coverage, listed as property-test candidates.

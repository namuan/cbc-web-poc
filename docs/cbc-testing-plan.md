# Incremental Correct-by-Construction Testing Plan

## Objective

Strengthen the equipment-checkout POC by specifying its domain rules before implementation, expressing legal operations as explicit state transitions, and testing that each transition preserves the rules. Use property-based and database-backed tests as evidence. Consider finite-state model checking for concurrency after the executable model is stable.

This is an assurance improvement plan, not a claim that the application is formally proved correct. TypeScript types and tests do not prove arbitrary executions correct. Any formal result must name its model, assumptions, bounds, and relationship to the running implementation.

## Current baseline

- The API accepts Zod-validated request bodies and uses a development-only identity header with server-side role checks.
- Equipment lifecycle changes and loans are implemented in `apps/api/src/equipment/equipment.service.ts`.
- PostgreSQL has a partial unique index preventing multiple active loans for one item, plus loan and audit constraints.
- Checkout and return use transactions and lock equipment rows.
- `apps/api/src/equipment/equipment.integration.test.ts` checks concurrent checkout and selected lifecycle/audit behavior against PostgreSQL. It exercises the service, not the HTTP boundary.
- `npm test` skips the database integration suite unless `TEST_DATABASE_URL` is configured. The Compose test profile provides a separate database.
- The database does not currently enforce the cross-table invariant that an item in `checked_out` state has exactly one active loan and other item states have none.

## Domain model to test

### Equipment transitions

| Current state | Operation | Resulting state | Conditions |
| --- | --- | --- | --- |
| `available` | checkout | `checked_out` | Actor is a manager; target member is active; due time is in the future |
| `available` | place in maintenance | `maintenance` | Actor is a manager; reason is present |
| `available` | retire | `retired` | Actor is a manager; reason is present |
| `checked_out` | return serviceable item | `available` | There is one active loan; actor is a manager; return has not already occurred |
| `checked_out` | return faulty item | `maintenance` | There is one active loan; actor is a manager; condition note is present |
| `maintenance` | restore | `available` | Actor is a manager; reason is present |
| `maintenance` | retire | `retired` | Actor is a manager; reason is present |
| `retired` | any lifecycle operation | no transition | Retired is terminal |

### Safety invariants

1. An equipment item has one defined lifecycle state.
2. Each item has at most one active loan.
3. An item is `checked_out` if and only if it has exactly one active loan. Confirm whether this full bidirectional rule is required before adding database enforcement.
4. A new loan references an active member and available item; `due_at` is later than the operation's captured current time and checkout time.
5. Checkout/return updates to the loan, equipment, and audit event commit together or not at all.
6. A return can happen only once. Returned loan history is not silently rewritten.
7. Members can read only their own loans; manager-only operations are denied to members regardless of UI state.
8. Every successful state-changing operation creates its required audit record in the same transaction. Audit records are append-only through application routes.
9. Overdue is derived from an active loan and its due time rather than maintained as a separate mutable flag.

Record any changed rule and its rationale here before changing the implementation or tests.

## Incremental work plan

### Step 1: Specify transitions and test oracles

- Keep the transition table and invariants above as the first version of the domain specification.
- Add examples for valid transitions, rejected transitions, time boundaries, inactive members, missing condition notes, and simultaneous operations.
- Define expected API status/error outcomes separately from domain outcomes.
- Identify which layer enforces each rule: constructor/schema, pure domain, authorization, database constraint, transaction, or operational policy.

**Exit criteria:** each invariant has a clear owner and at least one test scenario; unresolved cross-table and security decisions are recorded rather than assumed.

### Step 2: Extract a pure domain transition module

- Move state decision logic into a side-effect-free module, separate from NestJS controllers, SQL, and HTTP exceptions.
- Model commands and results as discriminated unions, such as checkout, return, enter-maintenance, restore, and retire.
- Pass a captured clock value into due-time checks. Do not read `Date.now()` inside pure transition functions.
- Validate domain primitives at creation boundaries. Use narrow types/factories for equipment names, identifiers, due times, and condition notes where this improves clarity; do not rely on unchecked branded casts.
- Translate domain outcomes into HTTP responses and database operations in the application/service layer.

**Exit criteria:** the pure transition module has no database, network, framework, clock, or random dependencies; exhaustive handling is compiler-checked.

### Step 3: Add example-based domain tests

- Test every allowed and rejected transition in the table.
- Test due time just before, equal to, and after the captured current time.
- Test the checkout/return result and audit intent together at the application boundary.
- Test malformed boundary payloads and ensure validation failures perform no writes.
- Keep tests deterministic and independent of wall-clock timing.

**Exit criteria:** the transition table is covered by direct unit tests, including failure cases and boundary values.

### Step 4: Add property-based and stateful tests

- Add `fast-check` to the API development dependencies.
- Generate domain values and commands, including inactive members, invalid dates, and attempts against unavailable/retired equipment.
- Check general properties: failed transitions leave the model unchanged; successful checkout creates exactly one active loan; illegal states cannot be entered; terminal `retired` state cannot be exited; repeated returns do not create another successful transition.
- Use bounded command sequences against both a simple reference model and the pure implementation. Keep the model independently expressed so it does not merely duplicate implementation logic.
- Record failing seeds and shrink cases so failures are reproducible.

**Exit criteria:** properties run deterministically in the normal unit-test command with documented generation bounds and replay instructions.

### Step 5: Strengthen database and transaction evidence

- Extend the isolated Compose integration suite to check persisted state after each valid and invalid operation.
- Exercise concurrent checkout and concurrent return, then assert both the response outcomes and final database invariants.
- Force a failure after the first transactional write, such as an audit-insert failure in a disposable test database, and verify that no partial loan or equipment update remains.
- Test database constraints directly, including the active-loan unique index and audit append-only trigger.
- Decide whether the cross-table item/active-loan invariant needs deferred database-trigger enforcement. First evaluate trigger complexity, transaction behavior, migrations, and bypass paths; otherwise keep it inside the transactional service and add invariant queries to integration tests.

**Exit criteria:** the Compose integration command checks final database state, transaction rollback, and concurrency, and cannot accidentally run against the development database.

### Step 6: Test the HTTP and authorization boundaries

- Add HTTP-level tests using seeded identities or explicit test identities and a disposable test database.
- Verify unauthenticated requests are rejected, members cannot call manager operations, members cannot see other members' loans, and inactive identities are denied.
- Verify malformed JSON, invalid identifiers, invalid enum values, unknown fields, and unsupported transitions produce expected errors without writes.
- Keep development-header tests explicitly limited to development mode. Do not treat them as evidence of production authentication.

**Exit criteria:** critical authorization and request-boundary scenarios execute through HTTP in automated tests.

### Step 7: Optionally model-check concurrency

- If stronger assurance is useful, write a small TLA+ model for a bounded set of items and members with checkout, return, and maintenance actions.
- Check type correctness, at-most-one-active-loan, item/loan consistency, and the rule that maintenance/retired items cannot be checked out under all interleavings in the model bounds.
- Keep the state space and assumptions explicit. Add TLC to CI only if the model remains small, repeatable, and maintainable.
- Translate important counterexample traces into database integration tests. Treat model checking as evidence about the model, not automatic proof that the TypeScript implementation refines it.

**Exit criteria:** the checked model, assumptions, bounds, invariants, and implementation links are documented; counterexamples become regression tests.

### Step 8: Make assurance repeatable in CI and documentation

- CI runs typecheck, build, unit/property tests, isolated PostgreSQL integration tests, and dependency audit.
- The database-backed tests must run as a required CI job, not remain silently skipped in the release path.
- If adopted, run the bounded model checker in a separate, clearly reported job.
- For each invariant, retain a trace from rule to enforcing code/database mechanism to tests. Document uncovered cases and known limitations.
- Describe the project as tested and reviewed at the level supported by this evidence; do not say formally verified unless a reviewed proof establishes a precisely scoped claim.

**Exit criteria:** a clean checkout can run the required checks reproducibly, and failed checks block merge/release.

## Suggested implementation order

1. Step 1 specification and Step 2 pure domain extraction.
2. Step 3 deterministic transition tests.
3. Step 4 property-based tests.
4. Step 5 database transaction/concurrency tests and Step 6 HTTP authorization tests.
5. Step 7 formal model only if risk and maintenance cost justify it.
6. Step 8 CI enforcement and assurance documentation.

# Shared Lab Equipment Checkout POC

A TypeScript web application prototype for tracking shared lab equipment and enforcing safe checkout, return, maintenance, and retirement workflows. The POC focuses on making state changes explicit, auditable, and safe under concurrent requests; it is not a certified safety system or production-ready application.

## What this repository is for

This repository is where we are building and evaluating a small equipment-lending workflow end to end: a React UI, a NestJS API, PostgreSQL persistence, and Podman-based local development. The initial scenario assumes one small organization with equipment managers and members. Development data is synthetic.

We use runtime validation, database constraints, transactions, authorization checks, and automated tests as complementary safeguards. These measures reduce risk but do not constitute a formal proof of application correctness.

## Product scope

- **Members** can view equipment availability and their own current and past loans.
- **Equipment managers** can add equipment, check equipment out to active members, record returns and condition notes, place available equipment into maintenance, restore maintained equipment, and retire equipment.
- A return marked serviceable makes equipment available; a return reporting a fault moves it into maintenance.
- Overdue status is calculated from an active loan's due time.

Reservations, renewals, notifications, payments, uploads, inventory integrations, multiple organizations, and regulatory certification are out of scope for this POC.

## State and safety rules

Equipment has one of four states: `available`, `checked_out`, `maintenance`, or `retired`. The API and database enforce these core rules:

- Only available equipment can be checked out, and the assigned member must be active.
- Equipment can have at most one active loan. A PostgreSQL partial unique index backs this invariant.
- Checkout and return update the loan, equipment state, and audit record in one transaction. Equipment rows are locked during state changes so simultaneous checkout requests cannot both succeed.
- Maintenance and retired equipment cannot be checked out. A checked-out item must be returned before it can leave circulation.
- Ordinary application routes cannot update or delete audit records. Audit history records the actor, action, time, and relevant reason or condition.
- Member loan queries are scoped to the signed-in development identity; manager-only actions are checked server-side.

The database migration is in `apps/api/migrations/`. Automated checks include a unit test and a database-backed integration test for concurrent checkout, state transitions, and append-only audit events.

## Implementation map

- `apps/web/`: React and TypeScript UI.
- `apps/api/`: NestJS API, request validation, development identity/role checks, and domain operations.
- `apps/api/migrations/`: PostgreSQL schema, constraints, indexes, and audit trigger.
- `compose.yaml`: web, API, PostgreSQL, migration/seed setup, and an isolated integration-test database profile.
- `scripts/dev-tmux.sh`: starts the Compose stack and opens database, setup/API, and web logs in tmux panes.
- `scripts/stop-dev.sh`: stops the app and test containers and tmux session while preserving local database data.

## Local development

Requirements: Node.js 24+, npm, Podman with a running Podman machine and Compose provider. tmux is additionally needed for the pane-based launcher.

Start the stack and open its logs in a three-pane tmux session:

```sh
./scripts/dev-tmux.sh
```

Or start the containers without tmux:

```sh
podman machine start
podman compose up --build -d
```

The Compose setup applies migrations and inserts synthetic demo equipment and identities. Visit <http://localhost:5173> and use the development identity selector to switch between **Member** and **Equipment manager**.

- Web app: <http://localhost:5173>
- API health: <http://localhost:3001/api/health>
- PostgreSQL: `localhost:5432`, database/user `app`

View status and logs with `podman compose ps` and `podman compose logs -f`. Stop the stack and preserve the database volume with:

```sh
./scripts/stop-dev.sh
```

To remove local database data as well, run `podman compose down -v`.

The default database password and seeded identities are for local development only. The identity selector uses a spoofable `x-dev-user-id` header and is enabled only with `NODE_ENV=development`. Production authentication and identity-provider integration are not implemented. Do not expose this configuration to a network or use it with real equipment or personal data.

## Checks

```sh
npm ci
npm run typecheck
npm run build
npm test
npm audit
```

Run the database-backed integration suite against an isolated Compose database:

```sh
podman compose --profile test run --rm --build test-runner
```

## License

MIT licensed; see [LICENSE](LICENSE).

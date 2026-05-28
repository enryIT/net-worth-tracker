---
name: backend-dev-guidelines
description: "You are a senior backend engineer operating production-grade services under strict architectural and reliability constraints. Use when routes, controllers, services, repositories, express middleware, or prisma database access."
risk: unknown
source: community
date_added: "2026-02-27"
---

# Backend Development Guidelines

**(Node.js · Express · TypeScript · Microservices)**

You are a **senior backend engineer** operating production-grade services under strict architectural and reliability constraints.

Your goal is to build **predictable, observable, and maintainable backend systems** using:

* Layered architecture
* Explicit error boundaries
* Strong typing and validation
* Centralized configuration
* First-class observability

This skill defines **how backend code must be written**, not merely suggestions.

---

## 1. Backend Feasibility & Risk Index (BFRI)

Before implementing or modifying a backend feature, assess feasibility.

### BFRI Dimensions (1–5)

| Dimension                     | Question                                                         |
| ----------------------------- | ---------------------------------------------------------------- |
| **Architectural Fit**         | Does this follow routes → controllers → services → repositories? |
| **Business Logic Complexity** | How complex is the domain logic?                                 |
| **Data Risk**                 | Does this affect critical data paths or transactions?            |
| **Operational Risk**          | Does this impact auth, billing, messaging, or infra?             |
| **Testability**               | Can this be reliably unit + integration tested?                  |

### Score Formula

```
BFRI = (Architectural Fit + Testability) − (Complexity + Data Risk + Operational Risk)
```

**Range:** `-10 → +10`

### Interpretation

| BFRI     | Meaning   | Action                 |
| -------- | --------- | ---------------------- |
| **6–10** | Safe      | Proceed                |
| **3–5**  | Moderate  | Add tests + monitoring |
| **0–2**  | Risky     | Refactor or isolate    |
| **< 0**  | Dangerous | Redesign before coding |

---

## When to Use
Automatically applies when working on:

* Routes, controllers, services, repositories
* Express middleware
* Prisma database access
* Zod validation
* Sentry error tracking
* Configuration management
* Backend refactors or migrations

---

## 2. Core Architecture Doctrine (Non-Negotiable)

### 1. Layered Architecture Is Mandatory

```
Routes → Controllers → Services → Repositories → Database
```

* No layer skipping
* No cross-layer leakage
* Each layer has **one responsibility**

---

### 2. Routes Only Route

```ts
// ❌ NEVER
router.post('/create', async (req, res) => {
  await prisma.user.create(...);
});

// ✅ ALWAYS
router.post('/create', (req, res) =>
  userController.create(req, res)
);
```

Routes must contain **zero business logic**.

---

### 3. Controllers Coordinate, Services Decide

* Controllers:

  * Parse request
  * Call services
  * Handle response formatting
  * Handle errors via BaseController

* Services:

  * Contain business rules
  * Are framework-agnostic
  * Use DI
  * Are unit-testable

---

### 4. All Controllers Extend `BaseController`

```ts
export class UserController extends BaseController {
  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const user = await this.userService.getById(req.params.id);
      this.handleSuccess(res, user);
    } catch (error) {
      this.handleError(error, res, 'getUser');
    }
  }
}
```

No raw `res.json` calls outside BaseController helpers.

---

### 5. All Errors Go to Sentry

```ts
catch (error) {
  Sentry.captureException(error);
  throw error;
}
```

❌ `console.log`
❌ silent failures
❌ swallowed errors

---

### 6. unifiedConfig Is the Only Config Source

```ts
// ❌ NEVER
process.env.JWT_SECRET;

// ✅ ALWAYS
import { config } from '@/config/unifiedConfig';
config.auth.jwtSecret;
```

---

### 7. Validate All External Input with Zod

* Request bodies
* Query params
* Route params
* Webhook payloads

```ts
const schema = z.object({
  email: z.string().email(),
});

const input = schema.parse(req.body);
```

No validation = bug.

---

## 3. Directory Structure (Canonical)

```
src/
├── config/              # unifiedConfig
├── controllers/         # BaseController + controllers
├── services/            # Business logic
├── repositories/        # Prisma access
├── routes/              # Express routes
├── middleware/          # Auth, validation, errors
├── validators/          # Zod schemas
├── types/               # Shared types
├── utils/               # Helpers
├── tests/               # Unit + integration tests
├── instrument.ts        # Sentry (FIRST IMPORT)
├── app.ts               # Express app
└── server.ts            # HTTP server
```

---

## 4. Naming Conventions (Strict)

| Layer      | Convention                |
| ---------- | ------------------------- |
| Controller | `PascalCaseController.ts` |
| Service    | `camelCaseService.ts`     |
| Repository | `PascalCaseRepository.ts` |
| Routes     | `camelCaseRoutes.ts`      |
| Validators | `camelCase.schema.ts`     |

---

## 5. Dependency Injection Rules

* Services receive dependencies via constructor
* No importing repositories directly inside controllers
* Enables mocking and testing

```ts
export class UserService {
  constructor(
    private readonly userRepository: UserRepository
  ) {}
}
```

---

## 6. Prisma & Repository Rules

* Prisma client **never used directly in controllers**
* Repositories:

  * Encapsulate queries
  * Handle transactions
  * Expose intent-based methods

```ts
await userRepository.findActiveUsers();
```

---

## 7. Async & Error Handling

### asyncErrorWrapper Required

All async route handlers must be wrapped.

```ts
router.get(
  '/users',
  asyncErrorWrapper((req, res) =>
    controller.list(req, res)
  )
);
```

No unhandled promise rejections.

---

## 8. Observability & Monitoring

### Required

* Sentry error tracking
* Sentry performance tracing
* Structured logs (where applicable)

Every critical path must be observable.

---

## 9. Testing Discipline

### Required Tests

* **Unit tests** for services
* **Integration tests** for routes
* **Repository tests** for complex queries

```ts
describe('UserService', () => {
  it('creates a user', async () => {
    expect(user).toBeDefined();
  });
});
```

No tests → no merge.

### Runtime Dependency Migration Slices

When migrating a React/Next.js app away from an old runtime data provider (Firebase, hosted DB SDKs, legacy API clients) toward a local/server-backed architecture:

1. Pick one vertical slice that preserves the existing public service API where possible.
2. Before coding, load the workflow skills named by the project/user from the repo-local `.agents/skills/...` path when such a copy exists; do not silently substitute a homonymous global/user skill. If a skill name is ambiguous, pause and load the explicit repo-local file or state why you cannot.
3. Add RED tests at the boundaries touched by the slice before implementation:
   * client wrapper test: imports the legacy public wrapper path when compatibility matters, asserts it calls the new local API, and guards against old provider imports or SDK calls;
   * route test: asserts session auth, demo/write guard, validation, success, and error status shape when a route changes or is added;
   * server service test: asserts persistence shape, ownership scoping, and cascade/denormalized updates when business logic moves server-side.
   Existing local routes do not need duplicate tests if the slice only rewires a wrapper, but nearby route tests should still run as broader regression coverage.
4. Keep App Router handlers thin: parse/validate request, resolve session, enforce write policy, delegate.
5. Keep Prisma/database access inside `lib/server/*` services or repositories, never React components or client wrappers.
6. If the project already has a JSON settings row/service for low-volume per-user configuration, prefer writing a namespaced key through that existing service over adding a new table for a tiny settings-like blob.
7. Preserve legacy wrapper arguments only as compatibility shims if session context now supplies ownership; name unused parameters explicitly (for example `_userId`). Never keep trusting client-supplied ownership after a route is session-scoped.
8. When a migrated wrapper has an associated child-record read (for example cost-center expenses), add a narrow server-side list method and route query branch instead of recreating old SDK queries in the client wrapper.
9. If setup commands such as `npm install` mutate a lockfile without an intentional dependency change, inspect and revert the unrelated lockfile change before staging.
10. When migrating a wrapper that used client-side cascade writes, move the cascade into the server service if it affects denormalized child rows. Cover category/name/type/subcategory propagation and any sign-flip semantics in service tests; the client wrapper should only call local APIs.
11. For shared utility/type boundary slices, remove provider imports by replacing SDK-specific types with structural local types when behavior only needs a tiny shape (for example `{ toDate(): Date }`). Add a source-level regression test that reads the touched file and forbids provider imports, then keep existing behavior tests for Date/string/provider-like objects. Avoid old-provider vocabulary in new type names when the migration's residual search includes those terms: a replacement named `TimestampLike` can keep a file in the hit list even after the runtime dependency is gone. Prefer domain-neutral names such as `GoalDateLike` or `InvestmentDateLike`. See `references/shared-type-provider-boundaries.md` for the worked checklist.
12. For active UI/client components that import an old provider SDK only for date/timestamp typing or `instanceof` checks, treat that as a valid narrow migration slice: replace the SDK import with an existing structural helper/type (for example `TimestampLike` plus `toDate()`), add a source-level boundary test for the UI files, and run nearby domain tests. If the component still imports another legacy service wrapper, document that as a caveat instead of broadening the slice.
13. For source-level boundary tests, import the test-runner globals explicitly unless the project config is known to inject them. If the first RED fails due to a test-harness issue (for example missing `describe`/`it`/`expect`), fix only the harness and rerun RED until it fails for the expected provider dependency.
14. After green tests, run a final search for the old provider imports to verify the touched slice disappeared from runtime hits, but do not claim full provider removal unless the full search is clean.
15. For UI forms that import the old provider only to create timestamps for newly submitted records, prefer plain platform values (for example `new Date()`) when the domain type already accepts `Date`. Add a source-level boundary test first that fails on the provider import, then make the smallest change from provider timestamp creation to local `Date` creation. Document any remaining shared type imports as caveats rather than broadening the slice.
16. For shared domain type files that import the old provider only for date/timestamp typing, add a source-level RED boundary test, replace SDK timestamp types with a domain-neutral structural type such as `AssetDateLike = { toDate(): Date }`, run nearby importer tests plus full typecheck, and document remaining provider hits without claiming full removal. See `references/asset-shared-type-provider-boundary.md` for the asset-type variant.
17. For shared authenticated fetch helpers that still import the old client auth SDK only to attach bearer tokens, first verify the relevant local API routes use server-side cookie/session auth, then add a RED boundary/behavior test and replace the helper with a compatibility shim using `credentials: init.credentials ?? 'same-origin'`. Preserve the exported helper signature and do not edit all call sites in the same slice. See `references/authenticated-fetch-local-session-boundary.md` for the worked checklist.
18. For legacy server-side compatibility helpers that still import the old runtime provider but have an equivalent local service/use-case, keep the public helper signature, add a RED source-level boundary test that forbids provider imports and asserts delegation, then replace the implementation with direct delegation to the local service. See `references/server-compatibility-provider-delegation.md` for the worked checklist.
19. When removing or neutralizing an apparently unused provider helper, search beyond the user's standard residual grep scope before deleting it. A helper may be imported from adjacent roots such as `contexts/`, `providers/`, or `src/` even if the migration prompt only scans `app lib components types __tests__`. If typecheck reveals a live caller after a deletion attempt, correct the slice to a neutral compatibility helper instead of leaving the caller broken; preserve behavior, rename provider-specific APIs to domain-neutral names, and document the out-of-scope caller as a future migration target. See `references/provider-helper-neutralization.md` for the worked checklist.
20. When cleaning old-provider vocabulary rather than imports, remember that the regression test can itself keep the residual grep noisy. Build forbidden-pattern regexes from neutral fragments (for example `'Time' + 'stamp'`) or otherwise avoid spelling the deprecated provider term literally in the test body. This preserves source-level RED/GREEN proof without adding new false-positive residual hits. See `references/provider-vocabulary-boundary-tests.md` for the checklist.
See `references/dividend-shared-type-provider-boundary.md` for the dividend-type variant, including the `DividendDateLike` structural boundary and nearby dividend test set.
See `references/cost-center-shared-type-provider-boundary.md` for the cost-center shared-type variant, including the `CostCenterDateLike` boundary and nearby cost-center/cashflow regression set.
See `references/expense-shared-type-provider-boundary.md` for the expense shared-type variant, including the `ExpenseDateLike` structural boundary and the `toMillis()` pitfall exposed by category UI sorting.
See `references/household-shared-type-provider-boundary.md` for the household shared-type variant, including the `HouseholdDateLike` structural boundary and the nearby household regression test set.
See `references/performance-shared-type-provider-boundary.md` for the performance shared-type variant, including the `PerformanceDateLike` structural boundary, neutral `Serialized*` cache type rename, and caveat that the legacy performance service may still be provider-backed.

See `references/runtime-provider-migration-slices.md` for concise worked patterns from cost-center wrapper, expense category-assignment, legacy wrapper, and shared utility/type boundary migrations, including dedicated local bulk-operation routes and sign-flip semantics for income/non-income moves.
See `references/runtime-provider-ui-boundary-slices.md` for the UI timestamp/date boundary pattern, including RED source-test shape and scope caveats when components still import other legacy wrappers.
See `references/runtime-provider-ui-form-timestamps.md` for a worked UI form timestamp-creation boundary slice using a source-level Vitest guard and `new Date()` replacement.

---

## 10. Anti-Patterns (Immediate Rejection)

❌ Business logic in routes
❌ Skipping service layer
❌ Direct Prisma in controllers
❌ Missing validation
❌ process.env usage
❌ console.log instead of Sentry
❌ Untested business logic

---

## 11. Integration With Other Skills

* **frontend-dev-guidelines** → API contract alignment
* **error-tracking** → Sentry standards
* **database-verification** → Schema correctness
* **analytics-tracking** → Event pipelines
* **skill-developer** → Skill governance

---

## 12. Operator Validation Checklist

Before finalizing backend work:

* [ ] BFRI ≥ 3
* [ ] Layered architecture respected
* [ ] Input validated
* [ ] Errors captured in Sentry
* [ ] unifiedConfig used
* [ ] Tests written
* [ ] Required project gates run and pass before commit/ship
* [ ] No anti-patterns present

### Blocked Validation Gates

If a required gate cannot complete because of the execution environment, do not treat the slice as complete. Preserve the gate, document the exact blocker and passing targeted checks, leave changes uncommitted when project rules require all gates to pass, and state the blocked status plainly to the user. See `references/blocked-validation-handoff.md` for the detailed handoff pattern.

---

## 13. Skill Status

**Status:** Stable · Enforceable · Production-grade
**Intended Use:** Long-lived Node.js microservices with real traffic and real risk
---

### When to Use
This skill is applicable to execute the workflow or actions described in the overview.

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

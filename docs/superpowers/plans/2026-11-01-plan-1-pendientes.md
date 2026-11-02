# Plan 1 (base) — decisiones tomadas y pendientes para los planes siguientes

Generado al cerrar la ejecución del plan 1 (2026-11-02). Fuente: registro de ejecución.

## Decisiones tomadas durante la ejecución

- Ruling: implementation runs on branch primeros-200/plan-1 cut from diseno/primeros-200 (spec+plan commits), not main — keeps July work untouched — cost if wrong: a rebase later.
- Ruling: Task 2 uses a separate local database decide_primeros200 on the decide_postgres_dev container (dev credentials from docker-compose.dev.yml), written to git-ignored apps/api/.env — avoids touching July dev data or any reset prompt — cost if wrong: re-run migrations on another DB.
- Ruling: lint step skipped for all tasks — eslint is not installed in apps/api (pre-existing env gap; typecheck + tests remain the gates) — cost if wrong: style issues surface later when eslint is added.
- Task 5: Ruling: change_origin on non-verified target gave memberships (plan-mandated, violates global constraint) — fix: update birthDepartment always, syncMemberships only if target is verified_citizen — cost if wrong: none expected.
- Task 5: Ruling: assignFounderSeat let admin replace occupied seats or give away 'administrador' unilaterally, bypassing spec §3 2-of-3 (plan-mandated) — fix: founder assignment only fills VACANT seats and never the 'administrador' role; replacing an occupied seat is deferred to Plan 3 (elections/board action) — cost if wrong: if a founder leaves before the first election, the seat can only be filled once vacated (no unassign endpoint yet).
- Task 6: Ruling: founding exception must not reopen if verified count later drops (reviewer #3, plan-mandated) — fix now: count users with status verified_citizen OR suspended (suspended is only reachable from verified) — cost if wrong: an observer/external status path could still lower the count; revisit in Plan 3.
- Task 7: Ruling: reinstating a suspended account (suspended → verified_citizen) is now blocked from the panel; it should be a 2-of-3 board action — deferred to Plan 3 (add BoardActionType.reinstate_user) — cost if wrong: a wrongly suspended member stays suspended until Plan 3 ships.
- Task 9: Ruling: coordinador/secretario cannot propose board actions because the propose form needs admin-only /api/users (plan-mandated, reviewer Important #2) — deferred to Plan 3 (board-visible member list) — cost if wrong: only the administrador can initiate 2-of-3 actions until then.
- Task 10: Ruling: ADR-014/015 are already reserved as IDs in DECISIONS.md 'Decisiones pendientes' — renumber the new ADR to ADR-016 — cost if wrong: one renumber.
- Final: Ruling: #5 anti-gaming (referee must have belonged to the host community ≥ N days) deferred to Plan 3 as a votable rule — at launch nobody has tenure, so it would block the acogida path; this round only records `via` + referee host slug in audit metadata — cost if wrong: a member could relocate to vouch until Plan 3.
- Final: Ruling: access-token freshness (status re-read in JwtStrategy) deferred to Plan 5 security review; this round deletes memberships on suspension, makes roleOf status-aware and re-reads referee status in confirm — cost if wrong: ≤15 min window where a suspended user's token reaches non-membership endpoints.

## Pendientes menores (aplazados, con su plan sugerido)

- Task 1: minor (deferred): hostCommunity does not trim input (callers must validate ISO-2) — host-community.util.ts
- Task 1: minor (deferred): Spanish type alias ConHogar in English-named file
- Task 1: minor (deferred): VerificationStatus.status typed string (brief-mandated)
- Task 2: minor (deferred): NewsletterSubscription has both @unique and @@index on email (matches existing DB; redundant index)
- Task 2: minor (deferred): BoardApproval lacks @@index([profileId]); BoardAction.targetUserId has no FK (plan-mandated)
- Task 3: minor (deferred): updateProfile stores currentRegion regardless of country (harmless: hostCommunity ignores region outside US) — plan-mandated
- Task 3: minor (deferred): currentRegion DTOs lack @IsString (Matches covers it) — plan-mandated
- Task 3: minor (deferred): tests don't cover updateProfile sync gating (verified syncs, pending doesn't) nor origin set-from-null allowed
- Task 4: minor (deferred): deleteMany then upserts not in a transaction (gap if upsert fails; re-sync repairs) — plan-mandated
- Task 4: minor (deferred): no residence cleanup when hostCommunity resolves to null — plan-mandated
- Task 4: minor (deferred): no test asserting origin membership survives residence sync
- Task 5: minor (deferred): vote flow not transactional (duplicate execute/audit on simultaneous final votes; P2002 → 500 on double-click)
- Task 5: minor (deferred): action stuck pending if execute throws (e.g. target without profile)
- Task 5: minor (deferred): execute() treats any non-suspend type as change_origin (no exhaustive switch)
- Task 5: minor (deferred): suspended board members keep their seat; roleOf ignores account status
- Task 5: minor (deferred): listActions N+1 profile lookups; no BoardGuard/getSeats tests
- Task 6: minor (deferred): founding count read outside the transaction (tiny race at the 4-person boundary)
- Task 6: minor (deferred): suspended referee can vouch until access-token expiry (JWT status not re-read in confirm)
- Task 6: minor (deferred): people invited by a since-suspended/non-verified member, or with invitedById null, can never get 'invitador' outside founding — needs a board path later
- Task 6: minor (deferred): no tests for pendingFor/statusFor; reference attestation text not recorded server-side (UI confirm dialog carries it)
- Task 7: minor (deferred): ALLOWED_STATUS_TRANSITIONS keeps now-dead verified_citizen/suspended targets; stale test comment for invited → verified_citizen; no controller 403 test
- Task 8: minor (deferred): seed header comment still says "si el usuario ya existe, no hace nada"; seat log prints even when unchanged
- Task 9: minor (deferred): no post-registration notice on /login?registered=1 (dashboard explains on first login)
- Task 9: minor (deferred): VoteButtons ignore voteBoardAction errors and don't hide after voting
- Task 9: minor (deferred): ROLE_LABEL exported from a 'use client' module into a server component; currentRegion asserted only in login test
- Task 10: minor (deferred): DECISIONS pending table IDs ADR-014/015 overlap the ADR namespace; date duplicated in ADR-016 heading
- Final: minor (deferred): inviteUser admin-exemption check reads the seat without holder status (suspended admin can't authenticate usefully)

## Hallazgos de la prueba de punta a punta

- W1 (medium): suspending a user keeps their community memberships; an already-issued access token (≤15 min) can still post proposals (201). Suspension should remove memberships (and/or participation should check status).
- W2 (low): nav shows "Mesa" and "Admin" to every verified user; /admin/users shows "Error cargando usuarios." to non-admins instead of an access message.
- W3 (low): API refuses to start without RESEND_API_KEY/EMAIL_FROM even in development; validateEnv doesn't mention them (pre-existing).

## Notas para la publicación (plan 5)

- Task 2: note: local helper container p200_pgproxy (socat 127.0.0.1:15432 → decide_postgres_dev) because a native Windows Postgres owns :5432; apps/api/.env points to it. Remove with `docker rm -f p200_pgproxy` at the end.
- Task 9: note: `next build` fails at the Windows standalone symlink step (EPERM) after compile+typecheck — environment; Linux CI/Docker unaffected (verify in Plan 5)
- Task 9: note: manual end-to-end walkthrough still pending — controller to run before final review

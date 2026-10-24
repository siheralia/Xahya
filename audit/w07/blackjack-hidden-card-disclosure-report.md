# W07 — Blackjack hidden-card disclosure remediation

- Workflow: W07
- Status: IMPLEMENTED_UNVERIFIED
- Repository: https://github.com/siheralia/Xahya
- Base branch: main
- Base SHA: ae94bc54d3b80dcc18e521e7dd7c9b1ce5b04383
- Implementation branch: fix/w07-blackjack-hidden-card-disclosure
- Result SHA: 3a97ea1c9654f710968d084a5a03a2d74f1a2918
- Target: `app/api/casino/blackjack/route.ts`
- Execution mode: scoped source change only; no production actions.

## Source findings

1. **Confirmed before change:** `start` returned the full dealer array and full dealer total when the hand remained active.
2. **Confirmed before change:** non-busting `hit` returned the full persisted dealer array even though `dealerHidden: true`; the dealer total used only the up-card, but the hole card itself was disclosed.
3. **Other branches:** `stand` and a busting `hit` end the active hand and reveal the dealer hand. This is consistent with W07's rule to reveal after the game ends, subject to domain-rule confirmation.
4. **GET:** returns only `activeGame: Boolean(resource?.blackjackState)`; it does not serialize card identities or totals.

## Changes

- Active `start` response now projects only the dealer up-card and computes `dealerValue` from that visible card.
- Active non-busting `hit` response now projects only the dealer up-card.
- Dealer hole-card data remains in persisted server-side state and is not removed from game state.
- Terminal branches continue to reveal the dealer hand.

## Verification

Static checks against the committed source:
- startSanitized: PASS
- hitSanitized: PASS
- hitDealerValueUpcardOnly: PASS
- standReveal: PASS
- bustReveal: PASS

Commands/tests: No local checkout or runnable test harness was available through the connected GitHub file operations. No automated response-contract tests, build, lint, runtime reproduction, or CI run is claimed. The repository package scripts currently expose build/lint but no test script. W01/G1 test-harness dependency remains unresolved; deterministic branch/action response tests are required before VERIFIED.

## Acceptance ledger

- [x] Enumerated start, hit, stand, bust, and GET response paths at source level.
- [x] Active start response omits dealer hole card and hidden-card total.
- [x] Active hit response omits dealer hole card and hidden-card total.
- [x] Terminal stand/bust responses reveal dealer hand only after the game ends.
- [ ] Automated response-contract tests for every action/state/error branch — BLOCKED: test harness not established (W01/G1).
- [ ] Build/lint/CI verification — NOT RUN.
- [ ] Independent review — PENDING.

## Exposure impact

The API response itself exposed the dealer hole card to the authenticated player during active play, despite the `dealerHidden` flag. This is a source-level confirmed disclosure. This change prevents the two active response paths identified above from serializing the hidden card. No historical response logs or player records were exported or inspected; historical exposure impact remains unassessed.

## Exceptions / residual risks

- W07 remains `IMPLEMENTED_UNVERIFIED`, not `VERIFIED`, until response-contract tests and independent review pass.
- Error branches return fixed error messages and do not include game state; runtime tests were not run.
- The dealer's visible-card representation is the existing Card object; only the up-card is returned while active.
- No production database writes, migrations, deployment, or game-balance changes were performed.

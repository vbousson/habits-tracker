<!--
Thanks for contributing. Keep this short — the checklist matters more than the prose.
See CONTRIBUTING.md for the full version.
-->

## What this changes

<!-- One or two sentences. What problem does it solve? -->

Closes #

## How to check it

<!-- The steps a reviewer should follow, or the test that now covers it. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` all pass locally.
- [ ] The commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- [ ] No new npm dependency — or, if there is one, the PR explains why it cannot be avoided.
- [ ] **No UI file imports a backend directly.** Screens and components go through `HabitRepository`; only `src/lib/backend.ts` knows which implementation is in use.
- [ ] **`src/core/` stays free of React, of the DOM and of anything Google.** New domain logic lives there and comes with unit tests.
- [ ] User-visible strings are in French; code, comments and documentation are in English.
- [ ] Behaviour that depends on the spreadsheet layout is reflected in `docs/DATA_MODEL.md`.
- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]` if a user would notice this change.

## Notes for the reviewer

<!-- Trade-offs, things you are unsure about, anything you deliberately left out. -->

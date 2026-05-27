# Project Rules

> **These rules define a mandatory workflow. Every step MUST be followed in order. Do not skip, reorder, or shortcut any step. If a step cannot be completed, halt and report the blocker to the human before proceeding.**

> **This file is the stack-agnostic workflow kernel. Stack-specific rules (lint commands, build gotchas, test runners, domain-specific verification) belong in `STACK.md`, which is imported at the end of this file via `@./STACK.md`.**

## Spec Driven Design

A spec MUST exist before any implementation begins. This applies to new features, changes to existing features, and bug fixes without exception. Do not write any code until a spec has been created and approved via the OpenSpec workflow.

`/opsx:propose` creates the proposal artifacts on a dedicated `proposal/<change-name>` branch cut from `main` and commits them as a single commit with the message `chore(openspec): propose <change-name>` (the `chore` type is required so the proposal produces no release version bump). It creates no implementation branch — the `feature/`|`bugfix/` branch is created later by `/opsx-apply-wt` (see "Branching"). The proposal merges to `main` only after the design-review gate passes (see "Code review with roborev") **and** the human has explicitly approved the merge: once the design review is clean, present the result to the human and wait for explicit approval — a clean review alone does not trigger the merge. After approval, fast-forward merge `proposal/<change-name>` into `main` with plain `git` — no PR — and delete the proposal branch. If `main` has advanced since the branch was cut, rebase the proposal branch onto `main` before the fast-forward.

## Branching

All tasks for a change MUST be implemented on a single branch. Implementation branch names MUST use either the `feature/` or `bugfix/` prefix followed by the kebab-case change name.

`/opsx:propose` does **not** create an implementation branch. It works on a dedicated, short-lived `proposal/<change-name>` branch (a third prefix, separate from `feature/`|`bugfix/`), runs the design-review gate, then merges the proposal to `main` (see "Spec Driven Design"). The `feature/`|`bugfix/` implementation branch is created from `main` only by `/opsx-apply-wt`, which is also where the human is prompted for the change type.

**REQUIRED: At `/opsx-apply-wt` time, before creating the implementation branch, prompt the human for the change type (feature or bugfix) and wait for confirmation. Do not create the branch until the human has confirmed the type.**

```
proposal/<change-name>   # created by /opsx:propose, deleted after it merges to main
feature/<change-name>    # implementation branch, created by /opsx-apply-wt
bugfix/<change-name>     # implementation branch, created by /opsx-apply-wt
```

Examples:

- `feature/power-button`
- `feature/second-oscillator`
- `bugfix/fix-filter-cutoff`

Before starting any implementation work, confirm you are inside the worktree that `/opsx-apply-wt` created, checked out on its `feature/`|`bugfix/` branch. Never create or switch to that branch in the `main` checkout — branch creation belongs to `/opsx-apply-wt` alone (its script owns the "branch already exists" preflight). If the expected worktree or branch is missing, halt and ask the human rather than creating it yourself.

## Worktree Workflow

Implementation happens in worktrees branched from `main`. All change implementation MUST happen in an isolated worktree. This is not optional.

**REQUIRED sequence:**

1. From `main`, run `/opsx-apply-wt <change-name>` to create a sibling worktree on the correct branch
2. Open the new worktree in a separate VS Code window or terminal
3. From inside that worktree, run `/opsx:apply <change-name>` to begin implementation

Do not implement changes directly on `main`. If you find yourself on `main` with implementation work, halt and ask the human how to proceed.

## Code review with roborev

This repo uses roborev for code review. Reviews are invoked **explicitly** at the defined gates — the proposal design review on the `proposal/<change-name>` branch (`/roborev-design-review-branch`), the end-of-implementation `roborev refine`, and ad-hoc `roborev review` / `roborev tui` — not automatically after every commit. Commits on `feature/`/`bugfix/` worktree branches are not auto-queued (the `post-commit` hook is a stub and `core.hooksPath` is shared across worktrees), so do not rely on a review firing on its own; invoke one explicitly when you need it.

- Browse open reviews interactively with `roborev tui`, or list them with `roborev fix --open --list`
- To address open findings, use the `/roborev-fix` skill
- Commit often so reviews stay scoped and contextual
- Configuration lives in `.roborev.toml` at the repo root

### Proposal design-review gate

A proposal MUST pass a roborev **design review** before it merges to `main` — the same "review passes cleanly before merge" posture that governs code. After `/opsx:propose` commits the artifacts to the `proposal/<change-name>` branch, run a roborev design review on that branch (the `/roborev-design-review-branch` skill) and resolve every finding until it passes cleanly. Then present the clean review result to the human and **wait for explicit human approval** before merging — mirroring the implementation gate, a clean review alone does not authorize the merge to `main`. Only after the human approves, fast-forward merge the proposal to `main` and delete the proposal branch. Do not merge a proposal while design-review findings remain open, and do not merge a proposal the human has not approved.

## Committing Changes

EVERY individual task step (e.g., 1.1, 1.2, 2.1) MUST be committed immediately after it is complete. Do not batch multiple steps into a single commit. Do not begin the next step until the commit for the current step has been made.

### Conventional Commits

Every commit MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>[optional scope]: <description>
```

Required types and their version-bump effect:

| Type       | When to use                                          | Version bump |
| ---------- | ---------------------------------------------------- | ------------ |
| `feat`     | New user-visible functionality                       | minor        |
| `fix`      | Corrects incorrect behaviour without adding features | patch        |
| `chore`    | Tooling, dependency, or pipeline changes             | none         |
| `docs`     | Documentation only                                   | none         |
| `refactor` | Code restructuring with no behaviour change          | none         |
| `test`     | Adding or updating tests                             | none         |

**Per-commit types are required for review scoping and history readability** — they keep each roborev review contextual and make the branch history legible. They are NOT the release input: each feature/bugfix branch is squash-merged to `main` as a single PR, and only the PR title becomes the commit on `main` that `release-please` parses for the version bump type. So the load-bearing release decision is the **PR title's** Conventional Commit type, not the individual per-commit types — getting the PR title's type wrong (or omitting it) silently breaks the release pipeline.

## Implementation Completion

There are no review or human-verification gates at section boundaries. Proceed straight through all sections until every task is implemented. The single review + human-verification gate runs once, at the end of the implementation.

The implementation is NOT complete until ALL of the following are true:

1. `/opsx:verify <change-name>` confirms the implementation matches the change artifacts (proposal, design, specs, tasks)
2. All applicable tests pass (see `STACK.md` for this project's specific test commands)
3. All roborev reviews on the branch pass
4. The human has explicitly approved moving forward

### End-of-implementation workflow

When all tasks across all sections are complete:

1. Run `/opsx:verify <change-name>` to confirm the implementation matches the change artifacts. **This is a hard gate:** if verify reports a mismatch between the implementation and the artifacts, halt and resolve it before proceeding — do not run the test suite, `roborev refine`, or request approval while a mismatch is open. A mismatch is not a "human decides whether it blocks" finding; the spec-driven contract must be met first. To resolve: if the implementation is wrong, fix the code to match the artifacts; if the artifacts are wrong, update them (proposal/design/specs/tasks) via the normal artifact-update flow; when it is unclear which side is correct, ask the human before changing either.
2. Confirm all tests pass (the full `STACK.md` test suite)
3. Run `roborev status` to confirm the daemon is healthy — if it is not running, halt and report the error; do not skip the review gate
4. Run `roborev refine --max-iterations 3` to resolve all open review findings
5. Present refine results to the human and **wait for explicit human approval** before opening the PR — do not self-approve

If step 4 (`roborev refine`) completes but open findings remain, present the remaining findings to the human. The human decides whether to run refine again, address findings manually, or explicitly override and proceed. Do not make this decision unilaterally.

**Do not create a PR until human approval is granted.** A single PR is opened for the whole feature/bugfix branch — see "Pull Requests" below.

## Pull Requests

> **Branch creation, rebase, sync, and PR submission use plain `git` and the `gh` CLI. `gh` is a required tool for this workflow — it must be installed and authenticated.**

A single PR is opened per feature/bugfix branch when the entire change is complete. **Do not create per-section PRs.** The end-of-implementation gate (tests + roborev + human approval) runs once before the PR is opened — see "Implementation Completion" above.

### Feature-level verification

The feature branch is ready for PR ONLY after the human has completed:

1. Visual verification of the feature in the running app
2. Personal reflection on the feature's behaviour and quality
3. Explicit instruction to open the PR

Any stack-specific verification gates (e.g. audio verification) and the pre-push CI-parity checks are listed in `STACK.md`'s Feature-level verification section.

Do not open the PR autonomously. Wait for the human to request it.

### Opening the PR

When the human requests the PR:

1. Confirm the end-of-implementation gate has passed (tests pass, roborev clean, human approved per "Implementation Completion" above)
2. Push the branch and open the PR against `main`: `git push -u origin HEAD && gh pr create --fill --base main`
3. Report the PR URL to the human

### PR Feedback

When addressing comments left by a human reviewer on the feature PR:

1. Make response commits on the feature branch. Worktree-branch commits are not auto-queued, so any roborev review of a response commit is invoked explicitly (`roborev review`) when needed — there is no reliance on an automatic post-commit review
2. Human reviews the response commits and any roborev findings directly — `roborev refine` is **not** run during feedback cycles
3. On human approval, squash non-interactively and force-push: `git reset --soft "$(git merge-base HEAD main)"` then a single `git commit`, then `git push --force-with-lease`. Do not use `git rebase -i` (interactive git is unsupported in the agent harness). The squash commit message MUST be the PR title (a valid Conventional Commit), since GitHub squash-merges the branch and the PR title is the release-parse input

## Project-specific rules

@./STACK.md

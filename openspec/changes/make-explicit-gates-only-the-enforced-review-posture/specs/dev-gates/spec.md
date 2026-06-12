## MODIFIED Requirements

### Requirement: Commits are not auto-reviewed

The repository SHALL enforce the explicit-gate review posture such that no automatic code review is enqueued by a commit on any branch, through **any** roborev mechanism — the committed `.githooks/post-commit` hook **and** the roborev daemon's repository registration/watch. The enforcement SHALL be durable: it MUST continue to hold after roborev re-arms its hooks (`roborev install-hook`/`roborev init`) or would otherwise observe the repository's commits. The committed `.githooks/post-commit` no-op stub SHALL remain the version-controlled statement of the posture, and its in-file documentation MUST describe the actual enforced mechanism (it MUST NOT claim a roborev hook written to `.git/hooks/` is "inert because `core.hooksPath` points at `.githooks`", which is false — roborev follows `core.hooksPath`).

#### Scenario: committing enqueues no review

- **WHEN** a commit is made on any branch
- **THEN** no automatic roborev review is enqueued by the commit, whether via a committed/installed `post-commit` hook or via the daemon observing the repository

#### Scenario: posture survives roborev re-arming its hooks

- **WHEN** roborev later runs `install-hook`/`init` and writes or re-writes a `post-commit` (or `post-rewrite`) hook
- **THEN** no automatic review is enqueued by subsequent commits, and the re-armed hook does not break the push gate (see "Pushes are gated by checks identical to CI")

#### Scenario: posture survives the daemon observing the repository

- **WHEN** the roborev daemon would otherwise auto-register or watch this repository and enqueue a review per `main` commit
- **THEN** the enforced posture keeps the repository out of that auto-review path, so commits to `main` enqueue no automatic review

#### Scenario: documentation matches the enforced posture

- **WHEN** the posture is described in the committed stub, `.roborev.toml`, `CLAUDE.md`, and `WORKFLOW-NOTES.md`
- **THEN** those descriptions agree with the actually-enforced behavior and contain no claim contradicted by roborev's real hook/daemon behavior

### Requirement: Hooks activate on install

Installing dependencies SHALL activate the repository's committed git hooks so that a fresh checkout is gated after a single `npm install`, and the activation SHALL be resilient to roborev's own hook installation: roborev re-arming its hooks MUST NOT corrupt the tracked, version-controlled hook sources that encode the review posture, nor cause the post-commit hook to enqueue an automatic review.

#### Scenario: postinstall wires hooks

- **WHEN** `npm install` completes in a git work tree
- **THEN** the committed hooks become the active hooks for subsequent git operations

#### Scenario: no-op outside a work tree

- **WHEN** the install runs where no git work tree is present (e.g. a tarball or CI container without git state)
- **THEN** hook activation is skipped without error

#### Scenario: roborev hook installation does not corrupt tracked hook sources

- **WHEN** roborev runs `install-hook`/`init` after hooks are activated
- **THEN** the tracked `.githooks/post-commit` source is not modified into an auto-review hook, so a `git status` after a roborev hook installation shows no working-tree modification of the tracked hook that would break the push gate

### Requirement: Pushes are gated by checks identical to CI

A `pre-push` hook SHALL run the repository's single shared checks script (`scripts/checks.sh`) over the whole repository, and CI SHALL run that **same** script, so that any push CI would reject also fails locally before it is sent. The shared checks SHALL NOT be made to fail by roborev-managed hook files (an installed `post-commit`/`post-rewrite` carrying roborev's own formatting): such files MUST either be kept out of the tracked lint scope or kept out of the tracked tree entirely, so a roborev hook (re)installation cannot block an otherwise-clean push.

#### Scenario: push fails for a repo-wide violation

- **WHEN** `git push` runs while any tracked file fails `scripts/checks.sh`
- **THEN** the push is aborted locally with the same failure CI would report

#### Scenario: hook and CI invoke the same script

- **WHEN** the `pre-push` hook and the CI lint/format job both run
- **THEN** both invoke `scripts/checks.sh`, so the check command cannot drift between them

#### Scenario: vendored files are not inspected

- **WHEN** `scripts/checks.sh` runs in a checkout where `node_modules/` is present
- **THEN** it discovers files via `git ls-files` and inspects no file under `node_modules/` (which `.gitignore` excludes from tracking)

#### Scenario: a roborev-managed hook does not block the push gate

- **WHEN** roborev has installed or re-armed its `post-commit`/`post-rewrite` hook (with its own formatting) and `git push` runs while no kernel-authored file violates the checks
- **THEN** the push is not blocked by the roborev-managed hook file

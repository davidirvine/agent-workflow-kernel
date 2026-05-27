---
name: openspec-propose
description: Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

Proposing happens on a dedicated `proposal/<change-name>` branch: I generate the artifacts, commit them as `chore(openspec): propose <name>`, run a roborev design review, and — after your explicit approval — fast-forward-merge the proposal to `main`. The `feature/`|`bugfix/` implementation branch is created later by `/opsx-apply-wt`, not here.

---

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the proposal branch, then the change directory**

   Proposing works on a dedicated short-lived `proposal/<change-name>` branch — NOT a `feature/`|`bugfix/` branch, and NOT `main` directly. Do **not** prompt for the change type (feature vs bugfix) here; that belongs to `/opsx-apply-wt`, which creates the implementation branch later. Cut the branch from an up-to-date `main`, then scaffold:
   ```bash
   git checkout main
   git checkout -b "proposal/<name>"
   openspec new change "<name>"
   ```
   This creates a scaffolded change at `openspec/changes/<name>/` with `.openspec.yaml`.

3. **Get the artifact build order**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to get:
   - `applyRequires`: array of artifact IDs needed before implementation (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts with their status and dependencies

4. **Create artifacts in sequence until apply-ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:
      - Get instructions:
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - The instructions JSON includes:
        - `context`: Project background (constraints for you - do NOT include in output)
        - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
        - `template`: The structure to use for your output file
        - `instruction`: Schema-specific guidance for this artifact type
        - `outputPath`: Where to write the artifact
        - `dependencies`: Completed artifacts to read for context
      - Read any completed dependency files for context
      - Create the artifact file using `template` as the structure
      - Apply `context` and `rules` as constraints - but do NOT copy them into the file
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until all `applyRequires` artifacts are complete**
      - After creating each artifact, re-run `openspec status --change "<name>" --json`
      - Check if every artifact ID in `applyRequires` has `status: "done"` in the artifacts array
      - Stop when all `applyRequires` artifacts are done

   c. **If an artifact requires user input** (unclear context):
      - Use **AskUserQuestion tool** to clarify
      - Then continue with creation

5. **Show final status**
   ```bash
   openspec status --change "<name>"
   ```

6. **Commit, design-review, and merge the proposal to `main`**

   The proposal is NOT done when the artifacts are written — it must pass a roborev design review and merge to `main`, mirroring the "review passes cleanly before merge" gate that governs code. Do NOT stop here and tell the user to run `/opsx:apply`.

   a. **Commit the artifacts** as a single commit on the `proposal/<name>` branch. The `chore` type is required so the proposal produces no release version bump:
      ```bash
      git add "openspec/changes/<name>"
      git commit -m "chore(openspec): propose <name>"
      ```
   b. **Run a roborev design review** on the branch via the `/roborev-design-review-branch` skill. Resolve every finding until the review passes cleanly.
   c. **Present the clean review result to the human and WAIT for explicit approval.** A clean review alone does NOT authorize the merge.
   d. **Only after approval, fast-forward merge to `main` and delete the branch.** If `main` advanced since the branch was cut, rebase the proposal branch onto `main` first:
      ```bash
      git checkout main
      git merge --ff-only "proposal/<name>"
      git branch -d "proposal/<name>"
      ```

**Output**

After the proposal has merged to `main`, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- Confirmation that the design review passed and the proposal was fast-forwarded to `main`
- Next step: "Run `/opsx-apply-wt <name>` from `main` to create the implementation worktree, then `/opsx:apply` inside it."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openspec instructions` for each artifact type
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**Guardrails**
- Create ALL artifacts needed for implementation (as defined by schema's `apply.requires`)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
- Work on a `proposal/<change-name>` branch only. Do NOT create a `feature/`|`bugfix/` branch and do NOT prompt for the change type — both belong to `/opsx-apply-wt`
- The proposal commit MUST use the `chore` type (`chore(openspec): propose <name>`)
- Do NOT merge the proposal to `main` while design-review findings remain open, and do NOT merge without explicit human approval

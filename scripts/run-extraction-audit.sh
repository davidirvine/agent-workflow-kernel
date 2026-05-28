#!/usr/bin/env bash
#
# run-extraction-audit.sh — the one-time chassis-purity extraction audit (D6,
# slice-2 gate (c)). Applies synth-d's FULL subtractive param vocabulary
# (committed in openspec/changes/import-chassis-preset/audit/
# synthd-instrument-params.json) as the forbidden-name set, then scans every
# preset's chassis source for any literal occurrence.
#
# This audit is distinct from the traveling chassis-purity test (task 9.1):
# - The traveling test derives its forbidden set from the CURRENT schema
#   (`keys(PARAM_SCHEMA) − {universal engine params}`). On a minimal reference
#   instrument it is "vacuous-but-correct" — it forbids the reference names
#   from chassis files, which IS the right invariant, but it cannot see
#   residual donor-schema literals like `cutoff`/`osc1Level` that are no longer
#   in the schema.
# - THIS audit hard-codes synth-d's full vocabulary. It runs once during
#   slice 2 to catch residual donor names left behind by the chassis copy,
#   then is preserved (with its run output) in the change directory as
#   archived evidence.
#
# Allowlist: documented in the fixture's `allowlist` array as
# `{ "name": "...", "rationale": "..." }` entries. Common-word collisions
# (e.g. a chassis identifier that happens to equal a forbidden name without
# being one) belong here.

set -euo pipefail

cd "$(dirname "$0")/.."

FIXTURE="openspec/changes/import-chassis-preset/audit/synthd-instrument-params.json"
if [ ! -f "$FIXTURE" ]; then
  echo "FATAL: $FIXTURE not found (run task 8.1 first)" >&2
  exit 1
fi

# Curated preset list — same shape as check-identity-leak.sh.
PRESETS=(
  "presets/svelte-faust-synth"
)

# Build the forbidden name list and the allowlist from the fixture.
forbidden_names=()
while IFS= read -r line; do forbidden_names+=("$line"); done < <(jq -r '.forbiddenNames[]' "$FIXTURE")

allowlist_names=()
while IFS= read -r line; do allowlist_names+=("$line"); done < <(jq -r '.allowlist[]?.name' "$FIXTURE")

is_allowlisted() {
  local target="$1"
  # ${arr[@]:-} guards against bash-3.2 + `set -u` unbound-variable error on
  # an empty array (the audit's allowlist is empty by default).
  for allowed in "${allowlist_names[@]:-}"; do
    if [ -n "$allowed" ] && [ "$target" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

# Per-preset, find Tier-3 instrument files to EXCLUDE from the chassis scan.
# These are the files where instrument-side literals legitimately live.
instrument_files() {
  local preset="$1"
  printf '%s\n' \
    "$preset/src/param-schema.js" \
    "$preset/src/components/InstrumentPanels.svelte"
  # The instrument-side FAUST DSP is also excluded from the chassis scan.
  if [ -d "$preset/faust" ]; then
    find "$preset/faust" -type f -name '*.dsp'
  fi
}

# Strip JS line/block and HTML/Svelte comments so only code is scanned —
# narrative comments correctly referencing the donor are NOT a leak.
strip_comments() {
  awk '
    BEGIN { in_block = 0; in_html = 0 }
    {
      line = $0
      # block comment handling: /* ... */ (single or multi-line)
      while (1) {
        if (in_block) {
          end = index(line, "*/")
          if (end == 0) { line = ""; break }
          line = substr(line, end + 2)
          in_block = 0
          continue
        }
        if (in_html) {
          end = index(line, "-->")
          if (end == 0) { line = ""; break }
          line = substr(line, end + 3)
          in_html = 0
          continue
        }
        start_block = index(line, "/*")
        start_html = index(line, "<!--")
        if (start_block > 0 && (start_html == 0 || start_block < start_html)) {
          rest = substr(line, start_block + 2)
          line = substr(line, 1, start_block - 1)
          end = index(rest, "*/")
          if (end == 0) { in_block = 1; break }
          line = line " " substr(rest, end + 2)
        } else if (start_html > 0) {
          rest = substr(line, start_html + 4)
          line = substr(line, 1, start_html - 1)
          end = index(rest, "-->")
          if (end == 0) { in_html = 1; break }
          line = line " " substr(rest, end + 3)
        } else break
      }
      # JS line comments: //... (but keep :// in URLs)
      sub(/([^:])\/\/[^\n]*$/, "\\1", line)
      sub(/^\/\/[^\n]*$/, "", line)
      print line
    }
  ' "$1"
}

# Collect chassis files for a preset: every .js/.svelte/.css under src/,
# minus the explicit instrument-files list, minus *.test.js (tests can
# legitimately reference these names for negative assertions).
chassis_files_for() {
  local preset="$1"
  local instr_list
  instr_list=$(instrument_files "$preset" | sort -u)

  find "$preset/src" -type f \( -name '*.js' -o -name '*.svelte' -o -name '*.css' \) |
    grep -vE '\.test\.js$' |
    grep -vE '\.test\.harness\.svelte$' |
    while IFS= read -r f; do
      if ! grep -Fxq "$f" <<<"$instr_list"; then
        echo "$f"
      fi
    done
}

# ─── Run the audit ───────────────────────────────────────────────────────────

violations=0
scanned_files=0

print_violation() {
  echo "VIOLATION: $1" >&2
  violations=$((violations + 1))
}

for preset in "${PRESETS[@]}"; do
  echo "Scanning preset: $preset"
  while IFS= read -r f; do
    scanned_files=$((scanned_files + 1))
    # Read the stripped (comments-removed) content.
    stripped=$(strip_comments "$f")
    found_for_file=()
    for name in "${forbidden_names[@]}"; do
      if is_allowlisted "$name"; then
        continue
      fi
      # Word-boundary match against stripped content.
      if echo "$stripped" | grep -qE "\\b${name}\\b"; then
        found_for_file+=("$name")
      fi
    done
    if [ "${#found_for_file[@]}" -gt 0 ]; then
      joined=$(
        IFS=,
        echo "${found_for_file[*]}"
      )
      print_violation "instrument literal(s) [$joined] found in $f"
    fi
  done < <(chassis_files_for "$preset")
done

if [ "$violations" -eq 0 ]; then
  echo ""
  echo "run-extraction-audit: PASS ($scanned_files chassis file(s) scanned across ${#PRESETS[@]} preset(s); ${#forbidden_names[@]} forbidden name(s); ${#allowlist_names[@]} allowlisted)"
  exit 0
else
  echo ""
  echo "run-extraction-audit: FAIL ($violations violation(s); $scanned_files file(s) scanned)" >&2
  exit 1
fi

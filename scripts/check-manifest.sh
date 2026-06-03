#!/usr/bin/env bash
#
# check-manifest.sh — validate kernel-manifest.json against the on-disk tree
# and the tier: frontmatter on every spec under openspec/specs/.
#
# Three checks (task 7.2):
#   1. Every spec listed in the manifest agrees with its tier: frontmatter
#      (kernel-group → tier:kernel; stack-group → tier:stack).
#   2. Every kernel-/stack-tier spec under openspec/specs/ appears in the
#      manifest (no spec quietly drops out of sync coverage).
#   3. Every non-spec path declared in the manifest exists in the repo
#      (globs are expanded via shell; literal paths are stat'd).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

MANIFEST="kernel-manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "check-manifest: $MANIFEST not found" >&2
  exit 1
fi

# Shared manifest primitives (design D6): expand_entry + the manifest_* helpers.
# shellcheck source=scripts/lib/manifest.sh
. "$SCRIPT_DIR/lib/manifest.sh"

violations=0
print_violation() {
  echo "VIOLATION: $1" >&2
  violations=$((violations + 1))
}

# Read the tier from a spec file's YAML frontmatter. Returns the value of the
# `tier:` key, or empty string if absent/malformed.
spec_tier() {
  local spec="$1"
  awk '
    BEGIN { in_fm = 0 }
    NR == 1 && /^---$/ { in_fm = 1; next }
    in_fm && /^---$/ { exit }
    in_fm && /^tier:/ {
      sub(/^tier:[[:space:]]*/, "")
      gsub(/^["\047]|["\047]$/, "")
      print
      exit
    }
  ' "$spec"
}

# ─── Check 1+2: tier-frontmatter ↔ manifest agreement ──────────────────────

# Manifest spec lists, per group.
kernel_specs=()
while IFS= read -r line; do kernel_specs+=("$line"); done < <(manifest_kernel_specs)
stack_specs=()
while IFS= read -r line; do stack_specs+=("$line"); done < <(jq -r '[.stack[].specs[]] | .[]' "$MANIFEST")

# All specs under openspec/specs/ that have any tier: frontmatter (kernel or
# stack tiers — instrument tier wouldn't be in this kernel repo at all).
all_specs_on_disk=()
while IFS= read -r line; do all_specs_on_disk+=("$line"); done < <(find openspec/specs -type f -name 'spec.md' | sort)

# 1a: every kernel-group spec has tier:kernel.
for spec in "${kernel_specs[@]}"; do
  if [ ! -f "$spec" ]; then
    print_violation "manifest declares kernel spec '$spec' but it does not exist on disk"
    continue
  fi
  tier=$(spec_tier "$spec")
  if [ "$tier" != "kernel" ]; then
    print_violation "manifest declares '$spec' under kernel group but its tier frontmatter is '${tier:-<missing>}'"
  fi
done

# 1b: every stack-group spec has tier:stack.
for spec in "${stack_specs[@]}"; do
  if [ ! -f "$spec" ]; then
    print_violation "manifest declares stack spec '$spec' but it does not exist on disk"
    continue
  fi
  tier=$(spec_tier "$spec")
  if [ "$tier" != "stack" ]; then
    print_violation "manifest declares '$spec' under stack group but its tier frontmatter is '${tier:-<missing>}'"
  fi
done

# 2: every kernel-/stack-tier spec on disk appears in the manifest.
all_manifest_specs=("${kernel_specs[@]}" "${stack_specs[@]}")
in_manifest() {
  local target="$1"
  for s in "${all_manifest_specs[@]}"; do
    if [ "$s" = "$target" ]; then
      return 0
    fi
  done
  return 1
}

for spec in "${all_specs_on_disk[@]}"; do
  tier=$(spec_tier "$spec")
  case "$tier" in
  kernel | stack)
    if ! in_manifest "$spec"; then
      print_violation "spec '$spec' has tier:$tier but is missing from kernel-manifest.json"
    fi
    ;;
  instrument)
    # Instrument-tier specs are app-local; they do not appear in the
    # manifest. Nothing to assert here.
    ;;
  "")
    print_violation "spec '$spec' is missing a tier: frontmatter"
    ;;
  *)
    print_violation "spec '$spec' has unrecognized tier '$tier' (must be kernel, stack, or instrument)"
    ;;
  esac
done

# ─── Check 3: non-spec paths exist ────────────────────────────────────────

kernel_paths=()
while IFS= read -r line; do kernel_paths+=("$line"); done < <(manifest_kernel_paths)
stack_paths=()
while IFS= read -r line; do stack_paths+=("$line"); done < <(jq -r '[.stack[].paths[]] | .[]' "$MANIFEST")

check_path_exists() {
  local p="$1" group="$2"
  # Split on whether $p is a literal path or a glob. Literal paths are stat'd
  # directly (the safest path — no expansion ambiguity for filenames with
  # spaces or glob metacharacters in their name). Glob patterns expand under
  # `shopt -s nullglob` so a zero-match glob produces an empty array, which
  # the size check below treats as missing.
  if [[ "$p" != *[*?[]* ]]; then
    if [ ! -e "$p" ]; then
      print_violation "manifest $group path '$p' does not exist in the repo"
    fi
    return
  fi
  # Glob path: enable nullglob in a subshell so zero matches yield an empty
  # array rather than the unexpanded literal, then word-split.
  shopt -s nullglob
  # shellcheck disable=SC2206
  # (intentional: $p IS a glob pattern; word-splitting on the unquoted
  # expansion is precisely what enables the wildcard match)
  local matches=($p)
  shopt -u nullglob
  if [ "${#matches[@]}" -eq 0 ]; then
    print_violation "manifest $group glob '$p' matched nothing in the repo"
  fi
}

for p in "${kernel_paths[@]}"; do
  check_path_exists "$p" "kernel"
done
for p in "${stack_paths[@]}"; do
  check_path_exists "$p" "stack"
done

# ─── Check 4+5: generation fields (instrumentStubs, appTemplates, exclude) ──
#
# expand_entry (the shared primitive that expands a glob-based manifest entry
# into its on-disk file set) and the manifest_* query helpers come from
# scripts/lib/manifest.sh, sourced above (design D6).

# Check 4: per-preset instrumentStubs + appTemplates. Each field maps a target
# path (relative to the generated app root) to a committed source inside the
# preset. Assert every source exists, and no target collides with the preset's
# own (flattened, glob-expanded) paths — a collision would mean the generator
# writes a stub/template then overwrites it with a preset file (design D3/D14).
preset_keys=()
while IFS= read -r line; do preset_keys+=("$line"); done < <(manifest_preset_keys)

for key in "${preset_keys[@]}"; do
  preset_path_entries=()
  while IFS= read -r line; do
    preset_path_entries+=("$line")
  done < <(manifest_preset_paths "$key")

  # Flattened (preset-prefix-stripped), glob-expanded app-relative path set.
  preset_files_flat=""
  if [ "${#preset_path_entries[@]}" -gt 0 ]; then
    preset_files_flat=$(
      for p in "${preset_path_entries[@]}"; do expand_entry "$p"; done | sed "s#^${key}/##" | sort -u
    )
  fi

  for field in instrumentStubs appTemplates; do
    while IFS=$'\t' read -r target source; do
      [ -z "$target" ] && continue
      src_full="$key/$source"
      if [ ! -e "$src_full" ]; then
        print_violation "$field source '$src_full' (preset '$key', target '$target') does not exist"
      fi
      if printf '%s\n' "$preset_files_flat" | grep -Fxq -- "$target"; then
        print_violation "$field target '$target' (preset '$key') also appears in the preset's paths — the generator would write it then overwrite it"
      fi
    done < <(jq -r --arg k "$key" --arg f "$field" '.stack[$k][$f] // {} | to_entries[] | "\(.key)\t\(.value)"' "$MANIFEST")
  done
done

# Check 5: every kernel.excludeFromGenerate entry resolves (as a literal path or
# glob, from the repo root) to at least one file that is also in the expanded
# kernel.paths set. A typo that matches nothing — or matches files outside
# kernel.paths — is rejected so an exclusion cannot silently become a no-op.
kernel_files=""
if [ "${#kernel_paths[@]}" -gt 0 ]; then
  kernel_files=$(
    for p in "${kernel_paths[@]}"; do expand_entry "$p"; done | sort -u
  )
fi

exclude_entries=()
while IFS= read -r line; do
  exclude_entries+=("$line")
done < <(manifest_kernel_excludes)

for e in "${exclude_entries[@]}"; do
  e_files=$(expand_entry "$e" | sort -u)
  if [ -z "$e_files" ]; then
    print_violation "excludeFromGenerate entry '$e' matches no file on disk (so it cannot be in the expanded kernel.paths set)"
    continue
  fi
  matched=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if printf '%s\n' "$kernel_files" | grep -Fxq -- "$f"; then
      matched=1
      break
    fi
  done <<<"$e_files"
  if [ "$matched" -eq 0 ]; then
    print_violation "excludeFromGenerate entry '$e' resolves to files, but none are in the expanded kernel.paths set"
  fi
done

# ─── Check 6: appStateFiles are literal, non-colliding sync-state paths ──────
#
# (design D8 / preset-portability "appStateFiles" requirement) Each entry is a
# file sync-kernel.sh (and new-app.sh) writes into the consuming app to record
# its sync state. They originate in the app from sync — NOT copied from the
# kernel — so each must be a non-empty literal path that does not collide with
# anything the kernel/preset copies; otherwise sync would treat its own state
# file as a synced (clobber-protected) file.
app_state_files=()
while IFS= read -r line; do
  [ -n "$line" ] && app_state_files+=("$line")
done < <(manifest_app_state_files)

if [ "${#app_state_files[@]}" -eq 0 ]; then
  print_violation "kernel.appStateFiles is absent or empty (must declare .kernel-version and .kernel-sync-hashes.json)"
else
  # The two entries the spec mandates are present.
  for required in ".kernel-version" ".kernel-sync-hashes.json"; do
    found=0
    for asf in "${app_state_files[@]}"; do
      [ "$asf" = "$required" ] && found=1 && break
    done
    [ "$found" -eq 1 ] || print_violation "kernel.appStateFiles is missing the required entry '$required'"
  done

  # Union of every COPIED target path: expanded kernel.paths (kernel_files, from
  # Check 5), each preset's flattened expanded paths, and each preset's
  # instrumentStubs / appTemplates target keys.
  copied_targets="$kernel_files"
  for key in "${preset_keys[@]}"; do
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        copied_targets+=$'\n'"${f#"$key"/}"
      done < <(expand_entry "$entry")
    done < <(manifest_preset_paths "$key")
    while IFS=$'\t' read -r target _source; do
      [ -n "$target" ] && copied_targets+=$'\n'"$target"
    done < <(manifest_preset_instrument_stubs "$key")
    while IFS=$'\t' read -r target _source; do
      [ -n "$target" ] && copied_targets+=$'\n'"$target"
    done < <(manifest_preset_app_templates "$key")
  done

  for asf in "${app_state_files[@]}"; do
    # Literal path: reject glob metacharacters (these are written verbatim).
    case "$asf" in
    *[*?[]*) print_violation "appStateFiles entry '$asf' must be a literal path (no glob metacharacters)" ;;
    esac
    if printf '%s\n' "$copied_targets" | grep -Fxq -- "$asf"; then
      print_violation "appStateFiles entry '$asf' collides with a kernel/preset copied path — sync would treat its own state file as a synced file"
    fi
  done
fi

# ─── Result ────────────────────────────────────────────────────────────────

total_specs=$((${#kernel_specs[@]} + ${#stack_specs[@]}))
total_paths=$((${#kernel_paths[@]} + ${#stack_paths[@]}))

if [ "$violations" -eq 0 ]; then
  echo "check-manifest: clean ($total_specs spec(s), $total_paths path(s) validated)"
  exit 0
else
  echo "check-manifest: $violations violation(s)" >&2
  exit 1
fi

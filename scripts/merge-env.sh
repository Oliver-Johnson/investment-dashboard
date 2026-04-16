#!/usr/bin/env bash
set -euo pipefail

# Merges an existing .env with a .env.example template.
# Preserves section comments and ordering from the template,
# fills in existing values, and appends any extra keys.

EXISTING=".env"
TEMPLATE=".env.example"
OUTPUT=".env.new"

usage() {
  echo "Usage: $0 [--existing PATH] [--template PATH] [--output PATH]"
  echo "  --existing  Path to your current .env        (default: .env)"
  echo "  --template  Path to .env.example template    (default: .env.example)"
  echo "  --output    Path to write merged result      (default: .env.new)"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --existing) EXISTING="$2"; shift 2 ;;
    --template) TEMPLATE="$2"; shift 2 ;;
    --output)   OUTPUT="$2";   shift 2 ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

[[ -f "$EXISTING" ]] || { echo "ERROR: existing .env not found: $EXISTING"; exit 1; }
[[ -f "$TEMPLATE" ]] || { echo "ERROR: template not found: $TEMPLATE";      exit 1; }

# Strip \r (Windows line endings) from a string
strip_cr() { printf '%s' "${1//$'\r'/}"; }

# Load all KEY=value pairs from existing .env into an associative array.
# Only non-comment, non-blank lines are parsed; split on FIRST = only.
declare -A EXISTING_VALS
declare -a EXISTING_KEYS  # ordered list of keys seen in existing file

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line=$(strip_cr "$raw_line")
  # Skip blanks and comments
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  # Extract key (everything before first =)
  key="${line%%=*}"
  val="${line#*=}"
  # Skip if key looks invalid (contains spaces)
  [[ "$key" =~ [[:space:]] ]] && continue
  EXISTING_VALS["$key"]="$val"
  EXISTING_KEYS+=("$key")
done < "$EXISTING"

# Track which template keys we've seen (to identify extras at the end)
declare -A TEMPLATE_KEYS

copied=0
placeholders=0
declare -a placeholder_keys

# Process template line-by-line, writing to output
> "$OUTPUT"

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line=$(strip_cr "$raw_line")

  # Blank lines and comment lines pass through unchanged
  if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
    printf '%s\n' "$line" >> "$OUTPUT"
    continue
  fi

  # Parse KEY=value from template line
  key="${line%%=*}"
  if [[ -z "$key" || "$key" =~ [[:space:]] ]]; then
    # Not a valid KEY=value line — pass through
    printf '%s\n' "$line" >> "$OUTPUT"
    continue
  fi

  TEMPLATE_KEYS["$key"]=1

  if [[ -v EXISTING_VALS["$key"] ]]; then
    printf '%s=%s\n' "$key" "${EXISTING_VALS[$key]}" >> "$OUTPUT"
    (( copied++ )) || true
  else
    printf '%s\n' "$line" >> "$OUTPUT"
    (( placeholders++ )) || true
    placeholder_keys+=("$key")
  fi
done < "$TEMPLATE"

# Append extra keys from existing .env that weren't in the template
extras=0
extra_lines=()
declare -A _seen_extra
for key in "${EXISTING_KEYS[@]}"; do
  [[ -v TEMPLATE_KEYS["$key"] ]] && continue
  # Avoid duplicates if the existing file repeats a key
  [[ -v _seen_extra["$key"] ]] && continue
  _seen_extra["$key"]=1
  extra_lines+=("${key}=${EXISTING_VALS[$key]}")
  (( extras++ )) || true
done

if [[ ${#extra_lines[@]} -gt 0 ]]; then
  printf '\n# === Extras preserved from old .env (not in template) ===\n' >> "$OUTPUT"
  for entry in "${extra_lines[@]}"; do
    printf '%s\n' "$entry" >> "$OUTPUT"
  done
fi

# Summary
echo ""
echo "Done → $OUTPUT"
echo "  Copied   : $copied existing value(s)"
echo "  Unchanged: $placeholders placeholder(s) needing attention"
if [[ $placeholders -gt 0 ]]; then
  echo "             $(IFS=', '; echo "${placeholder_keys[*]}")"
fi
echo "  Extras   : $extras key(s) from old .env appended at bottom"
echo ""
echo "Review the new file, then when happy:"
echo "  mv $OUTPUT .env && docker compose up -d --build"

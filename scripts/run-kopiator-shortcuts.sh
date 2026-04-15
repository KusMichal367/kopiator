#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_script="$repo_root/scripts/run-kopiator.sh"

source_path="${*:-}"
if [ -z "$source_path" ] && [ ! -t 0 ]; then
    IFS= read -r source_path || true
fi

if [ -z "$source_path" ] && command -v pbpaste >/dev/null 2>&1; then
    source_path="$(pbpaste)"
fi

source_path="$(printf '%s' "$source_path" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
source_path="${source_path%\"}"
source_path="${source_path#\"}"
source_path="${source_path%\'}"
source_path="${source_path#\'}"

if [[ "$source_path" == file://* ]]; then
    source_path="${source_path#file://}"
    source_path="$(printf '%b' "${source_path//%/\\x}")"
fi

if [[ "$source_path" == "~" ]]; then
    source_path="$HOME"
elif [[ "$source_path" == ~/* ]]; then
    source_path="$HOME/${source_path#~/}"
fi

if [ -z "$source_path" ]; then
    echo "Brak sciezki katalogu. Skopiuj adres folderu do schowka albo przekaz go jako wejscie skrotu." >&2
    exit 1
fi

mode="${KOPIATOR_MODE:-report}"
structure_files="${KOPIATOR_STRUCTURE_FILES:-report}"
output_dir="${KOPIATOR_OUTPUT_DIR:-$HOME/Downloads}"
exclude_files="${KOPIATOR_EXCLUDE_FILES:-}"
exclude_folders="${KOPIATOR_EXCLUDE_FOLDERS:-}"
exclude_extensions="${KOPIATOR_EXCLUDE_EXTENSIONS:-}"

"$run_script" \
    --source "$source_path" \
    --mode "$mode" \
    --structure-files "$structure_files" \
    --output-dir "$output_dir" \
    --exclude-files "$exclude_files" \
    --exclude-folders "$exclude_folders" \
    --exclude-extensions "$exclude_extensions"

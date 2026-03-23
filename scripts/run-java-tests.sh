#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="$repo_root/out/tests"

mkdir -p "$build_dir"

source_files=()
while IFS= read -r file; do
    source_files+=("$file")
done < <(find "$repo_root/java-console/src" "$repo_root/java-console/test" -name "*.java" -print | sort)

test_files=()
while IFS= read -r file; do
    test_files+=("$file")
done < <(find "$repo_root/java-console/test" -name "*Test.java" -print | sort)

if [ "${#source_files[@]}" -eq 0 ]; then
    echo "Brak plikow Java do kompilacji." >&2
    exit 1
fi

if [ "${#test_files[@]}" -eq 0 ]; then
    echo "Brak testow jednostkowych do uruchomienia." >&2
    exit 1
fi

javac -d "$build_dir" "${source_files[@]}"

for test_file in "${test_files[@]}"; do
    test_class="$(basename "$test_file" .java)"
    java -cp "$build_dir" "$test_class"
done

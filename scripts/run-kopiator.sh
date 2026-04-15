#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="$repo_root/out/app"
source_file="$repo_root/java-console/src/ContextBuilderApp.java"

if ! command -v javac >/dev/null 2>&1; then
    echo "Nie znaleziono javac. Zainstaluj JDK, aby uruchomic Kopiator." >&2
    exit 1
fi

if ! command -v java >/dev/null 2>&1; then
    echo "Nie znaleziono java. Zainstaluj JDK, aby uruchomic Kopiator." >&2
    exit 1
fi

mkdir -p "$build_dir"
javac -d "$build_dir" "$source_file"
java -cp "$build_dir" ContextBuilderApp "$@"

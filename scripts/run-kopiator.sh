#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="$repo_root/out/app"
source_file="$repo_root/java-console/src/ContextBuilderApp.java"

java_home="${JAVA_HOME:-}"
if [ -z "$java_home" ] && [ -x /usr/libexec/java_home ]; then
    java_home="$(/usr/libexec/java_home 2>/dev/null || true)"
fi

if [ -n "$java_home" ] && [ -x "$java_home/bin/javac" ] && [ -x "$java_home/bin/java" ]; then
    javac_cmd="$java_home/bin/javac"
    java_cmd="$java_home/bin/java"
else
    javac_cmd="$(command -v javac || true)"
    java_cmd="$(command -v java || true)"
fi

if [ -z "$javac_cmd" ]; then
    echo "Nie znaleziono javac. Zainstaluj JDK, aby uruchomic Kopiator." >&2
    exit 1
fi

if [ -z "$java_cmd" ]; then
    echo "Nie znaleziono java. Zainstaluj JDK, aby uruchomic Kopiator." >&2
    exit 1
fi

mkdir -p "$build_dir"
"$javac_cmd" -d "$build_dir" "$source_file"
"$java_cmd" -cp "$build_dir" ContextBuilderApp "$@"

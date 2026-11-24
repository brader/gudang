#!/bin/bash
# Pakai: tools/rilis.sh 1.5 "pesan rilis"  → set VERSION, perbarui ?v= di script tag, commit, tag, push.
set -e
cd "$(dirname "$0")/.."
V="$1"; MSG="$2"
[[ "$V" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo "Versi tidak valid: $V"; exit 1; }
[ -n "$MSG" ] || { echo "Pesan rilis wajib diisi"; exit 1; }
echo "$V" > VERSION
sed -i.bak -E "s/\.js\?v=[0-9.]+\"/.js?v=$V\"/g" index.html scan/index.html && rm -f index.html.bak scan/index.html.bak
git add -A
git commit -m "v$V: $MSG" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git tag "v$V"
git push && git push --tags
git archive --format=zip -o rakstok-upload.zip HEAD

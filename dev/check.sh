#!/usr/bin/env bash
# 發布前檢查：script 語法、發布檔不含測試用東西、外部資源只來自允許的來源
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=src/index.html
tmp=$(mktemp --suffix=.js)
trap 'rm -f "$tmp"' EXIT
n=$(grep -c '<script' "$SRC" || true)
[ "$n" = 1 ] || { echo "FAIL 預期只有一個 <script>，實際 $n"; exit 1; }
sed -n '/<script>/,/<\/script>/p' "$SRC" | sed '1d;$d' > "$tmp"
node --check "$tmp" && echo "ok   node --check"
if grep -nE '__mock|mock-claude|dev/|window\.print|\balert\(|\bconfirm\(' "$SRC"; then echo "FAIL 發布檔含測試或禁用的呼叫"; exit 1; fi
echo "ok   沒有 mock、dev、print、alert、confirm"
bad=$(grep -oE '(src|href)="https?://[^"]+"' "$SRC" | grep -vE '"https://(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/npm|unpkg\.com)(/|")' || true)
[ -z "$bad" ] || { echo "FAIL 不允許的外部資源：$bad"; exit 1; }
echo "ok   外部資源只來自允許的來源"

#!/usr/bin/env bash
# 全部檢查：發布檢查、日期測試、資料情境測試、e2e 流程與截圖
set -euo pipefail
cd "$(dirname "$0")/.."
dev/check.sh
node dev/date-test.js
node dev/data-test.js
node dev/render-test.js
node dev/weight-test.js
node dev/e2e.js "$@"

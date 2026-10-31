#!/usr/bin/env bash
# 全部檢查：發布檢查、日期測試、資料情境測試、e2e 流程與截圖
set -euo pipefail
cd "$(dirname "$0")/.."
dev/check.sh
node dev/date-test.js
node dev/heartbeat-test.js
node dev/med-test.js
node dev/merge-test.js
node dev/sample-mock-test.js
node dev/data-test.js
node dev/render-test.js
node dev/weight-test.js
node dev/review6-test.js
node dev/review7-test.js
node dev/remind-test.js "$@"
node dev/remind-ref-test.js
node dev/prompt-test.js
node dev/med-page-test.js "$@"
node dev/review-b-test.js
node dev/e2e.js "$@"

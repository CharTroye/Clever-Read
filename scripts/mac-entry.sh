#!/bin/bash
set -u
APP_DIRECTORY="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
NODE_EXECUTABLE=""
for candidate in "$(command -v node 2>/dev/null || true)" /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
  if [ -x "$candidate" ] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
    NODE_EXECUTABLE="$candidate"
    break
  fi
done
if [ -z "$NODE_EXECUTABLE" ]; then
  echo '需要 Node.js 22 或更高版本。请安装 Node.js 后重新双击启动。'
  result=1
else
  cd -- "$APP_DIRECTORY" || exit 1
  "$NODE_EXECUTABLE" "$APP_DIRECTORY/scripts/launch.mjs" "$@"
  result=$?
fi
if [ "$result" -ne 0 ] && [ -t 0 ]; then
  read -r -p '按回车关闭窗口…' _
fi
exit "$result"

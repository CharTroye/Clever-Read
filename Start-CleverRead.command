#!/bin/bash
APP_DIRECTORY="$(cd -- "$(dirname -- "$0")" && pwd -P)"
exec /bin/bash "$APP_DIRECTORY/scripts/mac-entry.sh" "$@"

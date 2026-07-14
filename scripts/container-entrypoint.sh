#!/bin/sh
set -eu

# Bind-mounted Unraid appdata directories are commonly created as `nobody:users`.
# Start only the bootstrap phase as root so the final application process can
# remain the dedicated, non-root `recipes` user.
if [ "$(id -u)" = "0" ]; then
  data_dir="${DATA_DIR:-/data}"
  mkdir -p "$data_dir"
  chown -R recipes:recipes "$data_dir"
  exec gosu recipes "$@"
fi

exec "$@"

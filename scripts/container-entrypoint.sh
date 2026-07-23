#!/bin/sh
set -eu

# Bind-mounted Unraid appdata directories are commonly created as `nobody:users`.
# Start only the bootstrap phase as root so the final application process can
# remain the dedicated, non-root `recipes` user.
if [ "$(id -u)" = "0" ]; then
  data_dir="${DATA_DIR:-/data}"
  mkdir -p "$data_dir"
  legacy_database="$data_dir/our-recipes.db"
  bord_database="$data_dir/bord.db"
  configured_database="${DATABASE_URL:-$bord_database}"
  if [ "$configured_database" = "$legacy_database" ]; then
    if [ -e "$legacy_database" ] && [ -e "$bord_database" ]; then
      echo "Both $legacy_database and $bord_database exist; refusing an ambiguous migration." >&2
      exit 1
    fi
    if [ -e "$legacy_database" ]; then
      mv "$legacy_database" "$bord_database"
      for suffix in -wal -shm -journal; do
        if [ -e "$legacy_database$suffix" ]; then mv "$legacy_database$suffix" "$bord_database$suffix"; fi
      done
    fi
    configured_database="$bord_database"
  fi
  export DATABASE_URL="$configured_database"
  chown -R recipes:recipes "$data_dir"
  exec gosu recipes "$@"
fi

exec "$@"

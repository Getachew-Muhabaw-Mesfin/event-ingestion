#!/usr/bin/env bash
set -euo pipefail

echo "Prisma action:"
echo "1) Create + apply migration locally"
echo "2) Deploy existing migrations (production/staging/local fresh DB)"
read -rp "Choose 1 or 2: " action

case "$action" in
  1)
    read -rp "Migration name: " migration_name

    if [ -z "${migration_name// }" ]; then
      echo "Migration name is required."
      exit 1
    fi

    pnpm exec prisma migrate dev --name "$migration_name"
    pnpm exec prisma generate
    ;;

  2)
    pnpm exec prisma migrate deploy
    pnpm exec prisma generate
    ;;

  *)
    echo "Invalid choice."
    exit 1
    ;;
esac
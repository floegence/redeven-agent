#!/usr/bin/env bash
set -euo pipefail

# Publish a tagged commit to the dedicated Cloudflare production branch.
# Cloudflare Workers Builds should watch this branch instead of main.

usage() {
    cat <<USAGE
Usage:
  ./scripts/publish_install_worker_release_branch.sh <tag> [target-branch]

Examples:
  ./scripts/publish_install_worker_release_branch.sh v0.1.12
  ./scripts/publish_install_worker_release_branch.sh v0.1.12 release
USAGE
}

TAG="${1:-}"
TARGET_BRANCH="${2:-release}"

if [[ -z "$TAG" ]]; then
    usage
    exit 1
fi

if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    echo "[ERROR] Invalid tag format: $TAG"
    echo "[ERROR] Expected semver tag like v1.2.3"
    exit 1
fi

git fetch origin --tags --prune

if ! git rev-parse -q --verify "${TAG}^{commit}" >/dev/null; then
    echo "[ERROR] Tag not found: $TAG"
    exit 1
fi

COMMIT_SHA="$(git rev-list -n1 "$TAG")"

REQUIRED_FILES=(
    "scripts/install.sh"
    "deployment/cloudflare/workers/install-agent/generate-worker.js"
    "deployment/cloudflare/workers/install-agent/wrangler.toml"
)

for required in "${REQUIRED_FILES[@]}"; do
    if ! git cat-file -e "${COMMIT_SHA}:${required}" 2>/dev/null; then
        echo "[ERROR] Required file missing in ${TAG}: ${required}"
        exit 1
    fi
done

echo "[INFO] Publishing tag ${TAG} (${COMMIT_SHA}) to branch ${TARGET_BRANCH}"
git push origin "${COMMIT_SHA}:refs/heads/${TARGET_BRANCH}" --force

echo "[INFO] Done"
echo "[INFO] Cloudflare Workers Builds should now deploy branch ${TARGET_BRANCH}"

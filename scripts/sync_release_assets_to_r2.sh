#!/usr/bin/env bash
set -euo pipefail

# Sync GitHub release assets to Cloudflare R2 package mirror.

log_info() {
  printf '[INFO] %s\n' "$1"
}

log_error() {
  printf '[ERROR] %s\n' "$1" >&2
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "Required command not found: $cmd"
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    log_error "Required environment variable is missing: $name"
    exit 1
  fi
}

validate_release_tag() {
  local value="$1"
  if [[ ! "$value" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    log_error "Invalid release tag: $value"
    log_error 'Expected tag format like v1.2.3'
    exit 1
  fi
}

summarize() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo '## Release Package Mirror Result'
      echo ''
      echo "- tag: \`$RELEASE_TAG\`"
      echo "- package bucket: \`$R2_PACKAGE_BUCKET\`"
      echo "- package prefix: \`$PACKAGE_PREFIX\`"
      echo "- source: \`$RELEASE_REPO\`"
    } >>"$GITHUB_STEP_SUMMARY"
  fi
}

require_cmd gh
require_cmd aws
require_cmd cosign
require_cmd sha256sum
require_cmd mktemp

require_env GH_TOKEN
require_env RELEASE_TAG
require_env RELEASE_REPO
require_env R2_ENDPOINT
require_env AWS_ACCESS_KEY_ID
require_env AWS_SECRET_ACCESS_KEY
require_env R2_PACKAGE_BUCKET

PACKAGE_PREFIX="${R2_PACKAGE_PREFIX:-agent-install-pkg}"

validate_release_tag "$RELEASE_TAG"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

ASSET_DIR="$WORK_DIR/assets"
VERIFY_DIR="$WORK_DIR/verify"
mkdir -p "$ASSET_DIR" "$VERIFY_DIR"

EXPECTED_FILES=(
  'redeven_linux_amd64.tar.gz'
  'redeven_linux_arm64.tar.gz'
  'redeven_darwin_amd64.tar.gz'
  'redeven_darwin_arm64.tar.gz'
  'SHA256SUMS'
  'SHA256SUMS.sig'
  'SHA256SUMS.pem'
  'knowledge_bundle.manifest.json'
  'knowledge_bundle.sha256'
)

log_info 'Downloading release assets from GitHub'
DOWNLOAD_OK=0
for attempt in 1 2 3 4 5; do
  if gh release download "$RELEASE_TAG" \
    --repo "$RELEASE_REPO" \
    --dir "$ASSET_DIR" \
    --clobber \
    --pattern 'redeven_*.tar.gz' \
    --pattern 'SHA256SUMS' \
    --pattern 'SHA256SUMS.sig' \
    --pattern 'SHA256SUMS.pem' \
    --pattern 'knowledge_bundle.manifest.json' \
    --pattern 'knowledge_bundle.sha256'; then
    DOWNLOAD_OK=1
    break
  fi

  log_info "Release assets are not ready yet (attempt ${attempt}/5), retrying in 5s"
  sleep 5
done

if [ "$DOWNLOAD_OK" -ne 1 ]; then
  log_error 'Failed to download release assets from GitHub after retries'
  exit 1
fi

for file in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$ASSET_DIR/$file" ]; then
    log_error "Release asset is missing: $file"
    exit 1
  fi
done

log_info 'Verifying checksum file'
(
  cd "$ASSET_DIR"
  sha256sum -c SHA256SUMS
)

log_info 'Verifying checksum signature with cosign'
cosign verify-blob \
  --certificate "$ASSET_DIR/SHA256SUMS.pem" \
  --signature "$ASSET_DIR/SHA256SUMS.sig" \
  --certificate-identity-regexp '^https://github.com/floegence/redeven-agent/.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$ASSET_DIR/SHA256SUMS" >/dev/null

R2_RELEASE_PREFIX="${PACKAGE_PREFIX%/}/$RELEASE_TAG"
log_info "Uploading release assets to R2 at $R2_RELEASE_PREFIX"
for file in "${EXPECTED_FILES[@]}"; do
  aws s3 cp \
    "$ASSET_DIR/$file" \
    "s3://$R2_PACKAGE_BUCKET/$R2_RELEASE_PREFIX/$file" \
    --endpoint-url "$R2_ENDPOINT" \
    --only-show-errors

done

log_info 'Re-downloading uploaded assets for integrity verification'
for file in "${EXPECTED_FILES[@]}"; do
  aws s3 cp \
    "s3://$R2_PACKAGE_BUCKET/$R2_RELEASE_PREFIX/$file" \
    "$VERIFY_DIR/$file" \
    --endpoint-url "$R2_ENDPOINT" \
    --only-show-errors

  src_sha="$(sha256sum "$ASSET_DIR/$file" | awk '{print $1}')"
  dst_sha="$(sha256sum "$VERIFY_DIR/$file" | awk '{print $1}')"
  if [ "$src_sha" != "$dst_sha" ]; then
    log_error "Integrity mismatch after R2 upload: $file"
    exit 1
  fi
done

summarize
log_info 'Release assets mirrored successfully'

#!/usr/bin/env bash
set -euo pipefail

apk_path="${1:?Usage: verify-android-apk.sh path/to/app.apk}"
if [[ ! -f "$apk_path" ]]; then
  echo "APK not found: $apk_path" >&2
  exit 1
fi

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -n "$sdk_root" && -x "$sdk_root/build-tools/36.0.0/aapt" ]]; then
  aapt="$sdk_root/build-tools/36.0.0/aapt"
elif command -v aapt >/dev/null 2>&1; then
  aapt="$(command -v aapt)"
else
  echo "aapt was not found; Android build-tools 36.0.0 must be installed." >&2
  exit 1
fi

entries="$(unzip -Z1 "$apk_path")"
for expected in \
  assets/public/index.html \
  assets/public/src/ui.js \
  assets/public/examples/manifest.json; do
  if ! grep -Fxq "$expected" <<<"$entries"; then
    echo "APK is missing bundled app asset: $expected" >&2
    exit 1
  fi
done

config="$(unzip -p "$apk_path" assets/capacitor.config.json)"
if grep -q '"serverUrl"' <<<"$config"; then
  echo "APK unexpectedly points to a remote server URL." >&2
  exit 1
fi

permissions="$("$aapt" dump permissions "$apk_path")"
if grep -q 'android.permission.INTERNET' <<<"$permissions"; then
  echo "APK unexpectedly requests internet permission; this build should be offline." >&2
  exit 1
fi

echo "Verified: the APK bundles its web app locally and does not request internet access."

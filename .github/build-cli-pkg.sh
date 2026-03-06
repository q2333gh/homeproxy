#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-only

set -o errexit
set -o pipefail

PKG_MGR="${1:-ipk}"
RELEASE_TYPE="${2:-snapshot}"
TARGET_ARCH="${3:-aarch64_generic}"

export PKG_SOURCE_DATE_EPOCH="$(date "+%s")"
export SOURCE_DATE_EPOCH="$PKG_SOURCE_DATE_EPOCH"

BASE_DIR="$(cd "$(dirname "$0")"; pwd)"
PKG_DIR="$BASE_DIR/.."

PKG_NAME="homeproxy-cli"
PKG_VERSION="$PKG_SOURCE_DATE_EPOCH~$(git -C "$PKG_DIR" rev-parse --short HEAD)"
if [ "$RELEASE_TYPE" = "release" ] && [ -n "${GITHUB_REF_NAME:-}" ]; then
	PKG_VERSION="${GITHUB_REF_NAME#v}"
fi

case "$TARGET_ARCH" in
	aarch64_generic)
		GOARCH="arm64"
		APK_ARCH="aarch64"
		;;
	x86_64|x86_64_generic)
		GOARCH="amd64"
		APK_ARCH="x86_64"
		TARGET_ARCH="x86_64"
		;;
	*)
		echo "Unsupported target arch: $TARGET_ARCH" >&2
		exit 1
		;;
esac

TEMP_DIR="$(mktemp -d -p "$BASE_DIR")"
TEMP_PKG_DIR="$TEMP_DIR/$PKG_NAME"
mkdir -p "$TEMP_PKG_DIR/usr/bin"

if [ "$PKG_MGR" == "apk" ]; then
	mkdir -p "$TEMP_PKG_DIR/lib/apk/packages"
else
	mkdir -p "$TEMP_PKG_DIR/CONTROL"
fi

pushd "$PKG_DIR/cli-go" >/dev/null
CGO_ENABLED=0 GOOS=linux GOARCH="$GOARCH" \
	go build -trimpath -ldflags="-s -w" -o "$TEMP_PKG_DIR/usr/bin/homeproxy" ./cmd/homeproxy
popd >/dev/null

chmod 0755 "$TEMP_PKG_DIR/usr/bin/homeproxy"

if [ "$PKG_MGR" == "apk" ]; then
	find "$TEMP_PKG_DIR" -type f,l -printf '/%P\n' | sort > "$TEMP_PKG_DIR/lib/apk/packages/$PKG_NAME.list"

	apk mkpkg \
		--info "name:$PKG_NAME" \
		--info "version:$PKG_VERSION" \
		--info "description:HomeProxy Go CLI for OpenWrt" \
		--info "arch:$APK_ARCH" \
		--info "origin:https://github.com/immortalwrt/homeproxy" \
		--info "url:" \
		--info "maintainer:Tianling Shen <cnsztl@immortalwrt.org>" \
		--info "provides:" \
		--info "depends:" \
		--files "$TEMP_PKG_DIR" \
		--output "$TEMP_DIR/${PKG_NAME}_${PKG_VERSION}.apk"

	mv "$TEMP_DIR/${PKG_NAME}_${PKG_VERSION}.apk" "$BASE_DIR/${PKG_NAME}_${PKG_VERSION}_${APK_ARCH}.apk"
else
	cat > "$TEMP_PKG_DIR/CONTROL/control" <<-EOF
		Package: $PKG_NAME
		Version: $PKG_VERSION
		Depends:
		Source: https://github.com/immortalwrt/homeproxy
		SourceName: $PKG_NAME
		Section: utils
		SourceDateEpoch: $PKG_SOURCE_DATE_EPOCH
		Maintainer: Tianling Shen <cnsztl@immortalwrt.org>
		Architecture: $TARGET_ARCH
		Installed-Size: TO-BE-FILLED-BY-IPKG-BUILD
		Description:  HomeProxy Go CLI for OpenWrt
	EOF
	chmod 0644 "$TEMP_PKG_DIR/CONTROL/control"

	ipkg-build -m "" "$TEMP_PKG_DIR" "$TEMP_DIR"
	mv "$TEMP_DIR/${PKG_NAME}_${PKG_VERSION}_${TARGET_ARCH}.ipk" "$BASE_DIR/${PKG_NAME}_${PKG_VERSION}_${TARGET_ARCH}.ipk"
fi

rm -rf "$TEMP_DIR"

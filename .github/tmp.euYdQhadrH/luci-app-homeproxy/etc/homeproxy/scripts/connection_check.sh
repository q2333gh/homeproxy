#!/bin/sh

SITE="$1"
TIMEOUT_MS="${2:-3100}"

case "$SITE" in
	baidu)
		URL="https://www.baidu.com"
		;;
	google)
		URL="https://www.google.com"
		;;
	*)
		echo "unsupported site: $SITE" >&2
		exit 1
		;;
esac

/usr/bin/wget --spider -qT3 "$URL" 2>/dev/null
exit $?

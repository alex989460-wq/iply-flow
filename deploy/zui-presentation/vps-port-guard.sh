#!/bin/sh
# Block direct Internet access before Docker DNAT, preserving local proxy paths.
set -eu
INTERFACE=${1:-enp6s0}
case "$INTERFACE" in *[!a-zA-Z0-9_.:-]*|'') echo 'Invalid interface' >&2; exit 1;; esac
PORTS=5432,6543,8000,8100,3100
for command in iptables ip6tables; do
    "$command" -w -t mangle -N ZUI-PRIVATE-PORTS 2>/dev/null || true
    "$command" -w -t mangle -C ZUI-PRIVATE-PORTS -p tcp -m multiport --dports "$PORTS" -j DROP 2>/dev/null ||
        "$command" -w -t mangle -A ZUI-PRIVATE-PORTS -p tcp -m multiport --dports "$PORTS" -j DROP
    "$command" -w -t mangle -C PREROUTING -i "$INTERFACE" -j ZUI-PRIVATE-PORTS 2>/dev/null ||
        "$command" -w -t mangle -I PREROUTING 1 -i "$INTERFACE" -j ZUI-PRIVATE-PORTS
done
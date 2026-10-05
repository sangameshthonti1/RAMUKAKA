#!/bin/sh
set -eu

port="${PORT:-10000}"
case "$port" in
  ''|*[!0-9]*)
    echo "PORT must be an integer" >&2
    exit 1
    ;;
esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  echo "PORT must be between 1 and 65535" >&2
  exit 1
fi

mkdir -p /backend/data
chown -R appuser:appuser /backend/data
sed "s/__PORT__/$port/g" /etc/nginx/conf.d/ramukaka.template \
  > /etc/nginx/conf.d/ramukaka.conf
rm -f /etc/nginx/conf.d/ramukaka.template

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf

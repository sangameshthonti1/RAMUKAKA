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

pin="${RK_DEMO_ACCESS_PIN:-}"
if [ "${#pin}" -lt 8 ]; then
  echo "RK_DEMO_ACCESS_PIN must be set to at least 8 characters" >&2
  exit 1
fi
case "$pin" in
  *"
"*)
    echo "RK_DEMO_ACCESS_PIN must not contain a newline" >&2
    exit 1
    ;;
esac

mkdir -p /backend/data /etc/nginx/snippets
chown -R appuser:appuser /backend/data
sed "s/__PORT__/$port/g" /etc/nginx/conf.d/ramukaka.template \
  > /etc/nginx/conf.d/ramukaka.conf
rm -f /etc/nginx/conf.d/ramukaka.template

umask 077
printf '%s\n' "$pin" | htpasswd -i -c -B /etc/nginx/.htpasswd demo >/dev/null
chown root:www-data /etc/nginx/.htpasswd
chmod 0640 /etc/nginx/.htpasswd
cat > /etc/nginx/snippets/ramukaka-auth.conf <<'EOF'
auth_basic "Ramu Kaka Round 3 demo";
auth_basic_user_file /etc/nginx/.htpasswd;
EOF

unset pin RK_DEMO_ACCESS_PIN
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf

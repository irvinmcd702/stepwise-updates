#!/usr/bin/env bash
# Builds the outdated Harbor & Pine site: PHP 7.4, WordPress 6.4, plugins
# a couple of years behind. Run from anywhere: ./lab/seed.sh
set -euo pipefail
cd "$(dirname "$0")"
source .env

echo 7.4 > php-version
export PHP_VERSION=7.4
wp() { MSYS_NO_PATHCONV=1 docker compose run --rm -T cli wp "$@"; }
in_cli() { MSYS_NO_PATHCONV=1 docker compose run --rm -T --entrypoint sh cli -c "$1"; }

mkdir -p logs backups && chmod 777 logs backups
docker compose up -d db wordpress >/dev/null
for _ in $(seq 1 60); do
  curl -s -o /dev/null http://localhost:8095/ && wp db check >/dev/null 2>&1 && break
  sleep 2
done

wp core download --version=6.4.5 --force --skip-content >/dev/null
if ! wp core is-installed 2>/dev/null; then
  wp core install --url="http://localhost:8095" --title="Harbor & Pine Bakery" \
    --admin_user="${ADMIN_USER}" --admin_password="${ADMIN_PASSWORD}" \
    --admin_email="owner@harborpine.example" --skip-email >/dev/null
fi
wp option update blogdescription "Sourdough and pastries since 2009" >/dev/null
wp rewrite structure '/%postname%/' --hard >/dev/null

in_cli 'rm -rf wp-content/themes/harbor wp-content/plugins/harbor-hours &&
  cp -r /theme/harbor wp-content/themes/ &&
  cp -r /plugins/harbor-hours wp-content/plugins/ &&
  mkdir -p wp-content/mu-plugins && cp /mu/*.php wp-content/mu-plugins/'
wp theme activate harbor >/dev/null
wp plugin delete hello akismet >/dev/null 2>&1 || true
wp plugin install contact-form-7 --version=5.7.7 --force --activate >/dev/null
wp plugin install wordpress-seo --version=22.0 --force --activate >/dev/null
wp plugin activate harbor-hours >/dev/null
wp theme delete --all >/dev/null 2>&1 || true

wp eval-file /content/pages.php
in_cli ": > /logs/debug.log; : > /logs/mail.log"
echo "outdated site ready: http://localhost:8095"

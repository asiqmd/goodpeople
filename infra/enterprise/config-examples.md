# Private config examples

Create these outside source control, mode 0600, beneath a 0700 directory. Replace every placeholder; encode credentials correctly in URLs. The signed environment schema plus `enterprise-cli validate-config` is authoritative for application config. Compose interpolation is checked independently by `docker compose ... config --quiet`.

`app.env` (JSON values below should be single-quoted dotenv strings):

```dotenv
DEPLOYMENT_MODE=self_hosted
INSTALLATION_ID=REPLACE_UUID
INSTALLATION_TENANT_ID=REPLACE_UUID
RELEASE_VERSION=5.3.0
DATABASE_URL=postgres://gp_app:REPLACE_URL_ENCODED@database:5432/good_people
WEB_ORIGIN=https://people.customer.example
API_ORIGIN=https://people-api.customer.example
JWT_ACCESS_SECRET=REPLACE_RANDOM_48_BYTES_BASE64
JWT_ACCESS_KEY_ID=customer-2026
FIELD_ENCRYPTION_KEY=REPLACE_RANDOM_32_BYTES_BASE64
LICENSE_PUBLIC_KEYS_JSON='{"vendor-2026":"-----BEGIN PUBLIC KEY-----\nREPLACE\n-----END PUBLIC KEY-----\n"}'
FIELD_ENCRYPTION_KEYS_JSON='{}'
SIGNUP_ENABLED=off
REQUIRE_ADMIN_MFA=on
SECURITY_STORE=redis
REDIS_URL=redis://:REPLACE_URL_ENCODED@redis:6379
SECURITY_NAMESPACE=gp:REPLACE_INSTALLATION_UUID
STORAGE_DRIVER=local
STORAGE_DIR=/data/documents
SUPPORT_INBOX_EMAIL=customer-operator@example.invalid
EMAIL_DRIVER=disabled
SMS_DRIVER=disabled
PUSH_DRIVER=disabled
```

`owner.env`: `DATABASE_OWNER_URL=postgres://gp_owner:REPLACE_URL_ENCODED@database:5432/good_people`.

`setup.env`: administrator URL to the postgres database plus distinct `DATABASE_OWNER_URL` and `DATABASE_URL` above. The setup job is not a business service. `database.env`: `POSTGRES_PASSWORD=REPLACE_RANDOM`. `redis.env`: `REDISCLI_AUTH=REPLACE_RANDOM`, matching `config/redis.conf`.

For host recovery tooling, use equivalent private app config with **host-reachable** database/Redis URLs and the host document path. Container service names are not host DNS. The recovered config must use the new database, a new signing secret and all historical field keys. Keep field/backup key escrow on separate media; a fingerprint is not a decryption key.

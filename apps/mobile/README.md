# Good People mobile

Flutter app for Good People (Android and iOS). Phase 0 is the shell: sign in
to a workspace, then see the tenant's plan, billing mode, access state and
which modules are enabled. Phase 1 adds **My profile**: the signed-in user's
own employee record (job, personal details, identity documents, addresses,
nominees, payment accounts) from `GET /tenant/me/employee`, opened from a
card on the home screen, and **Leave**: balances, applying for leave,
the user's own requests, approvals and the holiday calendar. English and
Bangla.

Needs Flutter 3.47 (Dart 3.13) or newer. Run every command below from
`apps/mobile`. This app is not part of the pnpm workspace; use `flutter`, not
`pnpm`.

## Run

```sh
flutter pub get

# iOS simulator: the API on your machine is at localhost
flutter run --dart-define=API_BASE_URL=http://localhost:4000 --dart-define=APP_ENV=dev

# Android emulator: the host machine is 10.0.2.2, not localhost
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

| Define         | Values                   | Default                 |
| -------------- | ------------------------ | ----------------------- |
| `API_BASE_URL` | API origin               | `http://localhost:4000` |
| `APP_ENV`      | `dev`, `staging`, `prod` | `dev`                   |

Environments are dart-defines, not native flavors: one Android and iOS setup
serves all of them. An unknown `APP_ENV` shows an error instead of the login screen. Outside `prod`, the
login screen shows the environment and API URL under the form.

On a physical phone, use your computer's LAN address, for example
`--dart-define=API_BASE_URL=http://192.168.1.20:4000`.

## Code layout

| Path | What it holds |
| ---- | ------------- |
| `lib/config/` | `AppConfig` from the dart-defines |
| `lib/api/` | Hand-written dio client, models, `ApiException`, token store |
| `lib/auth/` | Auth state, sign in and out, token refresh, login screen |
| `lib/home/` | Home screen and the module list |
| `lib/profile/` | My profile screen and `myEmployeeProvider` |
| `lib/leave/` | Leave screen, one file per tab, and the leave providers |
| `lib/settings/` | Language choice (in memory) |
| `lib/ui/` | Theme, language menu, shared widgets, date formatting |
| `lib/l10n/` | ARB files and the generated `AppLocalizations` |

State is Riverpod. `AuthGate` in `lib/app.dart` shows the login or home
screen from the auth state, so signing in, signing out and an expired session
all switch screens in one place. Signing out also pops any screen pushed on
top of home, such as the profile.

Sessions: tokens stay in memory (`InMemoryTokenStore`), so a restart signs the
user out. Phase 1 replaces it with `flutter_secure_storage`. When any
authenticated call (`/tenant/access`, `/tenant/me/employee`, every leave call)
returns 401, the app calls `/auth/refresh` once and retries.
If the refresh is rejected, or the retry is still a 401, it returns to login
with a "session ended" notice. If the refresh fails because the network is
down, the screen shows the error with a retry button instead.

My profile: a 404 from `/tenant/me/employee` means the login has no employee
record (usual for tenant admins), and the screen shows an empty state, not an
error. Other errors, such as a 403 for a suspended workspace, show the API's
message with a retry button. Payment accounts show only the masked number
the API sends; the app re-masks to the last four characters if a longer
number ever arrives.

Leave: the home screen shows a **Leave** card under My profile when the
workspace has the `leave` module. The screen has five tabs:

| Tab | API | Notes |
| --- | --- | ----- |
| Balances | `GET /tenant/me/leave/balances?year=` | A card per type. Per-event leave (maternity) shows "On request" instead of a number. |
| Apply | `GET /tenant/leave/types`, `POST /tenant/me/leave/preview`, `POST /tenant/me/leave/requests` | Active types only; types limited to one gender are hidden from the others (gender from My profile). Half day only for types that allow it, on a single day. |
| My requests | `GET /tenant/me/leave/requests?year=`, `POST /tenant/leave/requests/{id}/cancel` | Status, approval trail, and Cancel (with a confirmation) for pending requests and approved ones that have not started. |
| Approvals | `GET /tenant/approvals`, `POST /tenant/approvals/{stepId}/approve` or `/reject` | Shown only while the inbox is not empty, with the count as a badge. |
| Holidays | `GET /tenant/me/holidays?year=` | Tentative (moon-sighting) dates are marked. |

Balances, My requests and Holidays share one year switcher (this year and
next). Each tab loads the first time it is opened and keeps its state, so a
half-filled form survives a look at the balances. The apply form asks the
preview endpoint again whenever the type, dates or half day change; Send is
disabled while the latest preview has problems. A 400 with code
`leave_not_allowed` on Send shows the API's message the same way. Problems,
holiday names in the preview, and other API messages are in English, as the
API sends them. A 404 from the `/tenant/me/leave/...` calls means the login
has no employee record and shows an empty state, as on My profile.

## Localization

Strings live in `lib/l10n/app_en.arb` (the template) and `lib/l10n/app_bn.arb`.
After editing them:

```sh
flutter gen-l10n
```

`flutter pub get` and `flutter run` also regenerate them (`generate: true` in
`pubspec.yaml`, options in `l10n.yaml`). API enum values (gender, religion,
employment type, division and so on) are translated with ICU `select`
messages keyed by the wire value, for example `genderName`. Dates go through
`formatDate` and the other helpers in `lib/ui/format.dart` (intl), so Bangla
shows Bangla digits; so do day counts (`leaveDays`, a `num` plural that keeps
halves such as 1.5) and the approvals badge. Leave type and holiday names
use the API's `nameBn` under Bangla when it is set.
The generated `lib/l10n/app_localizations*.dart` files are committed so analysis works on a
fresh checkout. Every key in `app_en.arb` needs a Bangla entry in
`app_bn.arb`.

No fonts are bundled. The theme lists system fonts with Bangla glyphs as
fallbacks: Noto Sans Bengali on Android, Kohinoor Bangla and Bangla Sangam MN
on iOS.

## Check

```sh
dart format .
flutter analyze
flutter test
```

Widget tests replace the HTTP client with `FakeGoodPeopleApi`
(`test/support/fake_api.dart`, leave fixtures in
`test/support/leave_fixtures.dart`) through a Riverpod override. Leave tests
also override `todayProvider` so "this year" and "has it started" are fixed.
`test/api_client_test.dart` runs the real dio client against a stub adapter
that returns the contract's JSON.

## Generated API client (`tool/gen_api.sh`)

```sh
tool/gen_api.sh                     # $API_BASE_URL/docs-json, else ../api/openapi.json
tool/gen_api.sh path/to/openapi.json
tool/gen_api.sh https://staging.example.com/docs-json
```

It writes a Dart client generated from the API's OpenAPI spec to
`lib/api/generated/`. It is pure Dart and needs no Java:
[swagger_parser](https://pub.dev/packages/swagger_parser) writes retrofit
clients and json_serializable models, then build_runner writes their `.g.dart`
parts. Both run in `tool/api_codegen/`, a separate package, so the app's
pubspec carries none of the generator dependencies. Set `DART=/path/to/dart`
if `dart` is not on your `PATH`.

In Phase 0 the app does not use the generated code. `lib/api/generated/` is
gitignored and excluded from `flutter analyze`. To adopt it later: add
`retrofit` and `json_annotation` to the app's dependencies, remove the two
exclusions, and replace the hand-written client in `lib/api/`.

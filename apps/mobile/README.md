# Good People mobile

Flutter app for Good People (Android and iOS). Phase 0 is the shell: sign in
to a workspace, then see the tenant's plan, billing mode, access state and
which modules are enabled. Phase 1 adds **My profile**: the signed-in user's
own employee record (job, personal details, identity documents, addresses,
nominees, payment accounts) from `GET /tenant/me/employee`, opened from a
card on the home screen, **Leave**: balances, applying for leave,
the user's own requests, approvals and the holiday calendar,
**Attendance**: punching in and out with the phone's location (and a selfie
when the workspace asks for one), this month's days and attendance
corrections, **My documents**: what HR shared and the service book, and
**Resignation**, from the bottom of My profile. Milestone 5 adds sign-in
with a code texted to a mobile number, two-step sign-in, a **notification
inbox** with push, punches kept on the phone while offline, a **Team** view
for managers and HR, and **Account** (password and language). English and
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
| `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID` | The Firebase project's settings; the app ID differs between the Android and the iOS app | none: push is off |

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
| `lib/home/` | Home screen, the module list, and `SessionServices` (what runs while signed in: the offline punch queue, inbox reloads, push, language) |
| `lib/profile/` | My profile screen and `myEmployeeProvider` |
| `lib/leave/` | Leave screen, one file per tab, and the leave providers |
| `lib/attendance/` | Attendance screen, its tabs, the correction form, the providers, `LocationService` and `CameraService` |
| `lib/approvals/` | The approvals inbox tab (leave, corrections, resignations, project timesheets, job openings and offers above budget) and `approvalsProvider`, shared by Leave and Attendance, and `ApprovalsScreen` for notifications |
| `lib/interviews/` | My interviews, an interview with its scorecard, their providers and `LinkOpener` (video call links) |
| `lib/notifications/` | The inbox screen and `notificationInboxProvider`, which screen each notification opens, and `PushService` (Firebase, or off) |
| `lib/team/` | The Team screen and its providers |
| `lib/account/` | Account and the change-password form |
| `lib/util/` | `uuidV4` |
| `lib/documents/` | My documents, the in-app image viewer, `myDocumentsProvider` and `FileOpener` |
| `lib/resignation/` | The resignation screen and form, `mySeparationsProvider` and the status pill |
| `lib/settings/` | Language choice (in memory) |
| `lib/ui/` | Theme, language menu, shared widgets, date formatting |
| `lib/l10n/` | ARB files and the generated `AppLocalizations` |

State is Riverpod. `AuthGate` in `lib/app.dart` shows the login or home
screen from the auth state, so signing in, signing out and an expired session
all switch screens in one place. Signing out also pops any screen pushed on
top of home, such as the profile.

Sessions: tokens stay in memory (`InMemoryTokenStore`), so a restart signs the
user out. Phase 1 replaces it with `flutter_secure_storage`. When any
authenticated call (`/tenant/access`, `/tenant/me/employee`, every leave,
attendance, document and resignation call) returns 401, the app calls
`/auth/refresh` once and retries.
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
| Approvals | `GET /tenant/approvals`, `POST /tenant/approvals/{stepId}/approve` or `/reject` | Shown only while the inbox is not empty, with the count as a badge. The whole inbox: attendance corrections show here too (see Attendance). |
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

Attendance: the home screen shows an **Attendance** card when the workspace
has the `attendance` module. The screen has three tabs, plus Approvals:

| Tab | API | Notes |
| --- | --- | ----- |
| Today | `GET /tenant/me/attendance/today`, `POST /tenant/me/attendance/punch` | The shift, the day's status, first in, last out, hours worked and the punches (with where each came from). One large Punch in / Punch out button, following `nextDirection`. When `selfPunch.blockedReason` is set (punching from the app is off, or the location has no geofence) the tab says why instead. The punch answers with the whole day, which replaces the shown one. |
| This month | `GET /tenant/me/attendance?from=&to=` | The 1st of this month to today, newest day first, with the totals on top. Status chips, late, left-early and overtime badges, a "Correction: Pending" mark; weekly offs and holidays are muted. Tapping a day opens the correction form for it. |
| Corrections | `GET /tenant/me/attendance/regularizations`, `POST` to the same path, `POST /tenant/attendance/regularizations/{id}/cancel` | The user's corrections with status, times and approval trail; Cancel (with a confirmation) for pending ones. **Request correction** opens a form: the day, a missed punch (in time, out time or both) or an on-duty day (no times), and a reason (3 to 500 characters). |
| Approvals | as on Leave | The same inbox. A correction shows who asks, the day, the times asked for, the reason and the day as recorded now. A resignation shows who, the notice date and last working day, how many days the notice is short (when it is) and the reason. A project timesheet shows who, the month, the total hours and each project's hours and share of the month, with the planned share where there is one; rejecting it returns it to the employee to correct. A job opening shows its title, company, unit, location and designation, how many positions of which employment type, new or replacing whom, the monthly gross budget, the hiring manager, why it is needed and this round's approval steps. An offer above budget shows the candidate, the opening, the company and designation, the monthly gross against the budget's top, the joining date and who drafted it. An item of a kind this app does not know is listed without buttons, with a note to decide it on the web. |

Times (`firstIn`, `lastOut`, punches) are shown in the response's
`timeZone`. Only fixed-offset zones are known without a time zone database
(`Asia/Dhaka`, UTC+6, no daylight saving; and UTC); any other zone falls back
to the device's time. Durations are `h:mm`. Approval items carry no time
zone, so the inbox shows a day's punches in Dhaka time.

Location: punching reads the phone's location through `LocationService`
(`lib/attendance/location_service.dart`, the
[geolocator](https://pub.dev/packages/geolocator) plugin on a device, a fake in
widget tests). The permission is asked the first time the user punches, never
in the background. With the `geofenced` mode the location is required: if
location is off, the permission is refused, or no fix arrives within 20
seconds, the tab says so (with **Open settings** when only the system settings
can fix it) and sends nothing. With `anywhere` the app tries for 8 seconds and
punches without coordinates if it gets none. The permission texts are in
`ios/Runner/Info.plist` (`NSLocationWhenInUseUsageDescription`) and
`android/app/src/main/AndroidManifest.xml` (`ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`).

Selfie punches: when `selfPunch.requireSelfie` is set, Punch first opens
the camera through `CameraService` (`lib/attendance/camera_service.dart`,
[image_picker](https://pub.dev/packages/image_picker) on a device, a fake in
widget tests), asking for the front camera; some Android camera apps open
the back one anyway. The photo is scaled to 1024 px and saved as a JPEG at
quality 70, well under the API's 2 MB limit. Backing out of the camera sends
nothing (the location is not even read) and says so. Then the location is
read as above, and the punch goes as `multipart/form-data`: `source`,
`latitude`, `longitude` and `accuracyM` as text fields and the photo in
`selfie`. Without the requirement it is JSON, as before. Refused camera
access shows **Open settings**. A punch that came with a photo shows a
camera icon. The camera text is `NSCameraUsageDescription` in
`ios/Runner/Info.plist`; Android needs no permission, because the phone's
camera app takes the photo.

Refusals are shown in the UI language by their `code`: `outside_geofence`
(with the distance, worked out from the phone's fix and the geofence the
same way the API does), `location_required`, `no_geofence`,
`self_punch_disabled`, `too_soon`, `separated`, `selfie_required` (the
workspace turned selfies on since the day loaded: the day reloads),
`unsupported_file` and a 413 for the photo, and for corrections
`future_day`, `outside_window`, `not_tracked`, `wrong_day`, `future_punch`,
`already_pending` and `not_pending`. Any other error shows the API's message,
as elsewhere. A 404 from the `/tenant/me/attendance...` calls means no
employee record, as on My profile.

My documents: the home screen shows a **My documents** card (part of
`core_hr`, which every workspace has). The list is
`GET /tenant/me/documents`: title, kind, issued and expiry dates, an
**Expires soon** mark within 60 days of expiry and **Expired** after it, and
whether it is a letter from HR (with its reference number) or an upload.
Tapping one downloads `GET /tenant/documents/{id}/file`: photos and scans
open in the app (pinch or double-tap to zoom), PDFs in the phone's own
viewer. **My service book** fetches `GET /tenant/me/service-book?language=`
in the app's language and opens it the same way. Opening a PDF goes through
`FileOpener` (`lib/documents/file_opener.dart`): it saves the file in the
app's cache ([path_provider](https://pub.dev/packages/path_provider)) and
hands it to the viewer ([open_filex](https://pub.dev/packages/open_filex):
an Android intent through its FileProvider, a QuickLook preview on iOS).
Only the file opened last is kept, and signing out deletes it. open_filex
declares storage and media permissions this app does not need, so
`android/app/src/main/AndroidManifest.xml` removes them from the merged
manifest. A 403 or 404 on a download (no longer shared, removed) says so and
reloads the list.

Resignation: the last entry of My profile opens it. It lists
`GET /tenant/me/separations` with the type, status, notice date, last
working day, the notice the Labour Act asks for, the notice given, the days
short (with a note that wages for them may be deducted), the reason and the
approval trail. A pending resignation has **Withdraw** (with a confirmation,
`POST /tenant/separations/{id}/cancel`). When none is pending or approved,
a form explains the Act's notice (60 days for a permanent worker, 30 for a
temporary one on monthly wages), then takes the last working day (today or
later; the picker opens 60 days ahead) and a reason (3 to 500 characters),
and after a confirmation sends `POST /tenant/me/resignation`. Refusals by
`code`: `past_last_day`, `separated`, `separation_open` (the list reloads to
show the open one) and `not_open` on a withdrawal.

Sign-in: the login screen switches between **Email** (password, as before)
and **Mobile**. A mobile number (`01712345678`; spaces, dashes and Bangla
digits are fine) goes to `POST /auth/otp/request`, which answers the same
whether or not the number has a login, so the screen says "if this number
has a login". The 6-digit code goes to `POST /auth/otp/verify`; **Send
again** is enabled 30 seconds after each code. When `POST /auth/login`
answers `{mfaRequired, mfaToken}`, the screen asks for the authenticator
code, or a recovery code such as `k7qm-2xpd`, and sends it to
`POST /auth/mfa/verify`. `{mfaSetupRequired}` (an admin role that must use
two-step sign-in but has not set it up) says to do that in the web app
first: the app does not enrol.

Errors: `describeError` (`lib/ui/error_text.dart`) shows a translated
message for the codes the app can meet anywhere (`too_many_attempts`, with
the wait from `retryAfterSeconds`, `login_disabled`, `tenant_suspended`,
`tenant_read_only`, `role_not_allowed`, `feature_not_in_plan`,
`wrong_password`, the punch refusals, `offline_punch_too_old` and
`future_punch`), else the API's English message.

Sessions refresh once for all calls that get a 401 together: a refresh
token works once, and the API takes a second use for a stolen token.

Notifications: the bell on the home screen shows the unread count from
`GET /tenant/notifications`; titles and bodies arrive in the user's
language. The inbox reloads when it opens, on pull-to-refresh, when the app
comes back to the foreground and when a push arrives. Tapping an item marks
it read (`POST /tenant/notifications/{id}/read`) and opens what it is about:
a request to decide opens the approvals, a decided one Leave, Attendance or
My profile by its `link`, documents and letters My documents, a missing
punch Attendance; probation reminders are only marked read. **Mark all as
read** posts `/tenant/notifications/read-all`. Changing the app language
sends `PATCH /account/preferences`, so notifications come in it.

Push: with the four `FIREBASE_*` defines, `FirebasePushService` starts
Firebase from them (no `google-services.json` or `GoogleService-Info.plist`),
asks for permission after sign-in, and registers the token with
`POST /account/devices`; signing out sends `POST /account/devices/remove`.
A push while the app is open shows its title with **View**; a tapped push
opens its screen and marks it read. Without the defines push is off and
nothing else changes. iOS also needs the Push Notifications capability and
an APNs key in the Firebase project; that is not set up in this repo.

Offline punches: a punch that gets no answer (no connection, a timeout) is
kept on the phone in `offline_punches/queue.json` in the app's support
directory, with its photo when it had one, and Today says how many wait.
Each punch gets a UUID v4 `clientId` before the first attempt; a resend
sends the same id and `punchedAt` (when it happened), so the API records it
once. The queue sends when the session starts, when the app comes back to
the foreground, every minute while it is open and after any call that goes
through. A 201 removes it; a 4xx other than 401, 408 and 429 (such as
`offline_punch_too_old` after 72 hours) removes it too and Today, and a
note on home, say why, with **Request correction** for that day; anything
else keeps it. Punches belong to the login that took them.

Team: the home screen shows **Team** with the `attendance` module for staff
roles, and for anyone else when today's `GET /tenant/attendance/daily` has
someone besides themselves (the API always includes the person). It lists
each person's status, first in and lateness, with chips by status, and,
with `leave`, who is on leave this week from `GET /tenant/leave/calendar`.

Interviews (recruitment): the home screen shows **Interviews**, with a
badge, while `GET /tenant/recruitment/me` counts interviews that need the
user (to come, or over without their scorecard); only with the workspace's
`recruitment` feature, and a 403 or 404 hides it. The list is
`GET /tenant/interviews`: those to come, then past ones, each with the
candidate, the position (the job post's title in the app's language), how
and when, and whether the scorecard is in. An interview,
`GET /tenant/interviews/{id}`, shows when (always in Bangladesh time, as
interviews are scheduled), the place or phone note, the video link (**Join
the video call** opens it outside the app through
[url_launcher](https://pub.dev/packages/url_launcher)), HR's notes, the
candidate's note and **Open the CV**
(`GET /tenant/recruitment/applications/{applicationId}/cv`, a PDF or Word
file, opened like a document). The scorecard takes a rating from 1 to 5 for
each of the opening's criteria, a recommendation (strong no to strong yes)
and notes; it is sent only once every criterion is rated and a
recommendation chosen (`PUT /tenant/interviews/{id}/scorecard`), and can be
updated until the application closes. The other interviewers' scorecards
show once the user's is in. Refusals by `code`: `scorecard_criteria` (the
criteria changed), `application_closed` and `interview_cancelled`; each
reloads the interview. A `recruitment.interview` notification opens the
list. The interviewer's view has no panel list in the API yet; the page
shows one when the API sends `panel`.

Account: `GET /account` (name, email, mobile, role, two-step sign-in) and,
for logins with a password, **Change password**
(`POST /account/password`, at least 10 characters, with this session's
refresh token as `keepRefreshToken` so the phone stays signed in while other
sessions end).

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
(`test/support/fake_api.dart`, fixtures in `test/support/leave_fixtures.dart`,
`test/support/attendance_fixtures.dart` and
`test/support/lifecycle_fixtures.dart`) through a Riverpod override.
Leave, attendance, document and resignation tests also override
`todayProvider` so "this year", "this month", "has it started" and "expires
soon" are fixed. Attendance tests replace the GPS with `FakeLocationService`
(`locationServiceProvider`) and the camera with `FakeCameraService`
(`cameraServiceProvider`); document tests replace the phone's viewer with
`FakeFileOpener` (`fileOpenerProvider`), and interview tests replace the
browser with `FakeLinkOpener` (`linkOpenerProvider`); recruitment fixtures
are in `test/support/recruitment_fixtures.dart`. `test/api_client_test.dart` runs the
real dio client against stub adapters that return the contract's JSON, or a
file's bytes and headers.

There is no device check in the tests: the camera, the PDF viewer and the
permission prompts need a phone or a simulator.

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

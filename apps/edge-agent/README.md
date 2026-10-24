# Good People Edge Agent

A small service that runs at each factory or office (a Windows PC, a mini PC or a Raspberry Pi).
The biometric devices on the site LAN push punches to it. It stores each punch on disk before it
answers the device, then uploads to the Good People cloud whenever the internet is up.

```
ZKTeco (ADMS push) ──┐
                     ├─► Edge Agent :8081 ──► queue.db (SQLite) ──► POST /edge/v1/punches
Hikvision (HTTP   ───┘                                             POST /edge/v1/heartbeat
 listening)
```

**What the agent guarantees:**

- A punch is never lost. It leaves the queue only when the cloud acknowledges it.
- A device that re-sends punches does not create duplicates. Punches are unique per device, user
  and time, both in the queue and in the cloud.
- Outages are survived:
  - **Internet down, cloud errors or rate limits (429):** the agent retries with exponential
    backoff and jitter, up to every 5 minutes.
  - **Token refused (401):** it retries every 5 minutes.
  - **Workspace read-only or suspended, or attendance not in the plan (403):** it backs off and
    keeps the punches.
- One bad record does not block the others. When the cloud refuses a batch as invalid (400), the
  agent splits the batch in halves until it finds the bad rows. Those rows are marked `rejected`
  with the cloud's message and are not sent again. Everything else goes through.

It needs Node.js 24 or later and has no runtime dependencies (it uses the built-in `node:sqlite`,
`node:http` and `fetch`).

## Configuration

Set environment variables, or put the same keys in camelCase in a JSON file and set
`GP_AGENT_CONFIG=/path/config.json`. If a key is set in both places, the environment variable wins.

| Variable                   | Config file key       | Default      | Notes                                                                                                                                                 |
| -------------------------- | --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GP_API_URL`               | `apiUrl`              | (required)   | Cloud API base URL, e.g. `https://api.example.com` or `http://localhost:4000`.                                                                        |
| `GP_AGENT_TOKEN`           | `agentToken`          | (required)   | `gpe.<tenant id>.<agent id>.<secret>`, shown once when the agent is registered. The secret is never logged.                                           |
| `GP_TIME_ZONE`             | `timeZone`            | `Asia/Dhaka` | IANA zone the device clocks are set to. ZKTeco times are converted from it, with DST handled correctly.                                               |
| `GP_PORT`                  | `port`                | `8081`       | Port the devices push to.                                                                                                                             |
| `GP_DATA_DIR`              | `dataDir`             | `./data`     | Holds `queue.db`. Relative paths are resolved against the working directory.                                                                          |
| `GP_SYNC_INTERVAL_MS`      | `syncIntervalMs`      | `10000`      | Regular upload interval. New punches also start an upload about one second after they arrive.                                                         |
| `GP_HEARTBEAT_INTERVAL_MS` | `heartbeatIntervalMs` | `60000`      | How often the agent reports its version, queue size and the devices it hears from.                                                                    |
| `GP_HIKVISION_EVENT_TYPES` | `hikvisionEventTypes` | `1,38,75`    | Hikvision access-control sub-event types that count as a punch: 1 card, 38 fingerprint, 75 face. Other types (door, alarm, failed match) are ignored. |
| `GP_LOG_LEVEL`             | `logLevel`            | `info`       | `debug` also logs every device request and why an event was ignored.                                                                                  |

The agent checks the configuration when it starts. If the URL or token is missing or malformed, it
prints what is wrong and exits with code 1.

## Running

From the repository root:

```sh
pnpm --filter @gp/edge-agent build
GP_API_URL=http://localhost:4000 GP_AGENT_TOKEN=gpe.… pnpm --filter @gp/edge-agent start
```

(With `pnpm --filter`, the working directory is `apps/edge-agent`, so the queue goes in
`apps/edge-agent/data/`.)

Check it with `curl http://<agent-ip>:8081/health`. The response shows:

- the number of queued and rejected punches
- the last successful upload and the last error
- every device that has talked to the agent since it started

Run it under a service manager so it starts at boot and restarts if it stops:

- **Linux:** systemd, with `Restart=always`
- **Windows:** a service wrapper such as NSSM

It stops cleanly on Ctrl+C, SIGINT or SIGTERM. It stops accepting requests, lets the upload in
flight finish, then closes the database.

### Docker

```sh
pnpm --filter @gp/edge-agent build
docker build -t gp-edge-agent apps/edge-agent
docker run -d --restart=always -p 8081:8081 -v gp-edge-data:/data \
  -e GP_API_URL=https://api.example.com -e GP_AGENT_TOKEN=gpe.… gp-edge-agent
```

The image copies the compiled `dist/`. Build it before running `docker build`.

## Pointing the devices at the agent

Give the agent PC a fixed IP address on the LAN (a DHCP reservation is fine), and allow inbound TCP
on port 8081 in its firewall.

**ZKTeco (ADMS / push):**

1. On the device, open **Menu → Comm. → Cloud Server Setting**.
2. Set **Server Address** to the agent PC's IP and **Server Port** to `8081`.
3. Turn **HTTPS** off, and turn off **Domain Name** and **Proxy** if the firmware has them.

The device fetches its options from `/iclock/cdata`, then uploads attendance records as people
punch. It identifies itself by its serial number.

**Hikvision (ISAPI HTTP listening):**

1. In the device's web page, open **Configuration → Network → Advanced → HTTP Listening**.
2. Set **Destination IP** to the agent's IP, **Port** to `8081` and **URL** to `/hikvision/events`,
   with protocol HTTP.

The agent identifies a Hikvision device by its MAC address, or by its IP address if the event has no
MAC. Some firmware also needs event upload or "notify surveillance center" enabled for
access-control events.

Within a minute or two, the device should appear under `devices` in `/health` and in the next
heartbeat.

## How punches are read

**ZKTeco `ATTLOG` lines:** `PIN, date time, status, verify, workcode…`, separated by tabs (or
spaces). Times are the device's wall clock in `GP_TIME_ZONE`, and the agent converts them to ISO
8601 with the correct offset. A time that occurs twice when clocks go back is read as the first
occurrence. The status maps to a direction as follows:

| Status | Meaning      | Direction |
| ------ | ------------ | --------- |
| 0      | Check-in     | `in`      |
| 1      | Check-out    | `out`     |
| 4      | Overtime in  | `in`      |
| 5      | Overtime out | `out`     |
| Other  |              | `unknown` |

Malformed lines are logged and skipped. Other tables (`OPERLOG`, `ATTPHOTO`, `USERINFO` and so on)
are acknowledged and ignored.

**Hikvision events:** the agent accepts JSON bodies, and `multipart/form-data` bodies where it takes
the first part that is a JSON object. Pictures are ignored, and uploads over 5 MB are cut at 5 MB.
An event becomes a punch only when all of these hold:

- `eventType` is `AccessControllerEvent`
- `majorEventType` is 5
- `subEventType` is in `GP_HIKVISION_EVENT_TYPES`
- `employeeNoString` is present

The agent maps `attendanceStatus` to a direction: `checkIn` and `overtimeIn` are `in`, `checkOut`
and `overtimeOut` are `out`, and anything else is `unknown`. Heartbeat events mark the device as
seen. The device always gets `200` unless the punch could not be written to disk; then it gets
`503`, so it retries.

## Inspecting the queue

`queue.db` is a plain SQLite file:

```sh
sqlite3 data/queue.db "SELECT status, COUNT(*) FROM punches GROUP BY status"
sqlite3 data/queue.db "SELECT device_serial, device_user_id, punched_at, last_error FROM punches WHERE status = 'rejected'"
```

If rows were rejected because of a problem that has since been fixed in the cloud, stop the agent
and run `UPDATE punches SET status = 'queued' WHERE status = 'rejected'`. The rows are sent on the
next start.

The agent deletes uploaded punches after 30 days. It never deletes queued or rejected punches.

## Status

**This has been tested only against simulated device traffic** (unit tests and an end-to-end test
with a fake cloud), **not against real ZKTeco or Hikvision hardware.** Firmware varies. Before
rolling it out, try each device model at a pilot site. Watch the log at `GP_LOG_LEVEL=debug` and
`/health`, and compare the punches in the cloud with the device's own log. Known gaps:

- Newer ZKTeco "PUSH 3" firmware that registers via `/iclock/registry` is not handled specially.
- Hikvision's older XML (`EventNotificationAlert`) event format is not parsed.

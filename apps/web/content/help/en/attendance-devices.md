---
title: Attendance devices and the Edge Agent
summary: Connect ZKTeco and Hikvision devices at each site through the Edge Agent, and match the people enrolled on them to employees.
category: time
order: 10
updated: 2026-10-27
related: /workspace/attendance/devices /workspace/employees /workspace/setup
---

Fingerprint, card and face devices do not talk to Good People directly. At each site, a small program called the **Edge Agent** runs on a PC on the same network. The devices send every punch to it, it saves each one on its own disk first, and then uploads them whenever the internet is up. A punch is never lost while the connection is down.

## Add an agent for a site

1. Go to **Attendance setup → Devices**. Only people who manage attendance see it.
2. Under **Edge Agents**, type the site's name (for example "Gazipur gate PC") and choose **Add agent**.
3. Copy the token straight away: it is shown only once.
4. On the site PC, set it as `GP_AGENT_TOKEN`, with `GP_API_URL` set to your Good People API address, and start the agent. It needs Node.js 24 or later and runs on Windows, a mini PC or a Raspberry Pi. Run it as a service that starts by itself, and give the PC a fixed address on the network.

The agent reports in every minute with its version and how many punches are waiting. The agent's line shows when it was **Last seen** and how many are waiting to upload. If a PC is lost or replaced, **Revoke** its agent and add a new one: the old token stops working at once, and that agent keeps its punches until it is given a new token.

## Point the devices at the agent

- **ZKTeco (ADMS push):** on the device, open **Menu → Comm. → Cloud Server Setting**. Set the server address to the agent PC's address and the port to `8081`, with HTTPS off.
- **Hikvision (HTTP listening):** in the device's web page, open **Configuration → Network → Advanced → HTTP Listening**. Set the destination to the agent's address, port `8081` and URL `/hikvision/events`.

Within a minute or two the device appears under **Devices**. Give it a name and the location it stands at. A device that sends the same punch twice is counted once: the same device, person and second is one punch.

> Firmware varies between models. Try each model at one site first and compare the punches in Good People with the device's own log. Newer ZKTeco "PUSH 3" registration and Hikvision's older XML events are not supported yet.

## Match device users to employees

Devices know people by the number they were enrolled under. Record that number as the employee's **Device PIN** on the **Attendance** tab of their employee page.

Punches from a number that no employee has wait under **Unmatched device users**, with how many there are and the dates. Choose the employee and **Claim**: the number becomes their device PIN, the waiting punches are linked to them, and the days they cover are worked out again. Saving the PIN on the employee page does the same. Nothing is thrown away while a number is unmatched.

## Check that everything reports

The **Go-live checklist** shows how many **Attendance devices** reported in the last day, and under **Device numbers** how many employees have theirs. Matched punches are processed as soon as they arrive, and the stored days are brought up to date every 15 minutes as well. Punches from devices can also be read on the employee's Attendance tab, where HR can add a missed punch or void a wrong one with a reason.

If the workspace becomes read-only, the agent keeps its punches and sends them once the workspace is writable again. Punching from phones is covered in [punching from the app or the web](/help/mobile-punch).

---
title: Punching from the app or the web
summary: Let employees punch in and out from their phone or browser, inside their workplace's geofence or anywhere, and correct a missed punch through approvals.
category: time
order: 20
updated: 2026-10-27
related: /workspace/attendance /workspace/attendance/settings /workspace/organization /workspace/approvals
---

Besides the attendance devices, an employee with a login can punch in and out on **My attendance** in the web app, or on the **Today** tab under **Attendance** in the mobile app. The first punch of the day is the in-punch and the next is the out-punch; the day's result is worked out from the first punch in and the last punch out.

## Choose how people may punch

Go to **Attendance setup → Rules & shifts**. Under **Punching from the apps**, choose one:

- **Off:** only the devices record attendance.
- **Inside the location's geofence:** the default. The punch is accepted only near the employee's workplace that day.
- **Anywhere:** for field staff. A punch away from the workplace is still recorded, with its distance, and the day is marked **Outside geofence** so HR can see it.

Devices always work, whatever you choose here. Tick **App punches need a photo** to make the camera open first: a photo is then taken with each punch, kept in the employee's documents and shown with the punch. In a group of companies, a company can have its own rule on **Group → Policies**.

## Set each workplace's geofence

On **Organization**, under **Locations**, give each location its latitude, longitude and **Punch radius (m)**. A punch counts as inside when the phone is within the radius, allowing for the accuracy the phone reports, up to 50 m more. With geofencing on and no geofence for the location, nobody there can punch from the app until one is set. The **Go-live checklist** shows how many locations have one.

The phone or browser asks for the location. When punching is limited to the geofence, the location is required: if the employee refuses or it times out, the punch is not recorded and they are asked to allow it.

## Rules every punch follows

- A second punch within a minute of the last one is refused, so a double tap cannot record two.
- People who have left the company cannot punch.
- Punches are never deleted. HR can void a wrong one with a reason on the employee's **Attendance** tab, or add a missed one.

## Without a connection

The mobile app keeps a punch made offline on the phone, with the time it was made, and sends it when the phone is back online. Each punch counts once however often the app sends it. A punch that reaches us more than 72 hours after it was made is refused: ask for a correction instead. The web app needs a connection to punch.

## Correcting a missed punch

On **My attendance**, choose **Correct** beside the day (or **Request correction** in the app) and pick a kind:

- **Missed punch:** the in time, the out time or both. An out time earlier than the in time means the next morning, for a night shift.
- **On official duty:** the day was spent working elsewhere.

Write a reason and **Send for approval**. Corrections go back as far as the **Correction window (days)** in the settings, 30 days unless HR changes it, and only for days that have started. One correction per day can wait at a time, and a waiting one can be cancelled.

The request goes to the **Approvals** inbox of whoever is ticked under **Corrections are approved by**: the employee's manager by default, and HR too if you add it. A manager without a login is skipped and HR decides instead; with nothing ticked, corrections are approved at once. An approved missed punch becomes a punch marked as a correction, and the day is worked out again. Device set-up is in [attendance devices and the Edge Agent](/help/attendance-devices).

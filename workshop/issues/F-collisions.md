---
key: F
title: "Feature: POST /collisions to find jobs that fire at the same minute"
labels: enhancement
---

We had an incident where three jobs all kicked off at 03:00 on the 1st and saturated the scheduler box. Nobody caught it because the schedules live in different config files.

Add a `POST /collisions` endpoint.

**Request**

```json
{
  "jobs": [
    { "name": "nightly-db-backup", "schedule": "0 3 * * *", "durationMinutes": 45 },
    { "name": "search-index-rebuild", "schedule": "0 3 * * *", "durationMinutes": 70 }
  ]
}
```

**Response**

- groups of jobs whose next runs land in the same minute
- jobs whose run windows overlap, based on `durationMinutes`

`examples/jobs.json` is a realistic input to test against.

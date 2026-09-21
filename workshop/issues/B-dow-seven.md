---
key: B
title: "Bug: weekly jobs written as 0 12 * * 7 are rejected"
labels: bug
---

Our scheduler config uses `0 12 * * 7` for the weekly usage report (see `examples/jobs.json`). Standard cron accepts `7` as Sunday, but cronwise rejects it with a 400.

**Repro**

```bash
curl -s -G http://localhost:3000/explain --data-urlencode "expression=0 12 * * 7"
```

**Actual**

```json
{ "error": "dayOfWeek value 7 is out of range (0-6)", "field": "dayOfWeek" }
```

**Expected**

Identical output to `0 12 * * 0`, including the same `nextRuns`.

---
key: A
title: "Bug: noon and midnight display as 0:00 PM and 0:00 AM"
labels: bug
---

The 12-hour clock conversion is wrong at the two boundaries that matter most.

**Repro**

```bash
curl -s -G http://localhost:3000/explain --data-urlencode "expression=0 12 * * *"
curl -s -G http://localhost:3000/explain --data-urlencode "expression=@daily"
```

**Actual**

- `0 12 * * *` -> "At 0:00 PM every day"
- `@daily` -> "At 0:00 AM every day"

**Expected**

- `0 12 * * *` -> "At 12:00 PM every day"
- `@daily` -> "At 12:00 AM every day"

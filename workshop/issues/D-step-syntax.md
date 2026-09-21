---
key: D
title: "Enhancement: describe step syntax like */15 as every 15 minutes"
labels: enhancement
---

Step expressions are expanded into a count instead of being summarized. See the `TODO` in `src/humanize.js`.

**Repro**

```bash
curl -s -G http://localhost:3000/explain --data-urlencode "expression=*/15 * * * *"
```

**Actual**

"96 times a day every day" — technically true and completely useless.

**Expected**

"Every 15 minutes".

Ranges with steps should work too: `0-30/10 * * * *` -> "Every 10 minutes from :00 to :30".

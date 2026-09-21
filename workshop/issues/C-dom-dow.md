---
key: C
title: "Bug: job with both a day-of-month and a day-of-week almost never fires"
labels: bug
---

We have a job configured as `0 3 1 * MON` — run the monthly close on the 1st, **and** every Monday as a catch-up. cronwise says the next run is over a year away.

**Repro**

```bash
curl -s -G http://localhost:3000/explain --data-urlencode "expression=0 3 1 * MON"
```

**Actual**

The first predicted run is the next date where the 1st of the month happens to *be* a Monday.

**Expected**

Our production scheduler fires this job on the 1st **or** on any Monday. The next run should be within days, not months.

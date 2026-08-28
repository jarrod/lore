---
type: Attested Computation
title: Revenue for fiscal year
description: Computes recognized revenue for a fiscal year.
status: stable
stale_after: 2099-12-31
runtime: bigquery
parameters:
  - name: year
    type: integer
    required: true
executor:
  resource: ../references/runner.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: ../references/attester.md
generated:
  by: fixture-agent/1.0
  at: 2026-08-20T09:00:00Z
verified:
  by: human:reviewer
  at: 2026-08-20T10:00:00Z
sources:
  - id: revenue-policy
    resource: ../references/policy.md
    title: Revenue policy
    author: team:finance
    usage_count: 100
    last_modified: 2026-08-01
usage_window:
  from: 2026-08-01
  to: 2026-08-20
---
# Computation

```sql
SELECT SUM(amount) AS revenue
FROM recognized_revenue
WHERE fiscal_year = @year
```

The calculation follows the revenue policy.[^revenue-policy]

[^revenue-policy]: Revenue policy

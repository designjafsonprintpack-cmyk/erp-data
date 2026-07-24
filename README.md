# vercel.json — Hobby-plan cron fix

Replace the `vercel.json` at the ROOT of the repo (next to package.json —
NOT inside src/) with this one, commit, push. The failing deployment will
go green.

Change: production-reminders cron was every 15 minutes (`*/15 * * * *`),
which Vercel's Hobby plan rejects at deploy time (daily-only limit) — that
was the entire reason deployments were failing. It now runs once daily at
09:00 Pakistan time (0 4 * * * UTC). The other two crons (reports 8am,
automation rules 6am) were already daily and are unchanged.

Trade-off (accepted): the "3-hours-before" stage reminders and Pending
Alerts now only fire once a day instead of every 15 minutes. If you move
to Vercel Pro later, changing this one line back to `*/15 * * * *`
restores the original behavior.

# Settings — "Back to Settings" link on every sub-page

2 new files, no migrations, no env vars. Drop into `src/` and redeploy.

Every Settings sub-page (Machines, Workflow, Permissions, Materials — all
17 of them) now shows a "← Back to Settings" link at the top. The Settings
index page itself doesn't show it. One shared layout covers all pages, so
any future settings page gets it automatically.

# Lock the home timezone after the first journal entry

Investment Journal periods use one user-level home timezone. The Journal detects the browser timezone and lets the user correct it before creating their first entry, then locks it once an entry exists. This deliberately avoids per-entry timezone snapshots and historical migrations while ensuring that calendar periods and their transaction queries retain stable boundaries.

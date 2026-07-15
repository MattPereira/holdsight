# Delete the private repository after cutover

The existing private repository will remain locked for a seven-day rollback quarantine after the five open issues are sanitized and migrated and the new public repository is serving production successfully, then it and obsolete local clones will be deleted. This supersedes ADR-0003's permanent historical archive because eliminating the old history reduces sensitive-data exposure more than retaining development history benefits the project.

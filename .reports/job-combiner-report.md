status: success
branch: feature/desktop-separate-prefs-storage-for-stagi-9c65b761
merged:
  - job/2506e8ad-eee3-4620-b2c7-84748f24c77b
conflicts_resolved: []
failure_reason:

PR: https://github.com/zazig-team/zazigv2/pull/403

## Notes

- Merged job/2506e8ad-eee3-4620-b2c7-84748f24c77b into feature/desktop-separate-prefs-storage-for-stagi-9c65b761 with no conflicts
- CI workflow already exists on master — skipped CI injection
- Changes: Use separate prefs file for staging vs production in packages/desktop/src/main/index.ts to prevent cross-environment preference or credential bleed

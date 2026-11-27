## Summary

-

## Security impact

- [ ] No parser, serializer or CLI security behavior changed
- [ ] Security behavior changed and the threat model section was updated
- [ ] This change fixes a nonpublic security report

## Verification

- [ ] `npm test`
- [ ] `node scripts/build-cjs.mjs --check`
- [ ] `node scripts/cli-smoke.mjs`
- [ ] `npm pack --dry-run`
- [ ] New or changed behavior has regression tests
- [ ] POSIX-only assertions are guarded for Windows

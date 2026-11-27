# Contributing to yamlcage

Thanks for helping improve a security-sensitive parser. Correctness and safe
failure are more important than broad YAML feature coverage.

## Ground rules

- Keep runtime dependencies and development dependencies empty.
- Keep Node.js 18 compatibility, including Windows.
- Do not use regular expressions that can catastrophically backtrack.
- Do not convert a rejection into a warning without a documented opt-in.
- Do not silently widen the YAML subset. Unsupported syntax must fail closed.
- Do not edit generated `cjs/index.cjs` directly. Edit `src/index.mjs` and run
  `node scripts/build-cjs.mjs`.
- Keep line endings as LF.
- Never commit credentials, tokens, local absolute paths or private email
  addresses.

## Verification checklist

Run all commands before opening a pull request:

```sh
npm test
node scripts/build-cjs.mjs --check
node scripts/cli-smoke.mjs
npm pack --dry-run
```

A parser change should include attack regression tests and ordinary valid YAML
tests. A serializer change should include a round-trip test through
`parseSafeYaml`. A CLI change should test both stdout and the exit code.

## Test style

Tests use only `node:test` and Node.js built-ins. Test files live in `tests/`
and end in `.test.mjs`. `scripts/run-tests.mjs` explicitly enumerates them so
behavior stays consistent on Windows Node.js 18 and 20.

POSIX-only behavior such as executable file mode must be guarded with
`process.platform !== 'win32'`.

## Security reports

Do not open public issues for exploitable parser differentials, expansion
bypasses, encoding bypasses or CLI file-handling problems. Follow
`SECURITY.md` instead.

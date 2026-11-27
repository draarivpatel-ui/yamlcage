# Security Policy

## Supported versions

Only the latest published `1.x` release receives security fixes. Users should
upgrade promptly when a security release is published.

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| Older than 1.0.0 | No |

## Reporting a vulnerability

Report suspected vulnerabilities privately through the GitHub Security
Advisories workflow for `draarivpatel-ui/yamlcage`. Do not open a public
issue, pull request or discussion with a working exploit payload.

Include:

- The exact package version and Node.js version
- Whether input came through `parseSafeYaml`, `parseSafeYamlBytes`,
  `parseSafeYamlDocuments`, `auditYaml`, `stringifySafeYaml`, a configured
  instance or the CLI
- The complete options object, with secrets removed
- A minimal YAML or byte fixture, encoded as base64 or hex when control bytes
  matter
- The expected safe result and the actual result or finding code
- Whether behavior differs between ESM and CommonJS or between operating
  systems

A small script that imports the package and prints the finding or error code
is enough.

## Scope

In scope:

- Alias expansion or Billion Laughs amplification bypasses
- Constructor, tag or deserialization behavior in accepted input
- Prototype pollution through keys, merge keys or output object shape
- Duplicate-key acceptance at any nesting level
- Multi-document smuggling into a single-document API
- UTF-8, BOM, surrogate or control-character differentials
- Depth, byte, node, sequence, key or output limit bypasses
- Serializer output that a YAML 1.1 parser can reinterpret unsafely
- CLI symlink, FIFO, device, terminal escape or exit-code weaknesses

Out of scope:

- YAML syntax outside the documented strict subset, unless accepting it causes
  one of the security outcomes above
- Vulnerabilities in another YAML parser that receives unvetted input
- Resource use proportional to documented configurable limits
- Attacks that require write access to the victim application or its trusted
  configuration files

## Response goals

Critical parser bypasses should receive an initial maintainer response within
seven days. Lower-severity hardening reports should receive an initial response
within fourteen days. These are goals, not contractual commitments.

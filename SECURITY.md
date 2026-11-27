# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Use the private GitHub Security Advisories form: [Report a vulnerability](https://github.com/draarivpatel-ui/yamlcage/security/advisories/new). Do not open a public issue, pull request, or discussion with exploit details, secrets, private endpoints, or personal data.

Include the affected version, Node.js version, the API or CLI path used, the complete options object with secrets removed, a minimal YAML or byte fixture, the expected safe result, and the actual result or finding code.

## Disclosure timeline

We acknowledge reports within 48 hours. We aim to confirm or reject the report within 7 days, prepare a fix as soon as practical, and coordinate public disclosure with the reporter. Unless a shorter deadline is required by an actively exploited issue, please allow up to 90 days for a coordinated fix and disclosure.

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

## Out of scope

YAML syntax outside the documented strict subset is out of scope unless accepting it causes one of the security outcomes above. Resource use proportional to documented configurable limits and attacks requiring write access to trusted configuration files are also out of scope.

## Hardening notes

The package has zero runtime dependencies. Input budgets, fail-closed validation, deterministic tests, and property-based fuzz tests are part of the maintenance bar. A report that the library marks unsafe must block the operation in the caller; audit output is a boundary signal, not proof that a downstream system is safe.

## Disclosure history

No published advisories yet. Fixed versions will be listed here with their advisory links.

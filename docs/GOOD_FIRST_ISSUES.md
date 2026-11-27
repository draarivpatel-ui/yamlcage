# Good first issues

These ten starter specifications are intentionally narrow. Each should include
tests, documentation updates when behavior changes, and the full verification
checklist from `CONTRIBUTING.md`.

1. **Plain scalar indicator audit.** Add precise tests for plain scalars that
   begin with indicator characters accepted or rejected by the strict subset.
   Document the accepted set in README.md.

2. **Block scalar indentation fixtures.** Add fixture-driven tests for literal
   and folded scalars with indentation indicators `1` through `9`, including
   content that is intentionally more indented than the base indentation.

3. **Folded scalar reference cases.** Add a table of small folded-scalar inputs
   and exact expected strings covering blank lines, more-indented lines, strip,
   clip and keep chomping.

4. **Norway warning matrix.** Generate a test matrix for every YAML 1.1
   boolean spelling in the README. Prove the parsed value is a string and the
   audit warning appears exactly once per scalar.

5. **Core float matrix.** Add positive and negative tests for `1.`, `.5`,
   `1e3`, `1E-3`, `+2.5`, leading zeros, overflow and underflow. Keep the
   matrix data-driven.

6. **Alias budget independence.** Add tests proving `maxAliases`,
   `maxAliasDepth` and `maxExpandedNodes` fail independently, with one test
   fixture per budget and one control fixture that remains accepted.

7. **Merge precedence fixtures.** Add deterministic merge-key tests for
   explicit-key override, sequence precedence and disabled-by-default behavior.
   Keep merge keys disabled in every unrelated fixture.

8. **Serializer ambiguity corpus.** Add a data-driven corpus of strings that
   must be quoted, including YAML 1.1 booleans, YAML 1.2 booleans, nulls,
   leading-zero numbers, empty strings, key separators and comment leaders.
   Round-trip every case.

9. **CLI malformed flag matrix.** Add CLI tests for duplicate flags, unknown
   flags, missing values, multiple inputs and nonnumeric limits. Assert exit
   code `2` and ANSI-neutralized stderr.

10. **TypeScript declaration consumer check.** Add a dependency-free smoke
    script that parses `types/index.d.ts` textually for every exported public
    API name, so accidental declaration drift fails in CI without adding a
    TypeScript dependency.

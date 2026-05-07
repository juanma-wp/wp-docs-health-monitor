# Checks

This document defines every check the validator runs against a documentation page. Each check maps to an issue `type` in `src/types/results.ts` and corresponds to a category in the system prompt (`src/adapters/validator/claude.ts`).

A check either finds nothing (silent pass) or produces one or more `Issue` objects with a severity, evidence, and a specific suggestion for fixing the doc.

---

## What counts as drift

### `type-signature`

A function parameter was added, removed, or renamed; or a return type changed — and the documentation still describes the old signature.

**Fires when:**
- A parameter the doc lists no longer exists in the function definition
- A new required parameter exists in the code that the doc doesn't mention
- A parameter name in the doc differs from the one in the source

**Does not fire for:**
- Undocumented optional parameters whose absence won't cause a developer's code to fail
- Teaching simplifications that omit edge-case overloads

**Default severity:** `critical` — a developer copying the documented signature will get a runtime error.

**Real example (none found in first run — check is active)**

---

### `default-value`

A default value documented for a parameter or property no longer matches what the code actually uses.

**Fires when:**
- The doc says a parameter defaults to `false` but the code initialises it to `null`
- A version number documented as "since X" is off by one release

**Does not fire for:**
- Differences in how the default is expressed (e.g. `0` vs `false`) if they are semantically equivalent

**Default severity:** `major` — misleading but rarely immediately breaking.

**Real example — `block-registration`:**
> Doc says `variations` is available **Since: WordPress 5.9.0**. The `$variations` property in `class-wp-block-type.php` is annotated `@since 5.8.0`. One minor release off — matters for plugin compatibility checks.

---

### `deprecated-api`

A function, hook, filter, or attribute that the code marks as deprecated is still documented as current or recommended.

**Fires when:**
- The code has a `@deprecated` annotation or calls `_deprecated_function()` / `_doing_it_wrong()` for something the doc presents as the correct approach
- The doc shows a deprecated usage pattern without noting it is deprecated

**Does not fire for:**
- Docs that explicitly mention the deprecation and point to the replacement

**Default severity:** `major` — developers will adopt a pattern the codebase is moving away from.

**Real example (none found in first run — check is active)**

---

### `broken-example`

A code example in the documentation would throw, produce wrong output, or silently fail against the current codebase.

**Fires when:**
- An example calls a function with the wrong number of arguments
- An example references a constant or global that no longer exists
- An example uses a removed API

**Does not fire for:**
- Simplified pseudocode clearly presented as illustrative, not runnable
- Minor style differences (spacing, variable naming) that don't affect execution

**Default severity:** `critical` — a developer running the example gets a broken result.

**Real example (none found in first run — check is active)**

---

### `nonexistent-name`

A function, hook, filter, block attribute, or property name that the documentation references does not exist in the mapped source files.

**Fires when:**
- A property listed in the doc (`color.gradient`) has a different name in the code (`color.gradients`)
- A feature documented as a subproperty (`aspectRatio` under `dimensions`) is absent from the doc entirely, or vice versa
- A property documented as valid no longer appears anywhere in the codebase

**Does not fire for:**
- Names that exist in unmapped files (the validator only sees mapped code files — see [Architecture](ARCHITECTURE.md))

**Default severity:** `major` — a developer using the documented name gets a silent no-op or a runtime error.

**Real examples — `block-supports`:**
> - Doc uses `color.gradient` (singular). Code checks `colorSupport.gradients` (plural) in `packages/block-editor/src/hooks/color.js`. Using the documented key silently does nothing.
> - Doc lists `height`, `minHeight`, `minWidth`, `width` as `dimensions` subproperties. Code also supports `aspectRatio` in `hasDimensionsSupport()` — undocumented, invisible to developers.

**Real example — `block-patterns`:**
> Doc documents a `source` property for `register_block_pattern()`. The property does not appear anywhere in `class-wp-block-patterns-registry.php`. Additionally, `filePath` (added WP 6.5.0) is not documented at all.

---

### `required-optional-mismatch`

A parameter or property is documented as optional when the code treats it as required, or vice versa.

**Fires when:**
- The code calls `_doing_it_wrong()` when a property is absent, but the doc doesn't mention it is required
- The doc marks a parameter as required but the code provides a default and handles its absence gracefully

**Does not fire for:**
- Parameters that are technically required by signature but have such sensible implied defaults that omitting them never causes problems in practice

**Default severity:** `minor` — usually discovered at integration time rather than causing silent bugs.

**Real example — `block-bindings`:**
> Doc intro says registering a source requires "a name and a callback function." Code in `class-wp-block-bindings-registry.php` calls `_doing_it_wrong()` when `label` is absent — it is required, but the doc omits it entirely.

---

## What does NOT count as drift

These are explicitly excluded from all checks:

- **Teaching simplifications** — intentional omission of edge cases or complexity for clarity. A doc that shows the simple case without covering every overload is not wrong.
- **Undocumented optional parameters** — unless their absence would cause a developer's code to fail or produce a surprise.
- **Style, grammar, or typos** — content accuracy only, not prose quality.
- **Broken external links** — out of scope.
- **Strict subsets** — if the documented behaviour is a strict subset of actual behaviour AND following the doc would not cause failure or surprise, it is not drift.

---

## Severity scale

| Severity | Meaning | Health score penalty |
|----------|---------|----------------------|
| `critical` | Following the doc causes a developer's code to fail or produce incorrect output | −15 pts |
| `major` | The doc is misleading or likely to confuse developers, but not immediately breaking | −7 pts |
| `minor` | Technically inaccurate but unlikely to cause problems in practice | −2 pts |

A doc starts at 100 and loses points per issue. Status thresholds:

| Score | Status |
|-------|--------|
| ≥ 85 | `healthy` |
| 60–84 | `needs-attention` |
| < 60 | `critical` |

---

## Known limitations

- **Absence detection** — the verbatim-check requires Claude to quote code that contradicts the doc. It cannot flag things the doc claims exist but are simply absent from the source. Tracked in [issue #29](https://github.com/juanma-wp/wp-docs-health-monitor/issues/29).
- **Unmapped files** — the validator only sees the code files listed in `mappings/`. If a documented API lives in an unmapped file, drift in that file will not be detected.
- **Confidence threshold** — issues below 0.7 confidence are dropped before Pass 2. The threshold is hardcoded in `claude.ts`.

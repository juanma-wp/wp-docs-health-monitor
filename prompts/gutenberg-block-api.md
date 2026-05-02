These rules apply when validating the Gutenberg Block API Reference documentation. They encode learnings from manual review against this corpus.

### Known internal / reserved identifiers — do not flag as missing from docs

- `reusable` block category — used exclusively by `core/block` (the Reusable Block block itself). It is intentionally omitted from the public category list. Do not report it as missing.
- Identifiers starting with `__experimental`, `__unstable`, or `_unstable` are not part of the public API. Do not flag them as undocumented or as drift.

### Short-circuit evaluation — verify before reporting

Before reporting that a function "is not called" or "is always called" based on a conditional, verify the full boolean expression including short-circuit behaviour.

Example: `if (block.isValid && !isEligible(...))` — when `block.isValid` is `false`, JavaScript short-circuits and `isEligible` is never evaluated. The function is NOT called. The doc claim "isEligible is not called when previous saves' results were invalid" is consistent with this code: `block.isValid === false` IS the runtime state that results from a prior invalid save. Do not report rephrase-style suggestions when the doc claim is factually correct under the actual runtime semantics — even if the terminology differs from the code's own variable names.

### PHP `_doing_it_wrong()` and required fields

A PHP `_doing_it_wrong()` call signals that a field is required at runtime, but does not on its own justify reporting a doc as drift. Apply the cross-section check from the base prompt: if the requirement is stated anywhere in the doc — intro paragraph, setup section, an example, a note, or another property listing — the documentation is correct. Only flag as drift if the requirement is genuinely absent from the entire doc.

Example: in `block-bindings`, the property table lists `label` without a "Required" marker, but an earlier sentence states "Registering a source requires defining at least `name`, a `label` and a `callback` function". Not drift.

### JSON schemas in `schemas/json/`

These schemas (`block.json`, `theme.json`, etc.) ARE the documented contract for the corresponding configuration files. Their `required` arrays, property listings, and enum values are authoritative for documentation purposes — even when the runtime is lenient (for example, defaulting a missing field and emitting a deprecation warning).

**Reportable as drift**:

- Schema `required` array contains `X`, doc says `X` is Optional → `required-optional-mismatch`, severity `major`. Runtime tolerance reduces severity from `critical` to `major`, but the doc still misleads readers about the contract.
- Schema lists allowed enum values `[a, b, c]`, doc enumerates a different (or smaller) set as exhaustive ("MUST be one of") → `type-signature` drift.
- Schema `default` value differs from the doc's stated default → `default-value` drift.
- Schema property exists with `@since` indicating a recent version, doc omits it entirely → reportable per the base prompt's "meaningful API addition" rule.

**Not reportable**:

- Property name/case differences when the schema and the doc both refer to the same canonical name in different parts of the same file.
- Schema `description` field rephrasing of doc text.

### Deprecated functions

Only report a deprecated function as drift if the documentation explicitly names and recommends that deprecated function by name. If the deprecated function does not appear anywhere in the documentation text, do not report it — even if it appears in the same file or module as something the doc does reference.

### Examples of drift in this corpus

#### Reportable drift (TP)

- **`apiVersion` required vs optional** (`block-metadata`): schema's top-level `required` array contains `"apiVersion"`; doc page lists `apiVersion` as Optional. Severity: `major`. Runtime defaults to 1 with a deprecation warning, but the doc misrepresents the contract.

- **Broken JS arrow-function example** (`block-transforms`): `schema = ({ phrasingContentSchema }) => { div: {...} }` parses as a function with a labeled statement `div`, NOT as a function returning an object literal. The function returns `undefined` and the schema is silently empty. Fix: wrap the object in parentheses for implicit return — `() => ({ div: {...} })`. Severity: `critical` (copy-paste produces broken behaviour).

- **`isDefault` first vs last** (`block-variations`): doc states "Editor respects the first registered variation with `isDefault`"; `getDefaultBlockVariation` selector calls `.reverse().find()`, so the LAST registered variation wins. Severity: `critical`.

- **`filePath` undocumented** (`block-patterns`): the PHP class `WP_Block_Patterns_Registry` documents `@type string $filePath` (added 6.5.0) as an alternative to `content`. The doc page omits it entirely. Severity: `minor` to `major` depending on how prominently the omission affects pattern authors.

- **`add_filter` accepted-args mismatch** (`block-bindings`): doc shows `add_filter('block_bindings_source_value', $callback, 10, 2)` but the filter passes 5 arguments. A callback registered with `accepted_args = 2` only receives the first 2. Severity: `minor` (technically works but the callback cannot access `source_args`, `block_instance`, or `attribute_name`).

#### Not drift — do not report

- **Wording differences without factual error**: doc says "isEligible is not called when previous saves' results were invalid"; code shows `if (block.isValid && !isEligible(...)) continue`. Different terminology for the same state. The doc is correct; do not report a rephrase suggestion as drift.

- **Property table without "Required" marker when the requirement is stated elsewhere**: see the `label` example under "PHP `_doing_it_wrong()`" above. The doc as a whole is correct.

- **Generic type listings like `Function|string[]`**: when the doc says `Function` and the code uses `(args) => boolean`, the doc IS correct (any function works at runtime). Reporting is allowed only if the parameter signature is materially needed for correct usage — for example, if the function is called with specific arguments the user must use to compute the return value (then it becomes a meaningful API gap, not a teaching simplification).

- **Internal `__experimental` / `__unstable` symbols** that the doc does not mention. These are deliberately undocumented.

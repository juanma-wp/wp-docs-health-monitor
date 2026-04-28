# Mapping Guidelines

This document explains how to build and maintain the mappings in `mappings/`.

Each entry maps a doc slug to a set of tiered code files. The validator sends these files as context to Claude — primary files are always included, secondary and context files are added until the token budget is exhausted.

---

## Source authority

When choosing which files to map, consider their authority for the doc's subject:

| Source type | Authority | When to use |
|-------------|-----------|-------------|
| JSON Schema | **Useful for property names and types** — but these schemas are designed for IDE tooling (autocomplete, editor validation), not runtime enforcement. Good for checking valid property names and value types. Do NOT use `required` arrays to determine whether a field is required — confirm that in TypeScript/PHP source. | Any doc describing JSON configuration |
| Test files | **High** — encodes intended public API behavior and contracts | Any doc describing a public function or API |
| TypeScript/PHP source | **Standard** — authoritative for runtime behavior | All docs |

---

## Tier assignment

### `primary` (max 3 files, always included)

The most directly relevant files — the ones that define the API or behavior the doc describes. A reader checking a doc claim should go here first.

**Rule: if the doc describes JSON configuration (block.json, theme.json, wp-env.json, or similar), the corresponding JSON schema MUST be in the primary tier.**

Known schemas in the Gutenberg repo:
- `schemas/json/block.json` — block.json metadata fields, attribute types and sources
- `schemas/json/theme.json` — theme.json configuration
- `schemas/json/wp-env.json` — wp-env configuration

### `secondary` (max 5 files, added after primary)

Supporting files that provide useful context for the primary files — related registries, store reducers, or complementary implementations.

### `context` (max 8 files, added last, dropped first under token pressure)

Broader context files — parent registries, base classes, or related APIs that may be referenced in the doc but are not the primary subject.

---

## Identifying the right files

Start from the doc's subject:
- What function or API is being documented? → find the file that exports it
- Does the doc describe a JSON file format? → find the schema first, then the parser
- Does the doc describe a PHP hook or filter? → find the PHP file that applies it
- Does the doc describe a React component? → find the component and its store selectors

If a public function has tests, add the test file to `primary` or `secondary`. Tests confirm what behavior is an intentional public contract vs an implementation detail.

---

## Example

```json
"block-attributes": {
  "primary": [
    { "repo": "gutenberg", "path": "schemas/json/block.json" },
    { "repo": "gutenberg", "path": "packages/blocks/src/api/parser/get-block-attributes.ts" },
    { "repo": "gutenberg", "path": "packages/blocks/src/api/serializer.tsx" }
  ],
  "secondary": [
    { "repo": "gutenberg", "path": "packages/blocks/src/api/registration.ts" },
    { "repo": "wordpress-develop", "path": "src/wp-includes/class-wp-block.php" }
  ],
  "context": [
    { "repo": "gutenberg", "path": "packages/blocks/src/api/validation/index.ts" }
  ]
}
```

The schema is first in `primary` because it is the most authoritative source for attribute property names and types. The TypeScript parser follows as the runtime implementation.

---

## Adding a new doc

1. Read the doc at developer.wordpress.org
2. Identify the primary function, API, or JSON format it describes
3. Check if a JSON schema exists for any JSON configuration the doc covers
4. Find the 2–3 most relevant source files
5. Add test files if they exist and the function is a public API
6. Run `npx tsx scripts/bootstrap-mapping.ts <slug> --config config/gutenberg-block-api.json` to get a Claude-suggested starting point, then review and adjust manually

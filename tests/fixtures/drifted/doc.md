# Block Registration

The `registerBlockType` function is used to register a new block type. Block type names must be string that contains a namespace prefix. Example: `my-plugin/my-custom-block`.

## Usage

```js
import { registerBlockType } from '@wordpress/blocks';

registerBlockType( 'my-plugin/my-custom-block', {
    title: 'My Custom Block',
    category: 'text',
    edit: function() { return <div>Hello</div>; },
    save: function() { return <div>Hello</div>; },
} );
```

## Parameters

The `registerBlockType` function accepts the following parameters:

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `blockSlug` | string | Yes | The block type's namespaced name. |
| `settings` | Object | Yes | The block type's settings object. |

The first parameter is named `blockSlug` and must follow the `namespace/block-name` pattern.

## Settings Object

The settings object accepts the following properties:

- `title` (string, required): The display title of the block.
- `category` (string): The category the block belongs to.
- `edit` (function, required): The edit function rendered in the editor.
- `save` (function, required): The save function used to render the block's content.
- `icon` (string|element): The icon for the block. Must be a `Dashicon` slug or an SVG element.
- `supports.align` (boolean): Whether the block supports alignment. Default: `false`.

## Deprecated: `wp_register_block_type_from_metadata`

The PHP function `wp_register_block_type_from_metadata` is the old way to register blocks from PHP. It is now deprecated — use `register_block_type` instead.

## The `blockSlug` attribute

The `blockSlug` attribute maps to the block `name` in the block.json file. It must be a non-empty string following the `namespace/block-name` format. Providing an empty string or a string without a namespace prefix will cause registration to fail with a validation error.

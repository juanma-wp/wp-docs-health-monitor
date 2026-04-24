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
| `name` | string | Yes | The block type's namespaced name. |
| `settings` | Object | Yes | The block type's settings object. |

The first parameter is named `name` and must follow the `namespace/block-name` pattern.

## Settings Object

The settings object accepts the following properties:

- `title` (string, required): The display title of the block.
- `category` (string): The category the block belongs to.
- `edit` (function, required): The edit function rendered in the editor.
- `save` (function, required): The save function used to render the block's content.
- `icon` (string|element): The icon for the block.
- `supports` (Object): Optional object with block supports configuration.

## Return Value

Returns the registered block type object if registration was successful, or `undefined` if registration failed.

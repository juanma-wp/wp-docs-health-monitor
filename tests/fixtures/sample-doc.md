---
title: Block Attributes
slug: block-attributes
---

# Block Attributes

Block attributes provide information about the data stored by a block.
They define the structure of the block's data and how it is parsed from the serialized post content.

## Attribute Sources

Attributes can come from various sources:

```js
registerBlockType('my-plugin/example', {
  attributes: {
    content: {
      type: 'string',
      source: 'html',
      selector: 'p',
    },
  },
});
```

You can also use the `attribute` source:

```js
registerBlockType('my-plugin/image', {
  attributes: {
    url: {
      type: 'string',
      source: 'attribute',
      selector: 'img',
      attribute: 'src',
    },
  },
});
```

## Links

For more information, see the [Block Editor Handbook](https://developer.wordpress.org/block-editor/).
Visit [WordPress.org](https://wordpress.org/) for general documentation.
Check out the [Gutenberg repository](https://github.com/WordPress/gutenberg) for source code.

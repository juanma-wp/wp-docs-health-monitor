---
title: Block Attributes
slug: block-attributes
---

# Block Attributes

This is a sample doc with some content for testing.

## Code Examples

Here is a code block:

```php
function my_block_attributes() {
  return array(
    'content' => array(
      'type' => 'string',
    ),
  );
}
```

Another code block:

```js
const attributes = {
  url: {
    type: 'string',
    source: 'attribute',
    selector: 'img',
    attribute: 'src',
  },
};
```

## Links

Check out the [Block API reference](https://developer.wordpress.org/block-editor/).
Visit [WordPress](https://wordpress.org/) for more info.
Also see [Gutenberg GitHub](https://github.com/WordPress/gutenberg).

[config] Merged dev overrides from config/gutenberg-block-api.dev.json
## Documentation: Metadata in block.json

URL: https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/

# Metadata in block.json

Starting with the WordPress 5.8 release, we recommend using the `block.json` metadata file as the canonical way to register block types with both PHP (server-side) and JavaScript (client-side). Here is an example `block.json` file that would define the metadata for a plugin create a notice block.

**Example:**

```json
{
	"$schema": "https://schemas.wp.org/trunk/block.json",
	"apiVersion": 3,
	"name": "my-plugin/notice",
	"title": "Notice",
	"category": "text",
	"parent": [ "core/group" ],
	"icon": "star",
	"description": "Shows warning, error or success notices...",
	"keywords": [ "alert", "message" ],
	"version": "1.0.3",
	"textdomain": "my-plugin",
	"attributes": {
		"message": {
			"type": "string",
			"source": "html",
			"selector": ".message"
		}
	},
	"providesContext": {
		"my-plugin/message": "message"
	},
	"usesContext": [ "groupId" ],
	"selectors": {
		"root": ".wp-block-my-plugin-notice"
	},
	"supports": {
		"align": true
	},
	"styles": [
		{ "name": "default", "label": "Default", "isDefault": true },
		{ "name": "other", "label": "Other" }
	],
	"example": {
		"attributes": {
			"message": "This is a notice!"
		}
	},
	"variations": [
		{
			"name": "example",
			"title": "Example",
			"attributes": {
				"message": "This is an example!"
			}
		}
	],
	"editorScript": "file:./index.js",
	"script": "file:./script.js",
	"viewScript": [ "file:./view.js", "example-shared-view-script" ],
	"editorStyle": "file:./index.css",
	"style": [ "file:./style.css", "example-shared-style" ],
	"viewStyle": [ "file:./view.css", "example-view-style" ],
	"render": "file:./render.php"
}
```

## Benefits of using the metadata file

The block definition allows code sharing between JavaScript, PHP, and other languages when processing block types stored as JSON, and registering blocks with the `block.json` metadata file provides multiple benefits on top of it.

From a performance perspective, when themes support lazy loading assets, blocks registered with `block.json` will have their asset enqueuing optimized out of the box. The frontend CSS and JavaScript assets listed in the `style` or `script` properties will only be enqueued when the block is present on the page, resulting in reduced page sizes.

Furthermore, because the [Block Type REST API Endpoint](https://developer.wordpress.org/rest-api/reference/block-types/) can only list blocks registered on the server, registering blocks server-side is recommended; using the `block.json` file simplifies this registration.

The [WordPress Plugins Directory](https://wordpress.org/plugins/) can detect `block.json` files, highlight blocks included in plugins, and extract their metadata. If you wish to submit your block(s) to the Block Directory all blocks contained in your plugin must have a `block.json` file for the Block Directory to recognize them.

Development is improved by using a defined schema definition file. Supported editors can provide help like tooltips, autocomplete, and schema validation. To use the schema, add the following to the top of the `block.json`.

```json
"$schema": "https://schemas.wp.org/trunk/block.json"
```

<div class="callout callout-info">
Check <a href="https://developer.wordpress.org/block-editor/getting-started/fundamentals-block-development/registration-of-a-block">Registration of a block</a> to learn more about how to register a block using its metadata.
</div>

## Block API

This section describes all the properties that can be added to the `block.json` file to define the behavior and metadata of block types.

### API version

-   Type: `number`
-   Optional
-   Localized: No
-   Property: `apiVersion`
-   Default: `1`

```json
{ "apiVersion": 3 }
```

The version of the Block API used by the block. The most recent version is `3` and it was introduced in WordPress 6.3.

See [the API versions documentation](/docs/reference-guides/block-api/block-api-versions/README.md) for more details.

### Name

-   Type: `string`
-   Required
-   Localized: No
-   Property: `name`

```json
{ "name": "core/heading" }
```

The name for a block is a unique string that identifies a block. Names have to be structured as `namespace/block-name`, where namespace is the name of your plugin or theme.

**Note:** A block name can only contain lowercase alphanumeric characters, dashes, and at most one forward slash to designate the plugin-unique namespace prefix. It must begin with a letter.

**Note:** This name is used on the comment delimiters as `<!-- wp:my-plugin/book -->`. Block types in the `core` namespace do not include a namespace when serialized.

### Title

-   Type: `string`
-   Required
-   Localized: Yes
-   Property: `title`

```json
{ "title": "Heading" }
```

This is the display title for your block, which can be translated with our translation functions. The title will display in the Inserter and in other areas of the editor.

**Note:** To keep your block titles readable and accessible in the UI, try to avoid very long titles.

### Category

-   Type: `string`
-   Optional
-   Localized: No
-   Property: `category`

```json
{ "category": "text" }
```

Blocks are grouped into categories to help users browse and discover them.

The core provided categories are:

-   text
-   media
-   design
-   widgets
-   theme
-   embed

Plugins and Themes can also register [custom block categories](/docs/reference-guides/filters/block-filters.md#managing-block-categories).

An implementation should expect and tolerate unknown categories, providing some reasonable fallback behavior (e.g. a "text" category).

### Parent

-   Type: `string[]`
-   Optional
-   Localized: No
-   Property: `parent`

```json
{ "parent": [ "my-block/product" ] }
```

Setting `parent` lets a block require that it is only available when nested within the specified blocks. For example, you might want to allow an 'Add to Cart' block to only be available within a 'Product' block.

### Ancestor

-   Type: `string[]`
-   Optional
-   Localized: No
-   Property: `ancestor`
-   Since: `WordPress 6.0.0`

```json
{ "ancestor": [ "my-block/product" ] }
```

The `ancestor` property makes a block available inside the specified block types at any position of the ancestor block subtree. That allows, for example, to place a ‘Comment Content’ block inside a ‘Column’ block, as long as ‘Column’ is somewhere within a ‘Comment Template’ block. In comparison to the `parent` property blocks that specify their `ancestor` can be placed anywhere in the subtree whilst blocks with a specified `parent` need to be direct children.

### Allowed Blocks

-   Type: `string[]`
-   Optional
-   Localized: No
-   Property: `allowedBlocks`
-   Since: `WordPress 6.5.0`

```json
{ "allowedBlocks": [ "my-block/product" ] }
```

The `allowedBlocks` specifies which block types can be the direct children of the block. For example, a ‘List’ block can allow only ‘List Item’ blocks as children.

### Icon

-   Type: `string`
-   Optional
-   Localized: No
-   Property: `icon`

```json
{ "icon": "smile" }
```

An icon property should be specified to make it easier to identify a block. These can be any of [WordPress' Dashicons](https://developer.wordpress.org/resource/dashicons/) (slug serving also as a fallback in non-js contexts).

**Note:** It's also possible to override this property on the client-side with the source of the SVG element. In addition, this property can be defined with JavaScript as an object containing background and foreground colors. These colors will appear with the icon when they are applicable e.g.: in the inserter. Custom SVG icons are automatically wrapped in the [wp.primitives.SVG](/packages/primitives/README.md) component to add accessibility attributes (aria-hidden, role, and focusable).

### Description

-   Type: `string`
-   Optional
-   Localized: Yes
-   Property: `description`

```json
{
	"description": "Introduce new sections and organize content to help visitors"
}
```

This is a short description for your block, which can be translated with our translation functions. This will be shown in the block inspector.

### Keywords

-   Type: `string[]`
-   Optional
-   Localized: Yes
-   Property: `keywords`
-   Default: `[]`

```json
{ "keywords": [ "keyword1", "keyword2" ] }
```

Sometimes a block could have aliases that help users discover it while searching. For example, an image block could also want to be discovered by photo. You can do so by providing an array of unlimited terms (which are translated).

### Version

-   Type: `string`
-   Optional
-   Localized: No
-   Property: `version`
-   Since: `WordPress 5.8.0`

```json
{ "version": "1.0.3" }
```

The current version number of the block, such as 1.0 or 1.0.3. It's similar to how plugins are versioned. This field might be used with block assets to control cache invalidation, and when the block author omits it, then the installed version of WordPress is used instead.

### Text Domain

-   Type: `string`
-   Optional
-   Localized: No
-   Property: `textdomain`
-   Since: `WordPress 5.7.0`

```json
{ "textdomain": "my-plugin" }
```

The [gettext](https://www.gnu.org/software/gettext/) text domain of the plugin/block. More information can be found in the [Text Domain](https://developer.wordpress.org/plugins/internationalization/how-to-internationalize-your-plugin/#text-domains) section of the [How to Internationalize your Plugin](https://developer.wordpress.org/plugins/internationalization/how-to-internationalize-your-plugin/) page.

### Attributes

-   Type: `object`
-   Optional
-   Localized: No
-   Property: `attributes`
-   Default: `{}`

```json
{
	"attributes": {
		"cover": {
			"type": "string",
			"source": "attribute",
			"selector": "img",
			"attribute": "src"
		},
		"author": {
			"type": "string",
			"source": "html",
			"selector": ".book-author"
		}
	}
}
```

Attributes provide the structured data needs of a block. They can exist in different forms when they are serialized, but they are declared together under a common interface.

See [the attributes documentation](/docs/reference-guides/block-api/block-attributes.md) for more details.

### Provides Context

-   Type: `object`
-   Optional
-   Localized: No
-   Property: `providesContext`
-   Default: `{}`

Context provided for available access by descendants of blocks of this type, in the form of an object which maps a context name to one of the block's own attributes.

See [the block context documentation](/docs/reference-guides/block-api/block-context.md) for more details.

```json
{
	"providesContext": {
		"my-plugin/recordId": "recordId"
	}
}
```

### Context

-   Type: `string[]`
-   Optional
-   Localized: No
-   Property: `usesContext`
-   Default: `[]`

Array of the names of context values to inherit from an ancestor provider.

See [the block context documentation](/docs/reference-guides/block-api/block-context.md) for more details.

```json
{
	"usesContext": [ "message" ]
}
```

### Selectors

-   Type: `object`
-   Optional
-   Localized: No
-   Property: `selectors`
-   Default: `{}`
-   Since: `WordPress 6.3.0`

Any custom CSS selectors, keyed by `root`, feature, or sub-feature, to be used
when generating block styles for theme.json (global styles) stylesheets.
Providing custom selectors allows more fine grained control over which styles
apply to what block elements, e.g. applying typography styles only to an inner
heading while colors are still applied on the outer block wrapper etc.

See [the selectors documentation](/docs/reference-guides/block-api/block-selectors.md) for more details.

```json
{
	"selectors": {
		"root": ".my-custom-block-selector",
		"color": {
			"text": ".my-custom-block-selector p"
		},
		"typography": {
			"root": ".my-custom-block-selector > h2",
			"text-decoration": ".my-custom-block-selector > h2 span"
		}
	}
}
```

### Supports

-   Type: `object`
-   Optional
-   Localized: No
-   Property: `supports`
-   Default: `{}`

It contains a set of options to control features used in the editor. See [the supports documentation](/docs/reference-guides/block-api/block-supports.md) for more details.

### Block Styles

-   Type: `array`
-   Optional
-   Localized: Yes (`label` only)
-   Property: `styles`
-   Default: `[]`

```json
{
	"styles": [
		{ "name": "default", "label": "Default", "isDefault": true },
		{ "name": "other", "label": "Other" }
	]
}
```

Block styles can be used to provide alternative styles to block. It works by adding a class name to the block's wrapper. Using CSS, a theme developer can target the class name for the block style if it is selected.

Plugins and Themes can also register [custom block styles](/docs/reference-guides/block-api/block-styles.md) for existing blocks.

### Example

-   Type: `object`
-   Optional
-   Localized: No
-   Property: `example`

```json
{
	"example": {
		"attributes": {
			"message": "This is a notice!"
		}
	}
}
```

It provides structured example data for the block. This data is used to construct a preview for the block to be shown in the Inspector Help Panel when the user mouses over the block.

See the [Example documentation](/docs/reference-guides/block-api/block-registration.md#example-optional) for more details.

### Variations

-   Type: `object[]|WPDefinedPath` ([learn more](#wpdefinedpath))
-   Optional
-   Localized: Yes (`title`, `description`, and `keywords` of each variation only)
-   Property: `variations`
-   Since: `WordPress 5.9.0`

```json
{
	"variations": [
		{
			"name": "example",
			"title": "Example",
			"attributes": {
				"level": 2,
				"message": "This is an example!"
			},
			"scope": [ "block" ],
			"isActive": [ "level" ]
		}
	]
}
```

Block Variations is the API that allows a block to have similar versions of it, but all these versions share some common functionality. Each block variation is differentiated from the others by setting some initial attributes or inner blocks. Then at the time when a block is inserted these attributes and/or inner blocks are applied.

_Note: In JavaScript you can provide a function for the `isActive` property, and a React element for the `icon`. In the `block.json` file both only support strings_

Starting with version 6.7, it is possible to specify a PHP file in `block.json` that generates the list of block variations on the server side:

```json
{ "variations": "file:./variations.php" }
```

That PHP file is expected to `return` an array that contains the block variations. Strings found in the variations returned from the PHP file will not be localized automatically; instead, use the `__()` function as usual.

For example:

```php
<?php
// Generate variations for a Social Icon kind of block.

return array(
	array(
		'isDefault'  => true,
		'name'       => 'wordpress',
		'title'      => 'WordPress',
		'icon'       => 'wordpress',
		'attributes' => array(
			'service' => 'wordpress',
		),
		'isActive'   => array( 'service' )
	),
	array(
		'name'       => 'mail',
		'title'      => __( 'Mail' ),
		'keywords'   => array(
			__( 'email' ),
			__( 'e-mail' )
		),
		'icon'       => 'mail',
		'attributes' => array(
			'service' => 'mail',
		),
		'isActive'   => array( 'mail' )
	),
);

```

See [the variations documentation](/docs/reference-guides/block-api/block-variations.md) for more details.

### Block Hooks

-   Type: `object`
-   Optional
-   Property: `blockHooks`
-   Since: `WordPress 6.4.0`

```json
{
	"blockHooks": {
		"my-plugin/banner": "after"
	}
}
```

Block Hooks is an API that allows a block to automatically insert itself next to all instances of a given block type, in a relative position also specified by the "hooked" block. That is, a block can opt to be inserted before or after a given block type, or as its first or last child (i.e. to be prepended or appended to the list of its child blocks, respectively). Hooked blocks will appear both on the frontend and in the editor (to allow for customization by the user).

The key is the name of the block (`string`) to hook into, and the value is the position to hook into (`string`). Take a look at the [Block Hooks documentation](/docs/reference-guides/block-api/block-registration.md#block-hooks-optional) for more info about available configurations.

### Editor script

-   Type: `WPDefinedAsset`|`WPDefinedAsset[]` ([learn more](#wpdefinedasset))
-   Optional
-   Localized: No
-   Property: `editorScript`

```json
{ "editorScript": "file:./index.js" }
```

Block type editor scripts definition. They will only be enqueued in the context of the editor.

It's possible to pass a script handle registered with the [`wp_register_script`](https://developer.wordpress.org/reference/functions/wp_register_script/) function, a path to a JavaScript file relative to the `block.json` file, or a list with a mix of both ([learn more](#wpdefinedasset)).

_Note: An option to pass also an array of editor scripts exists since WordPress `6.1.0`._

### Script

-   Type: `WPDefinedAsset`|`WPDefinedAsset[]` ([learn more](#wpdefinedasset))
-   Optional
-   Localized: No
-   Property: `script`

```json
{ "script": "file:./script.js" }
```

Block type frontend and editor scripts definition. They will be enqueued both in the editor and when viewing the content on the front of the site.

It's possible to pass a script handle registered with the [`wp_register_script`](https://developer.wordpress.org/reference/functions/wp_register_script/) function, a path to a JavaScript file relative to the `block.json` file, or a list with a mix of both ([learn more](#wpdefinedasset)).

_Note: An option to pass also an array of scripts exists since WordPress `6.1.0`._

### View script

-   Type: `WPDefinedAsset`|`WPDefinedAsset[]` ([learn more](#wpdefinedasset))
-   Optional
-   Localized: No
-   Property: `viewScript`
-   Since: `WordPress 5.9.0`

```json
{ "viewScript": [ "file:./view.js", "example-shared-view-script" ] }
```

Block type frontend scripts definition. They will be enqueued only when viewing the content on the front of the site.

It's possible to pass a script handle registered with the [`wp_register_script`](https://developer.wordpress.org/reference/functions/wp_register_script/) function, a path to a JavaScript file relative to the `block.json` file, or a list with a mix of both ([learn more](#wpdefinedasset)).

_Note: An option to pass also an array of view scripts exists since WordPress `6.1.0`._

### View script module

-   Type: `WPDefinedAsset`|`WPDefinedAsset[]` ([learn more](#wpdefinedasset))
-   Optional
-   Localized: No
-   Property: `viewScriptModule`
-   Since: `WordPress 6.5.0`

```json
{ "viewScriptModule": [ "file:./view.js", "example-shared-script-module-id" ] }
```

Block type frontend script module definition. They will be enqueued only when viewing the content on the front of the site.

It's possible to pass a script module ID registered with the [`wp_register_script_module`](https://developer.wordpress.org/reference/functions/wp_register_script_module/) function, a path to a JavaScript module relative to the `block.json` file, or a list with a mix of both ([learn more](#wpdefinedasset)).

WordPress scripts and WordPress script modules are not compatible at the moment. If frontend view assets depend on WordPress scripts, `viewScript` should be used. If they depend on WordPress script modules —the Interactivity API at this time— `viewScriptModule` should be used. [More functionality](https://core.trac.wordpress.org/ticket/60647) will gradually become available to Script Modules.

_Note: Available since WordPress `6.5.0`._

### Editor style

-   Type: `WPDefinedAsset`|`WPDefinedAsset[]` ([learn more](#wpdefinedasset))
-   Optional
-   Localized: No
-   Property: `editorStyle`

```json
{ "editorStyle": "file:./index.css" }
```

Block type editor styles definition. They will only be enqueued in the context of the editor.

It's possible to pass a style handle registered with the [`wp_register_style`](https://developer.wordpress.org/reference/functions/wp_register_style/) function, a path to a CSS file relative to the `block.json` file, or a list with a mix of both ([learn more](#wpdefinedasset)).

_Note: An option to pass also an array of editor styles exists since WordPress `5.9.0`._

### Style

-   Type: `WPDefinedAsset`|`WPDefinedAsset[]` ([learn more](#wpdefinedasset))
-   Optional
-   Localized: No
-   Property: `style`

```json
{ "style": [ "file:./style.css", "example-shared-style" ] }
```

Block type frontend and editor styles definition. They will be enqueued both in the editor and when viewing the content on the front of the site.

It's possible to pass a style handle registered with the [`wp_register_style`](https://developer.wordpress.org/reference/functions/wp_register_style/) function, a path to a CSS file relative to the `block.json` file, or a list with a mix of both ([learn more](#wpdefinedasset)).

_Note: An option to pass also an array of styles exists since WordPress `5.9.0`._

### View Style

-   Type: `WPDefinedAsset`|`WPDefinedAsset[]` ([learn more](#wpdefinedasset))
-   Optional
-   Localized: No
-   Property: `viewStyle`
-   Since: `WordPress 6.5.0`

```json
{ "viewStyle": [ "file:./view.css", "example-view-style" ] }
```

Block type frontend styles definition. They will be enqueued only when viewing the content on the front of the site.

It's possible to pass a style handle registered with the [`wp_register_style`](https://developer.wordpress.org/reference/functions/wp_register_style/) function, a path to a CSS file relative to the `block.json` file, or a list with a mix of both ([learn more](#wpdefinedasset)).

Frontend-only styles are especially useful for interactive blocks, to style parts that will only be visible after a user performs some action and where those styles will never be needed in the editor. You can start with using the `style` property to put all your common styles in one stylesheet. Only when you need editor-specific styling or frontend-specific styling, you can expand to `editorStyle` and `viewStyle`, but still keep the common part of your styling in the main stylesheet.

### Render

-   Type: `WPDefinedPath` ([learn more](#wpdefinedpath))
-   Optional
-   Localized: No
-   Property: `render`
-   Since: `WordPress 6.1.0`

```json
{ "render": "file:./render.php" }
```

PHP file to use when rendering the block type on the server to show on the front end. The following variables are exposed to the file:

-   `$attributes` (`array`): The block attributes.
-   `$content` (`string`): The block default content.
-   `$block` (`WP_Block`): The block instance.

An example implementation of the `render.php` file defined with `render` could look like:

```php
<div <?php echo get_block_wrapper_attributes(); ?>>
	<?php echo esc_html( $attributes['label'] ); ?>
</div>
```

_Note: This file loads for every instance of the block type when rendering the page HTML on the server. Accounting for that is essential when declaring functions or classes in the file. The simplest way to avoid the risk of errors is to consume that shared logic from another file._

## Assets

### `WPDefinedPath`

The `WPDefinedPath` type is a subtype of string, where the value represents a path to a JavaScript, CSS or PHP file relative to where the `block.json` file is located. The path provided must be prefixed with `file:`. This approach is based on how npm handles [local paths](https://docs.npmjs.com/files/package.json#local-paths) for packages.

**Example:**

In `block.json`:

```json
{
	"render": "file:./render.php"
}
```

### `WPDefinedAsset`

It extends `WPDefinedPath` for JavaScript and CSS files. An alternative to the file path would be a script handle, script module ID, or style handle referencing an already registered asset using WordPress helpers.

**Example:**

In `block.json`:

```json
{
	"editorScript": "file:./index.js",
	"script": "file:./script.js",
	"viewScriptModule": [
		"file:./view.js",
		"example-registered-script-module-id"
	],
	"editorStyle": "file:./index.css",
	"style": [ "file:./style.css", "example-shared-style" ],
	"viewStyle": [ "file:./view.css", "example-view-style" ]
}
```

In the context of WordPress, when a block is registered with PHP, it will automatically register all scripts, script modules, and styles that are found in the `block.json` file and use file paths rather than asset handles.

That's why the `WPDefinedAsset` type has to offer a way to mirror the parameters necessary to register scripts, script modules, and styles using [`wp_register_script`](https://developer.wordpress.org/reference/functions/wp_register_script/), [`wp_register_script_module`](https://developer.wordpress.org/reference/functions/wp_register_script_module/), and [`wp_register_style`](https://developer.wordpress.org/reference/functions/wp_register_style/), and then assign these as handles or script module IDs associated with the block.

It's possible to provide an object which takes the following shape:

-   `handle` (`string`) - the name of the script. If omitted, it will be auto-generated.
-   `dependencies` (`string[]`|`{ id: string, import?: 'dynamic'|'static' }[]`) - an array of registered script handles this script depends on. Script modules may use a simple string for static dependencies or the object form to indicate a dynamic dependency. Dynamic dependencies are dependencies that may or may not be used at runtime and are typically used with the dynamic `import('module-id')` syntax. Default value: `[]`.
-   `version` (`string`|`false`|`null`) - string specifying the script version number, if it has one, which is added to the URL as a query string for cache busting purposes. If the version is set to `false`, a version number is automatically added equal to the currently installed WordPress version. If set to `null`, no version is added. Default value: `false`.

The definition is stored inside a separate PHP file which ends with `.asset.php` and is located next to the JS/CSS file listed in `block.json`. WordPress will automatically detect this file through pattern matching. This option is the preferred one as it is expected it will become an option to auto-generate those asset files with `@wordpress/scripts` package.

**Example:**

```
build/
├─ block.json
├─ index.js
└─ index.asset.php
```

In `block.json`:

```json
{ "editorScript": "file:./index.js" }
```

In `build/index.asset.php`:

```php
<?php
return array(
	'dependencies' => array(
		'react',
		'wp-blocks',
		'wp-i18n',
	),
	'version'      => '3be55b05081a63d8f9d0ecb466c42cfd',
);
```

### Frontend enqueueing

Starting in the WordPress 5.8 release, it is possible to instruct WordPress to enqueue scripts and styles for a block type only when rendered on the frontend. It applies to the following asset fields in the `block.json` file:

-   `script`
-   `viewScript`
-   `style`
-   `viewStyle` (Added in WordPress 6.5.0)

## Internationalization

WordPress string discovery system can automatically translate fields marked in this document as translatable. First, you need to set the `textdomain` property in the `block.json` file that provides block metadata.

**Example:**

```json
{
	"title": "My block",
	"description": "My block is fantastic",
	"keywords": [ "fantastic" ],
	"textdomain": "my-plugin"
}
```

### PHP

In PHP, localized properties will be automatically wrapped in `_x` function calls on the backend of WordPress when executing `register_block_type`. These translations get added as an inline script to the plugin's script handle or to the `wp-block-library` script handle in WordPress core.

The way `register_block_type` processes translatable values is roughly equivalent to the following code snippet:

```php
<?php
$metadata = array(
	'title'       => _x( 'My block', 'block title', 'my-plugin' ),
	'description' => _x( 'My block is fantastic!', 'block description', 'my-plugin' ),
	'keywords'    => array( _x( 'fantastic', 'block keyword', 'my-plugin' ) ),
);
```

Implementation follows the existing [get_plugin_data](https://developer.wordpress.org/reference/functions/get_plugin_data) function which parses the plugin contents to retrieve the plugin’s metadata, and it applies translations dynamically.

### JavaScript

In JavaScript, you can use `registerBlockType` method from `@wordpress/blocks` package and pass the metadata object loaded from `block.json` as the first param. All localized properties get automatically wrapped in `_x` (from `@wordpress/i18n` package) function calls similar to how it works in PHP.

**Example:**

```js
import { registerBlockType } from '@wordpress/blocks';
import Edit from './edit';
import metadata from './block.json';

registerBlockType( metadata, {
	edit: Edit,
	// ...other client-side settings
} );
```

## Backward compatibility

The existing registration mechanism (both server side and frontend) will continue to work, it will serve as low-level implementation detail for the `block.json` based registration.

Once all details are ready, Core Blocks will be migrated iteratively and third-party blocks will see warnings appearing in the console to encourage them to refactor the block registration API used.

The following properties are going to be supported for backward compatibility reasons on the client-side only. Some of them might be replaced with alternative APIs in the future:

-   `edit` - see the [Edit and Save](/docs/reference-guides/block-api/block-edit-save.md) documentation for more details.
-   `save` - see the [Edit and Save](/docs/reference-guides/block-api/block-edit-save.md) documentation for more details.
-   `transforms` - see the [Transforms](/docs/reference-guides/block-api/block-registration.md#transforms-optional) documentation for more details.
-   `deprecated` - see the [Deprecated Blocks](/docs/reference-guides/block-api/block-deprecation.md) documentation for more details.
-   `merge` - undocumented as of today. Its role is to handle merging multiple blocks into one.
-   `getEditWrapperProps` - undocumented as well. Its role is to inject additional props to the block edit's component wrapper.

**Example**:

```js
import { registerBlockType } from '@wordpress/blocks';

registerBlockType( 'my-plugin/block-name', {
	edit: function () {
		// Edit definition goes here.
	},
	save: function () {
		// Save definition goes here.
	},
	getEditWrapperProps: function () {
		// Implementation goes here.
	},
} );
```

In the case of [dynamic blocks](/docs/how-to-guides/block-tutorial/creating-dynamic-blocks.md) supported by WordPress, it should still be possible to register the `render_callback` property using both [`register_block_type`](https://developer.wordpress.org/reference/functions/register_block_type/) functions on the server.


---

## Exported API symbols

[gutenberg] packages/blocks/src/api/registration.ts
  unstable__bootstrapServerSideBlockDefinitions(definitions: Record< string, Record< string, unknown > >): void
    Sets the server side block definition of blocks. Ignored from documentation due to being marked as unstable.
  registerBlockType(blockNameOrMetadata: BlockConfiguration< Attributes >, settings?: Partial< BlockConfiguration< Attributes > >): BlockType | undefined
    Registers a new block provided a unique name and an object defining its behavior. Once registered, the block is made available as an option to any editor interface where blocks are implemented. For more in-depth information on registering a custom block see the [Create a block tutorial](https://developer.wordpress.org/block-editor/getting-started/create-block/).
  registerBlockType(blockNameOrMetadata: string, settings: BlockConfiguration< Attributes >): BlockType | undefined
  registerBlockType(blockNameOrMetadata: string | BlockConfiguration< Attributes >, settings?: Partial< BlockConfiguration< Attributes > >): BlockType | undefined
  registerBlockCollection(namespace: string, { title, icon }: { title: string; icon?: Icon }): void
    Registers a new block collection to group blocks in the same namespace in the inserter.
  unregisterBlockCollection(namespace: string): void
    Unregisters a block collection
  unregisterBlockType(name: string): BlockType | undefined
    Unregisters a block.
  setFreeformContentHandlerName(blockName: string): void
    Assigns name of block for handling non-block content.
  getFreeformContentHandlerName(): string | null
    Retrieves name of block handling non-block content, or undefined if no handler has been defined.
  getGroupingBlockName(): string | null
    Retrieves name of block used for handling grouping interactions.
  setUnregisteredTypeHandlerName(blockName: string): void
    Assigns name of block handling unregistered block types.
  getUnregisteredTypeHandlerName(): string | null
    Retrieves name of block handling unregistered block types, or undefined if no handler has been defined.
  setDefaultBlockName(name: string): void
    Assigns the default block name.
  setGroupingBlockName(name: string): void
    Assigns name of block for handling block grouping interactions. This function lets you select a different block to group other blocks in instead of the default `core/group` block. This function must be used in a component or when the DOM is fully loaded. See https://developer.wordpress.org/block-editor/reference-guides/packages/packages-dom-ready/
  getDefaultBlockName(): string | null
    Retrieves the default block name.
  getBlockType(name: string): BlockType | undefined
    Returns a registered block type.
  getBlockTypes(): BlockType[]
    Returns all registered blocks.
  getBlockSupport(nameOrType: string | BlockType, feature: string, defaultSupports?: unknown): unknown
    Returns the block support value for a feature, if defined.
  hasBlockSupport(nameOrType: string | BlockType, feature: string, defaultSupports?: boolean): boolean
    Returns true if the block defines support for a feature, or false otherwise.
  isReusableBlock(blockOrType: Block | BlockType | null | undefined): boolean
    Determines whether or not the given block is a reusable block. This is a special block type that is used to point to a global block stored via the API.
  isTemplatePart(blockOrType: Block | BlockType | null | undefined): boolean
    Determines whether or not the given block is a template part. This is a special block type that allows composing a page template out of reusable design elements.
  getChildBlockNames: (blockName: string) => string[]
    Returns an array with the child blocks of a given block.
  hasChildBlocks: (blockName: string) => boolean
    Returns a boolean indicating if a block has child blocks or not.
  hasChildBlocksWithInserterSupport: (blockName: string) => boolean
    Returns a boolean indicating if a block has at least one child block with inserter support.
  registerBlockStyle: (blockNames: string | string[], styleVariation: BlockStyle | BlockStyle[]) => void
    Registers a new block style for the given block types. For more information on connecting the styles with CSS [the official documentation](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-styles/#styles).
  unregisterBlockStyle: (blockName: string, styleVariationName: string) => void
    Unregisters a block style for the given block.
  getBlockVariations: (blockName: string, scope?: BlockVariationScope) => BlockVariation[] | void
    Returns an array with the variations of a given block type. Ignored from documentation as the recommended usage is via useSelect from
  registerBlockVariation: (blockName: string, variation: BlockVariation | BlockVariation[]) => void
    Registers a new block variation for the given block type. For more information on block variations see [the official documentation ](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-variations/).
  unregisterBlockVariation: (blockName: string, variationName: string | string[]) => void
    Unregisters a block variation defined for the given block type.
  registerBlockBindingsSource: (source: BlockBindingsSource) => void
    Registers a new block bindings source with an object defining its behavior. Once registered, the source is available to be connected to the supported block attributes.
    @since 6.7.0 Introduced in WordPress core.
  unregisterBlockBindingsSource(name: string): void
    Unregisters a block bindings source by providing its name.
    @since 6.7.0 Introduced in WordPress core.
  getBlockBindingsSource(name: string): BlockBindingsSource | undefined
    Returns a registered block bindings source by its name.
    @since 6.7.0 Introduced in WordPress core.
  getBlockBindingsSources(): Record<
	string,
	BlockBindingsSource
>
    Returns all registered block bindings sources.
    @since 6.7.0 Introduced in WordPress core.

[wordpress-develop] src/wp-includes/blocks.php
  remove_block_asset_path_prefix($asset_handle_or_path)
    /**
     * Functions related to registering and parsing blocks.
     *
     * @package WordPress
     * @subpackage Blocks
     * @since 5.0.0
     */
    /**
     * Removes the block asset's path prefix if provided.
     *
     * @since 5.5.0
     *
     * @param string $asset_handle_or_path Asset handle or prefixed path.
     * @return string Path without the prefix or the original value.
     */
  generate_block_asset_handle($block_name, $field_name, $index = …)
    /**
     * Generates the name for an asset based on the name of the block
     * and the field name provided.
     *
     * @since 5.5.0
     * @since 6.1.0 Added `$index` parameter.
     * @since 6.5.0 Added support for `viewScriptModule` field.
     *
     * @param string $block_name Name of the block.
     * @param string $field_name Name of the metadata field.
     * @param int    $index      Optional. Index of the asset when multiple items passed.
     *                           Default 0.
     * @return string Generated asset name for the block's field.
     */
  get_block_asset_url($path)
    /**
     * Gets the URL to a block asset.
     *
     * @since 6.4.0
     *
     * @param string $path A normalized path to a block asset.
     * @return string|false The URL to the block asset or false on failure.
     */
  register_block_script_module_id($metadata, $field_name, $index = …)
    /**
     * Finds a script module ID for the selected block metadata field. It detects
     * when a path to file was provided and optionally finds a corresponding asset
     * file with details necessary to register the script module under with an
     * automatically generated module ID. It returns unprocessed script module
     * ID otherwise.
     *
     * @since 6.5.0
     *
     * @param array  $metadata   Block metadata.
     * @param string $field_name Field name to pick from metadata.
     * @param int    $index      Optional. Index of the script module ID to register when multiple
     *                           items passed. Default 0.
     * @return string|false Script module ID or false on failure.
     */
  register_block_script_handle($metadata, $field_name, $index = …)
    /**
     * Finds a script handle for the selected block metadata field. It detects
     * when a path to file was provided and optionally finds a corresponding asset
     * file with details necessary to register the script under automatically
     * generated handle name. It returns unprocessed script handle otherwise.
     *
     * @since 5.5.0
     * @since 6.1.0 Added `$index` parameter.
     * @since 6.5.0 The asset file is optional. Added script handle support in the asset file.
     *
     * @param array  $metadata   Block metadata.
     * @param string $field_name Field name to pick from metadata.
     * @param int    $index      Optional. Index of the script to register when multiple items passed.
     *                           Default 0.
     * @return string|false Script handle provided directly or created through
     *                      script's registration, or false on failure.
     */
  register_block_style_handle($metadata, $field_name, $index = …)
    /**
     * Finds a style handle for the block metadata field. It detects when a path
     * to file was provided and registers the style under automatically
     * generated handle name. It returns unprocessed style handle otherwise.
     *
     * @since 5.5.0
     * @since 6.1.0 Added `$index` parameter.
     *
     * @param array  $metadata   Block metadata.
     * @param string $field_name Field name to pick from metadata.
     * @param int    $index      Optional. Index of the style to register when multiple items passed.
     *                           Default 0.
     * @return string|false Style handle provided directly or created through
     *                      style's registration, or false on failure.
     */
  get_block_metadata_i18n_schema()
    /**
     * Gets i18n schema for block's metadata read from `block.json` file.
     *
     * @since 5.9.0
     *
     * @return object The schema for block's metadata.
     */
  wp_register_block_types_from_metadata_collection($path, $manifest = …)
    /**
     * Registers all block types from a block metadata collection.
     *
     * This can either reference a previously registered metadata collection or, if the `$manifest` parameter is provided,
     * register the metadata collection directly within the same function call.
     *
     * @since 6.8.0
     * @see wp_register_block_metadata_collection()
     * @see register_block_type_from_metadata()
     *
     * @param string $path     The absolute base path for the collection ( e.g., WP_PLUGIN_DIR . '/my-plugin/blocks/' ).
     * @param string $manifest Optional. The absolute path to the manifest file containing the metadata collection, in
     *                         order to register the collection. If this parameter is not provided, the `$path` parameter
     *                         must reference a previously registered block metadata collection.
     */
  wp_register_block_metadata_collection($path, $manifest)
    /**
     * Registers a block metadata collection.
     *
     * This function allows core and third-party plugins to register their block metadata
     * collections in a centralized location. Registering collections can improve performance
     * by avoiding multiple reads from the filesystem and parsing JSON.
     *
     * @since 6.7.0
     *
     * @param string $path     The base path in which block files for the collection reside.
     * @param string $manifest The path to the manifest file for the collection.
     */
  register_block_type_from_metadata($file_or_folder, $args = …)
    /**
     * Registers a block type from the metadata stored in the `block.json` file.
     *
     * @since 5.5.0
     * @since 5.7.0 Added support for `textdomain` field and i18n handling for all translatable fields.
     * @since 5.9.0 Added support for `variations` and `viewScript` fields.
     * @since 6.1.0 Added support for `render` field.
     * @since 6.3.0 Added `selectors` field.
     * @since 6.4.0 Added support for `blockHooks` field.
     * @since 6.5.0 Added support for `allowedBlocks`, `viewScriptModule`, and `viewStyle` fields.
     * @since 6.7.0 Allow PHP filename as `variations` argument.
     *
     * @param string $file_or_folder Path to the JSON file with metadata definition for
     *                               the block or path to the folder where the `block.json` file is located.
     *                               If providing the path to a JSON file, the filename must end with `block.json`.
     * @param array  $args           Optional. Array of block type arguments. Accepts any public property
     *                               of `WP_Block_Type`. See WP_Block_Type::__construct() for information
     *                               on accepted arguments. Default empty array.
     * @return WP_Block_Type|false The registered block type on success, or false on failure.
     */
  register_block_type($block_type, $args = …)
    /**
     * Registers a block type. The recommended way is to register a block type using
     * the metadata stored in the `block.json` file.
     *
     * @since 5.0.0
     * @since 5.8.0 First parameter now accepts a path to the `block.json` file.
     *
     * @param string|WP_Block_Type $block_type Block type name including namespace, or alternatively
     *                                         a path to the JSON file with metadata definition for the block,
     *                                         or a path to the folder where the `block.json` file is located,
     *                                         or a complete WP_Block_Type instance.
     *                                         In case a WP_Block_Type is provided, the $args parameter will be ignored.
     * @param array                $args       Optional. Array of block type arguments. Accepts any public property
     *                                         of `WP_Block_Type`. See WP_Block_Type::__construct() for information
     *                                         on accepted arguments. Default empty array.
     *
     * @return WP_Block_Type|false The registered block type on success, or false on failure.
     */
  unregister_block_type($name)
    /**
     * Unregisters a block type.
     *
     * @since 5.0.0
     *
     * @param string|WP_Block_Type $name Block type name including namespace, or alternatively
     *                                   a complete WP_Block_Type instance.
     * @return WP_Block_Type|false The unregistered block type on success, or false on failure.
     */
  has_blocks($post = …)
    /**
     * Determines whether a post or content string has blocks.
     *
     * This test optimizes for performance rather than strict accuracy, detecting
     * the pattern of a block but not validating its structure. For strict accuracy,
     * you should use the block parser on post content.
     *
     * @since 5.0.0
     *
     * @see parse_blocks()
     *
     * @param int|string|WP_Post|null $post Optional. Post content, post ID, or post object.
     *                                      Defaults to global $post.
     * @return bool Whether the post has blocks.
     */
  has_block($block_name, $post = …)
    /**
     * Determines whether a $post or a string contains a specific block type.
     *
     * This test optimizes for performance rather than strict accuracy, detecting
     * whether the block type exists but not validating its structure and not checking
     * synced patterns (formerly called reusable blocks). For strict accuracy,
     * you should use the block parser on post content.
     *
     * @since 5.0.0
     *
     * @see parse_blocks()
     *
     * @param string                  $block_name Full block type to look for.
     * @param int|string|WP_Post|null $post       Optional. Post content, post ID, or post object.
     *                                            Defaults to global $post.
     * @return bool Whether the post content contains the specified block.
     */
  get_dynamic_block_names()
    /**
     * Returns an array of the names of all registered dynamic block types.
     *
     * @since 5.0.0
     *
     * @return string[] Array of dynamic block names.
     */
  get_hooked_blocks()
    /**
     * Retrieves block types hooked into the given block, grouped by anchor block type and the relative position.
     *
     * @since 6.4.0
     *
     * @return array[] Array of block types grouped by anchor block type and the relative position.
     */
  insert_hooked_blocks(&$parsed_anchor_block, $relative_position, $hooked_blocks, $context)
    /**
     * Returns the markup for blocks hooked to the given anchor block in a specific relative position.
     *
     * @since 6.5.0
     * @access private
     *
     * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
     * @param string                          $relative_position   The relative position of the hooked blocks.
     *                                                             Can be one of 'before', 'after', 'first_child', or 'last_child'.
     * @param array                           $hooked_blocks       An array of hooked block types, grouped by anchor block and relative position.
     * @param WP_Block_Template|WP_Post|array $context             The block template, template part, or pattern that the anchor block belongs to.
     * @return string
     */
  set_ignored_hooked_blocks_metadata(&$parsed_anchor_block, $relative_position, $hooked_blocks, $context)
    /**
     * Adds a list of hooked block types to an anchor block's ignored hooked block types.
     *
     * This function is meant for internal use only.
     *
     * @since 6.5.0
     * @access private
     *
     * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
     * @param string                          $relative_position   The relative position of the hooked blocks.
     *                                                             Can be one of 'before', 'after', 'first_child', or 'last_child'.
     * @param array                           $hooked_blocks       An array of hooked block types, grouped by anchor block and relative position.
     * @param WP_Block_Template|WP_Post|array $context             The block template, template part, or pattern that the anchor block belongs to.
     * @return string Empty string.
     */
  apply_block_hooks_to_content($content, $context = …, $callback = …)
    /**
     * Runs the hooked blocks algorithm on the given content.
     *
     * @since 6.6.0
     * @since 6.7.0 Injects the `theme` attribute into Template Part blocks, even if no hooked blocks are registered.
     * @since 6.8.0 Have the `$context` parameter default to `null`, in which case `get_post()` will be called to use the current post as context.
     * @access private
     *
     * @param string                               $content  Serialized content.
     * @param WP_Block_Template|WP_Post|array|null $context  A block template, template part, post object, or pattern
     *                                                       that the blocks belong to. If set to `null`, `get_post()`
     *                                                       will be called to use the current post as context.
     *                                                       Default: `null`.
     * @param callable                             $callback A function that will be called for each block to generate
     *                                                       the markup for a given list of blocks that are hooked to it.
     *                                                       Default: 'insert_hooked_blocks'.
     * @return string The serialized markup.
     */
  apply_block_hooks_to_content_from_post_object($content, $post = …, $callback = …)
    /**
     * Run the Block Hooks algorithm on a post object's content.
     *
     * This function is different from `apply_block_hooks_to_content` in that
     * it takes ignored hooked block information from the post's metadata into
     * account. This ensures that any blocks hooked as first or last child
     * of the block that corresponds to the post type are handled correctly.
     *
     * @since 6.8.0
     * @access private
     *
     * @param string       $content  Serialized content.
     * @param WP_Post|null $post     A post object that the content belongs to. If set to `null`,
     *                               `get_post()` will be called to use the current post as context.
     *                               Default: `null`.
     * @param callable     $callback A function that will be called for each block to generate
     *                               the markup for a given list of blocks that are hooked to it.
     *                               Default: 'insert_hooked_blocks'.
     * @return string The serialized markup.
     */
  remove_serialized_parent_block($serialized_block)
    /**
     * Accepts the serialized markup of a block and its inner blocks, and returns serialized markup of the inner blocks.
     *
     * @since 6.6.0
     * @access private
     *
     * @param string $serialized_block The serialized markup of a block and its inner blocks.
     * @return string The serialized markup of the inner blocks.
     */
  extract_serialized_parent_block($serialized_block)
    /**
     * Accepts the serialized markup of a block and its inner blocks, and returns serialized markup of the wrapper block.
     *
     * @since 6.7.0
     * @access private
     *
     * @see remove_serialized_parent_block()
     *
     * @param string $serialized_block The serialized markup of a block and its inner blocks.
     * @return string The serialized markup of the wrapper block.
     */
  update_ignored_hooked_blocks_postmeta($post)
    /**
     * Updates the wp_postmeta with the list of ignored hooked blocks
     * where the inner blocks are stored as post content.
     *
     * @since 6.6.0
     * @since 6.8.0 Support non-`wp_navigation` post types.
     * @access private
     *
     * @param stdClass $post Post object.
     * @return stdClass The updated post object.
     */
  insert_hooked_blocks_and_set_ignored_hooked_blocks_metadata(&$parsed_anchor_block, $relative_position, $hooked_blocks, $context)
    /**
     * Returns the markup for blocks hooked to the given anchor block in a specific relative position and then
     * adds a list of hooked block types to an anchor block's ignored hooked block types.
     *
     * This function is meant for internal use only.
     *
     * @since 6.6.0
     * @access private
     *
     * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
     * @param string                          $relative_position   The relative position of the hooked blocks.
     *                                                             Can be one of 'before', 'after', 'first_child', or 'last_child'.
     * @param array                           $hooked_blocks       An array of hooked block types, grouped by anchor block and relative position.
     * @param WP_Block_Template|WP_Post|array $context             The block template, template part, or pattern that the anchor block belongs to.
     * @return string
     */
  insert_hooked_blocks_into_rest_response($response, $post)
    /**
     * Hooks into the REST API response for the Posts endpoint and adds the first and last inner blocks.
     *
     * @since 6.6.0
     * @since 6.8.0 Support non-`wp_navigation` post types.
     *
     * @param WP_REST_Response $response The response object.
     * @param WP_Post          $post     Post object.
     * @return WP_REST_Response The response object.
     */
  make_before_block_visitor($hooked_blocks, $context, $callback = …)
    /**
     * Returns a function that injects the theme attribute into, and hooked blocks before, a given block.
     *
     * The returned function can be used as `$pre_callback` argument to `traverse_and_serialize_block(s)`,
     * where it will inject the `theme` attribute into all Template Part blocks, and prepend the markup for
     * any blocks hooked `before` the given block and as its parent's `first_child`, respectively.
     *
     * This function is meant for internal use only.
     *
     * @since 6.4.0
     * @since 6.5.0 Added $callback argument.
     * @access private
     *
     * @param array                           $hooked_blocks An array of blocks hooked to another given block.
     * @param WP_Block_Template|WP_Post|array $context       A block template, template part, post object,
     *                                                       or pattern that the blocks belong to.
     * @param callable                        $callback      A function that will be called for each block to generate
     *                                                       the markup for a given list of blocks that are hooked to it.
     *                                                       Default: 'insert_hooked_blocks'.
     * @return callable A function that returns the serialized markup for the given block,
     *                  including the markup for any hooked blocks before it.
     */
  make_after_block_visitor($hooked_blocks, $context, $callback = …)
    /**
     * Returns a function that injects the hooked blocks after a given block.
     *
     * The returned function can be used as `$post_callback` argument to `traverse_and_serialize_block(s)`,
     * where it will append the markup for any blocks hooked `after` the given block and as its parent's
     * `last_child`, respectively.
     *
     * This function is meant for internal use only.
     *
     * @since 6.4.0
     * @since 6.5.0 Added $callback argument.
     * @access private
     *
     * @param array                           $hooked_blocks An array of blocks hooked to another block.
     * @param WP_Block_Template|WP_Post|array $context       A block template, template part, post object,
     *                                                       or pattern that the blocks belong to.
     * @param callable                        $callback      A function that will be called for each block to generate
     *                                                       the markup for a given list of blocks that are hooked to it.
     *                                                       Default: 'insert_hooked_blocks'.
     * @return callable A function that returns the serialized markup for the given block,
     *                  including the markup for any hooked blocks after it.
     */
  serialize_block_attributes($block_attributes)
    /**
     * Given an array of attributes, returns a string in the serialized attributes
     * format prepared for post content.
     *
     * The serialized result is a JSON-encoded string, with unicode escape sequence
     * substitution for characters which might otherwise interfere with embedding
     * the result in an HTML comment.
     *
     * This function must produce output that remains in sync with the output of
     * the serializeAttributes JavaScript function in the block editor in order
     * to ensure consistent operation between PHP and JavaScript.
     *
     * @since 5.3.1
     *
     * @param array $block_attributes Attributes object.
     * @return string Serialized attributes.
     */
  strip_core_block_namespace($block_name = …)
    /**
     * Returns the block name to use for serialization. This will remove the default
     * "core/" namespace from a block name.
     *
     * @since 5.3.1
     *
     * @param string|null $block_name Optional. Original block name. Null if the block name is unknown,
     *                                e.g. Classic blocks have their name set to null. Default null.
     * @return string Block name to use for serialization.
     */
  get_comment_delimited_block_content($block_name, $block_attributes, $block_content)
    /**
     * Returns the content of a block, including comment delimiters.
     *
     * @since 5.3.1
     *
     * @param string|null $block_name       Block name. Null if the block name is unknown,
     *                                      e.g. Classic blocks have their name set to null.
     * @param array       $block_attributes Block attributes.
     * @param string      $block_content    Block save content.
     * @return string Comment-delimited block content.
     */
  serialize_block($block)
    /**
     * Returns the content of a block, including comment delimiters, serializing all
     * attributes from the given parsed block.
     *
     * This should be used when preparing a block to be saved to post content.
     * Prefer `render_block` when preparing a block for display. Unlike
     * `render_block`, this does not evaluate a block's `render_callback`, and will
     * instead preserve the markup as parsed.
     *
     * @since 5.3.1
     *
     * @param array $block {
     *     An associative array of a single parsed block object. See WP_Block_Parser_Block.
     *
     *     @type string|null $blockName    Name of block.
     *     @type array       $attrs        Attributes from block comment delimiters.
     *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
     *                                     have the same structure as this one.
     *     @type string      $innerHTML    HTML from inside block comment delimiters.
     *     @type array       $innerContent List of string fragments and null markers where
     *                                     inner blocks were found.
     * }
     * @return string String of rendered HTML.
     */
  serialize_blocks($blocks)
    /**
     * Returns a joined string of the aggregate serialization of the given
     * parsed blocks.
     *
     * @since 5.3.1
     *
     * @param array[] $blocks {
     *     Array of block structures.
     *
     *     @type array ...$0 {
     *         An associative array of a single parsed block object. See WP_Block_Parser_Block.
     *
     *         @type string|null $blockName    Name of block.
     *         @type array       $attrs        Attributes from block comment delimiters.
     *         @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
     *                                         have the same structure as this one.
     *         @type string      $innerHTML    HTML from inside block comment delimiters.
     *         @type array       $innerContent List of string fragments and null markers where
     *                                         inner blocks were found.
     *     }
     * }
     * @return string String of rendered HTML.
     */
  traverse_and_serialize_block($block, $pre_callback = …, $post_callback = …)
    /**
     * Traverses a parsed block tree and applies callbacks before and after serializing it.
     *
     * Recursively traverses the block and its inner blocks and applies the two callbacks provided as
     * arguments, the first one before serializing the block, and the second one after serializing it.
     * If either callback returns a string value, it will be prepended and appended to the serialized
     * block markup, respectively.
     *
     * The callbacks will receive a reference to the current block as their first argument, so that they
     * can also modify it, and the current block's parent block as second argument. Finally, the
     * `$pre_callback` receives the previous block, whereas the `$post_callback` receives
     * the next block as third argument.
     *
     * Serialized blocks are returned including comment delimiters, and with all attributes serialized.
     *
     * This function should be used when there is a need to modify the saved block, or to inject markup
     * into the return value. Prefer `serialize_block` when preparing a block to be saved to post content.
     *
     * This function is meant for internal use only.
     *
     * @since 6.4.0
     * @access private
     *
     * @see serialize_block()
     *
     * @param array    $block         An associative array of a single parsed block object. See WP_Block_Parser_Block.
     * @param callable $pre_callback  Callback to run on each block in the tree before it is traversed and serialized.
     *                                It is called with the following arguments: &$block, $parent_block, $previous_block.
     *                                Its string return value will be prepended to the serialized block markup.
     * @param callable $post_callback Callback to run on each block in the tree after it is traversed and serialized.
     *                                It is called with the following arguments: &$block, $parent_block, $next_block.
     *                                Its string return value will be appended to the serialized block markup.
     * @return string Serialized block markup.
     */
  resolve_pattern_blocks($blocks)
    /**
     * Replaces patterns in a block tree with their content.
     *
     * @since 6.6.0
     *
     * @param array $blocks An array blocks.
     *
     * @return array An array of blocks with patterns replaced by their content.
     */
  traverse_and_serialize_blocks($blocks, $pre_callback = …, $post_callback = …)
    /**
     * Given an array of parsed block trees, applies callbacks before and after serializing them and
     * returns their concatenated output.
     *
     * Recursively traverses the blocks and their inner blocks and applies the two callbacks provided as
     * arguments, the first one before serializing a block, and the second one after serializing.
     * If either callback returns a string value, it will be prepended and appended to the serialized
     * block markup, respectively.
     *
     * The callbacks will receive a reference to the current block as their first argument, so that they
     * can also modify it, and the current block's parent block as second argument. Finally, the
     * `$pre_callback` receives the previous block, whereas the `$post_callback` receives
     * the next block as third argument.
     *
     * Serialized blocks are returned including comment delimiters, and with all attributes serialized.
     *
     * This function should be used when there is a need to modify the saved blocks, or to inject markup
     * into the return value. Prefer `serialize_blocks` when preparing blocks to be saved to post content.
     *
     * This function is meant for internal use only.
     *
     * @since 6.4.0
     * @access private
     *
     * @see serialize_blocks()
     *
     * @param array[]  $blocks        An array of parsed blocks. See WP_Block_Parser_Block.
     * @param callable $pre_callback  Callback to run on each block in the tree before it is traversed and serialized.
     *                                It is called with the following arguments: &$block, $parent_block, $previous_block.
     *                                Its string return value will be prepended to the serialized block markup.
     * @param callable $post_callback Callback to run on each block in the tree after it is traversed and serialized.
     *                                It is called with the following arguments: &$block, $parent_block, $next_block.
     *                                Its string return value will be appended to the serialized block markup.
     * @return string Serialized block markup.
     */
  filter_block_content($text, $allowed_html = …, $allowed_protocols = …)
    /**
     * Filters and sanitizes block content to remove non-allowable HTML
     * from parsed block attribute values.
     *
     * @since 5.3.1
     *
     * @param string         $text              Text that may contain block content.
     * @param array[]|string $allowed_html      Optional. An array of allowed HTML elements and attributes,
     *                                          or a context name such as 'post'. See wp_kses_allowed_html()
     *                                          for the list of accepted context names. Default 'post'.
     * @param string[]       $allowed_protocols Optional. Array of allowed URL protocols.
     *                                          Defaults to the result of wp_allowed_protocols().
     * @return string The filtered and sanitized content result.
     */
  _filter_block_content_callback($matches)
    /**
     * Callback used for regular expression replacement in filter_block_content().
     *
     * @since 6.2.1
     * @access private
     *
     * @param array $matches Array of preg_replace_callback matches.
     * @return string Replacement string.
     */
  filter_block_kses($block, $allowed_html, $allowed_protocols = …)
    /**
     * Filters and sanitizes a parsed block to remove non-allowable HTML
     * from block attribute values.
     *
     * @since 5.3.1
     *
     * @param WP_Block_Parser_Block $block             The parsed block object.
     * @param array[]|string        $allowed_html      An array of allowed HTML elements and attributes,
     *                                                 or a context name such as 'post'. See wp_kses_allowed_html()
     *                                                 for the list of accepted context names.
     * @param string[]              $allowed_protocols Optional. Array of allowed URL protocols.
     *                                                 Defaults to the result of wp_allowed_protocols().
     * @return array The filtered and sanitized block object result.
     */
  filter_block_kses_value($value, $allowed_html, $allowed_protocols = …, $block_context = …)
    /**
     * Filters and sanitizes a parsed block attribute value to remove
     * non-allowable HTML.
     *
     * @since 5.3.1
     * @since 6.5.5 Added the `$block_context` parameter.
     *
     * @param string[]|string $value             The attribute value to filter.
     * @param array[]|string  $allowed_html      An array of allowed HTML elements and attributes,
     *                                           or a context name such as 'post'. See wp_kses_allowed_html()
     *                                           for the list of accepted context names.
     * @param string[]        $allowed_protocols Optional. Array of allowed URL protocols.
     *                                           Defaults to the result of wp_allowed_protocols().
     * @param array           $block_context     Optional. The block the attribute belongs to, in parsed block array format.
     * @return string[]|string The filtered and sanitized result.
     */
  filter_block_core_template_part_attributes($attribute_value, $attribute_name, $allowed_html)
    /**
     * Sanitizes the value of the Template Part block's `tagName` attribute.
     *
     * @since 6.5.5
     *
     * @param string         $attribute_value The attribute value to filter.
     * @param string         $attribute_name  The attribute name.
     * @param array[]|string $allowed_html    An array of allowed HTML elements and attributes,
     *                                        or a context name such as 'post'. See wp_kses_allowed_html()
     *                                        for the list of accepted context names.
     * @return string The sanitized attribute value.
     */
  excerpt_remove_blocks($content)
    /**
     * Parses blocks out of a content string, and renders those appropriate for the excerpt.
     *
     * As the excerpt should be a small string of text relevant to the full post content,
     * this function renders the blocks that are most likely to contain such text.
     *
     * @since 5.0.0
     *
     * @param string $content The content to parse.
     * @return string The parsed and filtered content.
     */
  excerpt_remove_footnotes($content)
    /**
     * Parses footnotes markup out of a content string,
     * and renders those appropriate for the excerpt.
     *
     * @since 6.3.0
     *
     * @param string $content The content to parse.
     * @return string The parsed and filtered content.
     */
  _excerpt_render_inner_blocks($parsed_block, $allowed_blocks)
    /**
     * Renders inner blocks from the allowed wrapper blocks
     * for generating an excerpt.
     *
     * @since 5.8.0
     * @access private
     *
     * @param array $parsed_block   The parsed block.
     * @param array $allowed_blocks The list of allowed inner blocks.
     * @return string The rendered inner blocks.
     */
  render_block($parsed_block)
    /**
     * Renders a single block into a HTML string.
     *
     * @since 5.0.0
     *
     * @global WP_Post $post The post to edit.
     *
     * @param array $parsed_block {
     *     An associative array of the block being rendered. See WP_Block_Parser_Block.
     *
     *     @type string|null $blockName    Name of block.
     *     @type array       $attrs        Attributes from block comment delimiters.
     *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
     *                                     have the same structure as this one.
     *     @type string      $innerHTML    HTML from inside block comment delimiters.
     *     @type array       $innerContent List of string fragments and null markers where
     *                                     inner blocks were found.
     * }
     * @return string String of rendered HTML.
     */
  parse_blocks($content)
    /**
     * Parses blocks out of a content string.
     *
     * Given an HTML document, this function fully-parses block content, producing
     * a tree of blocks and their contents, as well as top-level non-block content,
     * which will appear as a block with no `blockName`.
     *
     * This function can be memory heavy for certain documents, particularly those
     * with deeply-nested blocks or blocks with extensive attribute values. Further,
     * this function must parse an entire document in one atomic operation.
     *
     * If the entire parsed document is not necessary, consider using {@see WP_Block_Processor}
     * instead, as it provides a streaming and low-overhead interface for finding blocks.
     *
     * @since 5.0.0
     *
     * @param string $content Post content.
     * @return array[] {
     *     Array of block structures.
     *
     *     @type array ...$0 {
     *         An associative array of a single parsed block object. See WP_Block_Parser_Block.
     *
     *         @type string|null $blockName    Name of block.
     *         @type array       $attrs        Attributes from block comment delimiters.
     *         @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
     *                                         have the same structure as this one.
     *         @type string      $innerHTML    HTML from inside block comment delimiters.
     *         @type array       $innerContent List of string fragments and null markers where
     *                                         inner blocks were found.
     *     }
     * }
     */
  do_blocks($content)
    /**
     * Parses dynamic blocks out of `post_content` and re-renders them.
     *
     * @since 5.0.0
     *
     * @param string $content Post content.
     * @return string Updated post content.
     */
  _restore_wpautop_hook($content)
    /**
     * If do_blocks() needs to remove wpautop() from the `the_content` filter, this re-adds it afterwards,
     * for subsequent `the_content` usage.
     *
     * @since 5.0.0
     * @access private
     *
     * @param string $content The post content running through this filter.
     * @return string The unmodified content.
     */
  block_version($content)
    /**
     * Returns the current version of the block format that the content string is using.
     *
     * If the string doesn't contain blocks, it returns 0.
     *
     * @since 5.0.0
     *
     * @param string $content Content to test.
     * @return int The block format version is 1 if the content contains one or more blocks, 0 otherwise.
     */
  register_block_style($block_name, $style_properties)
    /**
     * Registers a new block style.
     *
     * @since 5.3.0
     * @since 6.6.0 Added support for registering styles for multiple block types.
     *
     * @link https://developer.wordpress.org/block-editor/reference-guides/block-api/block-styles/
     *
     * @param string|string[] $block_name       Block type name including namespace or array of namespaced block type names.
     * @param array           $style_properties Array containing the properties of the style name, label,
     *                                          style_handle (name of the stylesheet to be enqueued),
     *                                          inline_style (string containing the CSS to be added),
     *                                          style_data (theme.json-like array to generate CSS from).
     *                                          See WP_Block_Styles_Registry::register().
     * @return bool True if the block style was registered with success and false otherwise.
     */
  unregister_block_style($block_name, $block_style_name)
    /**
     * Unregisters a block style.
     *
     * @since 5.3.0
     *
     * @param string $block_name       Block type name including namespace.
     * @param string $block_style_name Block style name.
     * @return bool True if the block style was unregistered with success and false otherwise.
     */
  block_has_support($block_type, $feature, $default_value = …)
    /**
     * Checks whether the current block type supports the feature requested.
     *
     * @since 5.8.0
     * @since 6.4.0 The `$feature` parameter now supports a string.
     *
     * @param WP_Block_Type $block_type    Block type to check for support.
     * @param string|array  $feature       Feature slug, or path to a specific feature to check support for.
     * @param mixed         $default_value Optional. Fallback value for feature support. Default false.
     * @return bool Whether the feature is supported.
     */
  wp_migrate_old_typography_shape($metadata)
    /**
     * Converts typography keys declared under `supports.*` to `supports.typography.*`.
     *
     * Displays a `_doing_it_wrong()` notice when a block using the older format is detected.
     *
     * @since 5.8.0
     *
     * @param array $metadata Metadata for registering a block type.
     * @return array Filtered metadata for registering a block type.
     */
  build_query_vars_from_query_block($block, $page)
    /**
     * Helper function that constructs a WP_Query args array from
     * a `Query` block properties.
     *
     * It's used in Query Loop, Query Pagination Numbers and Query Pagination Next blocks.
     *
     * @since 5.8.0
     * @since 6.1.0 Added `query_loop_block_query_vars` filter and `parents` support in query.
     * @since 6.7.0 Added support for the `format` property in query.
     *
     * @param WP_Block $block Block instance.
     * @param int      $page  Current query's page.
     *
     * @return array Returns the constructed WP_Query arguments.
     */
  get_query_pagination_arrow($block, $is_next)
    /**
     * Helper function that returns the proper pagination arrow HTML for
     * `QueryPaginationNext` and `QueryPaginationPrevious` blocks based
     * on the provided `paginationArrow` from `QueryPagination` context.
     *
     * It's used in QueryPaginationNext and QueryPaginationPrevious blocks.
     *
     * @since 5.9.0
     *
     * @param WP_Block $block   Block instance.
     * @param bool     $is_next Flag for handling `next/previous` blocks.
     * @return string|null The pagination arrow HTML or null if there is none.
     */
  build_comment_query_vars_from_block($block)
    /**
     * Helper function that constructs a comment query vars array from the passed
     * block properties.
     *
     * It's used with the Comment Query Loop inner blocks.
     *
     * @since 6.0.0
     *
     * @param WP_Block $block Block instance.
     * @return array Returns the comment query parameters to use with the
     *               WP_Comment_Query constructor.
     */
  get_comments_pagination_arrow($block, $pagination_type = …)
    /**
     * Helper function that returns the proper pagination arrow HTML for
     * `CommentsPaginationNext` and `CommentsPaginationPrevious` blocks based on the
     * provided `paginationArrow` from `CommentsPagination` context.
     *
     * It's used in CommentsPaginationNext and CommentsPaginationPrevious blocks.
     *
     * @since 6.0.0
     *
     * @param WP_Block $block           Block instance.
     * @param string   $pagination_type Optional. Type of the arrow we will be rendering.
     *                                  Accepts 'next' or 'previous'. Default 'next'.
     * @return string|null The pagination arrow HTML or null if there is none.
     */
  _wp_filter_post_meta_footnotes($footnotes)
    /**
     * Strips all HTML from the content of footnotes, and sanitizes the ID.
     *
     * This function expects slashed data on the footnotes content.
     *
     * @access private
     * @since 6.3.2
     *
     * @param string $footnotes JSON-encoded string of an array containing the content and ID of each footnote.
     * @return string Filtered content without any HTML on the footnote content and with the sanitized ID.
     */
  _wp_footnotes_kses_init_filters()
    /**
     * Adds the filters for footnotes meta field.
     *
     * @access private
     * @since 6.3.2
     */
  _wp_footnotes_remove_filters()
    /**
     * Removes the filters for footnotes meta field.
     *
     * @access private
     * @since 6.3.2
     */
  _wp_footnotes_kses_init()
    /**
     * Registers the filter of footnotes meta field if the user does not have `unfiltered_html` capability.
     *
     * @access private
     * @since 6.3.2
     */
  _wp_footnotes_force_filtered_html_on_import_filter($arg)
    /**
     * Initializes the filters for footnotes meta field when imported data should be filtered.
     *
     * This filter is the last one being executed on {@see 'force_filtered_html_on_import'}.
     * If the input of the filter is true, it means we are in an import situation and should
     * enable kses, independently of the user capabilities. So in that case we call
     * _wp_footnotes_kses_init_filters().
     *
     * @access private
     * @since 6.3.2
     *
     * @param string $arg Input argument of the filter.
     * @return string Input argument of the filter.
     */

[wordpress-develop] src/wp-includes/class-wp-block.php
  WP_Block
  public __construct($block, $available_context = …, $registry = …)
    /**
    	 * Constructor.
    	 *
    	 * Populates object properties from the provided block instance argument.
    	 *
    	 * The given array of context values will not necessarily be available on
    	 * the instance itself, but is treated as the full set of values provided by
    	 * the block's ancestry. This is assigned to the private `available_context`
    	 * property. Only values which are configured to consumed by the block via
    	 * its registered type will be assigned to the block's `context` property.
    	 *
    	 * @since 5.5.0
    	 *
    	 * @param array                  $block             {
    	 *     An associative array of a single parsed block object. See WP_Block_Parser_Block.
    	 *
    	 *     @type string|null $blockName    Name of block.
    	 *     @type array       $attrs        Attributes from block comment delimiters.
    	 *     @type array       $innerBlocks  List of inner blocks. An array of arrays that
    	 *                                     have the same structure as this one.
    	 *     @type string      $innerHTML    HTML from inside block comment delimiters.
    	 *     @type array       $innerContent List of string fragments and null markers where inner blocks were found.
    	 * }
    	 * @param array                  $available_context Optional array of ancestry context values.
    	 * @param WP_Block_Type_Registry $registry          Optional block type registry.
    	 */
  public refresh_context_dependents()
    /**
    	 * Updates the context for the current block and its inner blocks.
    	 *
    	 * The method updates the context of inner blocks, if any, by passing down
    	 * any context values the block provides (`provides_context`).
    	 *
    	 * If the block has inner blocks, the method recursively processes them by creating new instances of `WP_Block`
    	 * for each inner block and updating their context based on the block's `provides_context` property.
    	 *
    	 * @since 6.8.0
    	 */
  public refresh_parsed_block_dependents()
    /**
    	 * Updates the parsed block content for the current block and its inner blocks.
    	 *
    	 * This method sets the `inner_html` and `inner_content` properties of the block based on the parsed
    	 * block content provided during initialization. It ensures that the block instance reflects the
    	 * most up-to-date content for both the inner HTML and any string fragments around inner blocks.
    	 *
    	 * If the block has inner blocks, this method initializes a new `WP_Block_List` for them, ensuring the
    	 * correct content and context are updated for each nested block.
    	 *
    	 * @since 6.8.0
    	 */
  public __get($name)
    /**
    	 * Returns a value from an inaccessible property.
    	 *
    	 * This is used to lazily initialize the `attributes` property of a block,
    	 * such that it is only prepared with default attributes at the time that
    	 * the property is accessed. For all other inaccessible properties, a `null`
    	 * value is returned.
    	 *
    	 * @since 5.5.0
    	 *
    	 * @param string $name Property name.
    	 * @return array|null Prepared attributes, or null.
    	 */
  private process_block_bindings()
    /**
    	 * Processes the block bindings and updates the block attributes with the values from the sources.
    	 *
    	 * A block might contain bindings in its attributes. Bindings are mappings
    	 * between an attribute of the block and a source. A "source" is a function
    	 * registered with `register_block_bindings_source()` that defines how to
    	 * retrieve a value from outside the block, e.g. from post meta.
    	 *
    	 * This function will process those bindings and update the block's attributes
    	 * with the values coming from the bindings.
    	 *
    	 * ### Example
    	 *
    	 * The "bindings" property for an Image block might look like this:
    	 *
    	 * ```json
    	 * {
    	 *   "metadata": {
    	 *     "bindings": {
    	 *       "title": {
    	 *         "source": "core/post-meta",
    	 *         "args": { "key": "text_custom_field" }
    	 *       },
    	 *       "url": {
    	 *         "source": "core/post-meta",
    	 *         "args": { "key": "url_custom_field" }
    	 *       }
    	 *     }
    	 *   }
    	 * }
    	 * ```
    	 *
    	 * The above example will replace the `title` and `url` attributes of the Image
    	 * block with the values of the `text_custom_field` and `url_custom_field` post meta.
    	 *
    	 * @since 6.5.0
    	 * @since 6.6.0 Handle the `__default` attribute for pattern overrides.
    	 * @since 6.7.0 Return any updated bindings metadata in the computed attributes.
    	 *
    	 * @return array The computed block attributes for the provided block bindings.
    	 */
  private replace_html(string $block_content, string $attribute_name, $source_value)
    /**
    	 * Depending on the block attribute name, replace its value in the HTML based on the value provided.
    	 *
    	 * @since 6.5.0
    	 *
    	 * @param string $block_content  Block content.
    	 * @param string $attribute_name The attribute name to replace.
    	 * @param mixed  $source_value   The value used to replace in the HTML.
    	 * @return string The modified block content.
    	 */
  private static get_block_bindings_processor(string $block_content)
  public render($options = …)
    /**
    	 * Generates the render output for the block.
    	 *
    	 * @since 5.5.0
    	 * @since 6.5.0 Added block bindings processing.
    	 *
    	 * @global WP_Post $post Global post object.
    	 *
    	 * @param array $options {
    	 *     Optional options object.
    	 *
    	 *     @type bool $dynamic Defaults to 'true'. Optionally set to false to avoid using the block's render_callback.
    	 * }
    	 * @return string Rendered block output.
    	 */

[wordpress-develop] src/wp-includes/functions.wp-scripts.php
  wp_scripts()
    /**
     * Dependencies API: Scripts functions
     *
     * @since 2.6.0
     *
     * @package WordPress
     * @subpackage Dependencies
     */
    /**
     * Initializes $wp_scripts if it has not been set.
     *
     * @since 4.2.0
     *
     * @global WP_Scripts $wp_scripts
     *
     * @return WP_Scripts WP_Scripts instance.
     */
  _wp_scripts_maybe_doing_it_wrong($function_name, $handle = …)
    /**
     * Helper function to output a _doing_it_wrong message when applicable.
     *
     * @ignore
     * @since 4.2.0
     * @since 5.5.0 Added the `$handle` parameter.
     *
     * @param string $function_name Function name.
     * @param string $handle        Optional. Name of the script or stylesheet that was
     *                              registered or enqueued too early. Default empty.
     */
  wp_print_scripts($handles = …)
    /**
     * Prints scripts in document head that are in the $handles queue.
     *
     * Called by admin-header.php and {@see 'wp_head'} hook. Since it is called by wp_head on every page load,
     * the function does not instantiate the WP_Scripts object unless script names are explicitly passed.
     * Makes use of already-instantiated `$wp_scripts` global if present. Use provided {@see 'wp_print_scripts'}
     * hook to register/enqueue new scripts.
     *
     * @see WP_Scripts::do_item()
     * @since 2.1.0
     *
     * @global WP_Scripts $wp_scripts The WP_Scripts object for printing scripts.
     *
     * @param string|string[]|false $handles Optional. Scripts to be printed. Default 'false'.
     * @return string[] On success, an array of handles of processed WP_Dependencies items; otherwise, an empty array.
     */
  wp_add_inline_script($handle, $data, $position = …)
    /**
     * Adds extra code to a registered script.
     *
     * Code will only be added if the script is already in the queue.
     * Accepts a string `$data` containing the code. If two or more code blocks
     * are added to the same script `$handle`, they will be printed in the order
     * they were added, i.e. the latter added code can redeclare the previous.
     *
     * @since 4.5.0
     *
     * @see WP_Scripts::add_inline_script()
     *
     * @param string $handle   Name of the script to add the inline script to.
     * @param string $data     String containing the JavaScript to be added.
     * @param string $position Optional. Whether to add the inline script before the handle
     *                         or after. Default 'after'.
     * @return bool True on success, false on failure.
     */
  wp_register_script($handle, $src, $deps = …, $ver = …, $args = …)
    /**
     * Registers a new script.
     *
     * Registers a script to be enqueued later using the wp_enqueue_script() function.
     *
     * @see WP_Dependencies::add()
     * @see WP_Dependencies::add_data()
     *
     * @since 2.1.0
     * @since 4.3.0 A return value was added.
     * @since 6.3.0 The $in_footer parameter of type boolean was overloaded to be an $args parameter of type array.
     * @since 6.9.0 The $fetchpriority parameter of type string was added to the $args parameter of type array.
     *
     * @param string           $handle    Name of the script. Should be unique.
     * @param string|false     $src       Full URL of the script, or path of the script relative to the WordPress root directory.
     *                                    If source is set to false, script is an alias of other scripts it depends on.
     * @param string[]         $deps      Optional. An array of registered script handles this script depends on. Default empty array.
     * @param string|bool|null $ver       Optional. String specifying script version number, if it has one, which is added to the URL
     *                                    as a query string for cache busting purposes. If version is set to false, a version
     *                                    number is automatically added equal to current installed WordPress version.
     *                                    If set to null, no version is added.
     * @param array|bool       $args     {
     *     Optional. An array of additional script loading strategies. Default empty array.
     *     Otherwise, it may be a boolean in which case it determines whether the script is printed in the footer. Default false.
     *
     *     @type string    $strategy      Optional. If provided, may be either 'defer' or 'async'.
     *     @type bool      $in_footer     Optional. Whether to print the script in the footer. Default 'false'.
     *     @type string    $fetchpriority Optional. The fetch priority for the script. Default 'auto'.
     * }
     * @return bool Whether the script has been registered. True on success, false on failure.
     */
  wp_localize_script($handle, $object_name, $l10n)
    /**
     * Localizes a script.
     *
     * Works only if the script has already been registered.
     *
     * Accepts an associative array `$l10n` and creates a JavaScript object:
     *
     *     "$object_name": {
     *         key: value,
     *         key: value,
     *         ...
     *     }
     *
     * @see WP_Scripts::localize()
     * @link https://core.trac.wordpress.org/ticket/11520
     *
     * @since 2.2.0
     *
     * @todo Documentation cleanup
     *
     * @param string $handle      Script handle the data will be attached to.
     * @param string $object_name Name for the JavaScript object. Passed directly, so it should be qualified JS variable.
     *                            Example: '/[a-zA-Z0-9_]+/'.
     * @param array  $l10n        The data itself. The data can be either a single or multi-dimensional array.
     * @return bool True if the script was successfully localized, false otherwise.
     */
  wp_set_script_translations($handle, $domain = …, $path = …)
    /**
     * Sets translated strings for a script.
     *
     * Works only if the script has already been registered.
     *
     * @see WP_Scripts::set_translations()
     * @since 5.0.0
     * @since 5.1.0 The `$domain` parameter was made optional.
     *
     * @global WP_Scripts $wp_scripts The WP_Scripts object for printing scripts.
     *
     * @param string $handle Script handle the textdomain will be attached to.
     * @param string $domain Optional. Text domain. Default 'default'.
     * @param string $path   Optional. The full file path to the directory containing translation files.
     * @return bool True if the text domain was successfully localized, false otherwise.
     */
  wp_deregister_script($handle)
    /**
     * Removes a registered script.
     *
     * Note: there are intentional safeguards in place to prevent critical admin scripts,
     * such as jQuery core, from being unregistered.
     *
     * @see WP_Dependencies::remove()
     *
     * @since 2.1.0
     *
     * @global string $pagenow The filename of the current screen.
     *
     * @param string $handle Name of the script to be removed.
     */
  wp_enqueue_script($handle, $src = …, $deps = …, $ver = …, $args = …)
    /**
     * Enqueues a script.
     *
     * Registers the script if `$src` provided (does NOT overwrite), and enqueues it.
     *
     * @see WP_Dependencies::add()
     * @see WP_Dependencies::add_data()
     * @see WP_Dependencies::enqueue()
     *
     * @since 2.1.0
     * @since 6.3.0 The $in_footer parameter of type boolean was overloaded to be an $args parameter of type array.
     * @since 6.9.0 The $fetchpriority parameter of type string was added to the $args parameter of type array.
     *
     * @param string           $handle    Name of the script. Should be unique.
     * @param string           $src       Full URL of the script, or path of the script relative to the WordPress root directory.
     *                                    Default empty.
     * @param string[]         $deps      Optional. An array of registered script handles this script depends on. Default empty array.
     * @param string|bool|null $ver       Optional. String specifying script version number, if it has one, which is added to the URL
     *                                    as a query string for cache busting purposes. If version is set to false, a version
     *                                    number is automatically added equal to current installed WordPress version.
     *                                    If set to null, no version is added.
     * @param array|bool       $args     {
     *     Optional. An array of additional script loading strategies. Default empty array.
     *     Otherwise, it may be a boolean in which case it determines whether the script is printed in the footer. Default false.
     *
     *     @type string    $strategy      Optional. If provided, may be either 'defer' or 'async'.
     *     @type bool      $in_footer     Optional. Whether to print the script in the footer. Default 'false'.
     *     @type string    $fetchpriority Optional. The fetch priority for the script. Default 'auto'.
     * }
     */
  wp_dequeue_script($handle)
    /**
     * Removes a previously enqueued script.
     *
     * @see WP_Dependencies::dequeue()
     *
     * @since 3.1.0
     *
     * @param string $handle Name of the script to be removed.
     */
  wp_script_is($handle, $status = …)
    /**
     * Determines whether a script has been added to the queue.
     *
     * For more information on this and similar theme functions, check out
     * the {@link https://developer.wordpress.org/themes/basics/conditional-tags/
     * Conditional Tags} article in the Theme Developer Handbook.
     *
     * @since 2.8.0
     * @since 3.5.0 'enqueued' added as an alias of the 'queue' list.
     *
     * @param string $handle Name of the script.
     * @param string $status Optional. Status of the script to check. Default 'enqueued'.
     *                       Accepts 'enqueued', 'registered', 'queue', 'to_do', and 'done'.
     * @return bool Whether the script is queued.
     */
  wp_script_add_data($handle, $key, $value)
    /**
     * Adds metadata to a script.
     *
     * Works only if the script has already been registered.
     *
     * Possible values for $key and $value:
     * 'strategy' string 'defer' or 'async'.
     *
     * @since 4.2.0
     * @since 6.9.0 Updated possible values to remove reference to 'conditional' and add 'strategy'.
     *
     * @see WP_Dependencies::add_data()
     *
     * @param string $handle Name of the script.
     * @param string $key    Name of data point for which we're storing a value.
     * @param mixed  $value  String containing the data to be added.
     * @return bool True on success, false on failure.
     */

[wordpress-develop] src/wp-includes/functions.wp-styles.php
  wp_styles()
    /**
     * Dependencies API: Styles functions
     *
     * @since 2.6.0
     *
     * @package WordPress
     * @subpackage Dependencies
     */
    /**
     * Initializes $wp_styles if it has not been set.
     *
     * @since 4.2.0
     *
     * @global WP_Styles $wp_styles
     *
     * @return WP_Styles WP_Styles instance.
     */
  wp_print_styles($handles = …)
    /**
     * Displays styles that are in the $handles queue.
     *
     * Passing an empty array to $handles prints the queue,
     * passing an array with one string prints that style,
     * and passing an array of strings prints those styles.
     *
     * @since 2.6.0
     *
     * @global WP_Styles $wp_styles The WP_Styles object for printing styles.
     *
     * @param string|bool|array $handles Styles to be printed. Default 'false'.
     * @return string[] On success, an array of handles of processed WP_Dependencies items; otherwise, an empty array.
     */
  wp_add_inline_style($handle, $data)
    /**
     * Adds extra CSS styles to a registered stylesheet.
     *
     * Styles will only be added if the stylesheet is already in the queue.
     * Accepts a string $data containing the CSS. If two or more CSS code blocks
     * are added to the same stylesheet $handle, they will be printed in the order
     * they were added, i.e. the latter added styles can redeclare the previous.
     *
     * @see WP_Styles::add_inline_style()
     *
     * @since 3.3.0
     *
     * @param string $handle Name of the stylesheet to add the extra styles to.
     * @param string $data   String containing the CSS styles to be added.
     * @return bool True on success, false on failure.
     */
  wp_register_style($handle, $src, $deps = …, $ver = …, $media = …)
    /**
     * Registers a CSS stylesheet.
     *
     * @see WP_Dependencies::add()
     * @link https://www.w3.org/TR/CSS2/media.html#media-types List of CSS media types.
     *
     * @since 2.6.0
     * @since 4.3.0 A return value was added.
     *
     * @param string           $handle Name of the stylesheet. Should be unique.
     * @param string|false     $src    Full URL of the stylesheet, or path of the stylesheet relative to the WordPress root directory.
     *                                 If source is set to false, stylesheet is an alias of other stylesheets it depends on.
     * @param string[]         $deps   Optional. An array of registered stylesheet handles this stylesheet depends on. Default empty array.
     * @param string|bool|null $ver    Optional. String specifying stylesheet version number, if it has one, which is added to the URL
     *                                 as a query string for cache busting purposes. If version is set to false, a version
     *                                 number is automatically added equal to current installed WordPress version.
     *                                 If set to null, no version is added.
     * @param string           $media  Optional. The media for which this stylesheet has been defined.
     *                                 Default 'all'. Accepts media types like 'all', 'print' and 'screen', or media queries like
     *                                 '(orientation: portrait)' and '(max-width: 640px)'.
     * @return bool Whether the style has been registered. True on success, false on failure.
     */
  wp_deregister_style($handle)
    /**
     * Removes a registered stylesheet.
     *
     * @see WP_Dependencies::remove()
     *
     * @since 2.1.0
     *
     * @param string $handle Name of the stylesheet to be removed.
     */
  wp_enqueue_style($handle, $src = …, $deps = …, $ver = …, $media = …)
    /**
     * Enqueues a CSS stylesheet.
     *
     * Registers the style if source provided (does NOT overwrite) and enqueues.
     *
     * @see WP_Dependencies::add()
     * @see WP_Dependencies::enqueue()
     * @link https://www.w3.org/TR/CSS2/media.html#media-types List of CSS media types.
     *
     * @since 2.6.0
     *
     * @param string           $handle Name of the stylesheet. Should be unique.
     * @param string           $src    Full URL of the stylesheet, or path of the stylesheet relative to the WordPress root directory.
     *                                 Default empty.
     * @param string[]         $deps   Optional. An array of registered stylesheet handles this stylesheet depends on. Default empty array.
     * @param string|bool|null $ver    Optional. String specifying stylesheet version number, if it has one, which is added to the URL
     *                                 as a query string for cache busting purposes. If version is set to false, a version
     *                                 number is automatically added equal to current installed WordPress version.
     *                                 If set to null, no version is added.
     * @param string           $media  Optional. The media for which this stylesheet has been defined.
     *                                 Default 'all'. Accepts media types like 'all', 'print' and 'screen', or media queries like
     *                                 '(orientation: portrait)' and '(max-width: 640px)'.
     */
  wp_dequeue_style($handle)
    /**
     * Removes a previously enqueued CSS stylesheet.
     *
     * @see WP_Dependencies::dequeue()
     *
     * @since 3.1.0
     *
     * @param string $handle Name of the stylesheet to be removed.
     */
  wp_style_is($handle, $status = …)
    /**
     * Checks whether a CSS stylesheet has been added to the queue.
     *
     * @since 2.8.0
     *
     * @param string $handle Name of the stylesheet.
     * @param string $status Optional. Status of the stylesheet to check. Default 'enqueued'.
     *                       Accepts 'enqueued', 'registered', 'queue', 'to_do', and 'done'.
     * @return bool Whether style is queued.
     */
  wp_style_add_data($handle, $key, $value)
    /**
     * Adds metadata to a CSS stylesheet.
     *
     * Works only if the stylesheet has already been registered.
     *
     * Possible values for $key and $value:
     * 'rtl'         bool|string To declare an RTL stylesheet.
     * 'suffix'      string      Optional suffix, used in combination with RTL.
     * 'alt'         bool        For rel="alternate stylesheet".
     * 'title'       string      For preferred/alternate stylesheets.
     * 'path'        string      The absolute path to a stylesheet. Stylesheet will
     *                           load inline when 'path' is set.
     *
     * @see WP_Dependencies::add_data()
     *
     * @since 3.6.0
     * @since 5.8.0 Added 'path' as an official value for $key.
     *              See {@see wp_maybe_inline_styles()}.
     * @since 6.9.0 'conditional' value changed. If the 'conditional' parameter is present
     *              the stylesheet will be ignored.
     *
     * @param string $handle Name of the stylesheet.
     * @param string $key    Name of data point for which we're storing a value.
     *                       Accepts 'rtl' and 'suffix', 'alt', 'title' and 'path'.
     * @param mixed  $value  String containing the CSS data to be added.
     * @return bool True on success, false on failure.
     */

[wordpress-develop] src/wp-includes/script-modules.php
  wp_script_modules(): WP_Script_Modules
    /**
     * Script Modules API: Script Module functions
     *
     * @since 6.5.0
     *
     * @package WordPress
     * @subpackage Script Modules
     */
    /**
     * Retrieves the main WP_Script_Modules instance.
     *
     * This function provides access to the WP_Script_Modules instance, creating one
     * if it doesn't exist yet.
     *
     * @since 6.5.0
     *
     * @global WP_Script_Modules $wp_script_modules
     *
     * @return WP_Script_Modules The main WP_Script_Modules instance.
     */
  wp_register_script_module(string $id, string $src, array $deps = …, $version = …, array $args = …)
    /**
     * Registers the script module if no script module with that script module
     * identifier has already been registered.
     *
     * @since 6.5.0
     * @since 6.9.0 Added the $args parameter.
     *
     * @param string            $id      The identifier of the script module. Should be unique. It will be used in the
     *                                   final import map.
     * @param string            $src     Optional. Full URL of the script module, or path of the script module relative
     *                                   to the WordPress root directory. If it is provided and the script module has
     *                                   not been registered yet, it will be registered.
     * @param array             $deps    {
     *                                       Optional. List of dependencies.
     *
     *                                       @type string|array ...$0 {
     *                                           An array of script module identifiers of the dependencies of this script
     *                                           module. The dependencies can be strings or arrays. If they are arrays,
     *                                           they need an `id` key with the script module identifier, and can contain
     *                                           an `import` key with either `static` or `dynamic`. By default,
     *                                           dependencies that don't contain an `import` key are considered static.
     *
     *                                           @type string $id     The script module identifier.
     *                                           @type string $import Optional. Import type. May be either `static` or
     *                                                                `dynamic`. Defaults to `static`.
     *                                       }
     *                                   }
     * @param string|false|null $version Optional. String specifying the script module version number. Defaults to false.
     *                                   It is added to the URL as a query string for cache busting purposes. If $version
     *                                   is set to false, the version number is the currently installed WordPress version.
     *                                   If $version is set to null, no version is added.
     * @param array             $args    {
     *     Optional. An array of additional args. Default empty array.
     *
     *     @type bool                $in_footer     Whether to print the script module in the footer. Only relevant to block themes. Default 'false'. Optional.
     *     @type 'auto'|'low'|'high' $fetchpriority Fetch priority. Default 'auto'. Optional.
     * }
     */
  wp_enqueue_script_module(string $id, string $src = …, array $deps = …, $version = …, array $args = …)
    /**
     * Marks the script module to be enqueued in the page.
     *
     * If a src is provided and the script module has not been registered yet, it
     * will be registered.
     *
     * @since 6.5.0
     * @since 6.9.0 Added the $args parameter.
     *
     * @param string            $id      The identifier of the script module. Should be unique. It will be used in the
     *                                   final import map.
     * @param string            $src     Optional. Full URL of the script module, or path of the script module relative
     *                                   to the WordPress root directory. If it is provided and the script module has
     *                                   not been registered yet, it will be registered.
     * @param array             $deps    {
     *                                       Optional. List of dependencies.
     *
     *                                       @type string|array ...$0 {
     *                                           An array of script module identifiers of the dependencies of this script
     *                                           module. The dependencies can be strings or arrays. If they are arrays,
     *                                           they need an `id` key with the script module identifier, and can contain
     *                                           an `import` key with either `static` or `dynamic`. By default,
     *                                           dependencies that don't contain an `import` key are considered static.
     *
     *                                           @type string $id     The script module identifier.
     *                                           @type string $import Optional. Import type. May be either `static` or
     *                                                                `dynamic`. Defaults to `static`.
     *                                       }
     *                                   }
     * @param string|false|null $version Optional. String specifying the script module version number. Defaults to false.
     *                                   It is added to the URL as a query string for cache busting purposes. If $version
     *                                   is set to false, the version number is the currently installed WordPress version.
     *                                   If $version is set to null, no version is added.
     * @param array             $args    {
     *     Optional. An array of additional args. Default empty array.
     *
     *     @type bool                $in_footer     Whether to print the script module in the footer. Only relevant to block themes. Default 'false'. Optional.
     *     @type 'auto'|'low'|'high' $fetchpriority Fetch priority. Default 'auto'. Optional.
     * }
     */
  wp_dequeue_script_module(string $id)
    /**
     * Unmarks the script module so it is no longer enqueued in the page.
     *
     * @since 6.5.0
     *
     * @param string $id The identifier of the script module.
     */
  wp_deregister_script_module(string $id)
    /**
     * Deregisters the script module.
     *
     * @since 6.5.0
     *
     * @param string $id The identifier of the script module.
     */
  wp_default_script_modules()
    /**
     * Registers all the default WordPress Script Modules.
     *
     * @since 6.7.0
     */

[wordpress-develop] src/wp-includes/l10n.php
  get_locale()
    /**
     * Core Translation API
     *
     * @package WordPress
     * @subpackage i18n
     * @since 1.2.0
     */
    /**
     * Retrieves the current locale.
     *
     * If the locale is set, then it will filter the locale in the {@see 'locale'}
     * filter hook and return the value.
     *
     * If the locale is not set already, then the WPLANG constant is used if it is
     * defined. Then it is filtered through the {@see 'locale'} filter hook and
     * the value for the locale global set and the locale is returned.
     *
     * The process to get the locale should only be done once, but the locale will
     * always be filtered using the {@see 'locale'} hook.
     *
     * @since 1.5.0
     *
     * @global string $locale           The current locale.
     * @global string $wp_local_package Locale code of the package.
     *
     * @return string The locale of the blog or from the {@see 'locale'} hook.
     */
  get_user_locale($user = …)
    /**
     * Retrieves the locale of a user.
     *
     * If the user has a locale set to a non-empty string then it will be
     * returned. Otherwise it returns the locale of get_locale().
     *
     * @since 4.7.0
     *
     * @param int|WP_User $user User's ID or a WP_User object. Defaults to current user.
     * @return string The locale of the user.
     */
  determine_locale()
    /**
     * Determines the current locale desired for the request.
     *
     * @since 5.0.0
     *
     * @global string $pagenow          The filename of the current screen.
     * @global string $wp_local_package Locale code of the package.
     *
     * @return string The determined locale.
     */
  translate($text, $domain = …)
    /**
     * Retrieves the translation of $text.
     *
     * If there is no translation, or the text domain isn't loaded, the original text is returned.
     *
     * *Note:* Don't use translate() directly, use __() or related functions.
     *
     * @since 2.2.0
     * @since 5.5.0 Introduced `gettext-{$domain}` filter.
     *
     * @param string $text   Text to translate.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     * @return string Translated text.
     */
  before_last_bar($text)
    /**
     * Removes last item on a pipe-delimited string.
     *
     * Meant for removing the last item in a string, such as 'Role name|User role'. The original
     * string will be returned if no pipe '|' characters are found in the string.
     *
     * @since 2.8.0
     *
     * @param string $text A pipe-delimited string.
     * @return string Either $text or everything before the last pipe.
     */
  translate_with_gettext_context($text, $context, $domain = …)
    /**
     * Retrieves the translation of $text in the context defined in $context.
     *
     * If there is no translation, or the text domain isn't loaded, the original text is returned.
     *
     * *Note:* Don't use translate_with_gettext_context() directly, use _x() or related functions.
     *
     * @since 2.8.0
     * @since 5.5.0 Introduced `gettext_with_context-{$domain}` filter.
     *
     * @param string $text    Text to translate.
     * @param string $context Context information for the translators.
     * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
     *                        Default 'default'.
     * @return string Translated text on success, original text on failure.
     */
  __($text, $domain = …)
    /**
     * Retrieves the translation of $text.
     *
     * If there is no translation, or the text domain isn't loaded, the original text is returned.
     *
     * @since 2.1.0
     *
     * @param string $text   Text to translate.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     * @return string Translated text.
     */
  esc_attr__($text, $domain = …)
    /**
     * Retrieves the translation of $text and escapes it for safe use in an attribute.
     *
     * If there is no translation, or the text domain isn't loaded, the original text is returned.
     *
     * @since 2.8.0
     *
     * @param string $text   Text to translate.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     * @return string Translated text on success, original text on failure.
     */
  esc_html__($text, $domain = …)
    /**
     * Retrieves the translation of $text and escapes it for safe use in HTML output.
     *
     * If there is no translation, or the text domain isn't loaded, the original text
     * is escaped and returned.
     *
     * @since 2.8.0
     *
     * @param string $text   Text to translate.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     * @return string Translated text.
     */
  _e($text, $domain = …)
    /**
     * Displays translated text.
     *
     * @since 1.2.0
     *
     * @param string $text   Text to translate.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     */
  esc_attr_e($text, $domain = …)
    /**
     * Displays translated text that has been escaped for safe use in an attribute.
     *
     * Encodes `< > & " '` (less than, greater than, ampersand, double quote, single quote).
     * Will never double encode entities.
     *
     * If you need the value for use in PHP, use esc_attr__().
     *
     * @since 2.8.0
     *
     * @param string $text   Text to translate.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     */
  esc_html_e($text, $domain = …)
    /**
     * Displays translated text that has been escaped for safe use in HTML output.
     *
     * If there is no translation, or the text domain isn't loaded, the original text
     * is escaped and displayed.
     *
     * If you need the value for use in PHP, use esc_html__().
     *
     * @since 2.8.0
     *
     * @param string $text   Text to translate.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     */
  _x($text, $context, $domain = …)
    /**
     * Retrieves translated string with gettext context.
     *
     * Quite a few times, there will be collisions with similar translatable text
     * found in more than two places, but with different translated context.
     *
     * By including the context in the pot file, translators can translate the two
     * strings differently.
     *
     * @since 2.8.0
     *
     * @param string $text    Text to translate.
     * @param string $context Context information for the translators.
     * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
     *                        Default 'default'.
     * @return string Translated context string without pipe.
     */
  _ex($text, $context, $domain = …)
    /**
     * Displays translated string with gettext context.
     *
     * @since 3.0.0
     *
     * @param string $text    Text to translate.
     * @param string $context Context information for the translators.
     * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
     *                        Default 'default'.
     */
  esc_attr_x($text, $context, $domain = …)
    /**
     * Translates string with gettext context, and escapes it for safe use in an attribute.
     *
     * If there is no translation, or the text domain isn't loaded, the original text
     * is escaped and returned.
     *
     * @since 2.8.0
     *
     * @param string $text    Text to translate.
     * @param string $context Context information for the translators.
     * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
     *                        Default 'default'.
     * @return string Translated text.
     */
  esc_html_x($text, $context, $domain = …)
    /**
     * Translates string with gettext context, and escapes it for safe use in HTML output.
     *
     * If there is no translation, or the text domain isn't loaded, the original text
     * is escaped and returned.
     *
     * @since 2.9.0
     *
     * @param string $text    Text to translate.
     * @param string $context Context information for the translators.
     * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
     *                        Default 'default'.
     * @return string Translated text.
     */
  _n($single, $plural, $number, $domain = …)
    /**
     * Translates and retrieves the singular or plural form based on the supplied number.
     *
     * Used when you want to use the appropriate form of a string based on whether a
     * number is singular or plural.
     *
     * Example:
     *
     *     printf( _n( '%s person', '%s people', $count, 'text-domain' ), number_format_i18n( $count ) );
     *
     * @since 2.8.0
     * @since 5.5.0 Introduced `ngettext-{$domain}` filter.
     *
     * @param string $single The text to be used if the number is singular.
     * @param string $plural The text to be used if the number is plural.
     * @param int    $number The number to compare against to use either the singular or plural form.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     * @return string The translated singular or plural form.
     */
  _nx($single, $plural, $number, $context, $domain = …)
    /**
     * Translates and retrieves the singular or plural form based on the supplied number, with gettext context.
     *
     * This is a hybrid of _n() and _x(). It supports context and plurals.
     *
     * Used when you want to use the appropriate form of a string with context based on whether a
     * number is singular or plural.
     *
     * Example of a generic phrase which is disambiguated via the context parameter:
     *
     *     printf( _nx( '%s group', '%s groups', $people, 'group of people', 'text-domain' ), number_format_i18n( $people ) );
     *     printf( _nx( '%s group', '%s groups', $animals, 'group of animals', 'text-domain' ), number_format_i18n( $animals ) );
     *
     * @since 2.8.0
     * @since 5.5.0 Introduced `ngettext_with_context-{$domain}` filter.
     *
     * @param string $single  The text to be used if the number is singular.
     * @param string $plural  The text to be used if the number is plural.
     * @param int    $number  The number to compare against to use either the singular or plural form.
     * @param string $context Context information for the translators.
     * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
     *                        Default 'default'.
     * @return string The translated singular or plural form.
     */
  _n_noop($singular, $plural, $domain = …)
    /**
     * Registers plural strings in POT file, but does not translate them.
     *
     * Used when you want to keep structures with translatable plural
     * strings and use them later when the number is known.
     *
     * Example:
     *
     *     $message = _n_noop( '%s post', '%s posts', 'text-domain' );
     *     ...
     *     printf( translate_nooped_plural( $message, $count, 'text-domain' ), number_format_i18n( $count ) );
     *
     * @since 2.5.0
     *
     * @param string $singular Singular form to be localized.
     * @param string $plural   Plural form to be localized.
     * @param string $domain   Optional. Text domain. Unique identifier for retrieving translated strings.
     *                         Default null.
     * @return array {
     *     Array of translation information for the strings.
     *
     *     @type string      $0        Singular form to be localized. No longer used.
     *     @type string      $1        Plural form to be localized. No longer used.
     *     @type string      $singular Singular form to be localized.
     *     @type string      $plural   Plural form to be localized.
     *     @type null        $context  Context information for the translators.
     *     @type string|null $domain   Text domain.
     * }
     */
  _nx_noop($singular, $plural, $context, $domain = …)
    /**
     * Registers plural strings with gettext context in POT file, but does not translate them.
     *
     * Used when you want to keep structures with translatable plural
     * strings and use them later when the number is known.
     *
     * Example of a generic phrase which is disambiguated via the context parameter:
     *
     *     $messages = array(
     *          'people'  => _nx_noop( '%s group', '%s groups', 'people', 'text-domain' ),
     *          'animals' => _nx_noop( '%s group', '%s groups', 'animals', 'text-domain' ),
     *     );
     *     ...
     *     $message = $messages[ $type ];
     *     printf( translate_nooped_plural( $message, $count, 'text-domain' ), number_format_i18n( $count ) );
     *
     * @since 2.8.0
     *
     * @param string $singular Singular form to be localized.
     * @param string $plural   Plural form to be localized.
     * @param string $context  Context information for the translators.
     * @param string $domain   Optional. Text domain. Unique identifier for retrieving translated strings.
     *                         Default null.
     * @return array {
     *     Array of translation information for the strings.
     *
     *     @type string      $0        Singular form to be localized. No longer used.
     *     @type string      $1        Plural form to be localized. No longer used.
     *     @type string      $2        Context information for the translators. No longer used.
     *     @type string      $singular Singular form to be localized.
     *     @type string      $plural   Plural form to be localized.
     *     @type string      $context  Context information for the translators.
     *     @type string|null $domain   Text domain.
     * }
     */
  translate_nooped_plural($nooped_plural, $count, $domain = …)
    /**
     * Translates and returns the singular or plural form of a string that's been registered
     * with _n_noop() or _nx_noop().
     *
     * Used when you want to use a translatable plural string once the number is known.
     *
     * Example:
     *
     *     $message = _n_noop( '%s post', '%s posts', 'text-domain' );
     *     ...
     *     printf( translate_nooped_plural( $message, $count, 'text-domain' ), number_format_i18n( $count ) );
     *
     * @since 3.1.0
     *
     * @param array  $nooped_plural {
     *     Array that is usually a return value from _n_noop() or _nx_noop().
     *
     *     @type string      $singular Singular form to be localized.
     *     @type string      $plural   Plural form to be localized.
     *     @type string|null $context  Context information for the translators.
     *     @type string|null $domain   Text domain.
     * }
     * @param int    $count         Number of objects.
     * @param string $domain        Optional. Text domain. Unique identifier for retrieving translated strings. If $nooped_plural contains
     *                              a text domain passed to _n_noop() or _nx_noop(), it will override this value. Default 'default'.
     * @return string Either $singular or $plural translated text.
     */
  load_textdomain($domain, $mofile, $locale = …)
    /**
     * Loads a .mo file into the text domain $domain.
     *
     * If the text domain already exists, the translations will be merged. If both
     * sets have the same string, the translation from the original value will be taken.
     *
     * On success, the .mo file will be placed in the $l10n global by $domain
     * and will be a MO object.
     *
     * @since 1.5.0
     * @since 6.1.0 Added the `$locale` parameter.
     *
     * @global MO[]                   $l10n                   An array of all currently loaded text domains.
     * @global MO[]                   $l10n_unloaded          An array of all text domains that have been unloaded again.
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     *
     * @param string $domain Text domain. Unique identifier for retrieving translated strings.
     * @param string $mofile Path to the .mo file.
     * @param string $locale Optional. Locale. Default is the current locale.
     * @return bool True on success, false on failure.
     */
  unload_textdomain($domain, $reloadable = …)
    /**
     * Unloads translations for a text domain.
     *
     * @since 3.0.0
     * @since 6.1.0 Added the `$reloadable` parameter.
     *
     * @global MO[] $l10n          An array of all currently loaded text domains.
     * @global MO[] $l10n_unloaded An array of all text domains that have been unloaded again.
     *
     * @param string $domain     Text domain. Unique identifier for retrieving translated strings.
     * @param bool   $reloadable Whether the text domain can be loaded just-in-time again.
     * @return bool Whether textdomain was unloaded.
     */
  load_default_textdomain($locale = …)
    /**
     * Loads default translated strings based on locale.
     *
     * Loads the .mo file in WP_LANG_DIR constant path from WordPress root.
     * The translated (.mo) file is named based on the locale.
     *
     * @see load_textdomain()
     *
     * @since 1.5.0
     *
     * @param string $locale Optional. Locale to load. Default is the value of get_locale().
     * @return bool Whether the textdomain was loaded.
     */
  load_plugin_textdomain($domain, $deprecated = …, $plugin_rel_path = …)
    /**
     * Loads a plugin's translated strings.
     *
     * If the path is not given then it will be the root of the plugin directory.
     *
     * The .mo file should be named based on the text domain with a dash, and then the locale exactly.
     *
     * @since 1.5.0
     * @since 4.6.0 The function now tries to load the .mo file from the languages directory first.
     * @since 6.7.0 Translations are no longer immediately loaded, but handed off to the just-in-time loading mechanism.
     *
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     * @global array<string, WP_Translations|NOOP_Translations> $l10n An array of all currently loaded text domains.
     *
     * @param string       $domain          Unique identifier for retrieving translated strings
     * @param string|false $deprecated      Optional. Deprecated. Use the $plugin_rel_path parameter instead.
     *                                      Default false.
     * @param string|false $plugin_rel_path Optional. Relative path to WP_PLUGIN_DIR where the .mo file resides.
     *                                      Default false.
     * @return bool True when textdomain is successfully loaded, false otherwise.
     */
  load_muplugin_textdomain($domain, $mu_plugin_rel_path = …)
    /**
     * Loads the translated strings for a plugin residing in the mu-plugins directory.
     *
     * @since 3.0.0
     * @since 4.6.0 The function now tries to load the .mo file from the languages directory first.
     * @since 6.7.0 Translations are no longer immediately loaded, but handed off to the just-in-time loading mechanism.
     *
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     * @global array<string, WP_Translations|NOOP_Translations> $l10n An array of all currently loaded text domains.
     *
     * @param string $domain             Text domain. Unique identifier for retrieving translated strings.
     * @param string $mu_plugin_rel_path Optional. Relative to `WPMU_PLUGIN_DIR` directory in which the .mo
     *                                   file resides. Default empty string.
     * @return bool True when textdomain is successfully loaded, false otherwise.
     */
  load_theme_textdomain($domain, $path = …)
    /**
     * Loads the theme's translated strings.
     *
     * If the current locale exists as a .mo file in the theme's root directory, it
     * will be included in the translated strings by the $domain.
     *
     * The .mo files must be named based on the locale exactly.
     *
     * @since 1.5.0
     * @since 4.6.0 The function now tries to load the .mo file from the languages directory first.
     * @since 6.7.0 Translations are no longer immediately loaded, but handed off to the just-in-time loading mechanism.
     *
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     * @global array<string, WP_Translations|NOOP_Translations> $l10n An array of all currently loaded text domains.
     *
     * @param string       $domain Text domain. Unique identifier for retrieving translated strings.
     * @param string|false $path   Optional. Path to the directory containing the .mo file.
     *                             Default false.
     * @return bool True when textdomain is successfully loaded, false otherwise.
     */
  load_child_theme_textdomain($domain, $path = …)
    /**
     * Loads the child theme's translated strings.
     *
     * If the current locale exists as a .mo file in the child theme's
     * root directory, it will be included in the translated strings by the $domain.
     *
     * The .mo files must be named based on the locale exactly.
     *
     * @since 2.9.0
     *
     * @param string       $domain Text domain. Unique identifier for retrieving translated strings.
     * @param string|false $path   Optional. Path to the directory containing the .mo file.
     *                             Default false.
     * @return bool True when the theme textdomain is successfully loaded, false otherwise.
     */
  load_script_textdomain($handle, $domain = …, $path = …)
    /**
     * Loads the script translated strings.
     *
     * @since 5.0.0
     * @since 5.0.2 Uses load_script_translations() to load translation data.
     * @since 5.1.0 The `$domain` parameter was made optional.
     *
     * @see WP_Scripts::set_translations()
     *
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     *
     * @param string $handle Name of the script to register a translation domain to.
     * @param string $domain Optional. Text domain. Default 'default'.
     * @param string $path   Optional. The full file path to the directory containing translation files.
     * @return string|false The translated strings in JSON encoding on success,
     *                      false if the script textdomain could not be loaded.
     */
  load_script_translations($file, $handle, $domain)
    /**
     * Loads the translation data for the given script handle and text domain.
     *
     * @since 5.0.2
     *
     * @param string|false $file   Path to the translation file to load. False if there isn't one.
     * @param string       $handle Name of the script to register a translation domain to.
     * @param string       $domain The text domain.
     * @return string|false The JSON-encoded translated strings for the given script handle and text domain.
     *                      False if there are none.
     */
  _load_textdomain_just_in_time($domain)
    /**
     * Loads plugin and theme text domains just-in-time.
     *
     * When a textdomain is encountered for the first time, we try to load
     * the translation file from `wp-content/languages`, removing the need
     * to call load_plugin_textdomain() or load_theme_textdomain().
     *
     * @since 4.6.0
     * @access private
     *
     * @global MO[]                   $l10n_unloaded          An array of all text domains that have been unloaded again.
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     *
     * @param string $domain Text domain. Unique identifier for retrieving translated strings.
     * @return bool True when the textdomain is successfully loaded, false otherwise.
     */
  get_translations_for_domain($domain)
    /**
     * Returns the Translations instance for a text domain.
     *
     * If there isn't one, returns empty Translations instance.
     *
     * @since 2.8.0
     *
     * @global MO[] $l10n An array of all currently loaded text domains.
     *
     * @param string $domain Text domain. Unique identifier for retrieving translated strings.
     * @return Translations|NOOP_Translations A Translations instance.
     */
  is_textdomain_loaded($domain)
    /**
     * Determines whether there are translations for the text domain.
     *
     * @since 3.0.0
     *
     * @global MO[] $l10n An array of all currently loaded text domains.
     *
     * @param string $domain Text domain. Unique identifier for retrieving translated strings.
     * @return bool Whether there are translations.
     */
  translate_user_role($name, $domain = …)
    /**
     * Translates role name.
     *
     * Since the role names are in the database and not in the source there
     * are dummy gettext calls to get them into the POT file and this function
     * properly translates them back.
     *
     * The before_last_bar() call is needed, because older installations keep the roles
     * using the old context format: 'Role name|User role' and just skipping the
     * content after the last bar is easier than fixing them in the DB. New installations
     * won't suffer from that problem.
     *
     * @since 2.8.0
     * @since 5.2.0 Added the `$domain` parameter.
     *
     * @param string $name   The role name.
     * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
     *                       Default 'default'.
     * @return string Translated role name on success, original name on failure.
     */
  get_available_languages($dir = …)
    /**
     * Gets all available languages based on the presence of *.mo and *.l10n.php files in a given directory.
     *
     * The default directory is WP_LANG_DIR.
     *
     * @since 3.0.0
     * @since 4.7.0 The results are now filterable with the {@see 'get_available_languages'} filter.
     * @since 6.5.0 The initial file list is now cached and also takes into account *.l10n.php files.
     *
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     *
     * @param string $dir A directory to search for language files.
     *                    Default WP_LANG_DIR.
     * @return string[] An array of language codes or an empty array if no languages are present.
     *                  Language codes are formed by stripping the file extension from the language file names.
     */
  wp_get_installed_translations($type)
    /**
     * Gets installed translations.
     *
     * Looks in the wp-content/languages directory for translations of
     * plugins or themes.
     *
     * @since 3.7.0
     *
     * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
     *
     * @param string $type What to search for. Accepts 'plugins', 'themes', 'core'.
     * @return array Array of language data.
     */
  wp_get_pomo_file_data($po_file)
    /**
     * Extracts headers from a PO file.
     *
     * @since 3.7.0
     *
     * @param string $po_file Path to PO file.
     * @return string[] Array of PO file header values keyed by header name.
     */
  wp_get_l10n_php_file_data($php_file)
    /**
     * Extracts headers from a PHP translation file.
     *
     * @since 6.6.0
     *
     * @param string $php_file Path to a `.l10n.php` file.
     * @return string[] Array of file header values keyed by header name.
     */
  wp_dropdown_languages($args = …)
    /**
     * Displays or returns a Language selector.
     *
     * @since 4.0.0
     * @since 4.3.0 Introduced the `echo` argument.
     * @since 4.7.0 Introduced the `show_option_site_default` argument.
     * @since 5.1.0 Introduced the `show_option_en_us` argument.
     * @since 5.9.0 Introduced the `explicit_option_en_us` argument.
     *
     * @see get_available_languages()
     * @see wp_get_available_translations()
     *
     * @param string|array $args {
     *     Optional. Array or string of arguments for outputting the language selector.
     *
     *     @type string   $id                           ID attribute of the select element. Default 'locale'.
     *     @type string   $name                         Name attribute of the select element. Default 'locale'.
     *     @type string[] $languages                    List of installed languages, contain only the locales.
     *                                                  Default empty array.
     *     @type array    $translations                 List of available translations. Default result of
     *                                                  wp_get_available_translations().
     *     @type string   $selected                     Language which should be selected. Default empty.
     *     @type bool|int $echo                         Whether to echo the generated markup. Accepts 0, 1, or their
     *                                                  boolean equivalents. Default 1.
     *     @type bool     $show_available_translations  Whether to show available translations. Default true.
     *     @type bool     $show_option_site_default     Whether to show an option to fall back to the site's locale. Default false.
     *     @type bool     $show_option_en_us            Whether to show an option for English (United States). Default true.
     *     @type bool     $explicit_option_en_us        Whether the English (United States) option uses an explicit value of en_US
     *                                                  instead of an empty value. Default false.
     * }
     * @return string HTML dropdown list of languages.
     */
  is_rtl()
    /**
     * Determines whether the current locale is right-to-left (RTL).
     *
     * For more information on this and similar theme functions, check out
     * the {@link https://developer.wordpress.org/themes/basics/conditional-tags/
     * Conditional Tags} article in the Theme Developer Handbook.
     *
     * @since 3.0.0
     *
     * @global WP_Locale $wp_locale WordPress date and time locale object.
     *
     * @return bool Whether locale is RTL.
     */
  switch_to_locale($locale)
    /**
     * Switches the translations according to the given locale.
     *
     * @since 4.7.0
     *
     * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
     *
     * @param string $locale The locale.
     * @return bool True on success, false on failure.
     */
  switch_to_user_locale($user_id)
    /**
     * Switches the translations according to the given user's locale.
     *
     * @since 6.2.0
     *
     * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
     *
     * @param int $user_id User ID.
     * @return bool True on success, false on failure.
     */
  restore_previous_locale()
    /**
     * Restores the translations according to the previous locale.
     *
     * @since 4.7.0
     *
     * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
     *
     * @return string|false Locale on success, false on error.
     */
  restore_current_locale()
    /**
     * Restores the translations according to the original locale.
     *
     * @since 4.7.0
     *
     * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
     *
     * @return string|false Locale on success, false on error.
     */
  is_locale_switched()
    /**
     * Determines whether switch_to_locale() is in effect.
     *
     * @since 4.7.0
     *
     * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
     *
     * @return bool True if the locale has been switched, false otherwise.
     */
  translate_settings_using_i18n_schema($i18n_schema, $settings, $textdomain)
    /**
     * Translates the provided settings value using its i18n schema.
     *
     * @since 5.9.0
     * @access private
     *
     * @param string|string[]|array[]|object $i18n_schema I18n schema for the setting.
     * @param string|string[]|array[]        $settings    Value for the settings.
     * @param string                         $textdomain  Textdomain to use with translations.
     *
     * @return string|string[]|array[] Translated settings.
     */
  wp_get_list_item_separator()
    /**
     * Retrieves the list item separator based on the locale.
     *
     * @since 6.0.0
     *
     * @global WP_Locale $wp_locale WordPress date and time locale object.
     *
     * @return string Locale-specific list item separator.
     */
  wp_get_word_count_type()
    /**
     * Retrieves the word count type based on the locale.
     *
     * @since 6.2.0
     *
     * @global WP_Locale $wp_locale WordPress date and time locale object.
     *
     * @return string Locale-specific word count type. Possible values are `characters_excluding_spaces`,
     *                `characters_including_spaces`, or `words`. Defaults to `words`.
     */
  has_translation(string $singular, string $textdomain = …, ?string $locale = …): bool
    /**
     * Returns a boolean to indicate whether a translation exists for a given string with optional text domain and locale.
     *
     * @since 6.7.0
     *
     * @param string  $singular   Singular translation to check.
     * @param string  $textdomain Optional. Text domain. Default 'default'.
     * @param ?string $locale     Optional. Locale. Default current locale.
     * @return bool  True if the translation exists, false otherwise.
     */

---

## Hooks and filters

Firing sites for action and filter hooks. Use these to verify hook names referenced in the documentation.

[wordpress-develop] src/wp-includes/blocks.php
  filter @ L500: $metadata = apply_filters( 'block_type_metadata', $metadata );
  filter @ L755: $settings = apply_filters( 'block_type_metadata_settings', $settings, $metadata );
  filter @ L967: $hooked_block_types = apply_filters( 'hooked_block_types', $hooked_block_types, $relative_position, $anchor_block_type, $context );
  filter @ L990: $parsed_hooked_block = apply_filters( 'hooked_block', $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );
  filter @ L1006: $parsed_hooked_block = apply_filters( "hooked_block_{$hooked_block_type}", $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );
  filter @ L1047: $hooked_block_types = apply_filters( 'hooked_block_types', $hooked_block_types, $relative_position, $anchor_block_type, $context );
  filter @ L1061: $parsed_hooked_block = apply_filters( 'hooked_block', $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );
  filter @ L1064: $parsed_hooked_block = apply_filters( "hooked_block_{$hooked_block_type}", $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );
  filter @ L1484: $response->data['content']['rendered'] = apply_filters(
  filter @ L2167: $allowed_wrapper_blocks = apply_filters( 'excerpt_allowed_wrapper_blocks', $allowed_wrapper_blocks );
  filter @ L2181: $allowed_blocks = apply_filters( 'excerpt_allowed_blocks', $allowed_blocks );
  filter @ L2305: $pre_render = apply_filters( 'pre_render_block', null, $parsed_block, $parent_block );
  filter @ L2343: $parsed_block = apply_filters( 'render_block_data', $parsed_block, $source_block, $parent_block );
  filter @ L2379: $context = apply_filters( 'render_block_context', $context, $parsed_block, $parent_block );
  filter @ L2427: $parser_class = apply_filters( 'block_parser_class', 'WP_Block_Parser' );
  filter @ L2844: return apply_filters( 'query_loop_block_query_vars', $query, $block, $page );

[wordpress-develop] src/wp-includes/class-wp-block.php
  filter @ L517: $interactivity_process_directives_enabled = apply_filters( 'interactivity_process_directives', true );
  filter @ L555: $pre_render = apply_filters( 'pre_render_block', null, $inner_block->parsed_block, $parent_block );
  filter @ L564: $inner_block->parsed_block = apply_filters( 'render_block_data', $inner_block->parsed_block, $source_block, $parent_block );
  filter @ L567: $inner_block->context = apply_filters( 'render_block_context', $inner_block->context, $inner_block->parsed_block, $parent_block );
  filter @ L651: $block_content = apply_filters( 'render_block', $block_content, $this->parsed_block, $this );
  filter @ L666: $block_content = apply_filters( "render_block_{$this->name}", $block_content, $this->parsed_block, $this );
  filter @ L704: ! (bool) apply_filters( 'enqueue_empty_block_content_assets', false, $this->name )

[wordpress-develop] src/wp-includes/functions.wp-scripts.php
  action @ L95: do_action( 'wp_print_scripts' );

[wordpress-develop] src/wp-includes/functions.wp-styles.php
  action @ L57: do_action( 'wp_print_styles' );

[wordpress-develop] src/wp-includes/l10n.php
  filter @ L35: return apply_filters( 'locale', $locale );
  filter @ L80: return apply_filters( 'locale', $locale );
  filter @ L134: $determined_locale = apply_filters( 'pre_determine_locale', null );
  filter @ L176: return apply_filters( 'determine_locale', $determined_locale );
  filter @ L207: $translation = apply_filters( 'gettext', $translation, $text, $domain );
  filter @ L220: $translation = apply_filters( "gettext_{$domain}", $translation, $text, $domain );
  filter @ L275: $translation = apply_filters( 'gettext_with_context', $translation, $text, $context, $domain );
  filter @ L289: $translation = apply_filters( "gettext_with_context_{$domain}", $translation, $text, $context, $domain );
  filter @ L498: $translation = apply_filters( 'ngettext', $translation, $single, $plural, $number, $domain );
  filter @ L513: $translation = apply_filters( "ngettext_{$domain}", $translation, $single, $plural, $number, $domain );
  filter @ L558: $translation = apply_filters( 'ngettext_with_context', $translation, $single, $plural, $number, $context, $domain );
  filter @ L574: $translation = apply_filters( "ngettext_with_context_{$domain}", $translation, $single, $plural, $number, $context, $domain );
  filter @ L749: $loaded = apply_filters( 'pre_load_textdomain', null, $domain, $mofile, $locale );
  filter @ L769: $plugin_override = apply_filters( 'override_load_textdomain', false, $domain, $mofile, $locale );
  action @ L785: do_action( 'load_textdomain', $domain, $mofile );
  filter @ L795: $mofile = apply_filters( 'load_textdomain_mofile', $mofile, $domain );
  filter @ L816: $preferred_format = apply_filters( 'translation_file_format', 'php', $domain );
  filter @ L843: $file = (string) apply_filters( 'load_translation_file', $file, $domain, $locale );
  filter @ L894: $plugin_override = apply_filters( 'override_unload_textdomain', false, $domain, $reloadable );
  action @ L913: do_action( 'unload_textdomain', $domain, $reloadable );
  filter @ L1252: $relative = apply_filters( 'load_script_textdomain_relative_path', $relative, $src );
  filter @ L1307: $translations = apply_filters( 'pre_load_script_translations', null, $file, $handle, $domain );
  filter @ L1322: $file = apply_filters( 'load_script_translation_file', $file, $handle, $domain );
  filter @ L1340: return apply_filters( 'load_script_translations', $translations, $file, $handle, $domain );
  filter @ L1516: return apply_filters( 'get_available_languages', array_unique( $languages ), $dir );

---

## Defaults

Default-value sites: `wp_parse_args` calls in PHP and object-spread merges in JS/TS. Use these to verify documented default values.

[wordpress-develop] src/wp-includes/class-wp-block.php

  wp_parse_args @ L527:
    )
    		) {
    			$root_interactive_block = $this;
    		}
    
    		$options = wp_parse_args(
    			$options,
    			array(
    				'dynamic' => true,
    			)
    		)

[wordpress-develop] src/wp-includes/l10n.php

  wp_parse_args @ L1678:
    * }
     * @return string HTML dropdown list of languages.
     */
    function wp_dropdown_languages( $args = array() ) {
    
    	$parsed_args = wp_parse_args(
    		$args,
    		array(
    			'id'                          => 'locale',
    			'name'                        => 'locale',
    			'languages'                   => array(),
    			'translations'                => array(),
    			'selected'                    => '',
    			'echo'                        => 1,
    			'show_available_translations' => true,
    			'show_option_site_default'    => false,
    			'show_option_en_us'           => true,
    			'explicit_option_en_us'       => false,
    		)
    	)

---

## Schemas

JSON schema files. Authoritative for property names and allowed enum values. Confirm field requirements against TypeScript or PHP source rather than the schema's `required` array.

### [gutenberg] schemas/json/block.json
```json
{
	"title": "JSON schema for WordPress blocks",
	"$schema": "http://json-schema.org/draft-07/schema#",
	"definitions": {
		"//": {
			"reference": "https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/",
			"attributesReference": "https://developer.wordpress.org/block-editor/reference-guides/block-api/block-attributes/",
			"contextReference": "https://developer.wordpress.org/block-editor/reference-guides/block-api/block-context/",
			"supportsReference": "https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/",
			"registerReference": "https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/#example-optional"
		}
	},
	"type": "object",
	"properties": {
		"$schema": {
			"type": "string"
		},
		"apiVersion": {
			"description": "The version of the Block API used by the block. If the block is registered with API version 2 or lower, the post editor may work as a non-iframe editor. Since all editors are planned to work as iframes in the future, it is recommended to set the `apiVersion` field to 3 and test the block inside the iframe editor.\n\nSee the API versions documentation at https://developer.wordpress.org/block-editor/reference-guides/block-api/block-api-versions/block-migration-for-iframe-editor-compatibility/ for more details.",
			"type": "integer",
			"const": 3
		},
		"name": {
			"description": "The name for a block is a unique string that identifies a block. Names have to be structured as `namespace/block-name`, where namespace is the name of your plugin or theme.",
			"type": "string",
			"pattern": "^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$"
		},
		"__experimental": {
			"description": "The name of the experiment this block is a part of, or boolean true if there is no specific experiment name.",
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "boolean"
				}
			]
		},
		"title": {
			"description": "This is the display title for your block, which can be translated with our translation functions. The block inserter will show this name.",
			"type": "string"
		},
		"category": {
			"description": "Blocks are grouped into categories to help users browse and discover them.\n Core provided categories are: text, media, design, widgets, theme, embed\n\nPlugins and Themes can also register custom block categories.\n\nhttps://developer.wordpress.org/block-editor/reference-guides/filters/block-filters/#managing-block-categories",
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "string",
					"enum": [
						"text",
						"media",
						"design",
						"widgets",
						"theme",
						"embed"
					]
				}
			]
		},
		"parent": {
			"description": "Setting parent lets a block require that it is only available when nested within the specified blocks. For example, you might want to allow an ‘Add to Cart’ block to only be available within a ‘Product’ block.",
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"ancestor": {
			"description": "The `ancestor` property makes a block available inside the specified block types at any position of the ancestor block subtree. That allows, for example, to place a ‘Comment Content’ block inside a ‘Column’ block, as long as ‘Column’ is somewhere within a ‘Comment Template’ block.",
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"allowedBlocks": {
			"description": "The `allowedBlocks` property specifies that only the listed block types can be the children of this block. For example, a ‘List’ block allows only ‘List Item’ blocks as direct children.",
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"icon": {
			"description": "An icon property should be specified to make it easier to identify a block. These can be any of WordPress’ Dashicons (slug serving also as a fallback in non-js contexts).",
			"type": "string"
		},
		"description": {
			"description": "This is a short description for your block, which can be translated with our translation functions. This will be shown in the block inspector.",
			"type": "string"
		},
		"keywords": {
			"description": "Sometimes a block could have aliases that help users discover it while searching. For example, an image block could also want to be discovered by photo. You can do so by providing an array of unlimited terms (which are translated).",
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"version": {
			"description": "The current version number of the block, such as 1.0 or 1.0.3. It’s similar to how plugins are versioned. This field might be used with block assets to control cache invalidation, and when the block author omits it, then the installed version of WordPress is used instead.",
			"type": "string"
		},
		"textdomain": {
			"description": "The gettext text domain of the plugin/block. More information can be found in the Text Domain section of the How to Internationalize your Plugin page.\n\nhttps://developer.wordpress.org/plugins/internationalization/how-to-internationalize-your-plugin/",
			"type": "string"
		},
		"attributes": {
			"description": "Attributes provide the structured data needs of a block. They can exist in different forms when they are serialized, but they are declared together under a common interface.\n\nSee the attributes documentation at https://developer.wordpress.org/block-editor/reference-guides/block-api/block-attributes/ for more details.",
			"type": "object",
			"patternProperties": {
				"[a-zA-Z]": {
					"type": "object",
					"properties": {
						"type": {
							"description": "The type indicates the type of data that is stored by the attribute. It does not indicate where the data is stored, which is defined by the source field.\n\nA type is required, unless an enum is provided. A type can be used with an enum.\n\nNote that the validity of an object is determined by your source. For an example, see the query details below.",
							"oneOf": [
								{
									"type": "string",
									"enum": [
										"null",
										"boolean",
										"object",
										"array",
										"string",
										"rich-text",
										"integer",
										"number"
									]
								},
								{
									"type": "array",
									"uniqueItems": true,
									"items": {
										"type": "string",
										"enum": [
											"null",
											"boolean",
											"object",
											"array",
											"string",
											"integer",
											"number"
										]
									}
								}
							]
						},
						"enum": {
							"description": "An attribute can be defined as one of a fixed set of values. This is specified by an enum, which contains an array of allowed values:",
							"type": "array",
							"items": {
								"oneOf": [
									{ "type": "boolean" },
									{ "type": "number" },
									{ "type": "string" }
								]
							}
						},
						"source": {
							"description": "Attribute sources are used to define how the attribute values are extracted from saved post content. They provide a mechanism to map from the saved markup to a JavaScript representation of a block.",
							"type": "string",
							"enum": [
								"attribute",
								"text",
								"rich-text",
								"html",
								"raw",
								"query",
								"meta"
							]
						},
						"selector": {
							"description": "The selector can be an HTML tag, or anything queryable with querySelector, such as a class or id attribute. Examples are given below.\n\nFor example, a selector of img will match an img element, and img.class will match an img element that has a class of class.",
							"type": "string"
						},
						"attribute": {
							"description": "Use an attribute source to extract the value from an attribute in the markup. The attribute is specified by the attribute field, which must be supplied.\n\nExample: Extract the src attribute from an image found in the block’s markup.",
							"type": "string"
						},
						"query": {
							"description": "Use query to extract an array of values from markup. Entries of the array are determined by the selector argument, where each matched element within the block will have an entry structured corresponding to the second argument, an object of attribute sources.",
							"type": "object"
						},
						"meta": {
							"description": "Although attributes may be obtained from a post’s meta, meta attribute sources are considered deprecated; EntityProvider and related hook APIs should be used instead, as shown in the Create Meta Block how-to here:\n\nhttps://developer.wordpress.org/block-editor/how-to-guides/metabox/#step-2-add-meta-block",
							"type": "string"
						},
						"role": {
							"description": "Designates the conceptual type of the attribute.\n\nThe `content` value marks the attribute as user-editable content, and the `local` value marks the attribute as temporary and non-persistable.",
							"type": "string",
							"enum": [ "content", "local" ]
						},
						"default": {
							"description": "A block attribute can contain a default value, which will be used if the type and source do not match anything within the block content.\n\nThe value is provided by the default field, and the value should match the expected format of the attribute."
						}
					},
					"anyOf": [
						{ "required": [ "type" ] },
						{ "required": [ "enum" ] }
					]
				}
			},
			"additionalProperties": false
		},
		"providesContext": {
			"description": "Context provided for available access by descendants of blocks of this type, in the form of an object which maps a context name to one of the block’s own attribute.\n\nSee the block context documentation at https://developer.wordpress.org/block-editor/reference-guides/block-api/block-context/ for more details.",
			"type": "object",
			"patternProperties": {
				"[a-zA-Z]": {
					"type": "string"
				}
			}
		},
		"usesContext": {
			"description": "Array of the names of context values to inherit from an ancestor provider.\n\nSee the block context documentation at https://developer.wordpress.org/block-editor/reference-guides/block-api/block-context/ for more details.",
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"supports": {
			"description": "It contains as set of options to control features used in the editor. See the supports documentation at https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/ for more details.",
			"type": "object",
			"properties": {
				"anchor": {
					"description": "Anchors let you link directly to a specific block on a page. This property adds a field to define an id for the block and a button to copy the direct link.",
					"type": "boolean",
					"default": false
				},
				"align": {
					"description": "This property adds block controls which allow to change block’s alignment.",
					"oneOf": [
						{
							"type": "boolean"
						},
						{
							"type": "array",
							"items": {
								"type": "string",
								"enum": [
									"wide",
									"full",
									"left",
									"center",
									"right"
								]
							}
						}
					],
					"default": false
				},
				"alignWide": {
					"description": "This property allows to enable wide alignment for your theme. To disable this behavior for a single block, set this flag to false.",
					"type": "boolean",
					"default": true
				},
				"allowedBlocks": {
					"description": "This property adds UI controls which enable the user to select allowed child blocks for a block container. Note: To use this feature, pass `attributes.allowedBlocks` as the `allowedBlocks` property in the options object of `useInnerBlocksProps`.",
					"type": "boolean",
					"default": false
				},
				"ariaLabel": {
					"description": "ARIA-labels let you define an accessible label for elements. This property allows enabling the definition of an aria-label for the block, without exposing a UI field.",
					"oneOf": [
						{
							"type": "boolean"
						},
						{
							"type": "object"
						}
					],
					"default": false
				},
				"className": {
					"description": "By default, the class .wp-block-your-block-name is added to the root element of your saved markup. This helps having a consistent mechanism for styling blocks that themes and plugins can rely on. If, for whatever reason, a class is not desired on the markup, this functionality can be disabled.",
					"type": "boolean",
					"default": true
				},
				"color": {
					"description": "This value signals that a block supports some of the properties related to color. When it does, the block editor will show UI controls for the user to set their values.\n\nNote that the background and text keys have a default value of true, so if the color property is present they’ll also be considered enabled",
					"type": "object",
					"properties": {
						"background": {
							"description": "This property adds UI controls which allow the user to apply a solid background color to a block.\n\nWhen color support is declared, this property is enabled by default (along with text), so simply setting color will enable background color.\n\nTo disable background support while keeping other color supports enabled, set to false.\n\nWhen the block declares support for color.background, its attributes definition is extended to include two new attributes: backgroundColor and style",
							"type": "boolean",
							"default": true
						},
						"gradients": {
							"description": "This property adds UI controls which allow the user to apply a gradient background to a block.\n\nGradient presets are sourced from editor-gradient-presets theme support.\n\nWhen the block declares support for color.gradient, its attributes definition is extended to include two new attributes: gradient and style",
							"type": "boolean",
							"default": false
						},
						"link": {
							"description": "This property adds block controls which allow the user to set link color in a block, link color is disabled by default.\n\nLink color presets are sourced from the editor-color-palette theme support.\n\nWhen the block declares support for color.link, its attributes definition is extended to include the style attribute",
							"type": "boolean",
							"default": false
						},
						"text": {
							"description": "This property adds block controls which allow the user to set text color in a block.\n\nWhen color support is declared, this property is enabled by default (along with background), so simply setting color will enable text color.\n\nText color presets are sourced from the editor-color-palette theme support.\n\nWhen the block declares support for color.text, its attributes definition is extended to include two new attributes: textColor and style",
							"type": "boolean",
							"default": true
						},
						"heading": {
							"description": "This property adds block controls which allow the user to set heading colors in a block. Heading color is disabled by default.\n\nHeading color presets are sourced from the editor-color-palette theme support.\n\nWhen the block declares support for color.heading, its attributes definition is extended to include the style attribute",
							"type": "boolean",
							"default": false
						},
						"button": {
							"description": "This property adds block controls which allow the user to set button colors in a block. Button color is disabled by default.\n\nButton color presets are sourced from the editor-color-palette theme support.\n\nWhen the block declares support for color.button, its attributes definition is extended to include the style attribute",
							"type": "boolean",
							"default": false
						},
						"enableContrastChecker": {
							"description": "Determines whether the contrast checker widget displays in the block editor UI.\n\nThe contrast checker appears only if the block declares support for color. It tests the readability of color combinations and warns if there is a potential issue. The property is enabled by default.\n\nSet to `false` to explicitly disable.",
							"type": "boolean",
							"default": true
						}
					}
				},
				"customClassName": {
					"description": "This property adds a field to define a custom className for the block's wrapper.",
					"type": "boolean",
					"default": true
				},
				"customCSS": {
					"description": "This property adds a field to define custom CSS for the block instance.",
					"type": "boolean",
					"default": true
				},
				"dimensions": {
					"description": "This value signals that a block supports some of the CSS style properties related to dimensions. When it does, the block editor will show UI controls for the user to set their values if the theme declares support.\n\nWhen the block declares support for a specific dimensions property, its attributes definition is extended to include the style attribute.",
					"type": "object",
					"properties": {
						"aspectRatio": {
							"description": "Allow blocks to define an aspect ratio value.",
							"type": "boolean",
							"default": false
						},
						"height": {
							"description": "Allow blocks to define a height value.",
							"type": "boolean",
							"default": false
						},
						"minHeight": {
							"description": "Allow blocks to define a minimum height value.",
							"type": "boolean",
							"default": false
						},
						"minWidth": {
							"description": "Allow blocks to define a minimum width value.",
							"type": "boolean",
							"default": false
						},
						"width": {
							"description": "Allow blocks to define a width value.",
							"type": "boolean",
							"default": false
						}
					}
				},
				"filter": {
					"description": "This value signals that a block supports some of the properties related to filters. When it does, the block editor will show UI controls for the user to set their values if the theme declares support.\n\nWhen the block declares support for a specific filter property, its attributes definition is extended to include the style attribute.",
					"type": "object",
					"properties": {
						"duotone": {
							"description": "Allow blocks to define a duotone filter.",
							"type": "boolean",
							"default": false
						}
					}
				},
				"background": {
					"description": "This value signals that a block supports some of the CSS style properties related to background. When it does, the block editor will show UI controls for the user to set their values if the theme declares support.\n\nWhen the block declares support for a specific background property, its attributes definition is extended to include the style attribute.",
					"type": "object",
					"properties": {
						"backgroundImage": {
							"description": "Allow blocks to define a background image.",
							"type": "boolean",
							"default": false
						},
						"backgroundSize": {
							"description": "Allow blocks to define values related to the size of a background image, including size, position, and repeat controls",
							"type": "boolean",
							"default": false
						},
						"gradient": {
							"description": "Allow blocks to define gradient values.",
							"type": "boolean",
							"default": false
						}
					}
				},
				"html": {
					"description": "By default, a block’s markup can be edited individually. To disable this behavior, set html to false.",
					"type": "boolean",
					"default": true
				},
				"inserter": {
					"description": "By default, all blocks will appear in the inserter, block transforms menu, Style Book, etc. To hide a block from all parts of the user interface so that it can only be inserted programmatically, set inserter to false.",
					"type": "boolean",
					"default": true
				},
				"renaming": {
					"description": "By default, a block can be renamed by a user from the block 'Options' dropdown or the 'Advanced' panel. To disable this behavior, set renaming to false.",
					"type": "boolean",
					"default": true
				},
				"visibility": {
					"description": "By default, a block can be hidden by a user from the block 'Options' dropdown. To disable this behavior, set visibility to false.",
					"type": "boolean",
					"default": true
				},
				"layout": {
					"description": "This value only applies to blocks that are containers for inner blocks. If set to `true` the layout type will be `flow`. For other layout types it's necessary to set the `type` explicitly inside the `default` object.",
					"oneOf": [
						{ "type": "boolean" },
						{
							"type": "object",
							"properties": {
								"default": {
									"description": "Allows setting the `type` property to define what layout type is default for the block, and also default values for any properties inherent to that layout type, e.g., for a `flex` layout, a default value can be set for `flexWrap`.",
									"type": "object",
									"properties": {
										"type": {
											"description": "The layout type.",
											"type": "string",
											"enum": [
												"constrained",
												"grid",
												"flex"
											]
										},
										"contentSize": {
											"description": "The content size used on all children.",
											"type": "string"
										},
										"wideSize": {
											"description": "The wide size used on alignwide children.",
											"type": "string"
										},
										"justifyContent": {
											"description": "Content justification value.",
											"type": "string",
											"enum": [
												"right",
												"center",
												"space-between",
												"left",
												"stretch"
											]
										},
										"orientation": {
											"description": "The orientation of the layout.",
											"type": "string",
											"enum": [ "horizontal", "vertical" ]
										},
										"flexWrap": {
											"description": "The flex wrap value.",
											"type": "string",
											"enum": [ "wrap", "nowrap" ]
										},
										"verticalAlignment": {
											"description": "The vertical alignment value.",
											"type": "string",
											"enum": [
												"top",
												"center",
												"bottom",
												"space-between",
												"stretch"
											]
										},
										"minimumColumnWidth": {
											"description": "The minimum column width value.",
											"type": "string"
										},
										"columnCount": {
											"description": "The column count value.",
											"type": "number"
										}
									}
								},
								"allowSwitching": {
									"description": "Exposes a switcher control that allows toggling between all existing layout types.",
									"type": "boolean",
									"default": false
								},
								"allowEditing": {
									"description": "Determines display of layout controls in the block sidebar. If set to false, layout controls will be hidden.",
									"type": "boolean",
									"default": true
								},
								"allowInheriting": {
									"description": "For the `flow` layout type only, determines display of the `Inner blocks use content width` toggle.",
									"type": "boolean",
									"default": true
								},
								"allowSizingOnChildren": {
									"description": "For the `flex` layout type only, determines display of sizing controls (Fit/Fill/Fixed) on all child blocks of the flex block.",
									"type": "boolean",
									"default": false
								},
								"allowVerticalAlignment": {
									"description": "For the `flex` layout type only, determines display of vertical alignment controls in the block toolbar.",
									"type": "boolean",
									"default": true
								},
								"allowJustification": {
									"description": "For the `flex` layout type, determines display of justification controls in the block toolbar and block sidebar. For the `constrained` layout type, determines display of justification control in the block sidebar.",
									"type": "boolean",
									"default": true
								},
								"allowOrientation": {
									"description": "For the `flex` layout type only, determines display of the orientation control in the block toolbar.",
									"type": "boolean",
									"default": true
								},
								"allowWrap": {
									"description": "For the `flex` layout type only, determines display of the wrap toggle in the block sidebar.",
									"type": "boolean",
									"default": true
								},
								"allowCustomContentAndWideSize": {
									"description": "For the `constrained` layout type only, determines display of the custom content and wide size controls in the block sidebar.",
									"type": "boolean",
									"default": true
								}
							}
						}
					],
					"default": false
				},
				"multiple": {
					"description": "A non-multiple block can be inserted into each post, one time only. For example, the built-in ‘More’ block cannot be inserted again if it already exists in the post being edited. A non-multiple block’s icon is automatically dimmed (unclickable) to prevent multiple instances.",
					"type": "boolean",
					"default": true
				},
				"reusable": {
					"description": "A block may want to disable the ability of being converted into a reusable block. By default all blocks can be converted to a reusable block. If supports reusable is set to false, the option to convert the block into a reusable block will not appear.",
					"type": "boolean",
					"default": true
				},
				"lock": {
					"description": "A block may want to disable the ability to toggle the lock state. It can be locked/unlocked by a user from the block 'Options' dropdown by default. To disable this behavior, set lock to false.",
					"type": "boolean",
					"default": true
				},
				"position": {
					"description": "This value signals that a block supports some of the CSS style properties related to position. When it does, the block editor will show UI controls for the user to set their values if the theme declares support.\n\nWhen the block declares support for a specific position property, its attributes definition is extended to include the style attribute.",
					"type": "object",
					"properties": {
						"sticky": {
							"description": "Allow blocks to stick to their immediate parent when scrolling the page.",
							"type": "boolean",
							"default": false
						}
					}
				},
				"spacing": {
					"description": "This value signals that a block supports some of the CSS style properties related to spacing. When it does, the block editor will show UI controls for the user to set their values if the theme declares support.\n\nWhen the block declares support for a specific spacing property, its attributes definition is extended to include the style attribute.",
					"type": "object",
					"properties": {
						"margin": {
							"oneOf": [
								{
									"type": "boolean"
								},
								{
									"type": "array",
									"items": {
										"type": "string",
										"enum": [
											"top",
											"right",
											"left",
											"bottom"
										]
									}
								},
								{
									"type": "array",
									"items": {
										"type": "string",
										"enum": [ "vertical", "horizontal" ]
									}
								}
							]
						},
						"padding": {
							"oneOf": [
								{
									"type": "boolean"
								},
								{
									"type": "array",
									"items": {
										"type": "string",
										"enum": [
											"top",
											"right",
											"left",
											"bottom"
										]
									}
								},
								{
									"type": "array",
									"items": {
										"type": "string",
										"enum": [ "vertical", "horizontal" ]
									}
								}
							]
						}
					}
				},
				"shadow": {
					"description": "Allow blocks to define a box shadow.",
					"oneOf": [
						{
							"description": "Defines whether a box shadow is enabled or not.",
							"type": "boolean"
						},
						{
							"type": "object"
						}
					],
					"default": false
				},
				"typography": {
					"description": "This value signals that a block supports some of the CSS style properties related to typography. When it does, the block editor will show UI controls for the user to set their values if the theme declares support.\n\nWhen the block declares support for a specific typography property, its attributes definition is extended to include the style attribute.",
					"type": "object",
					"properties": {
						"fontSize": {
							"description": "This value signals that a block supports the font-size CSS style property. When it does, the block editor will show an UI control for the user to set its value.\n\nThe values shown in this control are the ones declared by the theme via the editor-font-sizes theme support, or the default ones if none is provided.\n\nWhen the block declares support for fontSize, its attributes definition is extended to include two new attributes: fontSize and style",
							"type": "boolean",
							"default": false
						},
						"lineHeight": {
							"description": "This value signals that a block supports the line-height CSS style property. When it does, the block editor will show an UI control for the user to set its value if the theme declares support.\n\nWhen the block declares support for lineHeight, its attributes definition is extended to include a new attribute style of object type with no default assigned. It stores the custom value set by the user. The block can apply a default style by specifying its own style attribute with a default",
							"type": "boolean",
							"default": false
						},
						"textAlign": {
							"description": "This property adds block toolbar controls which allow to change block's text alignment.",
							"oneOf": [
								{
									"type": "boolean"
								},
								{
									"type": "array",
									"items": {
										"type": "string",
										"enum": [ "left", "center", "right" ]
									}
								}
							],
							"default": false
						},
						"fitText": {
							"description": "Enable fit text support for the block. This allows text content to automatically adjust its font size to fit within the block's dimensions.",
							"type": "boolean",
							"default": false
						},
						"textIndent": {
							"description": "This value signals that a block supports the text-indent CSS style property. When it does, the block editor will show a UI control for the user to set its value if the theme declares support.\n\nWhen the block declares support for textIndent, its attributes definition is extended to include the style attribute.",
							"type": "boolean",
							"default": false
						}
					}
				},
				"interactivity": {
					"description": "Indicates if the block is using Interactivity API features.",
					"oneOf": [
						{
							"description": "Indicates whether the block is using the Interactivity API directives.",
							"type": "boolean",
							"default": false
						},
						{
							"type": "object",
							"properties": {
								"clientNavigation": {
									"description": "Indicates whether a block is compatible with the Interactivity API client-side navigation.\n\nSet it to true only if the block is not interactive or if it is interactive using the Interactivity API. Set it to false if the block is interactive but uses vanilla JS, jQuery or another JS framework/library other than the Interactivity API.",
									"type": "boolean",
									"default": false
								},
								"interactive": {
									"description": "Indicates whether the block is using the Interactivity API directives.",
									"type": "boolean",
									"default": false
								}
							}
						}
					]
				},
				"contentRole": {
					"description": "This property marks the block itself as content. It is intended primarily for blocks that do not declare content attributes, or whose content is expressed only through their inner blocks. When enabled, content-only editing modes can still edit these blocks and allow inner blocks to be added or removed.",
					"type": "boolean",
					"default": false
				},
				"listView": {
					"description": "This property enables a dedicated List View panel in the block inspector for the block. When enabled, the inspector shows a List View tree for the block's inner blocks, allowing users to inspect, reorder, and manage the block's items from the sidebar instead of only using the global document List View.",
					"type": "boolean",
					"default": false
				},
				"splitting": {
					"description": "This property indicates whether the block can split when the Enter key is pressed or when blocks are pasted.",
					"type": "boolean",
					"default": false
				}
			},
			"additionalProperties": true
		},
		"selectors": {
			"description": "Provides custom CSS selectors and mappings for the block. Selectors may be set for the block itself or per-feature e.g. typography. Custom selectors per feature or sub-feature, allow different block styles to be applied to different elements within the block.",
			"type": "object",
			"properties": {
				"root": {
					"description": "The primary CSS class to apply to the block. This replaces the `.wp-block-name` class if set.",
					"type": "string"
				},
				"border": {
					"description": "Custom CSS selector used to generate rules for the block's theme.json border styles.",
					"oneOf": [
						{
							"type": "string"
						},
						{
							"type": "object",
							"properties": {
								"root": { "type": "string" },
								"color": { "type": "string" },
								"radius": { "type": "string" },
								"style": { "type": "string" },
								"width": { "type": "string" }
							}
						}
					]
				},
				"color": {
					"description": "Custom CSS selector used to generate rules for the block's theme.json color styles.",
					"oneOf": [
						{
							"type": "string"
						},
						{
							"type": "object",
							"properties": {
								"root": { "type": "string" },
								"text": { "type": "string" },
								"background": { "type": "string" }
							}
						}
					]
				},
				"dimensions": {
					"description": "Custom CSS selector used to generate rules for the block's theme.json dimensions styles.",
					"oneOf": [
						{
							"type": "string"
						},
						{
							"type": "object",
							"properties": {
								"root": { "type": "string" },
								"aspectRatio": { "type": "string" },
								"height": { "type": "string" },
								"minHeight": { "type": "string" },
								"minWidth": { "type": "string" },
								"width": { "type": "string" }
							}
						}
					]
				},
				"spacing": {
					"description": "Custom CSS selector used to generate rules for the block's theme.json spacing styles.",
					"oneOf": [
						{
							"type": "string"
						},
						{
							"type": "object",
							"properties": {
								"root": { "type": "string" },
								"blockGap": { "type": "string" },
								"padding": { "type": "string" },
								"margin": { "type": "string" }
							}
						}
					]
				},
				"typography": {
					"description": "Custom CSS selector used to generate rules for the block's theme.json typography styles.",
					"oneOf": [
						{
							"type": "string"
						},
						{
							"type": "object",
							"properties": {
								"root": { "type": "string" },
								"fontFamily": { "type": "string" },
								"fontSize": { "type": "string" },
								"fontStyle": { "type": "string" },
								"fontWeight": { "type": "string" },
								"lineHeight": { "type": "string" },
								"letterSpacing": { "type": "string" },
								"textDecoration": { "type": "string" },
								"textIndent": { "type": "string" },
								"textTransform": { "type": "string" }
							}
						}
					]
				},
				"css": {
					"description": "Custom CSS selector used when generating the block's custom CSS rules set via Global Styles.",
					"oneOf": [
						{
							"type": "string"
						},
						{
							"type": "object",
							"properties": {
								"root": { "type": "string" }
							}
						}
					]
				}
			}
		},
		"styles": {
			"description": "Block styles can be used to provide alternative styles to block. It works by adding a class name to the block’s wrapper. Using CSS, a theme developer can target the class name for the block style if it is selected.\n\nPlugins and Themes can also register custom block style for existing blocks.\n\nhttps://developer.wordpress.org/block-editor/reference-guides/block-api/block-styles/",
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"name": {
						"type": "string"
					},
					"label": {
						"type": "string"
					},
					"isDefault": {
						"type": "boolean",
						"default": false
					}
				},
				"required": [ "name", "label" ],
				"additionalProperties": false
			}
		},
		"example": {
			"description": "It provides structured example data for the block. This data is used to construct a preview for the block to be shown in the Inspector Help Panel when the user mouses over the block.\n\nSee the example documentation at https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/#example-optional for more details.",
			"type": "object",
			"properties": {
				"viewportWidth": {
					"description": "The viewportWidth controls the width of the iFrame container in which the block preview will get rendered",
					"type": "number",
					"default": 1200
				},
				"attributes": {
					"description": "Set the attributes for the block example",
					"type": "object"
				},
				"innerBlocks": {
					"description": "Set the inner blocks that should be used within the block example. The blocks should be defined as a nested array like this:\n\n[ { \"name\": \"core/heading\", \"attributes\": { \"content\": \"This is an Example\" } } ]\n\nWhere each block itself is an object that contains the block name, the block attributes, and the blocks inner blocks.",
					"type": "array"
				}
			}
		},
		"blockHooks": {
			"description": "Block Hooks allow a block to automatically insert itself next to all instances of a given block type.\n\nSee the Block Hooks documentation at https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/#block-hooks-optional for more details.",
			"type": "object",
			"patternProperties": {
				"^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$": {
					"type": "string",
					"enum": [ "before", "after", "firstChild", "lastChild" ]
				}
			},
			"additionalProperties": false
		},
		"editorScript": {
			"description": "Block type editor script definition. It will only be enqueued in the context of the editor.",
			"oneOf": [
				{
					"type": "string"
				},
				{
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			]
		},
		"script": {
			"description": "Block type frontend and editor script definition. It will be enqueued both in the editor and when viewing the content on the front of the site.",
			"oneOf": [
				{
					"type": "string"
				},
				{
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			]
		},
		"viewScript": {
			"description": "Block type frontend script definition. It will be enqueued only when viewing the content on the front of the site.",
			"oneOf": [
				{
					"type": "string"
				},
				{
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			]
		},
		"viewScriptModule": {
			"description": "Block type frontend script module definition. It will be enqueued only when viewing the content on the front of the site.",
			"oneOf": [
				{
					"type": "string"
				},
				{
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			]
		},
		"editorStyle": {
			"description": "Block type editor style definition. It will only be enqueued in the context of the editor.",
			"oneOf": [
				{
					"type": "string"
				},
				{
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			]
		},
		"style": {
			"description": "Block type frontend style definition. It will be enqueued both in the editor and when viewing the content on the front of the site.",
			"oneOf": [
				{
					"type": "string"
				},
				{
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			]
		},
		"viewStyle": {
			"description": "Block type frontend style definition. It will be enqueued only when viewing the content on the front of the site.",
			"oneOf": [
				{
					"type": "string"
				},
				{
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			]
		},
		"variations": {
			"description": "Block Variations is the API that allows a block to have similar versions of it, but all these versions share some common functionality.",
			"oneOf": [
				{
					"description": "The path to a PHP file that returns an array of block variations.",
					"type": "string"
				},
				{
					"description": "An array of block variations.",
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"name": {
								"description": "The unique and machine-readable name.",
								"type": "string"
							},
							"title": {
								"description": "A human-readable variation title.",
								"type": "string"
							},
							"description": {
								"description": "A detailed variation description.",
								"type": "string"
							},
							"category": {
								"description": "A category classification, used in search interfaces to arrange block types by category.",
								"anyOf": [
									{
										"type": "string"
									},
									{
										"type": "string",
										"enum": [
											"text",
											"media",
											"design",
											"widgets",
											"theme",
											"embed"
										]
									}
								]
							},
							"icon": {
								"description": "An icon helping to visualize the variation. It can have the same shape as the block type.",
								"type": "string"
							},
							"isDefault": {
								"description": "Indicates whether the current variation is the default one.",
								"type": "boolean",
								"default": false
							},
							"attributes": {
								"description": "Values that override block attributes.",
								"type": "object"
							},
							"innerBlocks": {
								"description": "Initial configuration of nested blocks.",
								"type": "array",
								"items": {
									"type": "array"
								}
							},
							"example": {
								"description": "Example provides structured data for the block preview. You can set to undefined to disable the preview shown for the block type.",
								"type": "object"
							},
							"scope": {
								"description": "The list of scopes where the variation is applicable.",
								"type": "array",
								"items": {
									"type": "string",
									"enum": [ "inserter", "block", "transform" ]
								},
								"default": [ "inserter", "block" ]
							},
							"keywords": {
								"description": "An array of terms (which can be translated) that help users discover the variation while searching.",
								"type": "array",
								"items": {
									"type": "string"
								}
							},
							"isActive": {
								"description": "The list of attributes that should be compared. Each attributes will be matched and the variation will be active if all of them are matching.",
								"type": "array",
								"items": {
									"type": "string"
								}
							}
						},
						"required": [ "name", "title" ],
						"additionalProperties": false
					}
				}
			]
		},
		"render": {
			"description": "Template file loaded on the server when rendering a block.",
			"type": "string"
		}
	},
	"required": [ "apiVersion", "name", "title" ],
	"additionalProperties": false
}

```

---

## Source Code

### [wordpress-develop] src/wp-includes/blocks.php
```php
<?php
/**
 * Functions related to registering and parsing blocks.
 *
 * @package WordPress
 * @subpackage Blocks
 * @since 5.0.0
 */

/**
 * Removes the block asset's path prefix if provided.
 *
 * @since 5.5.0
 *
 * @param string $asset_handle_or_path Asset handle or prefixed path.
 * @return string Path without the prefix or the original value.
 */
function remove_block_asset_path_prefix( $asset_handle_or_path ) {
	$path_prefix = 'file:';
	if ( ! str_starts_with( $asset_handle_or_path, $path_prefix ) ) {
		return $asset_handle_or_path;
	}
	$path = substr(
		$asset_handle_or_path,
		strlen( $path_prefix )
	);
	if ( str_starts_with( $path, './' ) ) {
		$path = substr( $path, 2 );
	}
	return $path;
}

/**
 * Generates the name for an asset based on the name of the block
 * and the field name provided.
 *
 * @since 5.5.0
 * @since 6.1.0 Added `$index` parameter.
 * @since 6.5.0 Added support for `viewScriptModule` field.
 *
 * @param string $block_name Name of the block.
 * @param string $field_name Name of the metadata field.
 * @param int    $index      Optional. Index of the asset when multiple items passed.
 *                           Default 0.
 * @return string Generated asset name for the block's field.
 */
function generate_block_asset_handle( $block_name, $field_name, $index = 0 ) {
	if ( str_starts_with( $block_name, 'core/' ) ) {
		$asset_handle = str_replace( 'core/', 'wp-block-', $block_name );
		if ( str_starts_with( $field_name, 'editor' ) ) {
			$asset_handle .= '-editor';
		}
		if ( str_starts_with( $field_name, 'view' ) ) {
			$asset_handle .= '-view';
		}
		if ( str_ends_with( strtolower( $field_name ), 'scriptmodule' ) ) {
			$asset_handle .= '-script-module';
		}
		if ( $index > 0 ) {
			$asset_handle .= '-' . ( $index + 1 );
		}
		return $asset_handle;
	}

	$field_mappings = array(
		'editorScript'     => 'editor-script',
		'editorStyle'      => 'editor-style',
		'script'           => 'script',
		'style'            => 'style',
		'viewScript'       => 'view-script',
		'viewScriptModule' => 'view-script-module',
		'viewStyle'        => 'view-style',
	);
	$asset_handle   = str_replace( '/', '-', $block_name ) .
		'-' . $field_mappings[ $field_name ];
	if ( $index > 0 ) {
		$asset_handle .= '-' . ( $index + 1 );
	}
	return $asset_handle;
}

/**
 * Gets the URL to a block asset.
 *
 * @since 6.4.0
 *
 * @param string $path A normalized path to a block asset.
 * @return string|false The URL to the block asset or false on failure.
 */
function get_block_asset_url( $path ) {
	if ( empty( $path ) ) {
		return false;
	}

	// Path needs to be normalized to work in Windows env.
	static $wpinc_path_norm = '';
	if ( ! $wpinc_path_norm ) {
		$wpinc_path_norm = wp_normalize_path( realpath( ABSPATH . WPINC ) );
	}

	if ( str_starts_with( $path, $wpinc_path_norm ) ) {
		return includes_url( str_replace( $wpinc_path_norm, '', $path ) );
	}

	static $template_paths_norm = array();

	$template = get_template();
	if ( ! isset( $template_paths_norm[ $template ] ) ) {
		$template_paths_norm[ $template ] = wp_normalize_path( realpath( get_template_directory() ) );
	}

	if ( str_starts_with( $path, trailingslashit( $template_paths_norm[ $template ] ) ) ) {
		return get_theme_file_uri( str_replace( $template_paths_norm[ $template ], '', $path ) );
	}

	if ( is_child_theme() ) {
		$stylesheet = get_stylesheet();
		if ( ! isset( $template_paths_norm[ $stylesheet ] ) ) {
			$template_paths_norm[ $stylesheet ] = wp_normalize_path( realpath( get_stylesheet_directory() ) );
		}

		if ( str_starts_with( $path, trailingslashit( $template_paths_norm[ $stylesheet ] ) ) ) {
			return get_theme_file_uri( str_replace( $template_paths_norm[ $stylesheet ], '', $path ) );
		}
	}

	return plugins_url( basename( $path ), $path );
}

/**
 * Finds a script module ID for the selected block metadata field. It detects
 * when a path to file was provided and optionally finds a corresponding asset
 * file with details necessary to register the script module under with an
 * automatically generated module ID. It returns unprocessed script module
 * ID otherwise.
 *
 * @since 6.5.0
 *
 * @param array  $metadata   Block metadata.
 * @param string $field_name Field name to pick from metadata.
 * @param int    $index      Optional. Index of the script module ID to register when multiple
 *                           items passed. Default 0.
 * @return string|false Script module ID or false on failure.
 */
function register_block_script_module_id( $metadata, $field_name, $index = 0 ) {
	if ( empty( $metadata[ $field_name ] ) ) {
		return false;
	}

	$module_id = $metadata[ $field_name ];
	if ( is_array( $module_id ) ) {
		if ( empty( $module_id[ $index ] ) ) {
			return false;
		}
		$module_id = $module_id[ $index ];
	}

	$module_path = remove_block_asset_path_prefix( $module_id );
	if ( $module_id === $module_path ) {
		return $module_id;
	}

	$path                  = dirname( $metadata['file'] );
	$module_asset_raw_path = $path . '/' . substr_replace( $module_path, '.asset.php', - strlen( '.js' ) );
	$module_id             = generate_block_asset_handle( $metadata['name'], $field_name, $index );
	$module_asset_path     = wp_normalize_path(
		realpath( $module_asset_raw_path )
	);

	$module_path_norm = wp_normalize_path( realpath( $path . '/' . $module_path ) );
	$module_uri       = get_block_asset_url( $module_path_norm );

	$module_asset        = ! empty( $module_asset_path ) ? require $module_asset_path : array();
	$module_dependencies = isset( $module_asset['dependencies'] ) ? $module_asset['dependencies'] : array();
	$block_version       = isset( $metadata['version'] ) ? $metadata['version'] : false;
	$module_version      = isset( $module_asset['version'] ) ? $module_asset['version'] : $block_version;

	$supports_interactivity_true = isset( $metadata['supports']['interactivity'] ) && true === $metadata['supports']['interactivity'];
	$is_interactive              = $supports_interactivity_true || ( isset( $metadata['supports']['interactivity']['interactive'] ) && true === $metadata['supports']['interactivity']['interactive'] );
	$supports_client_navigation  = $supports_interactivity_true || ( isset( $metadata['supports']['interactivity']['clientNavigation'] ) && true === $metadata['supports']['interactivity']['clientNavigation'] );

	$args = array();

	// Blocks using the Interactivity API are server-side rendered, so they are
	// by design not in the critical rendering path and should be deprioritized.
	if ( $is_interactive ) {
		$args['fetchpriority'] = 'low';
		$args['in_footer']     = true;
	}

	// Blocks using the Interactivity API that support client-side navigation
	// must be marked as such in their script modules.
	if ( $is_interactive && $supports_client_navigation ) {
		wp_interactivity()->add_client_navigation_support_to_script_module( $module_id );
	}

	wp_register_script_module(
		$module_id,
		$module_uri,
		$module_dependencies,
		$module_version,
		$args
	);

	return $module_id;
}

/**
 * Finds a script handle for the selected block metadata field. It detects
 * when a path to file was provided and optionally finds a corresponding asset
 * file with details necessary to register the script under automatically
 * generated handle name. It returns unprocessed script handle otherwise.
 *
 * @since 5.5.0
 * @since 6.1.0 Added `$index` parameter.
 * @since 6.5.0 The asset file is optional. Added script handle support in the asset file.
 *
 * @param array  $metadata   Block metadata.
 * @param string $field_name Field name to pick from metadata.
 * @param int    $index      Optional. Index of the script to register when multiple items passed.
 *                           Default 0.
 * @return string|false Script handle provided directly or created through
 *                      script's registration, or false on failure.
 */
function register_block_script_handle( $metadata, $field_name, $index = 0 ) {
	if ( empty( $metadata[ $field_name ] ) ) {
		return false;
	}

	$script_handle_or_path = $metadata[ $field_name ];
	if ( is_array( $script_handle_or_path ) ) {
		if ( empty( $script_handle_or_path[ $index ] ) ) {
			return false;
		}
		$script_handle_or_path = $script_handle_or_path[ $index ];
	}

	$script_path = remove_block_asset_path_prefix( $script_handle_or_path );
	if ( $script_handle_or_path === $script_path ) {
		return $script_handle_or_path;
	}

	$path                  = dirname( $metadata['file'] );
	$script_asset_raw_path = $path . '/' . substr_replace( $script_path, '.asset.php', - strlen( '.js' ) );
	$script_asset_path     = wp_normalize_path(
		realpath( $script_asset_raw_path )
	);

	// Asset file for blocks is optional. See https://core.trac.wordpress.org/ticket/60460.
	$script_asset  = ! empty( $script_asset_path ) ? require $script_asset_path : array();
	$script_handle = isset( $script_asset['handle'] ) ?
		$script_asset['handle'] :
		generate_block_asset_handle( $metadata['name'], $field_name, $index );
	if ( wp_script_is( $script_handle, 'registered' ) ) {
		return $script_handle;
	}

	$script_path_norm    = wp_normalize_path( realpath( $path . '/' . $script_path ) );
	$script_uri          = get_block_asset_url( $script_path_norm );
	$script_dependencies = isset( $script_asset['dependencies'] ) ? $script_asset['dependencies'] : array();
	$block_version       = isset( $metadata['version'] ) ? $metadata['version'] : false;
	$script_version      = isset( $script_asset['version'] ) ? $script_asset['version'] : $block_version;
	$script_args         = array();
	if ( 'viewScript' === $field_name && $script_uri ) {
		$script_args['strategy'] = 'defer';
	}

	$result = wp_register_script(
		$script_handle,
		$script_uri,
		$script_dependencies,
		$script_version,
		$script_args
	);
	if ( ! $result ) {
		return false;
	}

	if ( ! empty( $metadata['textdomain'] ) && in_array( 'wp-i18n', $script_dependencies, true ) ) {
		wp_set_script_translations( $script_handle, $metadata['textdomain'] );
	}

	return $script_handle;
}

/**
 * Finds a style handle for the block metadata field. It detects when a path
 * to file was provided and registers the style under automatically
 * generated handle name. It returns unprocessed style handle otherwise.
 *
 * @since 5.5.0
 * @since 6.1.0 Added `$index` parameter.
 *
 * @param array  $metadata   Block metadata.
 * @param string $field_name Field name to pick from metadata.
 * @param int    $index      Optional. Index of the style to register when multiple items passed.
 *                           Default 0.
 * @return string|false Style handle provided directly or created through
 *                      style's registration, or false on failure.
 */
function register_block_style_handle( $metadata, $field_name, $index = 0 ) {
	if ( empty( $metadata[ $field_name ] ) ) {
		return false;
	}

	$style_handle = $metadata[ $field_name ];
	if ( is_array( $style_handle ) ) {
		if ( empty( $style_handle[ $index ] ) ) {
			return false;
		}
		$style_handle = $style_handle[ $index ];
	}

	$style_handle_name = generate_block_asset_handle( $metadata['name'], $field_name, $index );
	// If the style handle is already registered, skip re-registering.
	if ( wp_style_is( $style_handle_name, 'registered' ) ) {
		return $style_handle_name;
	}

	static $wpinc_path_norm = '';
	if ( ! $wpinc_path_norm ) {
		$wpinc_path_norm = wp_normalize_path( realpath( ABSPATH . WPINC ) );
	}

	$is_core_block = isset( $metadata['file'] ) && str_starts_with( $metadata['file'], $wpinc_path_norm );
	// Skip registering individual styles for each core block when a bundled version provided.
	if ( $is_core_block && ! wp_should_load_separate_core_block_assets() ) {
		return false;
	}

	$style_path      = remove_block_asset_path_prefix( $style_handle );
	$is_style_handle = $style_handle === $style_path;
	// Allow only passing style handles for core blocks.
	if ( $is_core_block && ! $is_style_handle ) {
		return false;
	}
	// Return the style handle unless it's the first item for every core block that requires special treatment.
	if ( $is_style_handle && ! ( $is_core_block && 0 === $index ) ) {
		return $style_handle;
	}

	// Check whether styles should have a ".min" suffix or not.
	$suffix = SCRIPT_DEBUG ? '' : '.min';
	if ( $is_core_block ) {
		$style_path = ( 'editorStyle' === $field_name ) ? "editor{$suffix}.css" : "style{$suffix}.css";
	}

	$style_path_norm = wp_normalize_path( realpath( dirname( $metadata['file'] ) . '/' . $style_path ) );
	$style_uri       = get_block_asset_url( $style_path_norm );

	$block_version = ! $is_core_block && isset( $metadata['version'] ) ? $metadata['version'] : false;
	$version       = $style_path_norm && defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ? filemtime( $style_path_norm ) : $block_version;
	$result        = wp_register_style(
		$style_handle_name,
		$style_uri,
		array(),
		$version
	);
	if ( ! $result ) {
		return false;
	}

	if ( $style_uri ) {
		wp_style_add_data( $style_handle_name, 'path', $style_path_norm );

		if ( $is_core_block ) {
			$rtl_file = str_replace( "{$suffix}.css", "-rtl{$suffix}.css", $style_path_norm );
		} else {
			$rtl_file = str_replace( '.css', '-rtl.css', $style_path_norm );
		}

		if ( is_rtl() && file_exists( $rtl_file ) ) {
			wp_style_add_data( $style_handle_name, 'rtl', 'replace' );
			wp_style_add_data( $style_handle_name, 'suffix', $suffix );
			wp_style_add_data( $style_handle_name, 'path', $rtl_file );
		}
	}

	return $style_handle_name;
}

/**
 * Gets i18n schema for block's metadata read from `block.json` file.
 *
 * @since 5.9.0
 *
 * @return object The schema for block's metadata.
 */
function get_block_metadata_i18n_schema() {
	static $i18n_block_schema;

	if ( ! isset( $i18n_block_schema ) ) {
		$i18n_block_schema = wp_json_file_decode( __DIR__ . '/block-i18n.json' );
	}

	return $i18n_block_schema;
}

/**
 * Registers all block types from a block metadata collection.
 *
 * This can either reference a previously registered metadata collection or, if the `$manifest` parameter is provided,
 * register the metadata collection directly within the same function call.
 *
 * @since 6.8.0
 * @see wp_register_block_metadata_collection()
 * @see register_block_type_from_metadata()
 *
 * @param string $path     The absolute base path for the collection ( e.g., WP_PLUGIN_DIR . '/my-plugin/blocks/' ).
 * @param string $manifest Optional. The absolute path to the manifest file containing the metadata collection, in
 *                         order to register the collection. If this parameter is not provided, the `$path` parameter
 *                         must reference a previously registered block metadata collection.
 */
function wp_register_block_types_from_metadata_collection( $path, $manifest = '' ) {
	if ( $manifest ) {
		wp_register_block_metadata_collection( $path, $manifest );
	}

	$block_metadata_files = WP_Block_Metadata_Registry::get_collection_block_metadata_files( $path );
	foreach ( $block_metadata_files as $block_metadata_file ) {
		register_block_type_from_metadata( $block_metadata_file );
	}
}

/**
 * Registers a block metadata collection.
 *
 * This function allows core and third-party plugins to register their block metadata
 * collections in a centralized location. Registering collections can improve performance
 * by avoiding multiple reads from the filesystem and parsing JSON.
 *
 * @since 6.7.0
 *
 * @param string $path     The base path in which block files for the collection reside.
 * @param string $manifest The path to the manifest file for the collection.
 */
function wp_register_block_metadata_collection( $path, $manifest ) {
	WP_Block_Metadata_Registry::register_collection( $path, $manifest );
}

/**
 * Registers a block type from the metadata stored in the `block.json` file.
 *
 * @since 5.5.0
 * @since 5.7.0 Added support for `textdomain` field and i18n handling for all translatable fields.
 * @since 5.9.0 Added support for `variations` and `viewScript` fields.
 * @since 6.1.0 Added support for `render` field.
 * @since 6.3.0 Added `selectors` field.
 * @since 6.4.0 Added support for `blockHooks` field.
 * @since 6.5.0 Added support for `allowedBlocks`, `viewScriptModule`, and `viewStyle` fields.
 * @since 6.7.0 Allow PHP filename as `variations` argument.
 *
 * @param string $file_or_folder Path to the JSON file with metadata definition for
 *                               the block or path to the folder where the `block.json` file is located.
 *                               If providing the path to a JSON file, the filename must end with `block.json`.
 * @param array  $args           Optional. Array of block type arguments. Accepts any public property
 *                               of `WP_Block_Type`. See WP_Block_Type::__construct() for information
 *                               on accepted arguments. Default empty array.
 * @return WP_Block_Type|false The registered block type on success, or false on failure.
 */
function register_block_type_from_metadata( $file_or_folder, $args = array() ) {
	/*
	 * Get an array of metadata from a PHP file.
	 * This improves performance for core blocks as it's only necessary to read a single PHP file
	 * instead of reading a JSON file per-block, and then decoding from JSON to PHP.
	 * Using a static variable ensures that the metadata is only read once per request.
	 */

	$file_or_folder = wp_normalize_path( $file_or_folder );

	$metadata_file = ( ! str_ends_with( $file_or_folder, 'block.json' ) ) ?
		trailingslashit( $file_or_folder ) . 'block.json' :
		$file_or_folder;

	$is_core_block        = str_starts_with( $file_or_folder, wp_normalize_path( ABSPATH . WPINC ) );
	$metadata_file_exists = $is_core_block || file_exists( $metadata_file );
	$registry_metadata    = WP_Block_Metadata_Registry::get_metadata( $file_or_folder );

	if ( $registry_metadata ) {
		$metadata = $registry_metadata;
	} elseif ( $metadata_file_exists ) {
		$metadata = wp_json_file_decode( $metadata_file, array( 'associative' => true ) );
	} else {
		$metadata = array();
	}

	if ( ! is_array( $metadata ) || ( empty( $metadata['name'] ) && empty( $args['name'] ) ) ) {
		return false;
	}

	$metadata['file'] = $metadata_file_exists ? wp_normalize_path( realpath( $metadata_file ) ) : null;

	/**
	 * Filters the metadata provided for registering a block type.
	 *
	 * @since 5.7.0
	 *
	 * @param array $metadata Metadata for registering a block type.
	 */
	$metadata = apply_filters( 'block_type_metadata', $metadata );

	// Add `style` and `editor_style` for core blocks if missing.
	if ( ! empty( $metadata['name'] ) && str_starts_with( $metadata['name'], 'core/' ) ) {
		$block_name = str_replace( 'core/', '', $metadata['name'] );

		if ( ! isset( $metadata['style'] ) ) {
			$metadata['style'] = "wp-block-$block_name";
		}
		if ( current_theme_supports( 'wp-block-styles' ) && wp_should_load_separate_core_block_assets() ) {
			$metadata['style']   = (array) $metadata['style'];
			$metadata['style'][] = "wp-block-{$block_name}-theme";
		}
		if ( ! isset( $metadata['editorStyle'] ) ) {
			$metadata['editorStyle'] = "wp-block-{$block_name}-editor";
		}
	}

	$settings          = array();
	$property_mappings = array(
		'apiVersion'      => 'api_version',
		'name'            => 'name',
		'title'           => 'title',
		'category'        => 'category',
		'parent'          => 'parent',
		'ancestor'        => 'ancestor',
		'icon'            => 'icon',
		'description'     => 'description',
		'keywords'        => 'keywords',
		'attributes'      => 'attributes',
		'providesContext' => 'provides_context',
		'usesContext'     => 'uses_context',
		'selectors'       => 'selectors',
		'supports'        => 'supports',
		'styles'          => 'styles',
		'variations'      => 'variations',
		'example'         => 'example',
		'allowedBlocks'   => 'allowed_blocks',
	);
	$textdomain        = ! empty( $metadata['textdomain'] ) ? $metadata['textdomain'] : null;
	$i18n_schema       = get_block_metadata_i18n_schema();

	foreach ( $property_mappings as $key => $mapped_key ) {
		if ( isset( $metadata[ $key ] ) ) {
			$settings[ $mapped_key ] = $metadata[ $key ];
			if ( $metadata_file_exists && $textdomain && isset( $i18n_schema->$key ) ) {
				$settings[ $mapped_key ] = translate_settings_using_i18n_schema( $i18n_schema->$key, $settings[ $key ], $textdomain );
			}
		}
	}

	if ( ! empty( $metadata['render'] ) ) {
		$template_path = wp_normalize_path(
			realpath(
				dirname( $metadata['file'] ) . '/' .
				remove_block_asset_path_prefix( $metadata['render'] )
			)
		);
		if ( $template_path ) {
			/**
			 * Renders the block on the server.
			 *
			 * @since 6.1.0
			 *
			 * @param array    $attributes Block attributes.
			 * @param string   $content    Block default content.
			 * @param WP_Block $block      Block instance.
			 *
			 * @return string Returns the block content.
			 */
			$settings['render_callback'] = static function ( $attributes, $content, $block ) use ( $template_path ) {
				ob_start();
				require $template_path;
				return ob_get_clean();
			};
		}
	}

	// If `variations` is a string, it's the name of a PHP file that
	// generates the variations.
	if ( ! empty( $metadata['variations'] ) && is_string( $metadata['variations'] ) ) {
		$variations_path = wp_normalize_path(
			realpath(
				dirname( $metadata['file'] ) . '/' .
				remove_block_asset_path_prefix( $metadata['variations'] )
			)
		);
		if ( $variations_path ) {
			/**
			 * Generates the list of block variations.
			 *
			 * @since 6.7.0
			 *
			 * @return string Returns the list of block variations.
			 */
			$settings['variation_callback'] = static function () use ( $variations_path ) {
				$variations = require $variations_path;
				return $variations;
			};
			// The block instance's `variations` field is only allowed to be an array
			// (of known block variations). We unset it so that the block instance will
			// provide a getter that returns the result of the `variation_callback` instead.
			unset( $settings['variations'] );
		}
	}

	$settings = array_merge( $settings, $args );

	$script_fields = array(
		'editorScript' => 'editor_script_handles',
		'script'       => 'script_handles',
		'viewScript'   => 'view_script_handles',
	);
	foreach ( $script_fields as $metadata_field_name => $settings_field_name ) {
		if ( ! empty( $settings[ $metadata_field_name ] ) ) {
			$metadata[ $metadata_field_name ] = $settings[ $metadata_field_name ];
		}
		if ( ! empty( $metadata[ $metadata_field_name ] ) ) {
			$scripts           = $metadata[ $metadata_field_name ];
			$processed_scripts = array();
			if ( is_array( $scripts ) ) {
				for ( $index = 0; $index < count( $scripts ); $index++ ) {
					$result = register_block_script_handle(
						$metadata,
						$metadata_field_name,
						$index
					);
					if ( $result ) {
						$processed_scripts[] = $result;
					}
				}
			} else {
				$result = register_block_script_handle(
					$metadata,
					$metadata_field_name
				);
				if ( $result ) {
					$processed_scripts[] = $result;
				}
			}
			$settings[ $settings_field_name ] = $processed_scripts;
		}
	}

	$module_fields = array(
		'viewScriptModule' => 'view_script_module_ids',
	);
	foreach ( $module_fields as $metadata_field_name => $settings_field_name ) {
		if ( ! empty( $settings[ $metadata_field_name ] ) ) {
			$metadata[ $metadata_field_name ] = $settings[ $metadata_field_name ];
		}
		if ( ! empty( $metadata[ $metadata_field_name ] ) ) {
			$modules           = $metadata[ $metadata_field_name ];
			$processed_modules = array();
			if ( is_array( $modules ) ) {
				for ( $index = 0; $index < count( $modules ); $index++ ) {
					$result = register_block_script_module_id(
						$metadata,
						$metadata_field_name,
						$index
					);
					if ( $result ) {
						$processed_modules[] = $result;
					}
				}
			} else {
				$result = register_block_script_module_id(
					$metadata,
					$metadata_field_name
				);
				if ( $result ) {
					$processed_modules[] = $result;
				}
			}
			$settings[ $settings_field_name ] = $processed_modules;
		}
	}

	$style_fields = array(
		'editorStyle' => 'editor_style_handles',
		'style'       => 'style_handles',
		'viewStyle'   => 'view_style_handles',
	);
	foreach ( $style_fields as $metadata_field_name => $settings_field_name ) {
		if ( ! empty( $settings[ $metadata_field_name ] ) ) {
			$metadata[ $metadata_field_name ] = $settings[ $metadata_field_name ];
		}
		if ( ! empty( $metadata[ $metadata_field_name ] ) ) {
			$styles           = $metadata[ $metadata_field_name ];
			$processed_styles = array();
			if ( is_array( $styles ) ) {
				for ( $index = 0; $index < count( $styles ); $index++ ) {
					$result = register_block_style_handle(
						$metadata,
						$metadata_field_name,
						$index
					);
					if ( $result ) {
						$processed_styles[] = $result;
					}
				}
			} else {
				$result = register_block_style_handle(
					$metadata,
					$metadata_field_name
				);
				if ( $result ) {
					$processed_styles[] = $result;
				}
			}
			$settings[ $settings_field_name ] = $processed_styles;
		}
	}

	if ( ! empty( $metadata['blockHooks'] ) ) {
		/**
		 * Map camelCased position string (from block.json) to snake_cased block type position.
		 *
		 * @var array
		 */
		$position_mappings = array(
			'before'     => 'before',
			'after'      => 'after',
			'firstChild' => 'first_child',
			'lastChild'  => 'last_child',
		);

		$settings['block_hooks'] = array();
		foreach ( $metadata['blockHooks'] as $anchor_block_name => $position ) {
			// Avoid infinite recursion (hooking to itself).
			if ( $metadata['name'] === $anchor_block_name ) {
				_doing_it_wrong(
					__METHOD__,
					__( 'Cannot hook block to itself.' ),
					'6.4.0'
				);
				continue;
			}

			if ( ! isset( $position_mappings[ $position ] ) ) {
				continue;
			}

			$settings['block_hooks'][ $anchor_block_name ] = $position_mappings[ $position ];
		}
	}

	/**
	 * Filters the settings determined from the block type metadata.
	 *
	 * @since 5.7.0
	 *
	 * @param array $settings Array of determined settings for registering a block type.
	 * @param array $metadata Metadata provided for registering a block type.
	 */
	$settings = apply_filters( 'block_type_metadata_settings', $settings, $metadata );

	$metadata['name'] = ! empty( $settings['name'] ) ? $settings['name'] : $metadata['name'];

	return WP_Block_Type_Registry::get_instance()->register(
		$metadata['name'],
		$settings
	);
}

/**
 * Registers a block type. The recommended way is to register a block type using
 * the metadata stored in the `block.json` file.
 *
 * @since 5.0.0
 * @since 5.8.0 First parameter now accepts a path to the `block.json` file.
 *
 * @param string|WP_Block_Type $block_type Block type name including namespace, or alternatively
 *                                         a path to the JSON file with metadata definition for the block,
 *                                         or a path to the folder where the `block.json` file is located,
 *                                         or a complete WP_Block_Type instance.
 *                                         In case a WP_Block_Type is provided, the $args parameter will be ignored.
 * @param array                $args       Optional. Array of block type arguments. Accepts any public property
 *                                         of `WP_Block_Type`. See WP_Block_Type::__construct() for information
 *                                         on accepted arguments. Default empty array.
 *
 * @return WP_Block_Type|false The registered block type on success, or false on failure.
 */
function register_block_type( $block_type, $args = array() ) {
	if ( is_string( $block_type ) && file_exists( $block_type ) ) {
		return register_block_type_from_metadata( $block_type, $args );
	}

	return WP_Block_Type_Registry::get_instance()->register( $block_type, $args );
}

/**
 * Unregisters a block type.
 *
 * @since 5.0.0
 *
 * @param string|WP_Block_Type $name Block type name including namespace, or alternatively
 *                                   a complete WP_Block_Type instance.
 * @return WP_Block_Type|false The unregistered block type on success, or false on failure.
 */
function unregister_block_type( $name ) {
	return WP_Block_Type_Registry::get_instance()->unregister( $name );
}

/**
 * Determines whether a post or content string has blocks.
 *
 * This test optimizes for performance rather than strict accuracy, detecting
 * the pattern of a block but not validating its structure. For strict accuracy,
 * you should use the block parser on post content.
 *
 * @since 5.0.0
 *
 * @see parse_blocks()
 *
 * @param int|string|WP_Post|null $post Optional. Post content, post ID, or post object.
 *                                      Defaults to global $post.
 * @return bool Whether the post has blocks.
 */
function has_blocks( $post = null ) {
	if ( ! is_string( $post ) ) {
		$wp_post = get_post( $post );

		if ( ! $wp_post instanceof WP_Post ) {
			return false;
		}

		$post = $wp_post->post_content;
	}

	return str_contains( (string) $post, '<!-- wp:' );
}

/**
 * Determines whether a $post or a string contains a specific block type.
 *
 * This test optimizes for performance rather than strict accuracy, detecting
 * whether the block type exists but not validating its structure and not checking
 * synced patterns (formerly called reusable blocks). For strict accuracy,
 * you should use the block parser on post content.
 *
 * @since 5.0.0
 *
 * @see parse_blocks()
 *
 * @param string                  $block_name Full block type to look for.
 * @param int|string|WP_Post|null $post       Optional. Post content, post ID, or post object.
 *                                            Defaults to global $post.
 * @return bool Whether the post content contains the specified block.
 */
function has_block( $block_name, $post = null ) {
	if ( ! has_blocks( $post ) ) {
		return false;
	}

	if ( ! is_string( $post ) ) {
		$wp_post = get_post( $post );
		if ( $wp_post instanceof WP_Post ) {
			$post = $wp_post->post_content;
		}
	}

	/*
	 * Normalize block name to include namespace, if provided as non-namespaced.
	 * This matches behavior for WordPress 5.0.0 - 5.3.0 in matching blocks by
	 * their serialized names.
	 */
	if ( ! str_contains( $block_name, '/' ) ) {
		$block_name = 'core/' . $block_name;
	}

	// Test for existence of block by its fully qualified name.
	$has_block = str_contains( $post, '<!-- wp:' . $block_name . ' ' );

	if ( ! $has_block ) {
		/*
		 * If the given block name would serialize to a different name, test for
		 * existence by the serialized form.
		 */
		$serialized_block_name = strip_core_block_namespace( $block_name );
		if ( $serialized_block_name !== $block_name ) {
			$has_block = str_contains( $post, '<!-- wp:' . $serialized_block_name . ' ' );
		}
	}

	return $has_block;
}

/**
 * Returns an array of the names of all registered dynamic block types.
 *
 * @since 5.0.0
 *
 * @return string[] Array of dynamic block names.
 */
function get_dynamic_block_names() {
	$dynamic_block_names = array();

	$block_types = WP_Block_Type_Registry::get_instance()->get_all_registered();
	foreach ( $block_types as $block_type ) {
		if ( $block_type->is_dynamic() ) {
			$dynamic_block_names[] = $block_type->name;
		}
	}

	return $dynamic_block_names;
}

/**
 * Retrieves block types hooked into the given block, grouped by anchor block type and the relative position.
 *
 * @since 6.4.0
 *
 * @return array[] Array of block types grouped by anchor block type and the relative position.
 */
function get_hooked_blocks() {
	$block_types   = WP_Block_Type_Registry::get_instance()->get_all_registered();
	$hooked_blocks = array();
	foreach ( $block_types as $block_type ) {
		if ( ! ( $block_type instanceof WP_Block_Type ) || ! is_array( $block_type->block_hooks ) ) {
			continue;
		}
		foreach ( $block_type->block_hooks as $anchor_block_type => $relative_position ) {
			if ( ! isset( $hooked_blocks[ $anchor_block_type ] ) ) {
				$hooked_blocks[ $anchor_block_type ] = array();
			}
			if ( ! isset( $hooked_blocks[ $anchor_block_type ][ $relative_position ] ) ) {
				$hooked_blocks[ $anchor_block_type ][ $relative_position ] = array();
			}
			$hooked_blocks[ $anchor_block_type ][ $relative_position ][] = $block_type->name;
		}
	}

	return $hooked_blocks;
}

/**
 * Returns the markup for blocks hooked to the given anchor block in a specific relative position.
 *
 * @since 6.5.0
 * @access private
 *
 * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
 * @param string                          $relative_position   The relative position of the hooked blocks.
 *                                                             Can be one of 'before', 'after', 'first_child', or 'last_child'.
 * @param array                           $hooked_blocks       An array of hooked block types, grouped by anchor block and relative position.
 * @param WP_Block_Template|WP_Post|array $context             The block template, template part, or pattern that the anchor block belongs to.
 * @return string
 */
function insert_hooked_blocks( &$parsed_anchor_block, $relative_position, $hooked_blocks, $context ) {
	$anchor_block_type  = $parsed_anchor_block['blockName'];
	$hooked_block_types = isset( $anchor_block_type, $hooked_blocks[ $anchor_block_type ][ $relative_position ] )
		? $hooked_blocks[ $anchor_block_type ][ $relative_position ]
		: array();

	/**
	 * Filters the list of hooked block types for a given anchor block type and relative position.
	 *
	 * @since 6.4.0
	 *
	 * @param string[]                        $hooked_block_types The list of hooked block types.
	 * @param string                          $relative_position  The relative position of the hooked blocks.
	 *                                                            Can be one of 'before', 'after', 'first_child', or 'last_child'.
	 * @param string                          $anchor_block_type  The anchor block type.
	 * @param WP_Block_Template|WP_Post|array $context            The block template, template part, post object,
	 *                                                            or pattern that the anchor block belongs to.
	 */
	$hooked_block_types = apply_filters( 'hooked_block_types', $hooked_block_types, $relative_position, $anchor_block_type, $context );

	$markup = '';
	foreach ( $hooked_block_types as $hooked_block_type ) {
		$parsed_hooked_block = array(
			'blockName'    => $hooked_block_type,
			'attrs'        => array(),
			'innerBlocks'  => array(),
			'innerContent' => array(),
		);

		/**
		 * Filters the parsed block array for a given hooked block.
		 *
		 * @since 6.5.0
		 *
		 * @param array|null                      $parsed_hooked_block The parsed block array for the given hooked block type, or null to suppress the block.
		 * @param string                          $hooked_block_type   The hooked block type name.
		 * @param string                          $relative_position   The relative position of the hooked block.
		 * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
		 * @param WP_Block_Template|WP_Post|array $context             The block template, template part, post object,
		 *                                                             or pattern that the anchor block belongs to.
		 */
		$parsed_hooked_block = apply_filters( 'hooked_block', $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );

		/**
		 * Filters the parsed block array for a given hooked block.
		 *
		 * The dynamic portion of the hook name, `$hooked_block_type`, refers to the block type name of the specific hooked block.
		 *
		 * @since 6.5.0
		 *
		 * @param array|null                      $parsed_hooked_block The parsed block array for the given hooked block type, or null to suppress the block.
		 * @param string                          $hooked_block_type   The hooked block type name.
		 * @param string                          $relative_position   The relative position of the hooked block.
		 * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
		 * @param WP_Block_Template|WP_Post|array $context             The block template, template part, post object,
		 *                                                             or pattern that the anchor block belongs to.
		 */
		$parsed_hooked_block = apply_filters( "hooked_block_{$hooked_block_type}", $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );

		if ( null === $parsed_hooked_block ) {
			continue;
		}

		// It's possible that the filter returned a block of a different type, so we explicitly
		// look for the original `$hooked_block_type` in the `ignoredHookedBlocks` metadata.
		if (
			! isset( $parsed_anchor_block['attrs']['metadata']['ignoredHookedBlocks'] ) ||
			! in_array( $hooked_block_type, $parsed_anchor_block['attrs']['metadata']['ignoredHookedBlocks'], true )
		) {
			$markup .= serialize_block( $parsed_hooked_block );
		}
	}

	return $markup;
}

/**
 * Adds a list of hooked block types to an anchor block's ignored hooked block types.
 *
 * This function is meant for internal use only.
 *
 * @since 6.5.0
 * @access private
 *
 * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
 * @param string                          $relative_position   The relative position of the hooked blocks.
 *                                                             Can be one of 'before', 'after', 'first_child', or 'last_child'.
 * @param array                           $hooked_blocks       An array of hooked block types, grouped by anchor block and relative position.
 * @param WP_Block_Template|WP_Post|array $context             The block template, template part, or pattern that the anchor block belongs to.
 * @return string Empty string.
 */
function set_ignored_hooked_blocks_metadata( &$parsed_anchor_block, $relative_position, $hooked_blocks, $context ) {
	$anchor_block_type  = $parsed_anchor_block['blockName'];
	$hooked_block_types = isset( $anchor_block_type, $hooked_blocks[ $anchor_block_type ][ $relative_position ] )
		? $hooked_blocks[ $anchor_block_type ][ $relative_position ]
		: array();

	/** This filter is documented in wp-includes/blocks.php */
	$hooked_block_types = apply_filters( 'hooked_block_types', $hooked_block_types, $relative_position, $anchor_block_type, $context );
	if ( empty( $hooked_block_types ) ) {
		return '';
	}

	foreach ( $hooked_block_types as $index => $hooked_block_type ) {
		$parsed_hooked_block = array(
			'blockName'    => $hooked_block_type,
			'attrs'        => array(),
			'innerBlocks'  => array(),
			'innerContent' => array(),
		);

		/** This filter is documented in wp-includes/blocks.php */
		$parsed_hooked_block = apply_filters( 'hooked_block', $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );

		/** This filter is documented in wp-includes/blocks.php */
		$parsed_hooked_block = apply_filters( "hooked_block_{$hooked_block_type}", $parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context );

		if ( null === $parsed_hooked_block ) {
			unset( $hooked_block_types[ $index ] );
		}
	}

	$previously_ignored_hooked_blocks = isset( $parsed_anchor_block['attrs']['metadata']['ignoredHookedBlocks'] )
		? $parsed_anchor_block['attrs']['metadata']['ignoredHookedBlocks']
		: array();

	$parsed_anchor_block['attrs']['metadata']['ignoredHookedBlocks'] = array_unique(
		array_merge(
			$previously_ignored_hooked_blocks,
			$hooked_block_types
		)
	);

	// Markup for the hooked blocks has already been created (in `insert_hooked_blocks`).
	return '';
}

/**
 * Runs the hooked blocks algorithm on the given content.
 *
 * @since 6.6.0
 * @since 6.7.0 Injects the `theme` attribute into Template Part blocks, even if no hooked blocks are registered.
 * @since 6.8.0 Have the `$context` parameter default to `null`, in which case `get_post()` will be called to use the current post as context.
 * @access private
 *
 * @param string                               $content  Serialized content.
 * @param WP_Block_Template|WP_Post|array|null $context  A block template, template part, post object, or pattern
 *                                                       that the blocks belong to. If set to `null`, `get_post()`
 *                                                       will be called to use the current post as context.
 *                                                       Default: `null`.
 * @param callable                             $callback A function that will be called for each block to generate
 *                                                       the markup for a given list of blocks that are hooked to it.
 *                                                       Default: 'insert_hooked_blocks'.
 * @return string The serialized markup.
 */
function apply_block_hooks_to_content( $content, $context = null, $callback = 'insert_hooked_blocks' ) {
	// Default to the current post if no context is provided.
	if ( null === $context ) {
		$context = get_post();
	}

	$hooked_blocks = get_hooked_blocks();

	$before_block_visitor = '_inject_theme_attribute_in_template_part_block';
	$after_block_visitor  = null;
	if ( ! empty( $hooked_blocks ) || has_filter( 'hooked_block_types' ) ) {
		$before_block_visitor = make_before_block_visitor( $hooked_blocks, $context, $callback );
		$after_block_visitor  = make_after_block_visitor( $hooked_blocks, $context, $callback );
	}

	$block_allows_multiple_instances = array();
	/*
	 * Remove hooked blocks from `$hooked_block_types` if they have `multiple` set to false and
	 * are already present in `$content`.
	 */
	foreach ( $hooked_blocks as $anchor_block_type => $relative_positions ) {
		foreach ( $relative_positions as $relative_position => $hooked_block_types ) {
			foreach ( $hooked_block_types as $index => $hooked_block_type ) {
				$hooked_block_type_definition =
					WP_Block_Type_Registry::get_instance()->get_registered( $hooked_block_type );

				$block_allows_multiple_instances[ $hooked_block_type ] =
					block_has_support( $hooked_block_type_definition, 'multiple', true );

				if (
					! $block_allows_multiple_instances[ $hooked_block_type ] &&
					has_block( $hooked_block_type, $content )
				) {
					unset( $hooked_blocks[ $anchor_block_type ][ $relative_position ][ $index ] );
				}
			}
			if ( empty( $hooked_blocks[ $anchor_block_type ][ $relative_position ] ) ) {
				unset( $hooked_blocks[ $anchor_block_type ][ $relative_position ] );
			}
		}
		if ( empty( $hooked_blocks[ $anchor_block_type ] ) ) {
			unset( $hooked_blocks[ $anchor_block_type ] );
		}
	}

	/*
	 * We also need to cover the case where the hooked block is not present in
	 * `$content` at first and we're allowed to insert it once -- but not again.
	 */
	$suppress_single_instance_blocks = static function ( $hooked_block_types ) use ( &$block_allows_multiple_instances, $content ) {
		static $single_instance_blocks_present_in_content = array();
		foreach ( $hooked_block_types as $index => $hooked_block_type ) {
			if ( ! isset( $block_allows_multiple_instances[ $hooked_block_type ] ) ) {
				$hooked_block_type_definition =
					WP_Block_Type_Registry::get_instance()->get_registered( $hooked_block_type );

				$block_allows_multiple_instances[ $hooked_block_type ] =
					block_has_support( $hooked_block_type_definition, 'multiple', true );
			}

			if ( $block_allows_multiple_instances[ $hooked_block_type ] ) {
				continue;
			}

			// The block doesn't allow multiple instances, so we need to check if it's already present.
			if (
				in_array( $hooked_block_type, $single_instance_blocks_present_in_content, true ) ||
				has_block( $hooked_block_type, $content )
			) {
				unset( $hooked_block_types[ $index ] );
			} else {
				// We can insert the block once, but need to remember not to insert it again.
				$single_instance_blocks_present_in_content[] = $hooked_block_type;
			}
		}
		return $hooked_block_types;
	};
	add_filter( 'hooked_block_types', $suppress_single_instance_blocks, PHP_INT_MAX );
	$content = traverse_and_serialize_blocks(
		parse_blocks( $content ),
		$before_block_visitor,
		$after_block_visitor
	);
	remove_filter( 'hooked_block_types', $suppress_single_instance_blocks, PHP_INT_MAX );

	return $content;
}

/**
 * Run the Block Hooks algorithm on a post object's content.
 *
 * This function is different from `apply_block_hooks_to_content` in that
 * it takes ignored hooked block information from the post's metadata into
 * account. This ensures that any blocks hooked as first or last child
 * of the block that corresponds to the post type are handled correctly.
 *
 * @since 6.8.0
 * @access private
 *
 * @param string       $content  Serialized content.
 * @param WP_Post|null $post     A post object that the content belongs to. If set to `null`,
 *                               `get_post()` will be called to use the current post as context.
 *                               Default: `null`.
 * @param callable     $callback A function that will be called for each block to generate
 *                               the markup for a given list of blocks that are hooked to it.
 *                               Default: 'insert_hooked_blocks'.
 * @return string The serialized markup.
 */
function apply_block_hooks_to_content_from_post_object( $content, $post = null, $callback = 'insert_hooked_blocks' ) {
	// Default to the current post if no context is provided.
	if ( null === $post ) {
		$post = get_post();
	}

	if ( ! $post instanceof WP_Post ) {
		return apply_block_hooks_to_content( $content, $post, $callback );
	}

	/*
	 * If the content was created using the classic editor or using a single Classic block
	 * (`core/freeform`), it might not contain any block markup at all.
	 * However, we still might need to inject hooked blocks in the first child or last child
	 * positions of the parent block. To be able to apply the Block Hooks algorithm, we wrap
	 * the content in a `core/freeform` wrapper block.
	 */
	if ( ! has_blocks( $content ) ) {
		$original_content = $content;

		$content_wrapped_in_classic_block = get_comment_delimited_block_content(
			'core/freeform',
			array(),
			$content
		);

		$content = $content_wrapped_in_classic_block;
	}

	$attributes = array();

	// If context is a post object, `ignoredHookedBlocks` information is stored in its post meta.
	$ignored_hooked_blocks = get_post_meta( $post->ID, '_wp_ignored_hooked_blocks', true );
	if ( ! empty( $ignored_hooked_blocks ) ) {
		$ignored_hooked_blocks  = json_decode( $ignored_hooked_blocks, true );
		$attributes['metadata'] = array(
			'ignoredHookedBlocks' => $ignored_hooked_blocks,
		);
	}

	/*
	 * We need to wrap the content in a temporary wrapper block with that metadata
	 * so the Block Hooks algorithm can insert blocks that are hooked as first or last child
	 * of the wrapper block.
	 * To that end, we need to determine the wrapper block type based on the post type.
	 */
	if ( 'wp_navigation' === $post->post_type ) {
		$wrapper_block_type = 'core/navigation';
	} elseif ( 'wp_block' === $post->post_type ) {
		$wrapper_block_type = 'core/block';
	} else {
		$wrapper_block_type = 'core/post-content';
	}

	$content = get_comment_delimited_block_content(
		$wrapper_block_type,
		$attributes,
		$content
	);

	/*
	 * We need to avoid inserting any blocks hooked into the `before` and `after` positions
	 * of the temporary wrapper block that we create to wrap the content.
	 * See https://core.trac.wordpress.org/ticket/63287 for more details.
	 */
	$suppress_blocks_from_insertion_before_and_after_wrapper_block = static function ( $hooked_block_types, $relative_position, $anchor_block_type ) use ( $wrapper_block_type ) {
		if (
			$wrapper_block_type === $anchor_block_type &&
			in_array( $relative_position, array( 'before', 'after' ), true )
		) {
			return array();
		}
		return $hooked_block_types;
	};

	// Apply Block Hooks.
	add_filter( 'hooked_block_types', $suppress_blocks_from_insertion_before_and_after_wrapper_block, PHP_INT_MAX, 3 );
	$content = apply_block_hooks_to_content( $content, $post, $callback );
	remove_filter( 'hooked_block_types', $suppress_blocks_from_insertion_before_and_after_wrapper_block, PHP_INT_MAX );

	// Finally, we need to remove the temporary wrapper block.
	$content = remove_serialized_parent_block( $content );

	// If we wrapped the content in a `core/freeform` block, we also need to remove that.
	if ( ! empty( $content_wrapped_in_classic_block ) ) {
		/*
		 * We cannot simply use remove_serialized_parent_block() here,
		 * as that function assumes that the block wrapper is at the top level.
		 * However, there might now be a hooked block inserted next to it
		 * (as first or last child of the parent).
		 */
		$content = str_replace( $content_wrapped_in_classic_block, $original_content, $content );
	}

	return $content;
}

/**
 * Accepts the serialized markup of a block and its inner blocks, and returns serialized markup of the inner blocks.
 *
 * @since 6.6.0
 * @access private
 *
 * @param string $serialized_block The serialized markup of a block and its inner blocks.
 * @return string The serialized markup of the inner blocks.
 */
function remove_serialized_parent_block( $serialized_block ) {
	$start = strpos( $serialized_block, '-->' ) + strlen( '-->' );
	$end   = strrpos( $serialized_block, '<!--' );
	return substr( $serialized_block, $start, $end - $start );
}

/**
 * Accepts the serialized markup of a block and its inner blocks, and returns serialized markup of the wrapper block.
 *
 * @since 6.7.0
 * @access private
 *
 * @see remove_serialized_parent_block()
 *
 * @param string $serialized_block The serialized markup of a block and its inner blocks.
 * @return string The serialized markup of the wrapper block.
 */
function extract_serialized_parent_block( $serialized_block ) {
	$start = strpos( $serialized_block, '-->' ) + strlen( '-->' );
	$end   = strrpos( $serialized_block, '<!--' );
	return substr( $serialized_block, 0, $start ) . substr( $serialized_block, $end );
}

/**
 * Updates the wp_postmeta with the list of ignored hooked blocks
 * where the inner blocks are stored as post content.
 *
 * @since 6.6.0
 * @since 6.8.0 Support non-`wp_navigation` post types.
 * @access private
 *
 * @param stdClass $post Post object.
 * @return stdClass The updated post object.
 */
function update_ignored_hooked_blocks_postmeta( $post ) {
	/*
	 * In this scenario the user has likely tried to create a new post object via the REST API.
	 * In which case we won't have a post ID to work with and store meta against.
	 */
	if ( empty( $post->ID ) ) {
		return $post;
	}

	/*
	 * Skip meta generation when consumers intentionally update specific fields
	 * and omit the content update.
	 */
	if ( ! isset( $post->post_content ) ) {
		return $post;
	}

	/*
	 * Skip meta generation if post type is not set.
	 */
	if ( ! isset( $post->post_type ) ) {
		return $post;
	}

	$attributes = array();

	$ignored_hooked_blocks = get_post_meta( $post->ID, '_wp_ignored_hooked_blocks', true );
	if ( ! empty( $ignored_hooked_blocks ) ) {
		$ignored_hooked_blocks  = json_decode( $ignored_hooked_blocks, true );
		$attributes['metadata'] = array(
			'ignoredHookedBlocks' => $ignored_hooked_blocks,
		);
	}

	if ( 'wp_navigation' === $post->post_type ) {
		$wrapper_block_type = 'core/navigation';
	} elseif ( 'wp_block' === $post->post_type ) {
		$wrapper_block_type = 'core/block';
	} else {
		$wrapper_block_type = 'core/post-content';
	}

	$markup = get_comment_delimited_block_content(
		$wrapper_block_type,
		$attributes,
		$post->post_content
	);

	$existing_post = get_post( $post->ID );
	// Merge the existing post object with the updated post object to pass to the block hooks algorithm for context.
	$context          = (object) array_merge( (array) $existing_post, (array) $post );
	$context          = new WP_Post( $context ); // Convert to WP_Post object.
	$serialized_block = apply_block_hooks_to_content( $markup, $context, 'set_ignored_hooked_blocks_metadata' );
	$root_block       = parse_blocks( $serialized_block )[0];

	$ignored_hooked_blocks = isset( $root_block['attrs']['metadata']['ignoredHookedBlocks'] )
		? $root_block['attrs']['metadata']['ignoredHookedBlocks']
		: array();

	if ( ! empty( $ignored_hooked_blocks ) ) {
		$existing_ignored_hooked_blocks = get_post_meta( $post->ID, '_wp_ignored_hooked_blocks', true );
		if ( ! empty( $existing_ignored_hooked_blocks ) ) {
			$existing_ignored_hooked_blocks = json_decode( $existing_ignored_hooked_blocks, true );
			$ignored_hooked_blocks          = array_unique( array_merge( $ignored_hooked_blocks, $existing_ignored_hooked_blocks ) );
		}

		if ( ! isset( $post->meta_input ) ) {
			$post->meta_input = array();
		}
		$post->meta_input['_wp_ignored_hooked_blocks'] = json_encode( $ignored_hooked_blocks );
	}

	$post->post_content = remove_serialized_parent_block( $serialized_block );
	return $post;
}

/**
 * Returns the markup for blocks hooked to the given anchor block in a specific relative position and then
 * adds a list of hooked block types to an anchor block's ignored hooked block types.
 *
 * This function is meant for internal use only.
 *
 * @since 6.6.0
 * @access private
 *
 * @param array                           $parsed_anchor_block The anchor block, in parsed block array format.
 * @param string                          $relative_position   The relative position of the hooked blocks.
 *                                                             Can be one of 'before', 'after', 'first_child', or 'last_child'.
 * @param array                           $hooked_blocks       An array of hooked block types, grouped by anchor block and relative position.
 * @param WP_Block_Template|WP_Post|array $context             The block template, template part, or pattern that the anchor block belongs to.
 * @return string
 */
function insert_hooked_blocks_and_set_ignored_hooked_blocks_metadata( &$parsed_anchor_block, $relative_position, $hooked_blocks, $context ) {
	$markup  = insert_hooked_blocks( $parsed_anchor_block, $relative_position, $hooked_blocks, $context );
	$markup .= set_ignored_hooked_blocks_metadata( $parsed_anchor_block, $relative_position, $hooked_blocks, $context );

	return $markup;
}

/**
 * Hooks into the REST API response for the Posts endpoint and adds the first and last inner blocks.
 *
 * @since 6.6.0
 * @since 6.8.0 Support non-`wp_navigation` post types.
 *
 * @param WP_REST_Response $response The response object.
 * @param WP_Post          $post     Post object.
 * @return WP_REST_Response The response object.
 */
function insert_hooked_blocks_into_rest_response( $response, $post ) {
	if ( empty( $response->data['content']['raw'] ) ) {
		return $response;
	}

	$response->data['content']['raw'] = apply_block_hooks_to_content_from_post_object(
		$response->data['content']['raw'],
		$post,
		'insert_hooked_blocks_and_set_ignored_hooked_blocks_metadata'
	);

	// If the rendered content was previously empty, we leave it like that.
	if ( empty( $response->data['content']['rendered'] ) ) {
		return $response;
	}

	// `apply_block_hooks_to_content` is called above. Ensure it is not called again as a filter.
	$priority = has_filter( 'the_content', 'apply_block_hooks_to_content_from_post_object' );
	if ( false !== $priority ) {
		remove_filter( 'the_content', 'apply_block_hooks_to_content_from_post_object', $priority );
	}

	/** This filter is documented in wp-includes/post-template.php */
	$response->data['content']['rendered'] = apply_filters(
		'the_content',
		$response->data['content']['raw']
	);

	// Restore the filter if it was set initially.
	if ( false !== $priority ) {
		add_filter( 'the_content', 'apply_block_hooks_to_content_from_post_object', $priority );
	}

	return $response;
}

/**
 * Returns a function that injects the theme attribute into, and hooked blocks before, a given block.
 *
 * The returned function can be used as `$pre_callback` argument to `traverse_and_serialize_block(s)`,
 * where it will inject the `theme` attribute into all Template Part blocks, and prepend the markup for
 * any blocks hooked `before` the given block and as its parent's `first_child`, respectively.
 *
 * This function is meant for internal use only.
 *
 * @since 6.4.0
 * @since 6.5.0 Added $callback argument.
 * @access private
 *
 * @param array                           $hooked_blocks An array of blocks hooked to another given block.
 * @param WP_Block_Template|WP_Post|array $context       A block template, template part, post object,
 *                                                       or pattern that the blocks belong to.
 * @param callable                        $callback      A function that will be called for each block to generate
 *                                                       the markup for a given list of blocks that are hooked to it.
 *                                                       Default: 'insert_hooked_blocks'.
 * @return callable A function that returns the serialized markup for the given block,
 *                  including the markup for any hooked blocks before it.
 */
function make_before_block_visitor( $hooked_blocks, $context, $callback = 'insert_hooked_blocks' ) {
	/**
	 * Injects hooked blocks before the given block, injects the `theme` attribute into Template Part blocks, and returns the serialized markup.
	 *
	 * If the current block is a Template Part block, inject the `theme` attribute.
	 * Furthermore, prepend the markup for any blocks hooked `before` the given block and as its parent's
	 * `first_child`, respectively, to the serialized markup for the given block.
	 *
	 * @param array $block        The block to inject the theme attribute into, and hooked blocks before. Passed by reference.
	 * @param array $parent_block The parent block of the given block. Passed by reference. Default null.
	 * @param array $prev         The previous sibling block of the given block. Default null.
	 * @return string The serialized markup for the given block, with the markup for any hooked blocks prepended to it.
	 */
	return function ( &$block, &$parent_block = null, $prev = null ) use ( $hooked_blocks, $context, $callback ) {
		_inject_theme_attribute_in_template_part_block( $block );

		$markup = '';

		if ( $parent_block && ! $prev ) {
			// Candidate for first-child insertion.
			$markup .= call_user_func_array(
				$callback,
				array( &$parent_block, 'first_child', $hooked_blocks, $context )
			);
		}

		$markup .= call_user_func_array(
			$callback,
			array( &$block, 'before', $hooked_blocks, $context )
		);

		return $markup;
	};
}

/**
 * Returns a function that injects the hooked blocks after a given block.
 *
 * The returned function can be used as `$post_callback` argument to `traverse_and_serialize_block(s)`,
 * where it will append the markup for any blocks hooked `after` the given block and as its parent's
 * `last_child`, respectively.
 *
 * This function is meant for internal use only.
 *
 * @since 6.4.0
 * @since 6.5.0 Added $callback argument.
 * @access private
 *
 * @param array                           $hooked_blocks An array of blocks hooked to another block.
 * @param WP_Block_Template|WP_Post|array $context       A block template, template part, post object,
 *                                                       or pattern that the blocks belong to.
 * @param callable                        $callback      A function that will be called for each block to generate
 *                                                       the markup for a given list of blocks that are hooked to it.
 *                                                       Default: 'insert_hooked_blocks'.
 * @return callable A function that returns the serialized markup for the given block,
 *                  including the markup for any hooked blocks after it.
 */
function make_after_block_visitor( $hooked_blocks, $context, $callback = 'insert_hooked_blocks' ) {
	/**
	 * Injects hooked blocks after the given block, and returns the serialized markup.
	 *
	 * Append the markup for any blocks hooked `after` the given block and as its parent's
	 * `last_child`, respectively, to the serialized markup for the given block.
	 *
	 * @param array $block        The block to inject the hooked blocks after. Passed by reference.
	 * @param array $parent_block The parent block of the given block. Passed by reference. Default null.
	 * @param array $next         The next sibling block of the given block. Default null.
	 * @return string The serialized markup for the given block, with the markup for any hooked blocks appended to it.
	 */
	return function ( &$block, &$parent_block = null, $next = null ) use ( $hooked_blocks, $context, $callback ) {
		$markup = call_user_func_array(
			$callback,
			array( &$block, 'after', $hooked_blocks, $context )
		);

		if ( $parent_block && ! $next ) {
			// Candidate for last-child insertion.
			$markup .= call_user_func_array(
				$callback,
				array( &$parent_block, 'last_child', $hooked_blocks, $context )
			);
		}

		return $markup;
	};
}

/**
 * Given an array of attributes, returns a string in the serialized attributes
 * format prepared for post content.
 *
 * The serialized result is a JSON-encoded string, with unicode escape sequence
 * substitution for characters which might otherwise interfere with embedding
 * the result in an HTML comment.
 *
 * This function must produce output that remains in sync with the output of
 * the serializeAttributes JavaScript function in the block editor in order
 * to ensure consistent operation between PHP and JavaScript.
 *
 * @since 5.3.1
 *
 * @param array $block_attributes Attributes object.
 * @return string Serialized attributes.
 */
function serialize_block_attributes( $block_attributes ) {
	$encoded_attributes = wp_json_encode( $block_attributes, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );

	return strtr(
		$encoded_attributes,
		array(
			'\\\\' => '\\u005c',
			'--'   => '\\u002d\\u002d',
			'<'    => '\\u003c',
			'>'    => '\\u003e',
			'&'    => '\\u0026',
			'\\"'  => '\\u0022',
		)
	);
}

/**
 * Returns the block name to use for serialization. This will remove the default
 * "core/" namespace from a block name.
 *
 * @since 5.3.1
 *
 * @param string|null $block_name Optional. Original block name. Null if the block name is unknown,
 *                                e.g. Classic blocks have their name set to null. Default null.
 * @return string Block name to use for serialization.
 */
function strip_core_block_namespace( $block_name = null ) {
	if ( is_string( $block_name ) && str_starts_with( $block_name, 'core/' ) ) {
		return substr( $block_name, 5 );
	}

	return $block_name;
}

/**
 * Returns the content of a block, including comment delimiters.
 *
 * @since 5.3.1
 *
 * @param string|null $block_name       Block name. Null if the block name is unknown,
 *                                      e.g. Classic blocks have their name set to null.
 * @param array       $block_attributes Block attributes.
 * @param string      $block_content    Block save content.
 * @return string Comment-delimited block content.
 */
function get_comment_delimited_block_content( $block_name, $block_attributes, $block_content ) {
	if ( is_null( $block_name ) ) {
		return $block_content;
	}

	$serialized_block_name = strip_core_block_namespace( $block_name );
	$serialized_attributes = empty( $block_attributes ) ? '' : serialize_block_attributes( $block_attributes ) . ' ';

	if ( empty( $block_content ) ) {
		return sprintf( '<!-- wp:%s %s/-->', $serialized_block_name, $serialized_attributes );
	}

	return sprintf(
		'<!-- wp:%s %s-->%s<!-- /wp:%s -->',
		$serialized_block_name,
		$serialized_attributes,
		$block_content,
		$serialized_block_name
	);
}

/**
 * Returns the content of a block, including comment delimiters, serializing all
 * attributes from the given parsed block.
 *
 * This should be used when preparing a block to be saved to post content.
 * Prefer `render_block` when preparing a block for display. Unlike
 * `render_block`, this does not evaluate a block's `render_callback`, and will
 * instead preserve the markup as parsed.
 *
 * @since 5.3.1
 *
 * @param array $block {
 *     An associative array of a single parsed block object. See WP_Block_Parser_Block.
 *
 *     @type string|null $blockName    Name of block.
 *     @type array       $attrs        Attributes from block comment delimiters.
 *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
 *                                     have the same structure as this one.
 *     @type string      $innerHTML    HTML from inside block comment delimiters.
 *     @type array       $innerContent List of string fragments and null markers where
 *                                     inner blocks were found.
 * }
 * @return string String of rendered HTML.
 */
function serialize_block( $block ) {
	$block_content = '';

	$index = 0;
	foreach ( $block['innerContent'] as $chunk ) {
		$block_content .= is_string( $chunk ) ? $chunk : serialize_block( $block['innerBlocks'][ $index++ ] );
	}

	if ( ! is_array( $block['attrs'] ) ) {
		$block['attrs'] = array();
	}

	return get_comment_delimited_block_content(
		$block['blockName'],
		$block['attrs'],
		$block_content
	);
}

/**
 * Returns a joined string of the aggregate serialization of the given
 * parsed blocks.
 *
 * @since 5.3.1
 *
 * @param array[] $blocks {
 *     Array of block structures.
 *
 *     @type array ...$0 {
 *         An associative array of a single parsed block object. See WP_Block_Parser_Block.
 *
 *         @type string|null $blockName    Name of block.
 *         @type array       $attrs        Attributes from block comment delimiters.
 *         @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
 *                                         have the same structure as this one.
 *         @type string      $innerHTML    HTML from inside block comment delimiters.
 *         @type array       $innerContent List of string fragments and null markers where
 *                                         inner blocks were found.
 *     }
 * }
 * @return string String of rendered HTML.
 */
function serialize_blocks( $blocks ) {
	return implode( '', array_map( 'serialize_block', $blocks ) );
}

/**
 * Traverses a parsed block tree and applies callbacks before and after serializing it.
 *
 * Recursively traverses the block and its inner blocks and applies the two callbacks provided as
 * arguments, the first one before serializing the block, and the second one after serializing it.
 * If either callback returns a string value, it will be prepended and appended to the serialized
 * block markup, respectively.
 *
 * The callbacks will receive a reference to the current block as their first argument, so that they
 * can also modify it, and the current block's parent block as second argument. Finally, the
 * `$pre_callback` receives the previous block, whereas the `$post_callback` receives
 * the next block as third argument.
 *
 * Serialized blocks are returned including comment delimiters, and with all attributes serialized.
 *
 * This function should be used when there is a need to modify the saved block, or to inject markup
 * into the return value. Prefer `serialize_block` when preparing a block to be saved to post content.
 *
 * This function is meant for internal use only.
 *
 * @since 6.4.0
 * @access private
 *
 * @see serialize_block()
 *
 * @param array    $block         An associative array of a single parsed block object. See WP_Block_Parser_Block.
 * @param callable $pre_callback  Callback to run on each block in the tree before it is traversed and serialized.
 *                                It is called with the following arguments: &$block, $parent_block, $previous_block.
 *                                Its string return value will be prepended to the serialized block markup.
 * @param callable $post_callback Callback to run on each block in the tree after it is traversed and serialized.
 *                                It is called with the following arguments: &$block, $parent_block, $next_block.
 *                                Its string return value will be appended to the serialized block markup.
 * @return string Serialized block markup.
 */
function traverse_and_serialize_block( $block, $pre_callback = null, $post_callback = null ) {
	$block_content = '';
	$block_index   = 0;

	foreach ( $block['innerContent'] as $chunk ) {
		if ( is_string( $chunk ) ) {
			$block_content .= $chunk;
		} else {
			$inner_block = $block['innerBlocks'][ $block_index ];

			if ( is_callable( $pre_callback ) ) {
				$prev = 0 === $block_index
					? null
					: $block['innerBlocks'][ $block_index - 1 ];

				$block_content .= call_user_func_array(
					$pre_callback,
					array( &$inner_block, &$block, $prev )
				);
			}

			if ( is_callable( $post_callback ) ) {
				$next = count( $block['innerBlocks'] ) - 1 === $block_index
					? null
					: $block['innerBlocks'][ $block_index + 1 ];

				$post_markup = call_user_func_array(
					$post_callback,
					array( &$inner_block, &$block, $next )
				);
			}

			$block_content .= traverse_and_serialize_block( $inner_block, $pre_callback, $post_callback );
			$block_content .= isset( $post_markup ) ? $post_markup : '';

			++$block_index;
		}
	}

	if ( ! is_array( $block['attrs'] ) ) {
		$block['attrs'] = array();
	}

	return get_comment_delimited_block_content(
		$block['blockName'],
		$block['attrs'],
		$block_content
	);
}

/**
 * Replaces patterns in a block tree with their content.
 *
 * @since 6.6.0
 *
 * @param array $blocks An array blocks.
 *
 * @return array An array of blocks with patterns replaced by their content.
 */
function resolve_pattern_blocks( $blocks ) {
	static $inner_content;
	// Keep track of seen references to avoid infinite loops.
	static $seen_refs = array();
	$i                = 0;
	while ( $i < count( $blocks ) ) {
		if ( 'core/pattern' === $blocks[ $i ]['blockName'] ) {
			$attrs = $blocks[ $i ]['attrs'];

			if ( empty( $attrs['slug'] ) ) {
				++$i;
				continue;
			}

			$slug = $attrs['slug'];

			if ( isset( $seen_refs[ $slug ] ) ) {
				// Skip recursive patterns.
				array_splice( $blocks, $i, 1 );
				continue;
			}

			$registry = WP_Block_Patterns_Registry::get_instance();
			$pattern  = $registry->get_registered( $slug );

			// Skip unknown patterns.
			if ( ! $pattern ) {
				++$i;
				continue;
			}

			$blocks_to_insert   = parse_blocks( $pattern['content'] );
			$seen_refs[ $slug ] = true;
			$prev_inner_content = $inner_content;
			$inner_content      = null;
			$blocks_to_insert   = resolve_pattern_blocks( $blocks_to_insert );
			$inner_content      = $prev_inner_content;
			unset( $seen_refs[ $slug ] );
			array_splice( $blocks, $i, 1, $blocks_to_insert );

			// If we have inner content, we need to insert nulls in the
			// inner content array, otherwise serialize_blocks will skip
			// blocks.
			if ( $inner_content ) {
				$null_indices  = array_keys( $inner_content, null, true );
				$content_index = $null_indices[ $i ];
				$nulls         = array_fill( 0, count( $blocks_to_insert ), null );
				array_splice( $inner_content, $content_index, 1, $nulls );
			}

			// Skip inserted blocks.
			$i += count( $blocks_to_insert );
		} else {
			if ( ! empty( $blocks[ $i ]['innerBlocks'] ) ) {
				$prev_inner_content           = $inner_content;
				$inner_content                = $blocks[ $i ]['innerContent'];
				$blocks[ $i ]['innerBlocks']  = resolve_pattern_blocks(
					$blocks[ $i ]['innerBlocks']
				);
				$blocks[ $i ]['innerContent'] = $inner_content;
				$inner_content                = $prev_inner_content;
			}
			++$i;
		}
	}
	return $blocks;
}

/**
 * Given an array of parsed block trees, applies callbacks before and after serializing them and
 * returns their concatenated output.
 *
 * Recursively traverses the blocks and their inner blocks and applies the two callbacks provided as
 * arguments, the first one before serializing a block, and the second one after serializing.
 * If either callback returns a string value, it will be prepended and appended to the serialized
 * block markup, respectively.
 *
 * The callbacks will receive a reference to the current block as their first argument, so that they
 * can also modify it, and the current block's parent block as second argument. Finally, the
 * `$pre_callback` receives the previous block, whereas the `$post_callback` receives
 * the next block as third argument.
 *
 * Serialized blocks are returned including comment delimiters, and with all attributes serialized.
 *
 * This function should be used when there is a need to modify the saved blocks, or to inject markup
 * into the return value. Prefer `serialize_blocks` when preparing blocks to be saved to post content.
 *
 * This function is meant for internal use only.
 *
 * @since 6.4.0
 * @access private
 *
 * @see serialize_blocks()
 *
 * @param array[]  $blocks        An array of parsed blocks. See WP_Block_Parser_Block.
 * @param callable $pre_callback  Callback to run on each block in the tree before it is traversed and serialized.
 *                                It is called with the following arguments: &$block, $parent_block, $previous_block.
 *                                Its string return value will be prepended to the serialized block markup.
 * @param callable $post_callback Callback to run on each block in the tree after it is traversed and serialized.
 *                                It is called with the following arguments: &$block, $parent_block, $next_block.
 *                                Its string return value will be appended to the serialized block markup.
 * @return string Serialized block markup.
 */
function traverse_and_serialize_blocks( $blocks, $pre_callback = null, $post_callback = null ) {
	$result       = '';
	$parent_block = null; // At the top level, there is no parent block to pass to the callbacks; yet the callbacks expect a reference.

	$pre_callback_is_callable  = is_callable( $pre_callback );
	$post_callback_is_callable = is_callable( $post_callback );

	foreach ( $blocks as $index => $block ) {
		if ( $pre_callback_is_callable ) {
			$prev = 0 === $index
				? null
				: $blocks[ $index - 1 ];

			$result .= call_user_func_array(
				$pre_callback,
				array( &$block, &$parent_block, $prev )
			);
		}

		if ( $post_callback_is_callable ) {
			$next = count( $blocks ) - 1 === $index
				? null
				: $blocks[ $index + 1 ];

			$post_markup = call_user_func_array(
				$post_callback,
				array( &$block, &$parent_block, $next )
			);
		}

		$result .= traverse_and_serialize_block( $block, $pre_callback, $post_callback );
		$result .= isset( $post_markup ) ? $post_markup : '';
	}

	return $result;
}

/**
 * Filters and sanitizes block content to remove non-allowable HTML
 * from parsed block attribute values.
 *
 * @since 5.3.1
 *
 * @param string         $text              Text that may contain block content.
 * @param array[]|string $allowed_html      Optional. An array of allowed HTML elements and attributes,
 *                                          or a context name such as 'post'. See wp_kses_allowed_html()
 *                                          for the list of accepted context names. Default 'post'.
 * @param string[]       $allowed_protocols Optional. Array of allowed URL protocols.
 *                                          Defaults to the result of wp_allowed_protocols().
 * @return string The filtered and sanitized content result.
 */
function filter_block_content( $text, $allowed_html = 'post', $allowed_protocols = array() ) {
	$result = '';

	if ( str_contains( $text, '<!--' ) && str_contains( $text, '--->' ) ) {
		$text = preg_replace_callback( '%<!--(.*?)--->%', '_filter_block_content_callback', $text );
	}

	$blocks = parse_blocks( $text );
	foreach ( $blocks as $block ) {
		$block   = filter_block_kses( $block, $allowed_html, $allowed_protocols );
		$result .= serialize_block( $block );
	}

	return $result;
}

/**
 * Callback used for regular expression replacement in filter_block_content().
 *
 * @since 6.2.1
 * @access private
 *
 * @param array $matches Array of preg_replace_callback matches.
 * @return string Replacement string.
 */
function _filter_block_content_callback( $matches ) {
	return '<!--' . rtrim( $matches[1], '-' ) . '-->';
}

/**
 * Filters and sanitizes a parsed block to remove non-allowable HTML
 * from block attribute values.
 *
 * @since 5.3.1
 *
 * @param WP_Block_Parser_Block $block             The parsed block object.
 * @param array[]|string        $allowed_html      An array of allowed HTML elements and attributes,
 *                                                 or a context name such as 'post'. See wp_kses_allowed_html()
 *                                                 for the list of accepted context names.
 * @param string[]              $allowed_protocols Optional. Array of allowed URL protocols.
 *                                                 Defaults to the result of wp_allowed_protocols().
 * @return array The filtered and sanitized block object result.
 */
function filter_block_kses( $block, $allowed_html, $allowed_protocols = array() ) {
	$block['attrs'] = filter_block_kses_value( $block['attrs'], $allowed_html, $allowed_protocols, $block );

	if ( is_array( $block['innerBlocks'] ) ) {
		foreach ( $block['innerBlocks'] as $i => $inner_block ) {
			$block['innerBlocks'][ $i ] = filter_block_kses( $inner_block, $allowed_html, $allowed_protocols );
		}
	}

	return $block;
}

/**
 * Filters and sanitizes a parsed block attribute value to remove
 * non-allowable HTML.
 *
 * @since 5.3.1
 * @since 6.5.5 Added the `$block_context` parameter.
 *
 * @param string[]|string $value             The attribute value to filter.
 * @param array[]|string  $allowed_html      An array of allowed HTML elements and attributes,
 *                                           or a context name such as 'post'. See wp_kses_allowed_html()
 *                                           for the list of accepted context names.
 * @param string[]        $allowed_protocols Optional. Array of allowed URL protocols.
 *                                           Defaults to the result of wp_allowed_protocols().
 * @param array           $block_context     Optional. The block the attribute belongs to, in parsed block array format.
 * @return string[]|string The filtered and sanitized result.
 */
function filter_block_kses_value( $value, $allowed_html, $allowed_protocols = array(), $block_context = null ) {
	if ( is_array( $value ) ) {
		foreach ( $value as $key => $inner_value ) {
			$filtered_key   = filter_block_kses_value( $key, $allowed_html, $allowed_protocols, $block_context );
			$filtered_value = filter_block_kses_value( $inner_value, $allowed_html, $allowed_protocols, $block_context );

			if ( isset( $block_context['blockName'] ) && 'core/template-part' === $block_context['blockName'] ) {
				$filtered_value = filter_block_core_template_part_attributes( $filtered_value, $filtered_key, $allowed_html );
			}
			if ( $filtered_key !== $key ) {
				unset( $value[ $key ] );
			}

			$value[ $filtered_key ] = $filtered_value;
		}
	} elseif ( is_string( $value ) ) {
		return wp_kses( $value, $allowed_html, $allowed_protocols );
	}

	return $value;
}

/**
 * Sanitizes the value of the Template Part block's `tagName` attribute.
 *
 * @since 6.5.5
 *
 * @param string         $attribute_value The attribute value to filter.
 * @param string         $attribute_name  The attribute name.
 * @param array[]|string $allowed_html    An array of allowed HTML elements and attributes,
 *                                        or a context name such as 'post'. See wp_kses_allowed_html()
 *                                        for the list of accepted context names.
 * @return string The sanitized attribute value.
 */
function filter_block_core_template_part_attributes( $attribute_value, $attribute_name, $allowed_html ) {
	if ( empty( $attribute_value ) || 'tagName' !== $attribute_name ) {
		return $attribute_value;
	}
	if ( ! is_array( $allowed_html ) ) {
		$allowed_html = wp_kses_allowed_html( $allowed_html );
	}
	return isset( $allowed_html[ $attribute_value ] ) ? $attribute_value : '';
}

/**
 * Parses blocks out of a content string, and renders those appropriate for the excerpt.
 *
 * As the excerpt should be a small string of text relevant to the full post content,
 * this function renders the blocks that are most likely to contain such text.
 *
 * @since 5.0.0
 *
 * @param string $content The content to parse.
 * @return string The parsed and filtered content.
 */
function excerpt_remove_blocks( $content ) {
	if ( ! has_blocks( $content ) ) {
		return $content;
	}

	$allowed_inner_blocks = array(
		// Classic blocks have their blockName set to null.
		null,
		'core/freeform',
		'core/heading',
		'core/html',
		'core/list',
		'core/media-text',
		'core/paragraph',
		'core/preformatted',
		'core/pullquote',
		'core/quote',
		'core/table',
		'core/verse',
	);

	$allowed_wrapper_blocks = array(
		'core/columns',
		'core/column',
		'core/group',
	);

	/**
	 * Filters the list of blocks that can be used as wrapper blocks, allowing
	 * excerpts to be generated from the `innerBlocks` of these wrappers.
	 *
	 * @since 5.8.0
	 *
	 * @param string[] $allowed_wrapper_blocks The list of names of allowed wrapper blocks.
	 */
	$allowed_wrapper_blocks = apply_filters( 'excerpt_allowed_wrapper_blocks', $allowed_wrapper_blocks );

	$allowed_blocks = array_merge( $allowed_inner_blocks, $allowed_wrapper_blocks );

	/**
	 * Filters the list of blocks that can contribute to the excerpt.
	 *
	 * If a dynamic block is added to this list, it must not generate another
	 * excerpt, as this will cause an infinite loop to occur.
	 *
	 * @since 5.0.0
	 *
	 * @param string[] $allowed_blocks The list of names of allowed blocks.
	 */
	$allowed_blocks = apply_filters( 'excerpt_allowed_blocks', $allowed_blocks );
	$blocks         = parse_blocks( $content );
	$output         = '';

	foreach ( $blocks as $block ) {
		if ( in_array( $block['blockName'], $allowed_blocks, true ) ) {
			if ( ! empty( $block['innerBlocks'] ) ) {
				if ( in_array( $block['blockName'], $allowed_wrapper_blocks, true ) ) {
					$output .= _excerpt_render_inner_blocks( $block, $allowed_blocks );
					continue;
				}

				// Skip the block if it has disallowed or nested inner blocks.
				foreach ( $block['innerBlocks'] as $inner_block ) {
					if (
						! in_array( $inner_block['blockName'], $allowed_inner_blocks, true ) ||
						! empty( $inner_block['innerBlocks'] )
					) {
						continue 2;
					}
				}
			}

			$output .= render_block( $block );
		}
	}

	return $output;
}

/**
 * Parses footnotes markup out of a content string,
 * and renders those appropriate for the excerpt.
 *
 * @since 6.3.0
 *
 * @param string $content The content to parse.
 * @return string The parsed and filtered content.
 */
function excerpt_remove_footnotes( $content ) {
	if ( ! str_contains( $content, 'data-fn=' ) ) {
		return $content;
	}

	return preg_replace(
		'_<sup data-fn="[^"]+" class="[^"]+">\s*<a href="[^"]+" id="[^"]+">\d+</a>\s*</sup>_',
		'',
		$content
	);
}

/**
 * Renders inner blocks from the allowed wrapper blocks
 * for generating an excerpt.
 *
 * @since 5.8.0
 * @access private
 *
 * @param array $parsed_block   The parsed block.
 * @param array $allowed_blocks The list of allowed inner blocks.
 * @return string The rendered inner blocks.
 */
function _excerpt_render_inner_blocks( $parsed_block, $allowed_blocks ) {
	$output = '';

	foreach ( $parsed_block['innerBlocks'] as $inner_block ) {
		if ( ! in_array( $inner_block['blockName'], $allowed_blocks, true ) ) {
			continue;
		}

		if ( empty( $inner_block['innerBlocks'] ) ) {
			$output .= render_block( $inner_block );
		} else {
			$output .= _excerpt_render_inner_blocks( $inner_block, $allowed_blocks );
		}
	}

	return $output;
}

/**
 * Renders a single block into a HTML string.
 *
 * @since 5.0.0
 *
 * @global WP_Post $post The post to edit.
 *
 * @param array $parsed_block {
 *     An associative array of the block being rendered. See WP_Block_Parser_Block.
 *
 *     @type string|null $blockName    Name of block.
 *     @type array       $attrs        Attributes from block comment delimiters.
 *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
 *                                     have the same structure as this one.
 *     @type string      $innerHTML    HTML from inside block comment delimiters.
 *     @type array       $innerContent List of string fragments and null markers where
 *                                     inner blocks were found.
 * }
 * @return string String of rendered HTML.
 */
function render_block( $parsed_block ) {
	global $post;
	$parent_block = null;

	/**
	 * Allows render_block() to be short-circuited, by returning a non-null value.
	 *
	 * @since 5.1.0
	 * @since 5.9.0 The `$parent_block` parameter was added.
	 *
	 * @param string|null   $pre_render   The pre-rendered content. Default null.
	 * @param array         $parsed_block {
	 *     An associative array of the block being rendered. See WP_Block_Parser_Block.
	 *
	 *     @type string|null $blockName    Name of block.
	 *     @type array       $attrs        Attributes from block comment delimiters.
	 *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
	 *                                     have the same structure as this one.
	 *     @type string      $innerHTML    HTML from inside block comment delimiters.
	 *     @type array       $innerContent List of string fragments and null markers where
	 *                                     inner blocks were found.
	 * }
	 * @param WP_Block|null $parent_block If this is a nested block, a reference to the parent block.
	 */
	$pre_render = apply_filters( 'pre_render_block', null, $parsed_block, $parent_block );
	if ( ! is_null( $pre_render ) ) {
		return $pre_render;
	}

	$source_block = $parsed_block;

	/**
	 * Filters the block being rendered in render_block(), before it's processed.
	 *
	 * @since 5.1.0
	 * @since 5.9.0 The `$parent_block` parameter was added.
	 *
	 * @param array         $parsed_block {
	 *     An associative array of the block being rendered. See WP_Block_Parser_Block.
	 *
	 *     @type string|null $blockName    Name of block.
	 *     @type array       $attrs        Attributes from block comment delimiters.
	 *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
	 *                                     have the same structure as this one.
	 *     @type string      $innerHTML    HTML from inside block comment delimiters.
	 *     @type array       $innerContent List of string fragments and null markers where
	 *                                     inner blocks were found.
	 * }
	 * @param array         $source_block {
	 *     An un-modified copy of `$parsed_block`, as it appeared in the source content.
	 *     See WP_Block_Parser_Block.
	 *
	 *     @type string|null $blockName    Name of block.
	 *     @type array       $attrs        Attributes from block comment delimiters.
	 *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
	 *                                     have the same structure as this one.
	 *     @type string      $innerHTML    HTML from inside block comment delimiters.
	 *     @type array       $innerContent List of string fragments and null markers where
	 *                                     inner blocks were found.
	 * }
	 * @param WP_Block|null $parent_block If this is a nested block, a reference to the parent block.
	 */
	$parsed_block = apply_filters( 'render_block_data', $parsed_block, $source_block, $parent_block );

	$context = array();

	if ( $post instanceof WP_Post ) {
		$context['postId'] = $post->ID;

		/*
		 * The `postType` context is largely unnecessary server-side, since the ID
		 * is usually sufficient on its own. That being said, since a block's
		 * manifest is expected to be shared between the server and the client,
		 * it should be included to consistently fulfill the expectation.
		 */
		$context['postType'] = $post->post_type;
	}

	/**
	 * Filters the default context provided to a rendered block.
	 *
	 * @since 5.5.0
	 * @since 5.9.0 The `$parent_block` parameter was added.
	 *
	 * @param array         $context      Default context.
	 * @param array         $parsed_block {
	 *     An associative array of the block being rendered. See WP_Block_Parser_Block.
	 *
	 *     @type string|null $blockName    Name of block.
	 *     @type array       $attrs        Attributes from block comment delimiters.
	 *     @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
	 *                                     have the same structure as this one.
	 *     @type string      $innerHTML    HTML from inside block comment delimiters.
	 *     @type array       $innerContent List of string fragments and null markers where
	 *                                     inner blocks were found.
	 * }
	 * @param WP_Block|null $parent_block If this is a nested block, a reference to the parent block.
	 */
	$context = apply_filters( 'render_block_context', $context, $parsed_block, $parent_block );

	$block = new WP_Block( $parsed_block, $context );

	return $block->render();
}

/**
 * Parses blocks out of a content string.
 *
 * Given an HTML document, this function fully-parses block content, producing
 * a tree of blocks and their contents, as well as top-level non-block content,
 * which will appear as a block with no `blockName`.
 *
 * This function can be memory heavy for certain documents, particularly those
 * with deeply-nested blocks or blocks with extensive attribute values. Further,
 * this function must parse an entire document in one atomic operation.
 *
 * If the entire parsed document is not necessary, consider using {@see WP_Block_Processor}
 * instead, as it provides a streaming and low-overhead interface for finding blocks.
 *
 * @since 5.0.0
 *
 * @param string $content Post content.
 * @return array[] {
 *     Array of block structures.
 *
 *     @type array ...$0 {
 *         An associative array of a single parsed block object. See WP_Block_Parser_Block.
 *
 *         @type string|null $blockName    Name of block.
 *         @type array       $attrs        Attributes from block comment delimiters.
 *         @type array[]     $innerBlocks  List of inner blocks. An array of arrays that
 *                                         have the same structure as this one.
 *         @type string      $innerHTML    HTML from inside block comment delimiters.
 *         @type array       $innerContent List of string fragments and null markers where
 *                                         inner blocks were found.
 *     }
 * }
 */
function parse_blocks( $content ) {
	/**
	 * Filter to allow plugins to replace the server-side block parser.
	 *
	 * @since 5.0.0
	 *
	 * @param string $parser_class Name of block parser class.
	 */
	$parser_class = apply_filters( 'block_parser_class', 'WP_Block_Parser' );

	$parser = new $parser_class();
	return $parser->parse( $content );
}

/**
 * Parses dynamic blocks out of `post_content` and re-renders them.
 *
 * @since 5.0.0
 *
 * @param string $content Post content.
 * @return string Updated post content.
 */
function do_blocks( $content ) {
	$blocks                = parse_blocks( $content );
	$top_level_block_count = count( $blocks );
	$output                = '';

	/**
	 * Parsed blocks consist of a list of top-level blocks. Those top-level
	 * blocks may themselves contain nested inner blocks. However, every
	 * top-level block is rendered independently, meaning there are no data
	 * dependencies between them.
	 *
	 * Ideally, therefore, the parser would only need to parse one complete
	 * top-level block at a time, render it, and move on. Unfortunately, this
	 * is not possible with {@see \parse_blocks()} because it must parse the
	 * entire given document at once.
	 *
	 * While the current implementation prevents this optimization, it’s still
	 * possible to reduce the peak memory use when calls to `render_block()`
	 * on those top-level blocks are memory-heavy (which many of them are).
	 * By setting each parsed block to `NULL` after rendering it, any memory
	 * allocated during the render will be freed and reused for the next block.
	 * Before making this change, that memory was retained and would lead to
	 * out-of-memory crashes for certain posts that now run with this change.
	 */
	for ( $i = 0; $i < $top_level_block_count; $i++ ) {
		$output      .= render_block( $blocks[ $i ] );
		$blocks[ $i ] = null;
	}

	// If there are blocks in this content, we shouldn't run wpautop() on it later.
	$priority = has_filter( 'the_content', 'wpautop' );
	if ( false !== $priority && doing_filter( 'the_content' ) && has_blocks( $content ) ) {
		remove_filter( 'the_content', 'wpautop', $priority );
		add_filter( 'the_content', '_restore_wpautop_hook', $priority + 1 );
	}

	return $output;
}

/**
 * If do_blocks() needs to remove wpautop() from the `the_content` filter, this re-adds it afterwards,
 * for subsequent `the_content` usage.
 *
 * @since 5.0.0
 * @access private
 *
 * @param string $content The post content running through this filter.
 * @return string The unmodified content.
 */
function _restore_wpautop_hook( $content ) {
	$current_priority = has_filter( 'the_content', '_restore_wpautop_hook' );

	add_filter( 'the_content', 'wpautop', $current_priority - 1 );
	remove_filter( 'the_content', '_restore_wpautop_hook', $current_priority );

	return $content;
}

/**
 * Returns the current version of the block format that the content string is using.
 *
 * If the string doesn't contain blocks, it returns 0.
 *
 * @since 5.0.0
 *
 * @param string $content Content to test.
 * @return int The block format version is 1 if the content contains one or more blocks, 0 otherwise.
 */
function block_version( $content ) {
	return has_blocks( $content ) ? 1 : 0;
}

/**
 * Registers a new block style.
 *
 * @since 5.3.0
 * @since 6.6.0 Added support for registering styles for multiple block types.
 *
 * @link https://developer.wordpress.org/block-editor/reference-guides/block-api/block-styles/
 *
 * @param string|string[] $block_name       Block type name including namespace or array of namespaced block type names.
 * @param array           $style_properties Array containing the properties of the style name, label,
 *                                          style_handle (name of the stylesheet to be enqueued),
 *                                          inline_style (string containing the CSS to be added),
 *                                          style_data (theme.json-like array to generate CSS from).
 *                                          See WP_Block_Styles_Registry::register().
 * @return bool True if the block style was registered with success and false otherwise.
 */
function register_block_style( $block_name, $style_properties ) {
	return WP_Block_Styles_Registry::get_instance()->register( $block_name, $style_properties );
}

/**
 * Unregisters a block style.
 *
 * @since 5.3.0
 *
 * @param string $block_name       Block type name including namespace.
 * @param string $block_style_name Block style name.
 * @return bool True if the block style was unregistered with success and false otherwise.
 */
function unregister_block_style( $block_name, $block_style_name ) {
	return WP_Block_Styles_Registry::get_instance()->unregister( $block_name, $block_style_name );
}

/**
 * Checks whether the current block type supports the feature requested.
 *
 * @since 5.8.0
 * @since 6.4.0 The `$feature` parameter now supports a string.
 *
 * @param WP_Block_Type $block_type    Block type to check for support.
 * @param string|array  $feature       Feature slug, or path to a specific feature to check support for.
 * @param mixed         $default_value Optional. Fallback value for feature support. Default false.
 * @return bool Whether the feature is supported.
 */
function block_has_support( $block_type, $feature, $default_value = false ) {
	$block_support = $default_value;
	if ( $block_type instanceof WP_Block_Type ) {
		if ( is_array( $feature ) && count( $feature ) === 1 ) {
			$feature = $feature[0];
		}

		if ( is_array( $feature ) ) {
			$block_support = _wp_array_get( $block_type->supports, $feature, $default_value );
		} elseif ( isset( $block_type->supports[ $feature ] ) ) {
			$block_support = $block_type->supports[ $feature ];
		}
	}

	return true === $block_support || is_array( $block_support );
}

/**
 * Converts typography keys declared under `supports.*` to `supports.typography.*`.
 *
 * Displays a `_doing_it_wrong()` notice when a block using the older format is detected.
 *
 * @since 5.8.0
 *
 * @param array $metadata Metadata for registering a block type.
 * @return array Filtered metadata for registering a block type.
 */
function wp_migrate_old_typography_shape( $metadata ) {
	if ( ! isset( $metadata['supports'] ) ) {
		return $metadata;
	}

	$typography_keys = array(
		'__experimentalFontFamily',
		'__experimentalFontStyle',
		'__experimentalFontWeight',
		'__experimentalLetterSpacing',
		'__experimentalTextDecoration',
		'__experimentalTextTransform',
		'fontSize',
		'lineHeight',
	);

	foreach ( $typography_keys as $typography_key ) {
		$support_for_key = isset( $metadata['supports'][ $typography_key ] ) ? $metadata['supports'][ $typography_key ] : null;

		if ( null !== $support_for_key ) {
			_doing_it_wrong(
				'register_block_type_from_metadata()',
				sprintf(
					/* translators: 1: Block type, 2: Typography supports key, e.g: fontSize, lineHeight, etc. 3: block.json, 4: Old metadata key, 5: New metadata key. */
					__( 'Block "%1$s" is declaring %2$s support in %3$s file under %4$s. %2$s support is now declared under %5$s.' ),
					$metadata['name'],
					"<code>$typography_key</code>",
					'<code>block.json</code>',
					"<code>supports.$typography_key</code>",
					"<code>supports.typography.$typography_key</code>"
				),
				'5.8.0'
			);

			_wp_array_set( $metadata['supports'], array( 'typography', $typography_key ), $support_for_key );
			unset( $metadata['supports'][ $typography_key ] );
		}
	}

	return $metadata;
}

/**
 * Helper function that constructs a WP_Query args array from
 * a `Query` block properties.
 *
 * It's used in Query Loop, Query Pagination Numbers and Query Pagination Next blocks.
 *
 * @since 5.8.0
 * @since 6.1.0 Added `query_loop_block_query_vars` filter and `parents` support in query.
 * @since 6.7.0 Added support for the `format` property in query.
 *
 * @param WP_Block $block Block instance.
 * @param int      $page  Current query's page.
 *
 * @return array Returns the constructed WP_Query arguments.
 */
function build_query_vars_from_query_block( $block, $page ) {
	$query = array(
		'post_type'    => 'post',
		'order'        => 'DESC',
		'orderby'      => 'date',
		'post__not_in' => array(),
		'tax_query'    => array(),
	);

	if ( isset( $block->context['query'] ) ) {
		if ( ! empty( $block->context['query']['postType'] ) ) {
			$post_type_param = $block->context['query']['postType'];
			if ( is_post_type_viewable( $post_type_param ) ) {
				$query['post_type'] = $post_type_param;
			}
		}
		if ( isset( $block->context['query']['sticky'] ) && ! empty( $block->context['query']['sticky'] ) ) {
			$sticky = get_option( 'sticky_posts' );
			if ( 'only' === $block->context['query']['sticky'] ) {
				/*
				 * Passing an empty array to post__in will return have_posts() as true (and all posts will be returned).
				 * Logic should be used before hand to determine if WP_Query should be used in the event that the array
				 * being passed to post__in is empty.
				 *
				 * @see https://core.trac.wordpress.org/ticket/28099
				 */
				$query['post__in']            = ! empty( $sticky ) ? $sticky : array( 0 );
				$query['ignore_sticky_posts'] = 1;
			} elseif ( 'exclude' === $block->context['query']['sticky'] ) {
				$query['post__not_in'] = array_merge( $query['post__not_in'], $sticky );
			} elseif ( 'ignore' === $block->context['query']['sticky'] ) {
				$query['ignore_sticky_posts'] = 1;
			}
		}
		if ( ! empty( $block->context['query']['exclude'] ) ) {
			$excluded_post_ids     = array_map( 'intval', $block->context['query']['exclude'] );
			$excluded_post_ids     = array_filter( $excluded_post_ids );
			$query['post__not_in'] = array_merge( $query['post__not_in'], $excluded_post_ids );
		}
		if (
			isset( $block->context['query']['perPage'] ) &&
			is_numeric( $block->context['query']['perPage'] )
		) {
			$per_page = absint( $block->context['query']['perPage'] );
			$offset   = 0;

			if (
				isset( $block->context['query']['offset'] ) &&
				is_numeric( $block->context['query']['offset'] )
			) {
				$offset = absint( $block->context['query']['offset'] );
			}

			$query['offset']         = ( $per_page * ( $page - 1 ) ) + $offset;
			$query['posts_per_page'] = $per_page;
		}
		// Migrate `categoryIds` and `tagIds` to `tax_query` for backwards compatibility.
		if ( ! empty( $block->context['query']['categoryIds'] ) || ! empty( $block->context['query']['tagIds'] ) ) {
			$tax_query_back_compat = array();
			if ( ! empty( $block->context['query']['categoryIds'] ) ) {
				$tax_query_back_compat[] = array(
					'taxonomy'         => 'category',
					'terms'            => array_filter( array_map( 'intval', $block->context['query']['categoryIds'] ) ),
					'include_children' => false,
				);
			}
			if ( ! empty( $block->context['query']['tagIds'] ) ) {
				$tax_query_back_compat[] = array(
					'taxonomy'         => 'post_tag',
					'terms'            => array_filter( array_map( 'intval', $block->context['query']['tagIds'] ) ),
					'include_children' => false,
				);
			}
			$query['tax_query'] = array_merge( $query['tax_query'], $tax_query_back_compat );
		}
		if ( ! empty( $block->context['query']['taxQuery'] ) ) {
			$tax_query = array();
			foreach ( $block->context['query']['taxQuery'] as $taxonomy => $terms ) {
				if ( is_taxonomy_viewable( $taxonomy ) && ! empty( $terms ) ) {
					$tax_query[] = array(
						'taxonomy'         => $taxonomy,
						'terms'            => array_filter( array_map( 'intval', $terms ) ),
						'include_children' => false,
					);
				}
			}
			$query['tax_query'] = array_merge( $query['tax_query'], $tax_query );
		}
		if ( ! empty( $block->context['query']['format'] ) && is_array( $block->context['query']['format'] ) ) {
			$formats = $block->context['query']['format'];
			/*
			 * Validate that the format is either `standard` or a supported post format.
			 * - First, add `standard` to the array of valid formats.
			 * - Then, remove any invalid formats.
			 */
			$valid_formats = array_merge( array( 'standard' ), get_post_format_slugs() );
			$formats       = array_intersect( $formats, $valid_formats );

			/*
			 * The relation needs to be set to `OR` since the request can contain
			 * two separate conditions. The user may be querying for items that have
			 * either the `standard` format or a specific format.
			 */
			$formats_query = array( 'relation' => 'OR' );

			/*
			 * The default post format, `standard`, is not stored in the database.
			 * If `standard` is part of the request, the query needs to exclude all post items that
			 * have a format assigned.
			 */
			if ( in_array( 'standard', $formats, true ) ) {
				$formats_query[] = array(
					'taxonomy' => 'post_format',
					'field'    => 'slug',
					'operator' => 'NOT EXISTS',
				);
				// Remove the `standard` format, since it cannot be queried.
				unset( $formats[ array_search( 'standard', $formats, true ) ] );
			}
			// Add any remaining formats to the formats query.
			if ( ! empty( $formats ) ) {
				// Add the `post-format-` prefix.
				$terms           = array_map(
					static function ( $format ) {
						return "post-format-$format";
					},
					$formats
				);
				$formats_query[] = array(
					'taxonomy' => 'post_format',
					'field'    => 'slug',
					'terms'    => $terms,
					'operator' => 'IN',
				);
			}

			/*
			 * Add `$formats_query` to `$query`, as long as it contains more than one key:
			 * If `$formats_query` only contains the initial `relation` key, there are no valid formats to query,
			 * and the query should not be modified.
			 */
			if ( count( $formats_query ) > 1 ) {
				// Enable filtering by both post formats and other taxonomies by combining them with `AND`.
				if ( empty( $query['tax_query'] ) ) {
					$query['tax_query'] = $formats_query;
				} else {
					$query['tax_query'] = array(
						'relation' => 'AND',
						$query['tax_query'],
						$formats_query,
					);
				}
			}
		}

		if (
			isset( $block->context['query']['order'] ) &&
				in_array( strtoupper( $block->context['query']['order'] ), array( 'ASC', 'DESC' ), true )
		) {
			$query['order'] = strtoupper( $block->context['query']['order'] );
		}
		if ( isset( $block->context['query']['orderBy'] ) ) {
			$query['orderby'] = $block->context['query']['orderBy'];
		}
		if (
			isset( $block->context['query']['author'] )
		) {
			if ( is_array( $block->context['query']['author'] ) ) {
				$query['author__in'] = array_filter( array_map( 'intval', $block->context['query']['author'] ) );
			} elseif ( is_string( $block->context['query']['author'] ) ) {
				$query['author__in'] = array_filter( array_map( 'intval', explode( ',', $block->context['query']['author'] ) ) );
			} elseif ( is_int( $block->context['query']['author'] ) && $block->context['query']['author'] > 0 ) {
				$query['author'] = $block->context['query']['author'];
			}
		}
		if ( ! empty( $block->context['query']['search'] ) ) {
			$query['s'] = $block->context['query']['search'];
		}
		if ( ! empty( $block->context['query']['parents'] ) && is_post_type_hierarchical( $query['post_type'] ) ) {
			$query['post_parent__in'] = array_unique( array_map( 'intval', $block->context['query']['parents'] ) );
		}
	}

	/**
	 * Filters the arguments which will be passed to `WP_Query` for the Query Loop Block.
	 *
	 * Anything to this filter should be compatible with the `WP_Query` API to form
	 * the query context which will be passed down to the Query Loop Block's children.
	 * This can help, for example, to include additional settings or meta queries not
	 * directly supported by the core Query Loop Block, and extend its capabilities.
	 *
	 * Please note that this will only influence the query that will be rendered on the
	 * front-end. The editor preview is not affected by this filter. Also, worth noting
	 * that the editor preview uses the REST API, so, ideally, one should aim to provide
	 * attributes which are also compatible with the REST API, in order to be able to
	 * implement identical queries on both sides.
	 *
	 * @since 6.1.0
	 *
	 * @param array    $query Array containing parameters for `WP_Query` as parsed by the block context.
	 * @param WP_Block $block Block instance.
	 * @param int      $page  Current query's page.
	 */
	return apply_filters( 'query_loop_block_query_vars', $query, $block, $page );
}

/**
 * Helper function that returns the proper pagination arrow HTML for
 * `QueryPaginationNext` and `QueryPaginationPrevious` blocks based
 * on the provided `paginationArrow` from `QueryPagination` context.
 *
 * It's used in QueryPaginationNext and QueryPaginationPrevious blocks.
 *
 * @since 5.9.0
 *
 * @param WP_Block $block   Block instance.
 * @param bool     $is_next Flag for handling `next/previous` blocks.
 * @return string|null The pagination arrow HTML or null if there is none.
 */
function get_query_pagination_arrow( $block, $is_next ) {
	$arrow_map = array(
		'none'    => '',
		'arrow'   => array(
			'next'     => '→',
			'previous' => '←',
		),
		'chevron' => array(
			'next'     => '»',
			'previous' => '«',
		),
	);
	if ( ! empty( $block->context['paginationArrow'] ) && array_key_exists( $block->context['paginationArrow'], $arrow_map ) && ! empty( $arrow_map[ $block->context['paginationArrow'] ] ) ) {
		$pagination_type = $is_next ? 'next' : 'previous';
		$arrow_attribute = $block->context['paginationArrow'];
		$arrow           = $arrow_map[ $block->context['paginationArrow'] ][ $pagination_type ];
		$arrow_classes   = "wp-block-query-pagination-$pagination_type-arrow is-arrow-$arrow_attribute";
		return "<span class='$arrow_classes' aria-hidden='true'>$arrow</span>";
	}
	return null;
}

/**
 * Helper function that constructs a comment query vars array from the passed
 * block properties.
 *
 * It's used with the Comment Query Loop inner blocks.
 *
 * @since 6.0.0
 *
 * @param WP_Block $block Block instance.
 * @return array Returns the comment query parameters to use with the
 *               WP_Comment_Query constructor.
 */
function build_comment_query_vars_from_block( $block ) {

	$comment_args = array(
		'orderby'       => 'comment_date_gmt',
		'order'         => 'ASC',
		'status'        => 'approve',
		'no_found_rows' => false,
	);

	if ( is_user_logged_in() ) {
		$comment_args['include_unapproved'] = array( get_current_user_id() );
	} else {
		$unapproved_email = wp_get_unapproved_comment_author_email();

		if ( $unapproved_email ) {
			$comment_args['include_unapproved'] = array( $unapproved_email );
		}
	}

	if ( ! empty( $block->context['postId'] ) ) {
		$comment_args['post_id'] = (int) $block->context['postId'];
	}

	if ( get_option( 'thread_comments' ) ) {
		$comment_args['hierarchical'] = 'threaded';
	} else {
		$comment_args['hierarchical'] = false;
	}

	if ( get_option( 'page_comments' ) === '1' || get_option( 'page_comments' ) === true ) {
		$per_page     = get_option( 'comments_per_page' );
		$default_page = get_option( 'default_comments_page' );
		if ( $per_page > 0 ) {
			$comment_args['number'] = $per_page;

			$page = (int) get_query_var( 'cpage' );
			if ( $page ) {
				$comment_args['paged'] = $page;
			} elseif ( 'oldest' === $default_page ) {
				$comment_args['paged'] = 1;
			} elseif ( 'newest' === $default_page ) {
				$max_num_pages = (int) ( new WP_Comment_Query( $comment_args ) )->max_num_pages;
				if ( 0 !== $max_num_pages ) {
					$comment_args['paged'] = $max_num_pages;
				}
			}
		}
	}

	return $comment_args;
}

/**
 * Helper function that returns the proper pagination arrow HTML for
 * `CommentsPaginationNext` and `CommentsPaginationPrevious` blocks based on the
 * provided `paginationArrow` from `CommentsPagination` context.
 *
 * It's used in CommentsPaginationNext and CommentsPaginationPrevious blocks.
 *
 * @since 6.0.0
 *
 * @param WP_Block $block           Block instance.
 * @param string   $pagination_type Optional. Type of the arrow we will be rendering.
 *                                  Accepts 'next' or 'previous'. Default 'next'.
 * @return string|null The pagination arrow HTML or null if there is none.
 */
function get_comments_pagination_arrow( $block, $pagination_type = 'next' ) {
	$arrow_map = array(
		'none'    => '',
		'arrow'   => array(
			'next'     => '→',
			'previous' => '←',
		),
		'chevron' => array(
			'next'     => '»',
			'previous' => '«',
		),
	);
	if ( ! empty( $block->context['comments/paginationArrow'] ) && ! empty( $arrow_map[ $block->context['comments/paginationArrow'] ][ $pagination_type ] ) ) {
		$arrow_attribute = $block->context['comments/paginationArrow'];
		$arrow           = $arrow_map[ $block->context['comments/paginationArrow'] ][ $pagination_type ];
		$arrow_classes   = "wp-block-comments-pagination-$pagination_type-arrow is-arrow-$arrow_attribute";
		return "<span class='$arrow_classes' aria-hidden='true'>$arrow</span>";
	}
	return null;
}

/**
 * Strips all HTML from the content of footnotes, and sanitizes the ID.
 *
 * This function expects slashed data on the footnotes content.
 *
 * @access private
 * @since 6.3.2
 *
 * @param string $footnotes JSON-encoded string of an array containing the content and ID of each footnote.
 * @return string Filtered content without any HTML on the footnote content and with the sanitized ID.
 */
function _wp_filter_post_meta_footnotes( $footnotes ) {
	$footnotes_decoded = json_decode( $footnotes, true );
	if ( ! is_array( $footnotes_decoded ) ) {
		return '';
	}
	$footnotes_sanitized = array();
	foreach ( $footnotes_decoded as $footnote ) {
		if ( ! empty( $footnote['content'] ) && ! empty( $footnote['id'] ) ) {
			$footnotes_sanitized[] = array(
				'id'      => sanitize_key( $footnote['id'] ),
				'content' => wp_unslash( wp_filter_post_kses( wp_slash( $footnote['content'] ) ) ),
			);
		}
	}
	return wp_json_encode( $footnotes_sanitized );
}

/**
 * Adds the filters for footnotes meta field.
 *
 * @access private
 * @since 6.3.2
 */
function _wp_footnotes_kses_init_filters() {
	add_filter( 'sanitize_post_meta_footnotes', '_wp_filter_post_meta_footnotes' );
}

/**
 * Removes the filters for footnotes meta field.
 *
 * @access private
 * @since 6.3.2
 */
function _wp_footnotes_remove_filters() {
	remove_filter( 'sanitize_post_meta_footnotes', '_wp_filter_post_meta_footnotes' );
}

/**
 * Registers the filter of footnotes meta field if the user does not have `unfiltered_html` capability.
 *
 * @access private
 * @since 6.3.2
 */
function _wp_footnotes_kses_init() {
	_wp_footnotes_remove_filters();
	if ( ! current_user_can( 'unfiltered_html' ) ) {
		_wp_footnotes_kses_init_filters();
	}
}

/**
 * Initializes the filters for footnotes meta field when imported data should be filtered.
 *
 * This filter is the last one being executed on {@see 'force_filtered_html_on_import'}.
 * If the input of the filter is true, it means we are in an import situation and should
 * enable kses, independently of the user capabilities. So in that case we call
 * _wp_footnotes_kses_init_filters().
 *
 * @access private
 * @since 6.3.2
 *
 * @param string $arg Input argument of the filter.
 * @return string Input argument of the filter.
 */
function _wp_footnotes_force_filtered_html_on_import_filter( $arg ) {
	// If `force_filtered_html_on_import` is true, we need to init the global styles kses filters.
	if ( $arg ) {
		_wp_footnotes_kses_init_filters();
	}
	return $arg;
}

```

### [gutenberg] packages/blocks/src/api/registration.ts
```typescript
/**
 * WordPress dependencies
 */
import { select, dispatch } from '@wordpress/data';
import { _x } from '@wordpress/i18n';
import warning from '@wordpress/warning';

/**
 * Internal dependencies
 */
import i18nBlockSchema from './i18n-block.json';
import { store as blocksStore } from '../store';
import { unlock } from '../lock-unlock';
import type {
	BlockType,
	Block,
	BlockVariation,
	BlockVariationScope,
	BlockStyle,
	BlockBindingsSource,
	Icon,
	BlockConfiguration,
} from '../types';

function isObject( object: unknown ): object is Record< string, unknown > {
	return object !== null && typeof object === 'object';
}

/**
 * Sets the server side block definition of blocks.
 *
 * Ignored from documentation due to being marked as unstable.
 *
 * @ignore
 *
 * @param definitions Server-side block definitions
 */
// eslint-disable-next-line camelcase
export function unstable__bootstrapServerSideBlockDefinitions(
	definitions: Record< string, Record< string, unknown > >
): void {
	const { addBootstrappedBlockType } = unlock( dispatch( blocksStore ) );
	for ( const [ name, blockType ] of Object.entries( definitions ) ) {
		addBootstrappedBlockType( name, blockType );
	}
}

/**
 * Gets block settings from metadata loaded from `block.json` file
 *
 * @param metadata            Block metadata loaded from `block.json`.
 * @param metadata.textdomain Textdomain to use with translations.
 *
 * @return Block settings.
 */
function getBlockSettingsFromMetadata( {
	textdomain,
	...metadata
}: Record< string, unknown > & { textdomain?: string } ) {
	const allowedFields = [
		'apiVersion',
		'title',
		'category',
		'parent',
		'ancestor',
		'icon',
		'description',
		'keywords',
		'attributes',
		'providesContext',
		'usesContext',
		'selectors',
		'supports',
		'styles',
		'example',
		'variations',
		'blockHooks',
		'allowedBlocks',
	];

	const settings = Object.fromEntries(
		Object.entries( metadata ).filter( ( [ key ] ) =>
			allowedFields.includes( key )
		)
	);

	if ( textdomain ) {
		Object.keys( i18nBlockSchema ).forEach( ( key ) => {
			if ( ! settings[ key ] ) {
				return;
			}
			settings[ key ] = translateBlockSettingUsingI18nSchema(
				( i18nBlockSchema as Record< string, unknown > )[ key ],
				settings[ key ],
				textdomain
			);
		} );
	}

	return settings;
}

/**
 * Registers a new block provided a unique name and an object defining its
 * behavior. Once registered, the block is made available as an option to any
 * editor interface where blocks are implemented.
 *
 * For more in-depth information on registering a custom block see the
 * [Create a block tutorial](https://developer.wordpress.org/block-editor/getting-started/create-block/).
 *
 * @param blockNameOrMetadata Block type name or its metadata.
 * @param settings            Block settings.
 *
 * @example
 * ```js
 * import { __ } from '@wordpress/i18n';
 * import { registerBlockType } from '@wordpress/blocks'
 *
 * registerBlockType( 'namespace/block-name', {
 *     title: __( 'My First Block' ),
 *     edit: () => <div>{ __( 'Hello from the editor!' ) }</div>,
 *     save: () => <div>Hello from the saved content!</div>,
 * } );
 * ```
 *
 * @return The block, if it has been successfully registered;
 *         otherwise `undefined`.
 */
export function registerBlockType<
	Attributes extends Record< string, unknown > = Record< string, unknown >,
>(
	blockNameOrMetadata: BlockConfiguration< Attributes >,
	settings?: Partial< BlockConfiguration< Attributes > >
): BlockType | undefined;
export function registerBlockType<
	Attributes extends Record< string, unknown > = Record< string, unknown >,
>(
	blockNameOrMetadata: string,
	settings: BlockConfiguration< Attributes >
): BlockType | undefined;
export function registerBlockType<
	Attributes extends Record< string, unknown > = Record< string, unknown >,
>(
	blockNameOrMetadata: string | BlockConfiguration< Attributes >,
	settings?: Partial< BlockConfiguration< Attributes > >
): BlockType | undefined {
	const name = isObject( blockNameOrMetadata )
		? blockNameOrMetadata.name
		: blockNameOrMetadata;

	if ( typeof name !== 'string' ) {
		warning( 'Block names must be strings.' );
		return;
	}

	if ( ! /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test( name ) ) {
		warning(
			'Block names must contain a namespace prefix, include only lowercase alphanumeric characters or dashes, and start with a letter. Example: my-plugin/my-custom-block'
		);
		return;
	}
	if ( select( blocksStore ).getBlockType( name ) ) {
		warning( 'Block "' + name + '" is already registered.' );
		return;
	}

	const { addBootstrappedBlockType, addUnprocessedBlockType } = unlock(
		dispatch( blocksStore )
	);

	if ( isObject( blockNameOrMetadata ) ) {
		const metadata = getBlockSettingsFromMetadata( blockNameOrMetadata );
		addBootstrappedBlockType( name, metadata );
	}

	addUnprocessedBlockType( name, settings );

	return select( blocksStore ).getBlockType( name );
}

/**
 * Translates block settings provided with metadata using the i18n schema.
 *
 * @param i18nSchema   I18n schema for the block setting.
 * @param settingValue Value for the block setting.
 * @param textdomain   Textdomain to use with translations.
 *
 * @return Translated setting.
 */
function translateBlockSettingUsingI18nSchema(
	i18nSchema: unknown,
	settingValue: unknown,
	textdomain: string
): unknown {
	if ( typeof i18nSchema === 'string' && typeof settingValue === 'string' ) {
		// eslint-disable-next-line @wordpress/i18n-no-variables, @wordpress/i18n-text-domain
		return _x( settingValue, i18nSchema, textdomain );
	}
	if (
		Array.isArray( i18nSchema ) &&
		i18nSchema.length &&
		Array.isArray( settingValue )
	) {
		return settingValue.map( ( value ) =>
			translateBlockSettingUsingI18nSchema(
				i18nSchema[ 0 ],
				value,
				textdomain
			)
		);
	}
	if (
		isObject( i18nSchema ) &&
		Object.entries( i18nSchema ).length &&
		isObject( settingValue )
	) {
		return Object.keys( settingValue ).reduce(
			( accumulator: Record< string, unknown >, key ) => {
				if ( ! ( i18nSchema as Record< string, unknown > )[ key ] ) {
					accumulator[ key ] = settingValue[ key ];
					return accumulator;
				}
				accumulator[ key ] = translateBlockSettingUsingI18nSchema(
					( i18nSchema as Record< string, unknown > )[ key ],
					settingValue[ key ],
					textdomain
				);
				return accumulator;
			},
			{}
		);
	}
	return settingValue;
}

/**
 * Registers a new block collection to group blocks in the same namespace in the inserter.
 *
 * @param namespace      The namespace to group blocks by in the inserter; corresponds to the block namespace.
 * @param settings       The block collection settings.
 * @param settings.title The title to display in the block inserter.
 * @param settings.icon  The icon to display in the block inserter.
 *
 * @example
 * ```js
 * import { __ } from '@wordpress/i18n';
 * import { registerBlockCollection, registerBlockType } from '@wordpress/blocks';
 *
 * // Register the collection.
 * registerBlockCollection( 'my-collection', {
 *     title: __( 'Custom Collection' ),
 * } );
 *
 * // Register a block in the same namespace to add it to the collection.
 * registerBlockType( 'my-collection/block-name', {
 *     title: __( 'My First Block' ),
 *     edit: () => <div>{ __( 'Hello from the editor!' ) }</div>,
 *     save: () => <div>'Hello from the saved content!</div>,
 * } );
 * ```
 */
export function registerBlockCollection(
	namespace: string,
	{ title, icon }: { title: string; icon?: Icon }
): void {
	dispatch( blocksStore ).addBlockCollection( namespace, title, icon );
}

/**
 * Unregisters a block collection
 *
 * @param namespace The namespace to group blocks by in the inserter; corresponds to the block namespace
 *
 * @example
 * ```js
 * import { unregisterBlockCollection } from '@wordpress/blocks';
 *
 * unregisterBlockCollection( 'my-collection' );
 * ```
 */
export function unregisterBlockCollection( namespace: string ): void {
	dispatch( blocksStore ).removeBlockCollection( namespace );
}

/**
 * Unregisters a block.
 *
 * @param name Block name.
 *
 * @example
 * ```js
 * import { __ } from '@wordpress/i18n';
 * import { unregisterBlockType } from '@wordpress/blocks';
 *
 * const ExampleComponent = () => {
 *     return (
 *         <Button
 *             onClick={ () =>
 *                 unregisterBlockType( 'my-collection/block-name' )
 *             }
 *         >
 *             { __( 'Unregister my custom block.' ) }
 *         </Button>
 *     );
 * };
 * ```
 *
 * @return The previous block value, if it has been successfully
 *         unregistered; otherwise `undefined`.
 */
export function unregisterBlockType( name: string ): BlockType | undefined {
	const oldBlock = select( blocksStore ).getBlockType( name );
	if ( ! oldBlock ) {
		warning( 'Block "' + name + '" is not registered.' );
		return;
	}
	dispatch( blocksStore ).removeBlockTypes( name );
	return oldBlock;
}

/**
 * Assigns name of block for handling non-block content.
 *
 * @param blockName Block name.
 */
export function setFreeformContentHandlerName( blockName: string ): void {
	dispatch( blocksStore ).setFreeformFallbackBlockName( blockName );
}

/**
 * Retrieves name of block handling non-block content, or undefined if no
 * handler has been defined.
 *
 * @return Block name.
 */
export function getFreeformContentHandlerName(): string | null {
	return select( blocksStore ).getFreeformFallbackBlockName();
}

/**
 * Retrieves name of block used for handling grouping interactions.
 *
 * @return Block name.
 */
export function getGroupingBlockName(): string | null {
	return select( blocksStore ).getGroupingBlockName();
}

/**
 * Assigns name of block handling unregistered block types.
 *
 * @param blockName Block name.
 */
export function setUnregisteredTypeHandlerName( blockName: string ): void {
	dispatch( blocksStore ).setUnregisteredFallbackBlockName( blockName );
}

/**
 * Retrieves name of block handling unregistered block types, or undefined if no
 * handler has been defined.
 *
 * @return Block name.
 */
export function getUnregisteredTypeHandlerName(): string | null {
	return select( blocksStore ).getUnregisteredFallbackBlockName();
}

/**
 * Assigns the default block name.
 *
 * @param name Block name.
 *
 * @example
 * ```js
 * import { setDefaultBlockName } from '@wordpress/blocks';
 *
 * const ExampleComponent = () => {
 *
 *     return (
 *         <Button onClick={ () => setDefaultBlockName( 'core/heading' ) }>
 *             { __( 'Set the default block to Heading' ) }
 *         </Button>
 *     );
 * };
 * ```
 */
export function setDefaultBlockName( name: string ): void {
	dispatch( blocksStore ).setDefaultBlockName( name );
}

/**
 * Assigns name of block for handling block grouping interactions.
 *
 * This function lets you select a different block to group other blocks in instead of the
 * default `core/group` block. This function must be used in a component or when the DOM is fully
 * loaded. See https://developer.wordpress.org/block-editor/reference-guides/packages/packages-dom-ready/
 *
 * @param name Block name.
 *
 * @example
 * ```js
 * import { setGroupingBlockName } from '@wordpress/blocks';
 *
 * const ExampleComponent = () => {
 *
 *     return (
 *         <Button onClick={ () => setGroupingBlockName( 'core/columns' ) }>
 *             { __( 'Wrap in columns' ) }
 *         </Button>
 *     );
 * };
 * ```
 */
export function setGroupingBlockName( name: string ): void {
	dispatch( blocksStore ).setGroupingBlockName( name );
}

/**
 * Retrieves the default block name.
 *
 * @return Block name.
 */
export function getDefaultBlockName(): string | null {
	return select( blocksStore ).getDefaultBlockName();
}

/**
 * Returns a registered block type.
 *
 * @param name Block name.
 *
 * @return Block type.
 */
export function getBlockType( name: string ): BlockType | undefined {
	return select( blocksStore )?.getBlockType( name );
}

/**
 * Returns all registered blocks.
 *
 * @return Block settings.
 */
export function getBlockTypes(): BlockType[] {
	return select( blocksStore ).getBlockTypes();
}

/**
 * Returns the block support value for a feature, if defined.
 *
 * @param nameOrType      Block name or type object
 * @param feature         Feature to retrieve
 * @param defaultSupports Default value to return if not
 *                        explicitly defined
 *
 * @return Block support value
 */
export function getBlockSupport(
	nameOrType: string | BlockType,
	feature: string,
	defaultSupports?: unknown
): unknown {
	return select( blocksStore ).getBlockSupport(
		nameOrType,
		feature,
		defaultSupports
	);
}

/**
 * Returns true if the block defines support for a feature, or false otherwise.
 *
 * @param nameOrType      Block name or type object.
 * @param feature         Feature to test.
 * @param defaultSupports Whether feature is supported by
 *                        default if not explicitly defined.
 *
 * @return Whether block supports feature.
 */
export function hasBlockSupport(
	nameOrType: string | BlockType,
	feature: string,
	defaultSupports?: boolean
): boolean {
	return select( blocksStore ).hasBlockSupport(
		nameOrType,
		feature,
		defaultSupports
	);
}

/**
 * Determines whether or not the given block is a reusable block. This is a
 * special block type that is used to point to a global block stored via the
 * API.
 *
 * @param blockOrType Block or Block Type to test.
 *
 * @return Whether the given block is a reusable block.
 */
export function isReusableBlock(
	blockOrType: Block | BlockType | null | undefined
): boolean {
	return blockOrType?.name === 'core/block';
}

/**
 * Determines whether or not the given block is a template part. This is a
 * special block type that allows composing a page template out of reusable
 * design elements.
 *
 * @param blockOrType Block or Block Type to test.
 *
 * @return Whether the given block is a template part.
 */
export function isTemplatePart(
	blockOrType: Block | BlockType | null | undefined
): boolean {
	return blockOrType?.name === 'core/template-part';
}

/**
 * Returns an array with the child blocks of a given block.
 *
 * @param blockName Name of block (example: “latest-posts”).
 *
 * @return Array of child block names.
 */
export const getChildBlockNames = ( blockName: string ): string[] => {
	return select( blocksStore ).getChildBlockNames( blockName );
};

/**
 * Returns a boolean indicating if a block has child blocks or not.
 *
 * @param blockName Name of block (example: “latest-posts”).
 *
 * @return True if a block contains child blocks and false otherwise.
 */
export const hasChildBlocks = ( blockName: string ): boolean => {
	return select( blocksStore ).hasChildBlocks( blockName );
};

/**
 * Returns a boolean indicating if a block has at least one child block with inserter support.
 *
 * @param blockName Block type name.
 *
 * @return True if a block contains at least one child blocks with inserter support
 *         and false otherwise.
 */
export const hasChildBlocksWithInserterSupport = (
	blockName: string
): boolean => {
	return select( blocksStore ).hasChildBlocksWithInserterSupport( blockName );
};

/**
 * Registers a new block style for the given block types.
 *
 * For more information on connecting the styles with CSS
 * [the official documentation](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-styles/#styles).
 *
 * @param blockNames     Name of blocks e.g. “core/latest-posts” or `[“core/group”, “core/columns”]`.
 * @param styleVariation Object containing `name` which is the class name applied to the block and `label` which identifies the variation to the user.
 *
 * @example
 * ```js
 * import { __ } from '@wordpress/i18n';
 * import { registerBlockStyle } from '@wordpress/blocks';
 * import { Button } from '@wordpress/components';
 *
 *
 * const ExampleComponent = () => {
 *     return (
 *         <Button
 *             onClick={ () => {
 *                 registerBlockStyle( 'core/quote', {
 *                     name: 'fancy-quote',
 *                     label: __( 'Fancy Quote' ),
 *                 } );
 *             } }
 *         >
 *             { __( 'Add a new block style for core/quote' ) }
 *         </Button>
 *     );
 * };
 * ```
 */
export const registerBlockStyle = (
	blockNames: string | string[],
	styleVariation: BlockStyle | BlockStyle[]
): void => {
	dispatch( blocksStore ).addBlockStyles( blockNames, styleVariation );
};

/**
 * Unregisters a block style for the given block.
 *
 * @param blockName          Name of block (example: “core/latest-posts”).
 * @param styleVariationName Name of class applied to the block.
 *
 * @example
 * ```js
 * import { __ } from '@wordpress/i18n';
 * import { unregisterBlockStyle } from '@wordpress/blocks';
 * import { Button } from '@wordpress/components';
 *
 * const ExampleComponent = () => {
 *     return (
 *     <Button
 *         onClick={ () => {
 *             unregisterBlockStyle( 'core/quote', 'plain' );
 *         } }
 *     >
 *         { __( 'Remove the "Plain" block style for core/quote' ) }
 *     </Button>
 *     );
 * };
 * ```
 */
export const unregisterBlockStyle = (
	blockName: string,
	styleVariationName: string
): void => {
	dispatch( blocksStore ).removeBlockStyles( blockName, styleVariationName );
};

/**
 * Returns an array with the variations of a given block type.
 * Ignored from documentation as the recommended usage is via useSelect from @wordpress/data.
 *
 * @ignore
 *
 * @param blockName Name of block (example: “core/columns”).
 * @param scope     Block variation scope name.
 *
 * @return Block variations.
 */
export const getBlockVariations = (
	blockName: string,
	scope?: BlockVariationScope
): BlockVariation[] | void => {
	return select( blocksStore ).getBlockVariations( blockName, scope );
};

/**
 * Registers a new block variation for the given block type.
 *
 * For more information on block variations see
 * [the official documentation ](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-variations/).
 *
 * @param blockName Name of the block (example: “core/columns”).
 * @param variation Object describing a block variation.
 *
 * @example
 * ```js
 * import { __ } from '@wordpress/i18n';
 * import { registerBlockVariation } from '@wordpress/blocks';
 * import { Button } from '@wordpress/components';
 *
 * const ExampleComponent = () => {
 *     return (
 *         <Button
 *             onClick={ () => {
 *                 registerBlockVariation( 'core/embed', {
 *                     name: 'custom',
 *                     title: __( 'My Custom Embed' ),
 *                     attributes: { providerNameSlug: 'custom' },
 *                 } );
 *             } }
 *          >
 *              __( 'Add a custom variation for core/embed' ) }
 *         </Button>
 *     );
 * };
 * ```
 */
export const registerBlockVariation = (
	blockName: string,
	variation: BlockVariation | BlockVariation[]
): void => {
	if ( Array.isArray( variation ) ) {
		for ( const v of variation ) {
			if ( typeof v.name !== 'string' ) {
				warning( 'Variation names must be unique strings.' );
			}
		}
	} else if ( typeof variation.name !== 'string' ) {
		warning( 'Variation names must be unique strings.' );
	}

	dispatch( blocksStore ).addBlockVariations( blockName, variation );
};

/**
 * Unregisters a block variation defined for the given block type.
 *
 * @param blockName     Name of the block (example: “core/columns”).
 * @param variationName Name of the variation defined for the block.
 *
 * @example
 * ```js
 * import { __ } from '@wordpress/i18n';
 * import { unregisterBlockVariation } from '@wordpress/blocks';
 * import { Button } from '@wordpress/components';
 *
 * const ExampleComponent = () => {
 *     return (
 *         <Button
 *             onClick={ () => {
 *                 unregisterBlockVariation( 'core/embed', 'youtube' );
 *             } }
 *         >
 *             { __( 'Remove the YouTube variation from core/embed' ) }
 *         </Button>
 *     );
 * };
 * ```
 */
export const unregisterBlockVariation = (
	blockName: string,
	variationName: string | string[]
): void => {
	dispatch( blocksStore ).removeBlockVariations( blockName, variationName );
};

/**
 * Registers a new block bindings source with an object defining its
 * behavior. Once registered, the source is available to be connected
 * to the supported block attributes.
 *
 * @since 6.7.0 Introduced in WordPress core.
 *
 * @param source Object describing a block bindings source.
 *
 * @example
 * ```js
 * import { _x } from '@wordpress/i18n';
 * import { registerBlockBindingsSource } from '@wordpress/blocks'
 *
 * registerBlockBindingsSource( {
 *     name: 'plugin/my-custom-source',
 *     label: _x( 'My Custom Source', 'block bindings source' ),
 *     usesContext: [ 'postType' ],
 *     getValues: getSourceValues,
 *     setValues: updateMyCustomValuesInBatch,
 *     canUserEditValue: () => true,
 * } );
 * ```
 */
export const registerBlockBindingsSource = (
	source: BlockBindingsSource
): void => {
	const {
		name,
		label,
		usesContext,
		getValues,
		setValues,
		canUserEditValue,
		getFieldsList,
	} = source;

	const existingSource = unlock(
		select( blocksStore )
	).getBlockBindingsSource( name );

	/*
	 * Check if the source has been already registered on the client.
	 * If any property expected to be "client-only" is defined, return a warning.
	 */
	const serverProps = [ 'label', 'usesContext' ];
	for ( const prop in existingSource ) {
		if ( ! serverProps.includes( prop ) && existingSource[ prop ] ) {
			warning(
				'Block bindings source "' + name + '" is already registered.'
			);
			return;
		}
	}

	// Check the `name` property is correct.
	if ( ! name ) {
		warning( 'Block bindings source must contain a name.' );
		return;
	}

	if ( typeof name !== 'string' ) {
		warning( 'Block bindings source name must be a string.' );
		return;
	}

	if ( /[A-Z]+/.test( name ) ) {
		warning(
			'Block bindings source name must not contain uppercase characters.'
		);
		return;
	}

	if ( ! /^[a-z0-9/-]+$/.test( name ) ) {
		warning(
			'Block bindings source name must contain only valid characters: lowercase characters, hyphens, or digits. Example: my-plugin/my-custom-source.'
		);
		return;
	}

	if ( ! /^[a-z0-9-]+\/[a-z0-9-]+$/.test( name ) ) {
		warning(
			'Block bindings source name must contain a namespace and valid characters. Example: my-plugin/my-custom-source.'
		);
		return;
	}

	// Check the `label` property is correct.

	if ( ! label && ! existingSource?.label ) {
		warning( 'Block bindings source must contain a label.' );
		return;
	}

	if ( label && typeof label !== 'string' ) {
		warning( 'Block bindings source label must be a string.' );
		return;
	}

	if ( label && existingSource?.label && label !== existingSource?.label ) {
		warning( 'Block bindings "' + name + '" source label was overridden.' );
	}

	// Check the `usesContext` property is correct.
	if ( usesContext && ! Array.isArray( usesContext ) ) {
		warning( 'Block bindings source usesContext must be an array.' );
		return;
	}

	// Check the `getValues` property is correct.
	if ( getValues && typeof getValues !== 'function' ) {
		warning( 'Block bindings source getValues must be a function.' );
		return;
	}

	// Check the `setValues` property is correct.
	if ( setValues && typeof setValues !== 'function' ) {
		warning( 'Block bindings source setValues must be a function.' );
		return;
	}

	// Check the `canUserEditValue` property is correct.
	if ( canUserEditValue && typeof canUserEditValue !== 'function' ) {
		warning( 'Block bindings source canUserEditValue must be a function.' );
		return;
	}

	// Check the `getFieldsList` property is correct.
	if ( getFieldsList && typeof getFieldsList !== 'function' ) {
		warning( 'Block bindings source getFieldsList must be a function.' );
		return;
	}

	return unlock( dispatch( blocksStore ) ).addBlockBindingsSource( source );
};

/**
 * Unregisters a block bindings source by providing its name.
 *
 * @since 6.7.0 Introduced in WordPress core.
 *
 * @param name The name of the block bindings source to unregister.
 *
 * @example
 * ```js
 * import { unregisterBlockBindingsSource } from '@wordpress/blocks';
 *
 * unregisterBlockBindingsSource( 'plugin/my-custom-source' );
 * ```
 */
export function unregisterBlockBindingsSource( name: string ): void {
	const oldSource = getBlockBindingsSource( name );
	if ( ! oldSource ) {
		warning( 'Block bindings source "' + name + '" is not registered.' );
		return;
	}
	unlock( dispatch( blocksStore ) ).removeBlockBindingsSource( name );
}

/**
 * Returns a registered block bindings source by its name.
 *
 * @since 6.7.0 Introduced in WordPress core.
 *
 * @param name Block bindings source name.
 *
 * @return Block bindings source.
 */
export function getBlockBindingsSource(
	name: string
): BlockBindingsSource | undefined {
	return unlock( select( blocksStore ) ).getBlockBindingsSource( name );
}

/**
 * Returns all registered block bindings sources.
 *
 * @since 6.7.0 Introduced in WordPress core.
 *
 * @return Block bindings sources.
 */
export function getBlockBindingsSources(): Record<
	string,
	BlockBindingsSource
> {
	return unlock( select( blocksStore ) ).getAllBlockBindingsSources();
}

```

### [wordpress-develop] src/wp-includes/class-wp-block.php
```php
<?php
/**
 * Blocks API: WP_Block class
 *
 * @package WordPress
 * @since 5.5.0
 */

/**
 * Class representing a parsed instance of a block.
 *
 * @since 5.5.0
 * @property array $attributes
 */
#[AllowDynamicProperties]
class WP_Block {

	/**
	 * Original parsed array representation of block.
	 *
	 * @since 5.5.0
	 * @var array
	 */
	public $parsed_block;

	/**
	 * Name of block.
	 *
	 * @example "core/paragraph"
	 *
	 * @since 5.5.0
	 * @var string|null
	 */
	public $name;

	/**
	 * Block type associated with the instance.
	 *
	 * @since 5.5.0
	 * @var WP_Block_Type
	 */
	public $block_type;

	/**
	 * Block context values.
	 *
	 * @since 5.5.0
	 * @var array
	 */
	public $context = array();

	/**
	 * All available context of the current hierarchy.
	 *
	 * @since 5.5.0
	 * @var array
	 */
	protected $available_context = array();

	/**
	 * Block type registry.
	 *
	 * @since 5.9.0
	 * @var WP_Block_Type_Registry
	 */
	protected $registry;

	/**
	 * List of inner blocks (of this same class)
	 *
	 * @since 5.5.0
	 * @var WP_Block_List
	 */
	public $inner_blocks = array();

	/**
	 * Resultant HTML from inside block comment delimiters after removing inner
	 * blocks.
	 *
	 * @example "...Just <!-- wp:test /--> testing..." -> "Just testing..."
	 *
	 * @since 5.5.0
	 * @var string
	 */
	public $inner_html = '';

	/**
	 * List of string fragments and null markers where inner blocks were found
	 *
	 * @example array(
	 *   'inner_html'    => 'BeforeInnerAfter',
	 *   'inner_blocks'  => array( block, block ),
	 *   'inner_content' => array( 'Before', null, 'Inner', null, 'After' ),
	 * )
	 *
	 * @since 5.5.0
	 * @var array
	 */
	public $inner_content = array();

	/**
	 * Constructor.
	 *
	 * Populates object properties from the provided block instance argument.
	 *
	 * The given array of context values will not necessarily be available on
	 * the instance itself, but is treated as the full set of values provided by
	 * the block's ancestry. This is assigned to the private `available_context`
	 * property. Only values which are configured to consumed by the block via
	 * its registered type will be assigned to the block's `context` property.
	 *
	 * @since 5.5.0
	 *
	 * @param array                  $block             {
	 *     An associative array of a single parsed block object. See WP_Block_Parser_Block.
	 *
	 *     @type string|null $blockName    Name of block.
	 *     @type array       $attrs        Attributes from block comment delimiters.
	 *     @type array       $innerBlocks  List of inner blocks. An array of arrays that
	 *                                     have the same structure as this one.
	 *     @type string      $innerHTML    HTML from inside block comment delimiters.
	 *     @type array       $innerContent List of string fragments and null markers where inner blocks were found.
	 * }
	 * @param array                  $available_context Optional array of ancestry context values.
	 * @param WP_Block_Type_Registry $registry          Optional block type registry.
	 */
	public function __construct( $block, $available_context = array(), $registry = null ) {
		$this->parsed_block = $block;
		$this->name         = $block['blockName'];

		if ( is_null( $registry ) ) {
			$registry = WP_Block_Type_Registry::get_instance();
		}

		$this->registry = $registry;

		$this->block_type = $registry->get_registered( $this->name );

		$this->available_context = $available_context;

		$this->refresh_context_dependents();
	}

	/**
	 * Updates the context for the current block and its inner blocks.
	 *
	 * The method updates the context of inner blocks, if any, by passing down
	 * any context values the block provides (`provides_context`).
	 *
	 * If the block has inner blocks, the method recursively processes them by creating new instances of `WP_Block`
	 * for each inner block and updating their context based on the block's `provides_context` property.
	 *
	 * @since 6.8.0
	 */
	public function refresh_context_dependents() {
		/*
		 * Merging the `$context` property here is not ideal, but for now needs to happen because of backward compatibility.
		 * Ideally, the `$context` property itself would not be filterable directly and only the `$available_context` would be filterable.
		 * However, this needs to be separately explored whether it's possible without breakage.
		 */
		$this->available_context = array_merge( $this->available_context, $this->context );

		if ( ! empty( $this->block_type->uses_context ) ) {
			foreach ( $this->block_type->uses_context as $context_name ) {
				if ( array_key_exists( $context_name, $this->available_context ) ) {
					$this->context[ $context_name ] = $this->available_context[ $context_name ];
				}
			}
		}

		$this->refresh_parsed_block_dependents();
	}

	/**
	 * Updates the parsed block content for the current block and its inner blocks.
	 *
	 * This method sets the `inner_html` and `inner_content` properties of the block based on the parsed
	 * block content provided during initialization. It ensures that the block instance reflects the
	 * most up-to-date content for both the inner HTML and any string fragments around inner blocks.
	 *
	 * If the block has inner blocks, this method initializes a new `WP_Block_List` for them, ensuring the
	 * correct content and context are updated for each nested block.
	 *
	 * @since 6.8.0
	 */
	public function refresh_parsed_block_dependents() {
		if ( ! empty( $this->parsed_block['innerBlocks'] ) ) {
			$child_context = $this->available_context;

			if ( ! empty( $this->block_type->provides_context ) ) {
				foreach ( $this->block_type->provides_context as $context_name => $attribute_name ) {
					if ( array_key_exists( $attribute_name, $this->attributes ) ) {
						$child_context[ $context_name ] = $this->attributes[ $attribute_name ];
					}
				}
			}

			$this->inner_blocks = new WP_Block_List( $this->parsed_block['innerBlocks'], $child_context, $this->registry );
		}

		if ( ! empty( $this->parsed_block['innerHTML'] ) ) {
			$this->inner_html = $this->parsed_block['innerHTML'];
		}

		if ( ! empty( $this->parsed_block['innerContent'] ) ) {
			$this->inner_content = $this->parsed_block['innerContent'];
		}
	}

	/**
	 * Returns a value from an inaccessible property.
	 *
	 * This is used to lazily initialize the `attributes` property of a block,
	 * such that it is only prepared with default attributes at the time that
	 * the property is accessed. For all other inaccessible properties, a `null`
	 * value is returned.
	 *
	 * @since 5.5.0
	 *
	 * @param string $name Property name.
	 * @return array|null Prepared attributes, or null.
	 */
	public function __get( $name ) {
		if ( 'attributes' === $name ) {
			$this->attributes = isset( $this->parsed_block['attrs'] ) ?
				$this->parsed_block['attrs'] :
				array();

			if ( ! is_null( $this->block_type ) ) {
				$this->attributes = $this->block_type->prepare_attributes_for_render( $this->attributes );
			}

			return $this->attributes;
		}

		return null;
	}

	/**
	 * Processes the block bindings and updates the block attributes with the values from the sources.
	 *
	 * A block might contain bindings in its attributes. Bindings are mappings
	 * between an attribute of the block and a source. A "source" is a function
	 * registered with `register_block_bindings_source()` that defines how to
	 * retrieve a value from outside the block, e.g. from post meta.
	 *
	 * This function will process those bindings and update the block's attributes
	 * with the values coming from the bindings.
	 *
	 * ### Example
	 *
	 * The "bindings" property for an Image block might look like this:
	 *
	 * ```json
	 * {
	 *   "metadata": {
	 *     "bindings": {
	 *       "title": {
	 *         "source": "core/post-meta",
	 *         "args": { "key": "text_custom_field" }
	 *       },
	 *       "url": {
	 *         "source": "core/post-meta",
	 *         "args": { "key": "url_custom_field" }
	 *       }
	 *     }
	 *   }
	 * }
	 * ```
	 *
	 * The above example will replace the `title` and `url` attributes of the Image
	 * block with the values of the `text_custom_field` and `url_custom_field` post meta.
	 *
	 * @since 6.5.0
	 * @since 6.6.0 Handle the `__default` attribute for pattern overrides.
	 * @since 6.7.0 Return any updated bindings metadata in the computed attributes.
	 *
	 * @return array The computed block attributes for the provided block bindings.
	 */
	private function process_block_bindings() {
		$block_type                 = $this->name;
		$parsed_block               = $this->parsed_block;
		$computed_attributes        = array();
		$supported_block_attributes = get_block_bindings_supported_attributes( $block_type );

		// If the block doesn't have the bindings property, isn't one of the supported
		// block types, or the bindings property is not an array, return the block content.
		if (
			empty( $supported_block_attributes ) ||
			empty( $parsed_block['attrs']['metadata']['bindings'] ) ||
			! is_array( $parsed_block['attrs']['metadata']['bindings'] )
		) {
			return $computed_attributes;
		}

		$bindings = $parsed_block['attrs']['metadata']['bindings'];

		/*
		 * If the default binding is set for pattern overrides, replace it
		 * with a pattern override binding for all supported attributes.
		 */
		if (
			isset( $bindings['__default']['source'] ) &&
			'core/pattern-overrides' === $bindings['__default']['source']
		) {
			$updated_bindings = array();

			/*
			 * Build a binding array of all supported attributes.
			 * Note that this also omits the `__default` attribute from the
			 * resulting array.
			 */
			foreach ( $supported_block_attributes as $attribute_name ) {
				// Retain any non-pattern override bindings that might be present.
				$updated_bindings[ $attribute_name ] = isset( $bindings[ $attribute_name ] )
					? $bindings[ $attribute_name ]
					: array( 'source' => 'core/pattern-overrides' );
			}
			$bindings = $updated_bindings;
			/*
			 * Update the bindings metadata of the computed attributes.
			 * This ensures the block receives the expanded __default binding metadata when it renders.
			 */
			$computed_attributes['metadata'] = array_merge(
				$parsed_block['attrs']['metadata'],
				array( 'bindings' => $bindings )
			);
		}

		foreach ( $bindings as $attribute_name => $block_binding ) {
			// If the attribute is not in the supported list, process next attribute.
			if ( ! in_array( $attribute_name, $supported_block_attributes, true ) ) {
				continue;
			}
			// If no source is provided, or that source is not registered, process next attribute.
			if ( ! isset( $block_binding['source'] ) || ! is_string( $block_binding['source'] ) ) {
				continue;
			}

			$block_binding_source = get_block_bindings_source( $block_binding['source'] );
			if ( null === $block_binding_source ) {
				continue;
			}

			// Adds the necessary context defined by the source.
			if ( ! empty( $block_binding_source->uses_context ) ) {
				foreach ( $block_binding_source->uses_context as $context_name ) {
					if ( array_key_exists( $context_name, $this->available_context ) ) {
						$this->context[ $context_name ] = $this->available_context[ $context_name ];
					}
				}
			}

			$source_args  = ! empty( $block_binding['args'] ) && is_array( $block_binding['args'] ) ? $block_binding['args'] : array();
			$source_value = $block_binding_source->get_value( $source_args, $this, $attribute_name );

			// If the value is not null, process the HTML based on the block and the attribute.
			if ( ! is_null( $source_value ) ) {
				$computed_attributes[ $attribute_name ] = $source_value;
			}
		}

		return $computed_attributes;
	}

	/**
	 * Depending on the block attribute name, replace its value in the HTML based on the value provided.
	 *
	 * @since 6.5.0
	 *
	 * @param string $block_content  Block content.
	 * @param string $attribute_name The attribute name to replace.
	 * @param mixed  $source_value   The value used to replace in the HTML.
	 * @return string The modified block content.
	 */
	private function replace_html( string $block_content, string $attribute_name, $source_value ) {
		$block_type = $this->block_type;
		if ( ! isset( $block_type->attributes[ $attribute_name ]['source'] ) ) {
			return $block_content;
		}

		// Depending on the attribute source, the processing will be different.
		switch ( $block_type->attributes[ $attribute_name ]['source'] ) {
			case 'html':
			case 'rich-text':
				$block_reader = self::get_block_bindings_processor( $block_content );

				// TODO: Support for CSS selectors whenever they are ready in the HTML API.
				// In the meantime, support comma-separated selectors by exploding them into an array.
				$selectors = explode( ',', $block_type->attributes[ $attribute_name ]['selector'] );
				// Add a bookmark to the first tag to be able to iterate over the selectors.
				$block_reader->next_tag();
				$block_reader->set_bookmark( 'iterate-selectors' );

				foreach ( $selectors as $selector ) {
					// If the parent tag, or any of its children, matches the selector, replace the HTML.
					if ( strcasecmp( $block_reader->get_tag(), $selector ) === 0 || $block_reader->next_tag(
						array(
							'tag_name' => $selector,
						)
					) ) {
						// TODO: Use `WP_HTML_Processor::set_inner_html` method once it's available.
						$block_reader->release_bookmark( 'iterate-selectors' );
						$block_reader->replace_rich_text( wp_kses_post( $source_value ) );
						return $block_reader->get_updated_html();
					} else {
						$block_reader->seek( 'iterate-selectors' );
					}
				}
				$block_reader->release_bookmark( 'iterate-selectors' );
				return $block_content;

			case 'attribute':
				$amended_content = new WP_HTML_Tag_Processor( $block_content );
				if ( ! $amended_content->next_tag(
					array(
						// TODO: build the query from CSS selector.
						'tag_name' => $block_type->attributes[ $attribute_name ]['selector'],
					)
				) ) {
					return $block_content;
				}
				$amended_content->set_attribute( $block_type->attributes[ $attribute_name ]['attribute'], $source_value );
				return $amended_content->get_updated_html();

			default:
				return $block_content;
		}
	}

	private static function get_block_bindings_processor( string $block_content ) {
		$internal_processor_class = new class('', WP_HTML_Processor::CONSTRUCTOR_UNLOCK_CODE) extends WP_HTML_Processor {
			/**
			 * Replace the rich text content between a tag opener and matching closer.
			 *
			 * When stopped on a tag opener, replace the content enclosed by it and its
			 * matching closer with the provided rich text.
			 *
			 * @param string $rich_text The rich text to replace the original content with.
			 * @return bool True on success.
			 */
			public function replace_rich_text( $rich_text ) {
				if ( $this->is_tag_closer() || ! $this->expects_closer() ) {
					return false;
				}

				$depth    = $this->get_current_depth();
				$tag_name = $this->get_tag();

				$this->set_bookmark( '_wp_block_bindings' );
				// The bookmark names are prefixed with `_` so the key below has an extra `_`.
				$tag_opener = $this->bookmarks['__wp_block_bindings'];
				$start      = $tag_opener->start + $tag_opener->length;

				// Find matching tag closer.
				while ( $this->next_token() && $this->get_current_depth() >= $depth ) {
				}

				if ( ! $this->is_tag_closer() || $tag_name !== $this->get_tag() ) {
					return false;
				}

				$this->set_bookmark( '_wp_block_bindings' );
				$tag_closer = $this->bookmarks['__wp_block_bindings'];
				$end        = $tag_closer->start;

				$this->lexical_updates[] = new WP_HTML_Text_Replacement(
					$start,
					$end - $start,
					$rich_text
				);

				return true;
			}
		};

		return $internal_processor_class::create_fragment( $block_content );
	}

	/**
	 * Generates the render output for the block.
	 *
	 * @since 5.5.0
	 * @since 6.5.0 Added block bindings processing.
	 *
	 * @global WP_Post $post Global post object.
	 *
	 * @param array $options {
	 *     Optional options object.
	 *
	 *     @type bool $dynamic Defaults to 'true'. Optionally set to false to avoid using the block's render_callback.
	 * }
	 * @return string Rendered block output.
	 */
	public function render( $options = array() ) {
		global $post;

		$before_wp_enqueue_scripts_count = did_action( 'wp_enqueue_scripts' );

		// Capture the current assets queues.
		$before_styles_queue         = wp_styles()->queue;
		$before_scripts_queue        = wp_scripts()->queue;
		$before_script_modules_queue = wp_script_modules()->get_queue();

		/*
		 * There can be only one root interactive block at a time because the rendered HTML of that block contains
		 * the rendered HTML of all its inner blocks, including any interactive block.
		 */
		static $root_interactive_block = null;
		/**
		 * Filters whether Interactivity API should process directives.
		 *
		 * @since 6.6.0
		 *
		 * @param bool $enabled Whether the directives processing is enabled.
		 */
		$interactivity_process_directives_enabled = apply_filters( 'interactivity_process_directives', true );
		if (
			$interactivity_process_directives_enabled && null === $root_interactive_block && (
				( isset( $this->block_type->supports['interactivity'] ) && true === $this->block_type->supports['interactivity'] ) ||
				! empty( $this->block_type->supports['interactivity']['interactive'] )
			)
		) {
			$root_interactive_block = $this;
		}

		$options = wp_parse_args(
			$options,
			array(
				'dynamic' => true,
			)
		);

		// Process the block bindings and get attributes updated with the values from the sources.
		$computed_attributes = $this->process_block_bindings();
		if ( ! empty( $computed_attributes ) ) {
			// Merge the computed attributes with the original attributes.
			$this->attributes = array_merge( $this->attributes, $computed_attributes );
		}

		$is_dynamic    = $options['dynamic'] && $this->name && null !== $this->block_type && $this->block_type->is_dynamic();
		$block_content = '';

		if ( ! $options['dynamic'] || empty( $this->block_type->skip_inner_blocks ) ) {
			$index = 0;

			foreach ( $this->inner_content as $chunk ) {
				if ( is_string( $chunk ) ) {
					$block_content .= $chunk;
				} else {
					$inner_block  = $this->inner_blocks[ $index ];
					$parent_block = $this;

					/** This filter is documented in wp-includes/blocks.php */
					$pre_render = apply_filters( 'pre_render_block', null, $inner_block->parsed_block, $parent_block );

					if ( ! is_null( $pre_render ) ) {
						$block_content .= $pre_render;
					} else {
						$source_block        = $inner_block->parsed_block;
						$inner_block_context = $inner_block->context;

						/** This filter is documented in wp-includes/blocks.php */
						$inner_block->parsed_block = apply_filters( 'render_block_data', $inner_block->parsed_block, $source_block, $parent_block );

						/** This filter is documented in wp-includes/blocks.php */
						$inner_block->context = apply_filters( 'render_block_context', $inner_block->context, $inner_block->parsed_block, $parent_block );

						/*
						 * The `refresh_context_dependents()` method already calls `refresh_parsed_block_dependents()`.
						 * Therefore the second condition is irrelevant if the first one is satisfied.
						 */
						if ( $inner_block->context !== $inner_block_context ) {
							$inner_block->refresh_context_dependents();
						} elseif ( $inner_block->parsed_block !== $source_block ) {
							$inner_block->refresh_parsed_block_dependents();
						}

						$block_content .= $inner_block->render();
					}

					++$index;
				}
			}
		}

		if ( ! empty( $computed_attributes ) && ! empty( $block_content ) ) {
			foreach ( $computed_attributes as $attribute_name => $source_value ) {
				$block_content = $this->replace_html( $block_content, $attribute_name, $source_value );
			}
		}

		if ( $is_dynamic ) {
			$global_post = $post;
			$parent      = WP_Block_Supports::$block_to_render;

			WP_Block_Supports::$block_to_render = $this->parsed_block;

			$block_content = (string) call_user_func( $this->block_type->render_callback, $this->attributes, $block_content, $this );

			WP_Block_Supports::$block_to_render = $parent;

			$post = $global_post;
		}

		if ( ( ! empty( $this->block_type->script_handles ) ) ) {
			foreach ( $this->block_type->script_handles as $script_handle ) {
				wp_enqueue_script( $script_handle );
			}
		}

		if ( ! empty( $this->block_type->view_script_handles ) ) {
			foreach ( $this->block_type->view_script_handles as $view_script_handle ) {
				wp_enqueue_script( $view_script_handle );
			}
		}

		if ( ! empty( $this->block_type->view_script_module_ids ) ) {
			foreach ( $this->block_type->view_script_module_ids as $view_script_module_id ) {
				wp_enqueue_script_module( $view_script_module_id );
			}
		}

		/*
		 * For Core blocks, these styles are only enqueued if `wp_should_load_separate_core_block_assets()` returns
		 * true. Otherwise these `wp_enqueue_style()` calls will not have any effect, as the Core blocks are relying on
		 * the combined 'wp-block-library' stylesheet instead, which is unconditionally enqueued.
		 */
		if ( ( ! empty( $this->block_type->style_handles ) ) ) {
			foreach ( $this->block_type->style_handles as $style_handle ) {
				wp_enqueue_style( $style_handle );
			}
		}

		if ( ( ! empty( $this->block_type->view_style_handles ) ) ) {
			foreach ( $this->block_type->view_style_handles as $view_style_handle ) {
				wp_enqueue_style( $view_style_handle );
			}
		}

		/**
		 * Filters the content of a single block.
		 *
		 * @since 5.0.0
		 * @since 5.9.0 The `$instance` parameter was added.
		 *
		 * @param string   $block_content The block content.
		 * @param array    $block         The full block, including name and attributes.
		 * @param WP_Block $instance      The block instance.
		 */
		$block_content = apply_filters( 'render_block', $block_content, $this->parsed_block, $this );

		/**
		 * Filters the content of a single block.
		 *
		 * The dynamic portion of the hook name, `$name`, refers to
		 * the block name, e.g. "core/paragraph".
		 *
		 * @since 5.7.0
		 * @since 5.9.0 The `$instance` parameter was added.
		 *
		 * @param string   $block_content The block content.
		 * @param array    $block         The full block, including name and attributes.
		 * @param WP_Block $instance      The block instance.
		 */
		$block_content = apply_filters( "render_block_{$this->name}", $block_content, $this->parsed_block, $this );

		if ( $root_interactive_block === $this ) {
			// The root interactive block has finished rendering. Time to process directives.
			$block_content          = wp_interactivity_process_directives( $block_content );
			$root_interactive_block = null;
		}

		// Capture the new assets enqueued during rendering, and restore the queues the state prior to rendering.
		$after_styles_queue         = wp_styles()->queue;
		$after_scripts_queue        = wp_scripts()->queue;
		$after_script_modules_queue = wp_script_modules()->get_queue();

		/*
		 * As a very special case, a dynamic block may in fact include a call to wp_head() (and thus wp_enqueue_scripts()),
		 * in which all of its enqueued assets are targeting wp_footer. In this case, nothing would be printed, but this
		 * shouldn't indicate that the just-enqueued assets should be dequeued due to it being an empty block.
		 */
		$just_did_wp_enqueue_scripts = ( did_action( 'wp_enqueue_scripts' ) !== $before_wp_enqueue_scripts_count );

		$has_new_styles         = ( $before_styles_queue !== $after_styles_queue );
		$has_new_scripts        = ( $before_scripts_queue !== $after_scripts_queue );
		$has_new_script_modules = ( $before_script_modules_queue !== $after_script_modules_queue );

		// Dequeue the newly enqueued assets with the existing assets if the rendered block was empty & wp_enqueue_scripts did not fire.
		if (
			! $just_did_wp_enqueue_scripts &&
			( $has_new_styles || $has_new_scripts || $has_new_script_modules ) &&
			(
				trim( $block_content ) === '' &&
				/**
				 * Filters whether to enqueue assets for a block which has no rendered content.
				 *
				 * @since 6.9.0
				 *
				 * @param bool   $enqueue    Whether to enqueue assets.
				 * @param string $block_name Block name.
				 */
				! (bool) apply_filters( 'enqueue_empty_block_content_assets', false, $this->name )
			)
		) {
			foreach ( array_diff( $after_styles_queue, $before_styles_queue ) as $handle ) {
				wp_dequeue_style( $handle );
			}
			foreach ( array_diff( $after_scripts_queue, $before_scripts_queue ) as $handle ) {
				wp_dequeue_script( $handle );
			}
			foreach ( array_diff( $after_script_modules_queue, $before_script_modules_queue ) as $handle ) {
				wp_dequeue_script_module( $handle );
			}
		}

		return $block_content;
	}
}

```

### [wordpress-develop] src/wp-includes/functions.wp-scripts.php
```php
<?php
/**
 * Dependencies API: Scripts functions
 *
 * @since 2.6.0
 *
 * @package WordPress
 * @subpackage Dependencies
 */

/**
 * Initializes $wp_scripts if it has not been set.
 *
 * @since 4.2.0
 *
 * @global WP_Scripts $wp_scripts
 *
 * @return WP_Scripts WP_Scripts instance.
 */
function wp_scripts() {
	global $wp_scripts;

	if ( ! ( $wp_scripts instanceof WP_Scripts ) ) {
		$wp_scripts = new WP_Scripts();
	}

	return $wp_scripts;
}

/**
 * Helper function to output a _doing_it_wrong message when applicable.
 *
 * @ignore
 * @since 4.2.0
 * @since 5.5.0 Added the `$handle` parameter.
 *
 * @param string $function_name Function name.
 * @param string $handle        Optional. Name of the script or stylesheet that was
 *                              registered or enqueued too early. Default empty.
 */
function _wp_scripts_maybe_doing_it_wrong( $function_name, $handle = '' ) {
	if ( did_action( 'init' ) || did_action( 'wp_enqueue_scripts' )
		|| did_action( 'admin_enqueue_scripts' ) || did_action( 'login_enqueue_scripts' )
	) {
		return;
	}

	$message = sprintf(
		/* translators: 1: wp_enqueue_scripts, 2: admin_enqueue_scripts, 3: login_enqueue_scripts */
		__( 'Scripts and styles should not be registered or enqueued until the %1$s, %2$s, or %3$s hooks.' ),
		'<code>wp_enqueue_scripts</code>',
		'<code>admin_enqueue_scripts</code>',
		'<code>login_enqueue_scripts</code>'
	);

	if ( $handle ) {
		$message .= ' ' . sprintf(
			/* translators: %s: Name of the script or stylesheet. */
			__( 'This notice was triggered by the %s handle.' ),
			'<code>' . $handle . '</code>'
		);
	}

	_doing_it_wrong(
		$function_name,
		$message,
		'3.3.0'
	);
}

/**
 * Prints scripts in document head that are in the $handles queue.
 *
 * Called by admin-header.php and {@see 'wp_head'} hook. Since it is called by wp_head on every page load,
 * the function does not instantiate the WP_Scripts object unless script names are explicitly passed.
 * Makes use of already-instantiated `$wp_scripts` global if present. Use provided {@see 'wp_print_scripts'}
 * hook to register/enqueue new scripts.
 *
 * @see WP_Scripts::do_item()
 * @since 2.1.0
 *
 * @global WP_Scripts $wp_scripts The WP_Scripts object for printing scripts.
 *
 * @param string|string[]|false $handles Optional. Scripts to be printed. Default 'false'.
 * @return string[] On success, an array of handles of processed WP_Dependencies items; otherwise, an empty array.
 */
function wp_print_scripts( $handles = false ) {
	global $wp_scripts;

	/**
	 * Fires before scripts in the $handles queue are printed.
	 *
	 * @since 2.1.0
	 */
	do_action( 'wp_print_scripts' );

	if ( '' === $handles ) { // For 'wp_head'.
		$handles = false;
	}

	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__ );

	if ( ! ( $wp_scripts instanceof WP_Scripts ) ) {
		if ( ! $handles ) {
			return array(); // No need to instantiate if nothing is there.
		}
	}

	return wp_scripts()->do_items( $handles );
}

/**
 * Adds extra code to a registered script.
 *
 * Code will only be added if the script is already in the queue.
 * Accepts a string `$data` containing the code. If two or more code blocks
 * are added to the same script `$handle`, they will be printed in the order
 * they were added, i.e. the latter added code can redeclare the previous.
 *
 * @since 4.5.0
 *
 * @see WP_Scripts::add_inline_script()
 *
 * @param string $handle   Name of the script to add the inline script to.
 * @param string $data     String containing the JavaScript to be added.
 * @param string $position Optional. Whether to add the inline script before the handle
 *                         or after. Default 'after'.
 * @return bool True on success, false on failure.
 */
function wp_add_inline_script( $handle, $data, $position = 'after' ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	if ( false !== stripos( $data, '</script>' ) ) {
		_doing_it_wrong(
			__FUNCTION__,
			sprintf(
				/* translators: 1: <script>, 2: wp_add_inline_script() */
				__( 'Do not pass %1$s tags to %2$s.' ),
				'<code>&lt;script&gt;</code>',
				'<code>wp_add_inline_script()</code>'
			),
			'4.5.0'
		);
		$data = trim( preg_replace( '#<script[^>]*>(.*)</script>#is', '$1', $data ) );
	}

	return wp_scripts()->add_inline_script( $handle, $data, $position );
}

/**
 * Registers a new script.
 *
 * Registers a script to be enqueued later using the wp_enqueue_script() function.
 *
 * @see WP_Dependencies::add()
 * @see WP_Dependencies::add_data()
 *
 * @since 2.1.0
 * @since 4.3.0 A return value was added.
 * @since 6.3.0 The $in_footer parameter of type boolean was overloaded to be an $args parameter of type array.
 * @since 6.9.0 The $fetchpriority parameter of type string was added to the $args parameter of type array.
 *
 * @param string           $handle    Name of the script. Should be unique.
 * @param string|false     $src       Full URL of the script, or path of the script relative to the WordPress root directory.
 *                                    If source is set to false, script is an alias of other scripts it depends on.
 * @param string[]         $deps      Optional. An array of registered script handles this script depends on. Default empty array.
 * @param string|bool|null $ver       Optional. String specifying script version number, if it has one, which is added to the URL
 *                                    as a query string for cache busting purposes. If version is set to false, a version
 *                                    number is automatically added equal to current installed WordPress version.
 *                                    If set to null, no version is added.
 * @param array|bool       $args     {
 *     Optional. An array of additional script loading strategies. Default empty array.
 *     Otherwise, it may be a boolean in which case it determines whether the script is printed in the footer. Default false.
 *
 *     @type string    $strategy      Optional. If provided, may be either 'defer' or 'async'.
 *     @type bool      $in_footer     Optional. Whether to print the script in the footer. Default 'false'.
 *     @type string    $fetchpriority Optional. The fetch priority for the script. Default 'auto'.
 * }
 * @return bool Whether the script has been registered. True on success, false on failure.
 */
function wp_register_script( $handle, $src, $deps = array(), $ver = false, $args = array() ) {
	if ( ! is_array( $args ) ) {
		$args = array(
			'in_footer' => (bool) $args,
		);
	}
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	$wp_scripts = wp_scripts();

	$registered = $wp_scripts->add( $handle, $src, $deps, $ver );
	if ( ! empty( $args['in_footer'] ) ) {
		$wp_scripts->add_data( $handle, 'group', 1 );
	}
	if ( ! empty( $args['strategy'] ) ) {
		$wp_scripts->add_data( $handle, 'strategy', $args['strategy'] );
	}
	if ( ! empty( $args['fetchpriority'] ) ) {
		$wp_scripts->add_data( $handle, 'fetchpriority', $args['fetchpriority'] );
	}
	return $registered;
}

/**
 * Localizes a script.
 *
 * Works only if the script has already been registered.
 *
 * Accepts an associative array `$l10n` and creates a JavaScript object:
 *
 *     "$object_name": {
 *         key: value,
 *         key: value,
 *         ...
 *     }
 *
 * @see WP_Scripts::localize()
 * @link https://core.trac.wordpress.org/ticket/11520
 *
 * @since 2.2.0
 *
 * @todo Documentation cleanup
 *
 * @param string $handle      Script handle the data will be attached to.
 * @param string $object_name Name for the JavaScript object. Passed directly, so it should be qualified JS variable.
 *                            Example: '/[a-zA-Z0-9_]+/'.
 * @param array  $l10n        The data itself. The data can be either a single or multi-dimensional array.
 * @return bool True if the script was successfully localized, false otherwise.
 */
function wp_localize_script( $handle, $object_name, $l10n ) {
	$wp_scripts = wp_scripts();

	return $wp_scripts->localize( $handle, $object_name, $l10n );
}

/**
 * Sets translated strings for a script.
 *
 * Works only if the script has already been registered.
 *
 * @see WP_Scripts::set_translations()
 * @since 5.0.0
 * @since 5.1.0 The `$domain` parameter was made optional.
 *
 * @global WP_Scripts $wp_scripts The WP_Scripts object for printing scripts.
 *
 * @param string $handle Script handle the textdomain will be attached to.
 * @param string $domain Optional. Text domain. Default 'default'.
 * @param string $path   Optional. The full file path to the directory containing translation files.
 * @return bool True if the text domain was successfully localized, false otherwise.
 */
function wp_set_script_translations( $handle, $domain = 'default', $path = '' ) {
	global $wp_scripts;

	if ( ! ( $wp_scripts instanceof WP_Scripts ) ) {
		_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );
		return false;
	}

	return $wp_scripts->set_translations( $handle, $domain, $path );
}

/**
 * Removes a registered script.
 *
 * Note: there are intentional safeguards in place to prevent critical admin scripts,
 * such as jQuery core, from being unregistered.
 *
 * @see WP_Dependencies::remove()
 *
 * @since 2.1.0
 *
 * @global string $pagenow The filename of the current screen.
 *
 * @param string $handle Name of the script to be removed.
 */
function wp_deregister_script( $handle ) {
	global $pagenow;

	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	/**
	 * Do not allow accidental or negligent de-registering of critical scripts in the admin.
	 * Show minimal remorse if the correct hook is used.
	 */
	$current_filter = current_filter();
	if ( ( is_admin() && 'admin_enqueue_scripts' !== $current_filter ) ||
		( 'wp-login.php' === $pagenow && 'login_enqueue_scripts' !== $current_filter )
	) {
		$not_allowed = array(
			'jquery',
			'jquery-core',
			'jquery-migrate',
			'jquery-ui-core',
			'jquery-ui-accordion',
			'jquery-ui-autocomplete',
			'jquery-ui-button',
			'jquery-ui-datepicker',
			'jquery-ui-dialog',
			'jquery-ui-draggable',
			'jquery-ui-droppable',
			'jquery-ui-menu',
			'jquery-ui-mouse',
			'jquery-ui-position',
			'jquery-ui-progressbar',
			'jquery-ui-resizable',
			'jquery-ui-selectable',
			'jquery-ui-slider',
			'jquery-ui-sortable',
			'jquery-ui-spinner',
			'jquery-ui-tabs',
			'jquery-ui-tooltip',
			'jquery-ui-widget',
			'underscore',
			'backbone',
		);

		if ( in_array( $handle, $not_allowed, true ) ) {
			_doing_it_wrong(
				__FUNCTION__,
				sprintf(
					/* translators: 1: Script name, 2: wp_enqueue_scripts */
					__( 'Do not deregister the %1$s script in the administration area. To target the front-end theme, use the %2$s hook.' ),
					"<code>$handle</code>",
					'<code>wp_enqueue_scripts</code>'
				),
				'3.6.0'
			);
			return;
		}
	}

	wp_scripts()->remove( $handle );
}

/**
 * Enqueues a script.
 *
 * Registers the script if `$src` provided (does NOT overwrite), and enqueues it.
 *
 * @see WP_Dependencies::add()
 * @see WP_Dependencies::add_data()
 * @see WP_Dependencies::enqueue()
 *
 * @since 2.1.0
 * @since 6.3.0 The $in_footer parameter of type boolean was overloaded to be an $args parameter of type array.
 * @since 6.9.0 The $fetchpriority parameter of type string was added to the $args parameter of type array.
 *
 * @param string           $handle    Name of the script. Should be unique.
 * @param string           $src       Full URL of the script, or path of the script relative to the WordPress root directory.
 *                                    Default empty.
 * @param string[]         $deps      Optional. An array of registered script handles this script depends on. Default empty array.
 * @param string|bool|null $ver       Optional. String specifying script version number, if it has one, which is added to the URL
 *                                    as a query string for cache busting purposes. If version is set to false, a version
 *                                    number is automatically added equal to current installed WordPress version.
 *                                    If set to null, no version is added.
 * @param array|bool       $args     {
 *     Optional. An array of additional script loading strategies. Default empty array.
 *     Otherwise, it may be a boolean in which case it determines whether the script is printed in the footer. Default false.
 *
 *     @type string    $strategy      Optional. If provided, may be either 'defer' or 'async'.
 *     @type bool      $in_footer     Optional. Whether to print the script in the footer. Default 'false'.
 *     @type string    $fetchpriority Optional. The fetch priority for the script. Default 'auto'.
 * }
 */
function wp_enqueue_script( $handle, $src = '', $deps = array(), $ver = false, $args = array() ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	$wp_scripts = wp_scripts();

	if ( $src || ! empty( $args ) ) {
		$_handle = explode( '?', $handle );
		if ( ! is_array( $args ) ) {
			$args = array(
				'in_footer' => (bool) $args,
			);
		}

		if ( $src ) {
			$wp_scripts->add( $_handle[0], $src, $deps, $ver );
		}
		if ( ! empty( $args['in_footer'] ) ) {
			$wp_scripts->add_data( $_handle[0], 'group', 1 );
		}
		if ( ! empty( $args['strategy'] ) ) {
			$wp_scripts->add_data( $_handle[0], 'strategy', $args['strategy'] );
		}
		if ( ! empty( $args['fetchpriority'] ) ) {
			$wp_scripts->add_data( $_handle[0], 'fetchpriority', $args['fetchpriority'] );
		}
	}

	$wp_scripts->enqueue( $handle );
}

/**
 * Removes a previously enqueued script.
 *
 * @see WP_Dependencies::dequeue()
 *
 * @since 3.1.0
 *
 * @param string $handle Name of the script to be removed.
 */
function wp_dequeue_script( $handle ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	wp_scripts()->dequeue( $handle );
}

/**
 * Determines whether a script has been added to the queue.
 *
 * For more information on this and similar theme functions, check out
 * the {@link https://developer.wordpress.org/themes/basics/conditional-tags/
 * Conditional Tags} article in the Theme Developer Handbook.
 *
 * @since 2.8.0
 * @since 3.5.0 'enqueued' added as an alias of the 'queue' list.
 *
 * @param string $handle Name of the script.
 * @param string $status Optional. Status of the script to check. Default 'enqueued'.
 *                       Accepts 'enqueued', 'registered', 'queue', 'to_do', and 'done'.
 * @return bool Whether the script is queued.
 */
function wp_script_is( $handle, $status = 'enqueued' ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	return (bool) wp_scripts()->query( $handle, $status );
}

/**
 * Adds metadata to a script.
 *
 * Works only if the script has already been registered.
 *
 * Possible values for $key and $value:
 * 'strategy' string 'defer' or 'async'.
 *
 * @since 4.2.0
 * @since 6.9.0 Updated possible values to remove reference to 'conditional' and add 'strategy'.
 *
 * @see WP_Dependencies::add_data()
 *
 * @param string $handle Name of the script.
 * @param string $key    Name of data point for which we're storing a value.
 * @param mixed  $value  String containing the data to be added.
 * @return bool True on success, false on failure.
 */
function wp_script_add_data( $handle, $key, $value ) {
	return wp_scripts()->add_data( $handle, $key, $value );
}

```

### [wordpress-develop] src/wp-includes/functions.wp-styles.php
```php
<?php
/**
 * Dependencies API: Styles functions
 *
 * @since 2.6.0
 *
 * @package WordPress
 * @subpackage Dependencies
 */

/**
 * Initializes $wp_styles if it has not been set.
 *
 * @since 4.2.0
 *
 * @global WP_Styles $wp_styles
 *
 * @return WP_Styles WP_Styles instance.
 */
function wp_styles() {
	global $wp_styles;

	if ( ! ( $wp_styles instanceof WP_Styles ) ) {
		$wp_styles = new WP_Styles();
	}

	return $wp_styles;
}

/**
 * Displays styles that are in the $handles queue.
 *
 * Passing an empty array to $handles prints the queue,
 * passing an array with one string prints that style,
 * and passing an array of strings prints those styles.
 *
 * @since 2.6.0
 *
 * @global WP_Styles $wp_styles The WP_Styles object for printing styles.
 *
 * @param string|bool|array $handles Styles to be printed. Default 'false'.
 * @return string[] On success, an array of handles of processed WP_Dependencies items; otherwise, an empty array.
 */
function wp_print_styles( $handles = false ) {
	global $wp_styles;

	if ( '' === $handles ) { // For 'wp_head'.
		$handles = false;
	}

	if ( ! $handles ) {
		/**
		 * Fires before styles in the $handles queue are printed.
		 *
		 * @since 2.6.0
		 */
		do_action( 'wp_print_styles' );
	}

	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__ );

	if ( ! ( $wp_styles instanceof WP_Styles ) ) {
		if ( ! $handles ) {
			return array(); // No need to instantiate if nothing is there.
		}
	}

	return wp_styles()->do_items( $handles );
}

/**
 * Adds extra CSS styles to a registered stylesheet.
 *
 * Styles will only be added if the stylesheet is already in the queue.
 * Accepts a string $data containing the CSS. If two or more CSS code blocks
 * are added to the same stylesheet $handle, they will be printed in the order
 * they were added, i.e. the latter added styles can redeclare the previous.
 *
 * @see WP_Styles::add_inline_style()
 *
 * @since 3.3.0
 *
 * @param string $handle Name of the stylesheet to add the extra styles to.
 * @param string $data   String containing the CSS styles to be added.
 * @return bool True on success, false on failure.
 */
function wp_add_inline_style( $handle, $data ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	if ( false !== stripos( $data, '</style>' ) ) {
		_doing_it_wrong(
			__FUNCTION__,
			sprintf(
				/* translators: 1: <style>, 2: wp_add_inline_style() */
				__( 'Do not pass %1$s tags to %2$s.' ),
				'<code>&lt;style&gt;</code>',
				'<code>wp_add_inline_style()</code>'
			),
			'3.7.0'
		);
		$data = trim( preg_replace( '#<style[^>]*>(.*)</style>#is', '$1', $data ) );
	}

	return wp_styles()->add_inline_style( $handle, $data );
}

/**
 * Registers a CSS stylesheet.
 *
 * @see WP_Dependencies::add()
 * @link https://www.w3.org/TR/CSS2/media.html#media-types List of CSS media types.
 *
 * @since 2.6.0
 * @since 4.3.0 A return value was added.
 *
 * @param string           $handle Name of the stylesheet. Should be unique.
 * @param string|false     $src    Full URL of the stylesheet, or path of the stylesheet relative to the WordPress root directory.
 *                                 If source is set to false, stylesheet is an alias of other stylesheets it depends on.
 * @param string[]         $deps   Optional. An array of registered stylesheet handles this stylesheet depends on. Default empty array.
 * @param string|bool|null $ver    Optional. String specifying stylesheet version number, if it has one, which is added to the URL
 *                                 as a query string for cache busting purposes. If version is set to false, a version
 *                                 number is automatically added equal to current installed WordPress version.
 *                                 If set to null, no version is added.
 * @param string           $media  Optional. The media for which this stylesheet has been defined.
 *                                 Default 'all'. Accepts media types like 'all', 'print' and 'screen', or media queries like
 *                                 '(orientation: portrait)' and '(max-width: 640px)'.
 * @return bool Whether the style has been registered. True on success, false on failure.
 */
function wp_register_style( $handle, $src, $deps = array(), $ver = false, $media = 'all' ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	return wp_styles()->add( $handle, $src, $deps, $ver, $media );
}

/**
 * Removes a registered stylesheet.
 *
 * @see WP_Dependencies::remove()
 *
 * @since 2.1.0
 *
 * @param string $handle Name of the stylesheet to be removed.
 */
function wp_deregister_style( $handle ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	wp_styles()->remove( $handle );
}

/**
 * Enqueues a CSS stylesheet.
 *
 * Registers the style if source provided (does NOT overwrite) and enqueues.
 *
 * @see WP_Dependencies::add()
 * @see WP_Dependencies::enqueue()
 * @link https://www.w3.org/TR/CSS2/media.html#media-types List of CSS media types.
 *
 * @since 2.6.0
 *
 * @param string           $handle Name of the stylesheet. Should be unique.
 * @param string           $src    Full URL of the stylesheet, or path of the stylesheet relative to the WordPress root directory.
 *                                 Default empty.
 * @param string[]         $deps   Optional. An array of registered stylesheet handles this stylesheet depends on. Default empty array.
 * @param string|bool|null $ver    Optional. String specifying stylesheet version number, if it has one, which is added to the URL
 *                                 as a query string for cache busting purposes. If version is set to false, a version
 *                                 number is automatically added equal to current installed WordPress version.
 *                                 If set to null, no version is added.
 * @param string           $media  Optional. The media for which this stylesheet has been defined.
 *                                 Default 'all'. Accepts media types like 'all', 'print' and 'screen', or media queries like
 *                                 '(orientation: portrait)' and '(max-width: 640px)'.
 */
function wp_enqueue_style( $handle, $src = '', $deps = array(), $ver = false, $media = 'all' ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	$wp_styles = wp_styles();

	if ( $src ) {
		$_handle = explode( '?', $handle );
		$wp_styles->add( $_handle[0], $src, $deps, $ver, $media );
	}

	$wp_styles->enqueue( $handle );
}

/**
 * Removes a previously enqueued CSS stylesheet.
 *
 * @see WP_Dependencies::dequeue()
 *
 * @since 3.1.0
 *
 * @param string $handle Name of the stylesheet to be removed.
 */
function wp_dequeue_style( $handle ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	wp_styles()->dequeue( $handle );
}

/**
 * Checks whether a CSS stylesheet has been added to the queue.
 *
 * @since 2.8.0
 *
 * @param string $handle Name of the stylesheet.
 * @param string $status Optional. Status of the stylesheet to check. Default 'enqueued'.
 *                       Accepts 'enqueued', 'registered', 'queue', 'to_do', and 'done'.
 * @return bool Whether style is queued.
 */
function wp_style_is( $handle, $status = 'enqueued' ) {
	_wp_scripts_maybe_doing_it_wrong( __FUNCTION__, $handle );

	return (bool) wp_styles()->query( $handle, $status );
}

/**
 * Adds metadata to a CSS stylesheet.
 *
 * Works only if the stylesheet has already been registered.
 *
 * Possible values for $key and $value:
 * 'rtl'         bool|string To declare an RTL stylesheet.
 * 'suffix'      string      Optional suffix, used in combination with RTL.
 * 'alt'         bool        For rel="alternate stylesheet".
 * 'title'       string      For preferred/alternate stylesheets.
 * 'path'        string      The absolute path to a stylesheet. Stylesheet will
 *                           load inline when 'path' is set.
 *
 * @see WP_Dependencies::add_data()
 *
 * @since 3.6.0
 * @since 5.8.0 Added 'path' as an official value for $key.
 *              See {@see wp_maybe_inline_styles()}.
 * @since 6.9.0 'conditional' value changed. If the 'conditional' parameter is present
 *              the stylesheet will be ignored.
 *
 * @param string $handle Name of the stylesheet.
 * @param string $key    Name of data point for which we're storing a value.
 *                       Accepts 'rtl' and 'suffix', 'alt', 'title' and 'path'.
 * @param mixed  $value  String containing the CSS data to be added.
 * @return bool True on success, false on failure.
 */
function wp_style_add_data( $handle, $key, $value ) {
	return wp_styles()->add_data( $handle, $key, $value );
}

```

### [wordpress-develop] src/wp-includes/script-modules.php
```php
<?php
/**
 * Script Modules API: Script Module functions
 *
 * @since 6.5.0
 *
 * @package WordPress
 * @subpackage Script Modules
 */

/**
 * Retrieves the main WP_Script_Modules instance.
 *
 * This function provides access to the WP_Script_Modules instance, creating one
 * if it doesn't exist yet.
 *
 * @since 6.5.0
 *
 * @global WP_Script_Modules $wp_script_modules
 *
 * @return WP_Script_Modules The main WP_Script_Modules instance.
 */
function wp_script_modules(): WP_Script_Modules {
	global $wp_script_modules;

	if ( ! ( $wp_script_modules instanceof WP_Script_Modules ) ) {
		$wp_script_modules = new WP_Script_Modules();
	}

	return $wp_script_modules;
}

/**
 * Registers the script module if no script module with that script module
 * identifier has already been registered.
 *
 * @since 6.5.0
 * @since 6.9.0 Added the $args parameter.
 *
 * @param string            $id      The identifier of the script module. Should be unique. It will be used in the
 *                                   final import map.
 * @param string            $src     Optional. Full URL of the script module, or path of the script module relative
 *                                   to the WordPress root directory. If it is provided and the script module has
 *                                   not been registered yet, it will be registered.
 * @param array             $deps    {
 *                                       Optional. List of dependencies.
 *
 *                                       @type string|array ...$0 {
 *                                           An array of script module identifiers of the dependencies of this script
 *                                           module. The dependencies can be strings or arrays. If they are arrays,
 *                                           they need an `id` key with the script module identifier, and can contain
 *                                           an `import` key with either `static` or `dynamic`. By default,
 *                                           dependencies that don't contain an `import` key are considered static.
 *
 *                                           @type string $id     The script module identifier.
 *                                           @type string $import Optional. Import type. May be either `static` or
 *                                                                `dynamic`. Defaults to `static`.
 *                                       }
 *                                   }
 * @param string|false|null $version Optional. String specifying the script module version number. Defaults to false.
 *                                   It is added to the URL as a query string for cache busting purposes. If $version
 *                                   is set to false, the version number is the currently installed WordPress version.
 *                                   If $version is set to null, no version is added.
 * @param array             $args    {
 *     Optional. An array of additional args. Default empty array.
 *
 *     @type bool                $in_footer     Whether to print the script module in the footer. Only relevant to block themes. Default 'false'. Optional.
 *     @type 'auto'|'low'|'high' $fetchpriority Fetch priority. Default 'auto'. Optional.
 * }
 */
function wp_register_script_module( string $id, string $src, array $deps = array(), $version = false, array $args = array() ) {
	wp_script_modules()->register( $id, $src, $deps, $version, $args );
}

/**
 * Marks the script module to be enqueued in the page.
 *
 * If a src is provided and the script module has not been registered yet, it
 * will be registered.
 *
 * @since 6.5.0
 * @since 6.9.0 Added the $args parameter.
 *
 * @param string            $id      The identifier of the script module. Should be unique. It will be used in the
 *                                   final import map.
 * @param string            $src     Optional. Full URL of the script module, or path of the script module relative
 *                                   to the WordPress root directory. If it is provided and the script module has
 *                                   not been registered yet, it will be registered.
 * @param array             $deps    {
 *                                       Optional. List of dependencies.
 *
 *                                       @type string|array ...$0 {
 *                                           An array of script module identifiers of the dependencies of this script
 *                                           module. The dependencies can be strings or arrays. If they are arrays,
 *                                           they need an `id` key with the script module identifier, and can contain
 *                                           an `import` key with either `static` or `dynamic`. By default,
 *                                           dependencies that don't contain an `import` key are considered static.
 *
 *                                           @type string $id     The script module identifier.
 *                                           @type string $import Optional. Import type. May be either `static` or
 *                                                                `dynamic`. Defaults to `static`.
 *                                       }
 *                                   }
 * @param string|false|null $version Optional. String specifying the script module version number. Defaults to false.
 *                                   It is added to the URL as a query string for cache busting purposes. If $version
 *                                   is set to false, the version number is the currently installed WordPress version.
 *                                   If $version is set to null, no version is added.
 * @param array             $args    {
 *     Optional. An array of additional args. Default empty array.
 *
 *     @type bool                $in_footer     Whether to print the script module in the footer. Only relevant to block themes. Default 'false'. Optional.
 *     @type 'auto'|'low'|'high' $fetchpriority Fetch priority. Default 'auto'. Optional.
 * }
 */
function wp_enqueue_script_module( string $id, string $src = '', array $deps = array(), $version = false, array $args = array() ) {
	wp_script_modules()->enqueue( $id, $src, $deps, $version, $args );
}

/**
 * Unmarks the script module so it is no longer enqueued in the page.
 *
 * @since 6.5.0
 *
 * @param string $id The identifier of the script module.
 */
function wp_dequeue_script_module( string $id ) {
	wp_script_modules()->dequeue( $id );
}

/**
 * Deregisters the script module.
 *
 * @since 6.5.0
 *
 * @param string $id The identifier of the script module.
 */
function wp_deregister_script_module( string $id ) {
	wp_script_modules()->deregister( $id );
}

/**
 * Registers all the default WordPress Script Modules.
 *
 * @since 6.7.0
 */
function wp_default_script_modules() {
	$suffix = defined( 'WP_RUN_CORE_TESTS' ) ? '.min' : wp_scripts_get_suffix();

	/*
	 * Expects multidimensional array like:
	 *
	 *     'interactivity/index.min.js' => array('dependencies' => array(…), 'version' => '…'),
	 *     'interactivity/debug.min.js' => array('dependencies' => array(…), 'version' => '…'),
	 *     'interactivity-router/index.min.js' => …
	 */
	$assets = include ABSPATH . WPINC . "/assets/script-modules-packages{$suffix}.php";

	foreach ( $assets as $file_name => $script_module_data ) {
		/*
		 * Build the WordPress Script Module ID from the file name.
		 * Prepend `@wordpress/` and remove extensions and `/index` if present:
		 *   - interactivity/index.min.js  => @wordpress/interactivity
		 *   - interactivity/debug.min.js  => @wordpress/interactivity/debug
		 *   - block-library/query/view.js => @wordpress/block-library/query/view
		 */
		$script_module_id = '@wordpress/' . preg_replace( '~(?:/index)?(?:\.min)?\.js$~D', '', $file_name, 1 );

		switch ( $script_module_id ) {
			/*
			 * Interactivity exposes two entrypoints, "/index" and "/debug".
			 * "/debug" should replace "/index" in development.
			 */
			case '@wordpress/interactivity/debug':
				if ( ! SCRIPT_DEBUG ) {
					continue 2;
				}
				$script_module_id = '@wordpress/interactivity';
				break;
			case '@wordpress/interactivity':
				if ( SCRIPT_DEBUG ) {
					continue 2;
				}
				break;
		}

		/*
		 * The Interactivity API is designed with server-side rendering as its primary goal, so all of its script modules
		 * should be loaded with low fetchpriority and printed in the footer since they should not be needed in the
		 * critical rendering path. Also, the @wordpress/a11y script module is intended to be used as a dynamic import
		 * dependency, in which case the fetchpriority is irrelevant. See <https://make.wordpress.org/core/2024/10/14/updates-to-script-modules-in-6-7/>.
		 * However, in case it is added as a static import dependency, the fetchpriority is explicitly set to be 'low'
		 * since the module should not be involved in the critical rendering path, and if it is, its fetchpriority will
		 * be bumped to match the fetchpriority of the dependent script.
		 */
		$args = array();
		if (
			str_starts_with( $script_module_id, '@wordpress/interactivity' ) ||
			str_starts_with( $script_module_id, '@wordpress/block-library' ) ||
			'@wordpress/a11y' === $script_module_id
		) {
			$args['fetchpriority'] = 'low';
			$args['in_footer']     = true;
		}

		// Marks all Core blocks as compatible with client-side navigation.
		if ( str_starts_with( $script_module_id, '@wordpress/block-library' ) ) {
			wp_interactivity()->add_client_navigation_support_to_script_module( $script_module_id );
		}

		$path = includes_url( "js/dist/script-modules/{$file_name}" );
		wp_register_script_module( $script_module_id, $path, $script_module_data['dependencies'], $script_module_data['version'], $args );
	}
}

```

### [wordpress-develop] src/wp-includes/l10n.php
```php
<?php
/**
 * Core Translation API
 *
 * @package WordPress
 * @subpackage i18n
 * @since 1.2.0
 */

/**
 * Retrieves the current locale.
 *
 * If the locale is set, then it will filter the locale in the {@see 'locale'}
 * filter hook and return the value.
 *
 * If the locale is not set already, then the WPLANG constant is used if it is
 * defined. Then it is filtered through the {@see 'locale'} filter hook and
 * the value for the locale global set and the locale is returned.
 *
 * The process to get the locale should only be done once, but the locale will
 * always be filtered using the {@see 'locale'} hook.
 *
 * @since 1.5.0
 *
 * @global string $locale           The current locale.
 * @global string $wp_local_package Locale code of the package.
 *
 * @return string The locale of the blog or from the {@see 'locale'} hook.
 */
function get_locale() {
	global $locale, $wp_local_package;

	if ( isset( $locale ) ) {
		/** This filter is documented in wp-includes/l10n.php */
		return apply_filters( 'locale', $locale );
	}

	if ( isset( $wp_local_package ) ) {
		$locale = $wp_local_package;
	}

	// WPLANG was defined in wp-config.
	if ( defined( 'WPLANG' ) ) {
		$locale = WPLANG;
	}

	// If multisite, check options.
	if ( is_multisite() ) {
		// Don't check blog option when installing.
		if ( wp_installing() ) {
			$ms_locale = get_site_option( 'WPLANG' );
		} else {
			$ms_locale = get_option( 'WPLANG' );
			if ( false === $ms_locale ) {
				$ms_locale = get_site_option( 'WPLANG' );
			}
		}

		if ( false !== $ms_locale ) {
			$locale = $ms_locale;
		}
	} else {
		$db_locale = get_option( 'WPLANG' );
		if ( false !== $db_locale ) {
			$locale = $db_locale;
		}
	}

	if ( empty( $locale ) ) {
		$locale = 'en_US';
	}

	/**
	 * Filters the locale ID of the WordPress installation.
	 *
	 * @since 1.5.0
	 *
	 * @param string $locale The locale ID.
	 */
	return apply_filters( 'locale', $locale );
}

/**
 * Retrieves the locale of a user.
 *
 * If the user has a locale set to a non-empty string then it will be
 * returned. Otherwise it returns the locale of get_locale().
 *
 * @since 4.7.0
 *
 * @param int|WP_User $user User's ID or a WP_User object. Defaults to current user.
 * @return string The locale of the user.
 */
function get_user_locale( $user = 0 ) {
	$user_object = false;

	if ( 0 === $user && function_exists( 'wp_get_current_user' ) ) {
		$user_object = wp_get_current_user();
	} elseif ( $user instanceof WP_User ) {
		$user_object = $user;
	} elseif ( $user && is_numeric( $user ) ) {
		$user_object = get_user_by( 'id', $user );
	}

	if ( ! $user_object ) {
		return get_locale();
	}

	$locale = $user_object->locale;

	return $locale ? $locale : get_locale();
}

/**
 * Determines the current locale desired for the request.
 *
 * @since 5.0.0
 *
 * @global string $pagenow          The filename of the current screen.
 * @global string $wp_local_package Locale code of the package.
 *
 * @return string The determined locale.
 */
function determine_locale() {
	/**
	 * Filters the locale for the current request prior to the default determination process.
	 *
	 * Using this filter allows to override the default logic, effectively short-circuiting the function.
	 *
	 * @since 5.0.0
	 *
	 * @param string|null $locale The locale to return and short-circuit. Default null.
	 */
	$determined_locale = apply_filters( 'pre_determine_locale', null );

	if ( $determined_locale && is_string( $determined_locale ) ) {
		return $determined_locale;
	}

	if (
		isset( $GLOBALS['pagenow'] ) && 'wp-login.php' === $GLOBALS['pagenow'] &&
		( ! empty( $_GET['wp_lang'] ) || ! empty( $_COOKIE['wp_lang'] ) )
	) {
		if ( ! empty( $_GET['wp_lang'] ) ) {
			$determined_locale = sanitize_locale_name( $_GET['wp_lang'] );
		} else {
			$determined_locale = sanitize_locale_name( $_COOKIE['wp_lang'] );
		}
	} elseif (
		is_admin() ||
		( isset( $_GET['_locale'] ) && 'user' === $_GET['_locale'] && wp_is_json_request() )
	) {
		$determined_locale = get_user_locale();
	} elseif (
		( ! empty( $_REQUEST['language'] ) || isset( $GLOBALS['wp_local_package'] ) )
		&& wp_installing()
	) {
		if ( ! empty( $_REQUEST['language'] ) ) {
			$determined_locale = sanitize_locale_name( $_REQUEST['language'] );
		} else {
			$determined_locale = $GLOBALS['wp_local_package'];
		}
	}

	if ( ! $determined_locale ) {
		$determined_locale = get_locale();
	}

	/**
	 * Filters the locale for the current request.
	 *
	 * @since 5.0.0
	 *
	 * @param string $determined_locale The locale.
	 */
	return apply_filters( 'determine_locale', $determined_locale );
}

/**
 * Retrieves the translation of $text.
 *
 * If there is no translation, or the text domain isn't loaded, the original text is returned.
 *
 * *Note:* Don't use translate() directly, use __() or related functions.
 *
 * @since 2.2.0
 * @since 5.5.0 Introduced `gettext-{$domain}` filter.
 *
 * @param string $text   Text to translate.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 * @return string Translated text.
 */
function translate( $text, $domain = 'default' ) {
	$translations = get_translations_for_domain( $domain );
	$translation  = $translations->translate( $text );

	/**
	 * Filters text with its translation.
	 *
	 * @since 2.0.11
	 *
	 * @param string $translation Translated text.
	 * @param string $text        Text to translate.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( 'gettext', $translation, $text, $domain );

	/**
	 * Filters text with its translation for a domain.
	 *
	 * The dynamic portion of the hook name, `$domain`, refers to the text domain.
	 *
	 * @since 5.5.0
	 *
	 * @param string $translation Translated text.
	 * @param string $text        Text to translate.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( "gettext_{$domain}", $translation, $text, $domain );

	return $translation;
}

/**
 * Removes last item on a pipe-delimited string.
 *
 * Meant for removing the last item in a string, such as 'Role name|User role'. The original
 * string will be returned if no pipe '|' characters are found in the string.
 *
 * @since 2.8.0
 *
 * @param string $text A pipe-delimited string.
 * @return string Either $text or everything before the last pipe.
 */
function before_last_bar( $text ) {
	$last_bar = strrpos( $text, '|' );
	if ( false === $last_bar ) {
		return $text;
	} else {
		return substr( $text, 0, $last_bar );
	}
}

/**
 * Retrieves the translation of $text in the context defined in $context.
 *
 * If there is no translation, or the text domain isn't loaded, the original text is returned.
 *
 * *Note:* Don't use translate_with_gettext_context() directly, use _x() or related functions.
 *
 * @since 2.8.0
 * @since 5.5.0 Introduced `gettext_with_context-{$domain}` filter.
 *
 * @param string $text    Text to translate.
 * @param string $context Context information for the translators.
 * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
 *                        Default 'default'.
 * @return string Translated text on success, original text on failure.
 */
function translate_with_gettext_context( $text, $context, $domain = 'default' ) {
	$translations = get_translations_for_domain( $domain );
	$translation  = $translations->translate( $text, $context );

	/**
	 * Filters text with its translation based on context information.
	 *
	 * @since 2.8.0
	 *
	 * @param string $translation Translated text.
	 * @param string $text        Text to translate.
	 * @param string $context     Context information for the translators.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( 'gettext_with_context', $translation, $text, $context, $domain );

	/**
	 * Filters text with its translation based on context information for a domain.
	 *
	 * The dynamic portion of the hook name, `$domain`, refers to the text domain.
	 *
	 * @since 5.5.0
	 *
	 * @param string $translation Translated text.
	 * @param string $text        Text to translate.
	 * @param string $context     Context information for the translators.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( "gettext_with_context_{$domain}", $translation, $text, $context, $domain );

	return $translation;
}

/**
 * Retrieves the translation of $text.
 *
 * If there is no translation, or the text domain isn't loaded, the original text is returned.
 *
 * @since 2.1.0
 *
 * @param string $text   Text to translate.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 * @return string Translated text.
 */
function __( $text, $domain = 'default' ) {
	return translate( $text, $domain );
}

/**
 * Retrieves the translation of $text and escapes it for safe use in an attribute.
 *
 * If there is no translation, or the text domain isn't loaded, the original text is returned.
 *
 * @since 2.8.0
 *
 * @param string $text   Text to translate.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 * @return string Translated text on success, original text on failure.
 */
function esc_attr__( $text, $domain = 'default' ) {
	return esc_attr( translate( $text, $domain ) );
}

/**
 * Retrieves the translation of $text and escapes it for safe use in HTML output.
 *
 * If there is no translation, or the text domain isn't loaded, the original text
 * is escaped and returned.
 *
 * @since 2.8.0
 *
 * @param string $text   Text to translate.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 * @return string Translated text.
 */
function esc_html__( $text, $domain = 'default' ) {
	return esc_html( translate( $text, $domain ) );
}

/**
 * Displays translated text.
 *
 * @since 1.2.0
 *
 * @param string $text   Text to translate.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 */
function _e( $text, $domain = 'default' ) {
	echo translate( $text, $domain );
}

/**
 * Displays translated text that has been escaped for safe use in an attribute.
 *
 * Encodes `< > & " '` (less than, greater than, ampersand, double quote, single quote).
 * Will never double encode entities.
 *
 * If you need the value for use in PHP, use esc_attr__().
 *
 * @since 2.8.0
 *
 * @param string $text   Text to translate.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 */
function esc_attr_e( $text, $domain = 'default' ) {
	echo esc_attr( translate( $text, $domain ) );
}

/**
 * Displays translated text that has been escaped for safe use in HTML output.
 *
 * If there is no translation, or the text domain isn't loaded, the original text
 * is escaped and displayed.
 *
 * If you need the value for use in PHP, use esc_html__().
 *
 * @since 2.8.0
 *
 * @param string $text   Text to translate.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 */
function esc_html_e( $text, $domain = 'default' ) {
	echo esc_html( translate( $text, $domain ) );
}

/**
 * Retrieves translated string with gettext context.
 *
 * Quite a few times, there will be collisions with similar translatable text
 * found in more than two places, but with different translated context.
 *
 * By including the context in the pot file, translators can translate the two
 * strings differently.
 *
 * @since 2.8.0
 *
 * @param string $text    Text to translate.
 * @param string $context Context information for the translators.
 * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
 *                        Default 'default'.
 * @return string Translated context string without pipe.
 */
function _x( $text, $context, $domain = 'default' ) {
	return translate_with_gettext_context( $text, $context, $domain );
}

/**
 * Displays translated string with gettext context.
 *
 * @since 3.0.0
 *
 * @param string $text    Text to translate.
 * @param string $context Context information for the translators.
 * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
 *                        Default 'default'.
 */
function _ex( $text, $context, $domain = 'default' ) {
	echo _x( $text, $context, $domain );
}

/**
 * Translates string with gettext context, and escapes it for safe use in an attribute.
 *
 * If there is no translation, or the text domain isn't loaded, the original text
 * is escaped and returned.
 *
 * @since 2.8.0
 *
 * @param string $text    Text to translate.
 * @param string $context Context information for the translators.
 * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
 *                        Default 'default'.
 * @return string Translated text.
 */
function esc_attr_x( $text, $context, $domain = 'default' ) {
	return esc_attr( translate_with_gettext_context( $text, $context, $domain ) );
}

/**
 * Translates string with gettext context, and escapes it for safe use in HTML output.
 *
 * If there is no translation, or the text domain isn't loaded, the original text
 * is escaped and returned.
 *
 * @since 2.9.0
 *
 * @param string $text    Text to translate.
 * @param string $context Context information for the translators.
 * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
 *                        Default 'default'.
 * @return string Translated text.
 */
function esc_html_x( $text, $context, $domain = 'default' ) {
	return esc_html( translate_with_gettext_context( $text, $context, $domain ) );
}

/**
 * Translates and retrieves the singular or plural form based on the supplied number.
 *
 * Used when you want to use the appropriate form of a string based on whether a
 * number is singular or plural.
 *
 * Example:
 *
 *     printf( _n( '%s person', '%s people', $count, 'text-domain' ), number_format_i18n( $count ) );
 *
 * @since 2.8.0
 * @since 5.5.0 Introduced `ngettext-{$domain}` filter.
 *
 * @param string $single The text to be used if the number is singular.
 * @param string $plural The text to be used if the number is plural.
 * @param int    $number The number to compare against to use either the singular or plural form.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 * @return string The translated singular or plural form.
 */
function _n( $single, $plural, $number, $domain = 'default' ) {
	$translations = get_translations_for_domain( $domain );
	$translation  = $translations->translate_plural( $single, $plural, $number );

	/**
	 * Filters the singular or plural form of a string.
	 *
	 * @since 2.2.0
	 *
	 * @param string $translation Translated text.
	 * @param string $single      The text to be used if the number is singular.
	 * @param string $plural      The text to be used if the number is plural.
	 * @param int    $number      The number to compare against to use either the singular or plural form.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( 'ngettext', $translation, $single, $plural, $number, $domain );

	/**
	 * Filters the singular or plural form of a string for a domain.
	 *
	 * The dynamic portion of the hook name, `$domain`, refers to the text domain.
	 *
	 * @since 5.5.0
	 *
	 * @param string $translation Translated text.
	 * @param string $single      The text to be used if the number is singular.
	 * @param string $plural      The text to be used if the number is plural.
	 * @param int    $number      The number to compare against to use either the singular or plural form.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( "ngettext_{$domain}", $translation, $single, $plural, $number, $domain );

	return $translation;
}

/**
 * Translates and retrieves the singular or plural form based on the supplied number, with gettext context.
 *
 * This is a hybrid of _n() and _x(). It supports context and plurals.
 *
 * Used when you want to use the appropriate form of a string with context based on whether a
 * number is singular or plural.
 *
 * Example of a generic phrase which is disambiguated via the context parameter:
 *
 *     printf( _nx( '%s group', '%s groups', $people, 'group of people', 'text-domain' ), number_format_i18n( $people ) );
 *     printf( _nx( '%s group', '%s groups', $animals, 'group of animals', 'text-domain' ), number_format_i18n( $animals ) );
 *
 * @since 2.8.0
 * @since 5.5.0 Introduced `ngettext_with_context-{$domain}` filter.
 *
 * @param string $single  The text to be used if the number is singular.
 * @param string $plural  The text to be used if the number is plural.
 * @param int    $number  The number to compare against to use either the singular or plural form.
 * @param string $context Context information for the translators.
 * @param string $domain  Optional. Text domain. Unique identifier for retrieving translated strings.
 *                        Default 'default'.
 * @return string The translated singular or plural form.
 */
function _nx( $single, $plural, $number, $context, $domain = 'default' ) {
	$translations = get_translations_for_domain( $domain );
	$translation  = $translations->translate_plural( $single, $plural, $number, $context );

	/**
	 * Filters the singular or plural form of a string with gettext context.
	 *
	 * @since 2.8.0
	 *
	 * @param string $translation Translated text.
	 * @param string $single      The text to be used if the number is singular.
	 * @param string $plural      The text to be used if the number is plural.
	 * @param int    $number      The number to compare against to use either the singular or plural form.
	 * @param string $context     Context information for the translators.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( 'ngettext_with_context', $translation, $single, $plural, $number, $context, $domain );

	/**
	 * Filters the singular or plural form of a string with gettext context for a domain.
	 *
	 * The dynamic portion of the hook name, `$domain`, refers to the text domain.
	 *
	 * @since 5.5.0
	 *
	 * @param string $translation Translated text.
	 * @param string $single      The text to be used if the number is singular.
	 * @param string $plural      The text to be used if the number is plural.
	 * @param int    $number      The number to compare against to use either the singular or plural form.
	 * @param string $context     Context information for the translators.
	 * @param string $domain      Text domain. Unique identifier for retrieving translated strings.
	 */
	$translation = apply_filters( "ngettext_with_context_{$domain}", $translation, $single, $plural, $number, $context, $domain );

	return $translation;
}

/**
 * Registers plural strings in POT file, but does not translate them.
 *
 * Used when you want to keep structures with translatable plural
 * strings and use them later when the number is known.
 *
 * Example:
 *
 *     $message = _n_noop( '%s post', '%s posts', 'text-domain' );
 *     ...
 *     printf( translate_nooped_plural( $message, $count, 'text-domain' ), number_format_i18n( $count ) );
 *
 * @since 2.5.0
 *
 * @param string $singular Singular form to be localized.
 * @param string $plural   Plural form to be localized.
 * @param string $domain   Optional. Text domain. Unique identifier for retrieving translated strings.
 *                         Default null.
 * @return array {
 *     Array of translation information for the strings.
 *
 *     @type string      $0        Singular form to be localized. No longer used.
 *     @type string      $1        Plural form to be localized. No longer used.
 *     @type string      $singular Singular form to be localized.
 *     @type string      $plural   Plural form to be localized.
 *     @type null        $context  Context information for the translators.
 *     @type string|null $domain   Text domain.
 * }
 */
function _n_noop( $singular, $plural, $domain = null ) {
	return array(
		0          => $singular,
		1          => $plural,
		'singular' => $singular,
		'plural'   => $plural,
		'context'  => null,
		'domain'   => $domain,
	);
}

/**
 * Registers plural strings with gettext context in POT file, but does not translate them.
 *
 * Used when you want to keep structures with translatable plural
 * strings and use them later when the number is known.
 *
 * Example of a generic phrase which is disambiguated via the context parameter:
 *
 *     $messages = array(
 *          'people'  => _nx_noop( '%s group', '%s groups', 'people', 'text-domain' ),
 *          'animals' => _nx_noop( '%s group', '%s groups', 'animals', 'text-domain' ),
 *     );
 *     ...
 *     $message = $messages[ $type ];
 *     printf( translate_nooped_plural( $message, $count, 'text-domain' ), number_format_i18n( $count ) );
 *
 * @since 2.8.0
 *
 * @param string $singular Singular form to be localized.
 * @param string $plural   Plural form to be localized.
 * @param string $context  Context information for the translators.
 * @param string $domain   Optional. Text domain. Unique identifier for retrieving translated strings.
 *                         Default null.
 * @return array {
 *     Array of translation information for the strings.
 *
 *     @type string      $0        Singular form to be localized. No longer used.
 *     @type string      $1        Plural form to be localized. No longer used.
 *     @type string      $2        Context information for the translators. No longer used.
 *     @type string      $singular Singular form to be localized.
 *     @type string      $plural   Plural form to be localized.
 *     @type string      $context  Context information for the translators.
 *     @type string|null $domain   Text domain.
 * }
 */
function _nx_noop( $singular, $plural, $context, $domain = null ) {
	return array(
		0          => $singular,
		1          => $plural,
		2          => $context,
		'singular' => $singular,
		'plural'   => $plural,
		'context'  => $context,
		'domain'   => $domain,
	);
}

/**
 * Translates and returns the singular or plural form of a string that's been registered
 * with _n_noop() or _nx_noop().
 *
 * Used when you want to use a translatable plural string once the number is known.
 *
 * Example:
 *
 *     $message = _n_noop( '%s post', '%s posts', 'text-domain' );
 *     ...
 *     printf( translate_nooped_plural( $message, $count, 'text-domain' ), number_format_i18n( $count ) );
 *
 * @since 3.1.0
 *
 * @param array  $nooped_plural {
 *     Array that is usually a return value from _n_noop() or _nx_noop().
 *
 *     @type string      $singular Singular form to be localized.
 *     @type string      $plural   Plural form to be localized.
 *     @type string|null $context  Context information for the translators.
 *     @type string|null $domain   Text domain.
 * }
 * @param int    $count         Number of objects.
 * @param string $domain        Optional. Text domain. Unique identifier for retrieving translated strings. If $nooped_plural contains
 *                              a text domain passed to _n_noop() or _nx_noop(), it will override this value. Default 'default'.
 * @return string Either $singular or $plural translated text.
 */
function translate_nooped_plural( $nooped_plural, $count, $domain = 'default' ) {
	if ( $nooped_plural['domain'] ) {
		$domain = $nooped_plural['domain'];
	}

	if ( $nooped_plural['context'] ) {
		return _nx( $nooped_plural['singular'], $nooped_plural['plural'], $count, $nooped_plural['context'], $domain );
	} else {
		return _n( $nooped_plural['singular'], $nooped_plural['plural'], $count, $domain );
	}
}

/**
 * Loads a .mo file into the text domain $domain.
 *
 * If the text domain already exists, the translations will be merged. If both
 * sets have the same string, the translation from the original value will be taken.
 *
 * On success, the .mo file will be placed in the $l10n global by $domain
 * and will be a MO object.
 *
 * @since 1.5.0
 * @since 6.1.0 Added the `$locale` parameter.
 *
 * @global MO[]                   $l10n                   An array of all currently loaded text domains.
 * @global MO[]                   $l10n_unloaded          An array of all text domains that have been unloaded again.
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 *
 * @param string $domain Text domain. Unique identifier for retrieving translated strings.
 * @param string $mofile Path to the .mo file.
 * @param string $locale Optional. Locale. Default is the current locale.
 * @return bool True on success, false on failure.
 */
function load_textdomain( $domain, $mofile, $locale = null ) {
	/** @var WP_Textdomain_Registry $wp_textdomain_registry */
	global $l10n, $l10n_unloaded, $wp_textdomain_registry;

	$l10n_unloaded = (array) $l10n_unloaded;

	if ( ! is_string( $domain ) ) {
		return false;
	}

	/**
	 * Filters whether to short-circuit loading .mo file.
	 *
	 * Returning a non-null value from the filter will effectively short-circuit
	 * the loading, returning the passed value instead.
	 *
	 * @since 6.3.0
	 *
	 * @param bool|null   $loaded The result of loading a .mo file. Default null.
	 * @param string      $domain Text domain. Unique identifier for retrieving translated strings.
	 * @param string      $mofile Path to the MO file.
	 * @param string|null $locale Locale.
	 */
	$loaded = apply_filters( 'pre_load_textdomain', null, $domain, $mofile, $locale );
	if ( null !== $loaded ) {
		if ( true === $loaded ) {
			unset( $l10n_unloaded[ $domain ] );
		}

		return $loaded;
	}

	/**
	 * Filters whether to override the .mo file loading.
	 *
	 * @since 2.9.0
	 * @since 6.2.0 Added the `$locale` parameter.
	 *
	 * @param bool        $override Whether to override the .mo file loading. Default false.
	 * @param string      $domain   Text domain. Unique identifier for retrieving translated strings.
	 * @param string      $mofile   Path to the MO file.
	 * @param string|null $locale   Locale.
	 */
	$plugin_override = apply_filters( 'override_load_textdomain', false, $domain, $mofile, $locale );

	if ( true === (bool) $plugin_override ) {
		unset( $l10n_unloaded[ $domain ] );

		return true;
	}

	/**
	 * Fires before the MO translation file is loaded.
	 *
	 * @since 2.9.0
	 *
	 * @param string $domain Text domain. Unique identifier for retrieving translated strings.
	 * @param string $mofile Path to the .mo file.
	 */
	do_action( 'load_textdomain', $domain, $mofile );

	/**
	 * Filters MO file path for loading translations for a specific text domain.
	 *
	 * @since 2.9.0
	 *
	 * @param string $mofile Path to the MO file.
	 * @param string $domain Text domain. Unique identifier for retrieving translated strings.
	 */
	$mofile = apply_filters( 'load_textdomain_mofile', $mofile, $domain );

	if ( ! $locale ) {
		$locale = determine_locale();
	}

	$i18n_controller = WP_Translation_Controller::get_instance();

	// Ensures the correct locale is set as the current one, in case it was filtered.
	$i18n_controller->set_locale( $locale );

	/**
	 * Filters the preferred file format for translation files.
	 *
	 * Can be used to disable the use of PHP files for translations.
	 *
	 * @since 6.5.0
	 *
	 * @param string $preferred_format Preferred file format. Possible values: 'php', 'mo'. Default: 'php'.
	 * @param string $domain           The text domain.
	 */
	$preferred_format = apply_filters( 'translation_file_format', 'php', $domain );
	if ( ! in_array( $preferred_format, array( 'php', 'mo' ), true ) ) {
		$preferred_format = 'php';
	}

	$translation_files = array();

	if ( 'mo' !== $preferred_format ) {
		$translation_files[] = substr_replace( $mofile, ".l10n.$preferred_format", - strlen( '.mo' ) );
	}

	$translation_files[] = $mofile;

	foreach ( $translation_files as $file ) {
		/**
		 * Filters the file path for loading translations for the given text domain.
		 *
		 * Similar to the {@see 'load_textdomain_mofile'} filter with the difference that
		 * the file path could be for an MO or PHP file.
		 *
		 * @since 6.5.0
		 * @since 6.6.0 Added the `$locale` parameter.
		 *
		 * @param string $file   Path to the translation file to load.
		 * @param string $domain The text domain.
		 * @param string $locale The locale.
		 */
		$file = (string) apply_filters( 'load_translation_file', $file, $domain, $locale );

		$success = $i18n_controller->load_file( $file, $domain, $locale );

		if ( $success ) {
			if ( isset( $l10n[ $domain ] ) && $l10n[ $domain ] instanceof MO ) {
				$i18n_controller->load_file( $l10n[ $domain ]->get_filename(), $domain, $locale );
			}

			// Unset NOOP_Translations reference in get_translations_for_domain().
			unset( $l10n[ $domain ] );

			$l10n[ $domain ] = new WP_Translations( $i18n_controller, $domain );

			$wp_textdomain_registry->set( $domain, $locale, dirname( $file ) );

			return true;
		}
	}

	return false;
}

/**
 * Unloads translations for a text domain.
 *
 * @since 3.0.0
 * @since 6.1.0 Added the `$reloadable` parameter.
 *
 * @global MO[] $l10n          An array of all currently loaded text domains.
 * @global MO[] $l10n_unloaded An array of all text domains that have been unloaded again.
 *
 * @param string $domain     Text domain. Unique identifier for retrieving translated strings.
 * @param bool   $reloadable Whether the text domain can be loaded just-in-time again.
 * @return bool Whether textdomain was unloaded.
 */
function unload_textdomain( $domain, $reloadable = false ) {
	global $l10n, $l10n_unloaded;

	$l10n_unloaded = (array) $l10n_unloaded;

	/**
	 * Filters whether to override the text domain unloading.
	 *
	 * @since 3.0.0
	 * @since 6.1.0 Added the `$reloadable` parameter.
	 *
	 * @param bool   $override   Whether to override the text domain unloading. Default false.
	 * @param string $domain     Text domain. Unique identifier for retrieving translated strings.
	 * @param bool   $reloadable Whether the text domain can be loaded just-in-time again.
	 */
	$plugin_override = apply_filters( 'override_unload_textdomain', false, $domain, $reloadable );

	if ( $plugin_override ) {
		if ( ! $reloadable ) {
			$l10n_unloaded[ $domain ] = true;
		}

		return true;
	}

	/**
	 * Fires before the text domain is unloaded.
	 *
	 * @since 3.0.0
	 * @since 6.1.0 Added the `$reloadable` parameter.
	 *
	 * @param string $domain     Text domain. Unique identifier for retrieving translated strings.
	 * @param bool   $reloadable Whether the text domain can be loaded just-in-time again.
	 */
	do_action( 'unload_textdomain', $domain, $reloadable );

	// Since multiple locales are supported, reloadable text domains don't actually need to be unloaded.
	if ( ! $reloadable ) {
		WP_Translation_Controller::get_instance()->unload_textdomain( $domain );
	}

	if ( isset( $l10n[ $domain ] ) ) {
		if ( $l10n[ $domain ] instanceof NOOP_Translations ) {
			unset( $l10n[ $domain ] );

			return false;
		}

		unset( $l10n[ $domain ] );

		if ( ! $reloadable ) {
			$l10n_unloaded[ $domain ] = true;
		}

		return true;
	}

	return false;
}

/**
 * Loads default translated strings based on locale.
 *
 * Loads the .mo file in WP_LANG_DIR constant path from WordPress root.
 * The translated (.mo) file is named based on the locale.
 *
 * @see load_textdomain()
 *
 * @since 1.5.0
 *
 * @param string $locale Optional. Locale to load. Default is the value of get_locale().
 * @return bool Whether the textdomain was loaded.
 */
function load_default_textdomain( $locale = null ) {
	if ( null === $locale ) {
		$locale = determine_locale();
	}

	// Unload previously loaded strings so we can switch translations.
	unload_textdomain( 'default', true );

	$return = load_textdomain( 'default', WP_LANG_DIR . "/$locale.mo", $locale );

	if ( ( is_multisite() || ( defined( 'WP_INSTALLING_NETWORK' ) && WP_INSTALLING_NETWORK ) ) && ! file_exists( WP_LANG_DIR . "/admin-$locale.mo" ) ) {
		load_textdomain( 'default', WP_LANG_DIR . "/ms-$locale.mo", $locale );
		return $return;
	}

	if ( is_admin() || wp_installing() || ( defined( 'WP_REPAIRING' ) && WP_REPAIRING ) || doing_action( 'wp_maybe_auto_update' ) ) {
		load_textdomain( 'default', WP_LANG_DIR . "/admin-$locale.mo", $locale );
	}

	if ( is_network_admin() || ( defined( 'WP_INSTALLING_NETWORK' ) && WP_INSTALLING_NETWORK ) ) {
		load_textdomain( 'default', WP_LANG_DIR . "/admin-network-$locale.mo", $locale );
	}

	return $return;
}

/**
 * Loads a plugin's translated strings.
 *
 * If the path is not given then it will be the root of the plugin directory.
 *
 * The .mo file should be named based on the text domain with a dash, and then the locale exactly.
 *
 * @since 1.5.0
 * @since 4.6.0 The function now tries to load the .mo file from the languages directory first.
 * @since 6.7.0 Translations are no longer immediately loaded, but handed off to the just-in-time loading mechanism.
 *
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 * @global array<string, WP_Translations|NOOP_Translations> $l10n An array of all currently loaded text domains.
 *
 * @param string       $domain          Unique identifier for retrieving translated strings
 * @param string|false $deprecated      Optional. Deprecated. Use the $plugin_rel_path parameter instead.
 *                                      Default false.
 * @param string|false $plugin_rel_path Optional. Relative path to WP_PLUGIN_DIR where the .mo file resides.
 *                                      Default false.
 * @return bool True when textdomain is successfully loaded, false otherwise.
 */
function load_plugin_textdomain( $domain, $deprecated = false, $plugin_rel_path = false ) {
	/** @var WP_Textdomain_Registry $wp_textdomain_registry */
	/** @var array<string, WP_Translations|NOOP_Translations> $l10n */
	global $wp_textdomain_registry, $l10n;

	if ( ! is_string( $domain ) ) {
		return false;
	}

	if ( false !== $plugin_rel_path ) {
		$path = WP_PLUGIN_DIR . '/' . trim( $plugin_rel_path, '/' );
	} elseif ( false !== $deprecated ) {
		_deprecated_argument( __FUNCTION__, '2.7.0' );
		$path = ABSPATH . trim( $deprecated, '/' );
	} else {
		$path = WP_PLUGIN_DIR;
	}

	$wp_textdomain_registry->set_custom_path( $domain, $path );

	// If just-in-time loading was triggered before, reset the entry so it can be tried again.
	if ( isset( $l10n[ $domain ] ) && $l10n[ $domain ] instanceof NOOP_Translations ) {
		unset( $l10n[ $domain ] );
	}

	return true;
}

/**
 * Loads the translated strings for a plugin residing in the mu-plugins directory.
 *
 * @since 3.0.0
 * @since 4.6.0 The function now tries to load the .mo file from the languages directory first.
 * @since 6.7.0 Translations are no longer immediately loaded, but handed off to the just-in-time loading mechanism.
 *
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 * @global array<string, WP_Translations|NOOP_Translations> $l10n An array of all currently loaded text domains.
 *
 * @param string $domain             Text domain. Unique identifier for retrieving translated strings.
 * @param string $mu_plugin_rel_path Optional. Relative to `WPMU_PLUGIN_DIR` directory in which the .mo
 *                                   file resides. Default empty string.
 * @return bool True when textdomain is successfully loaded, false otherwise.
 */
function load_muplugin_textdomain( $domain, $mu_plugin_rel_path = '' ) {
	/** @var WP_Textdomain_Registry $wp_textdomain_registry */
	/** @var array<string, WP_Translations|NOOP_Translations> $l10n */
	global $wp_textdomain_registry, $l10n;

	if ( ! is_string( $domain ) ) {
		return false;
	}

	$path = WPMU_PLUGIN_DIR . '/' . ltrim( $mu_plugin_rel_path, '/' );

	$wp_textdomain_registry->set_custom_path( $domain, $path );

	// If just-in-time loading was triggered before, reset the entry so it can be tried again.
	if ( isset( $l10n[ $domain ] ) && $l10n[ $domain ] instanceof NOOP_Translations ) {
		unset( $l10n[ $domain ] );
	}

	return true;
}

/**
 * Loads the theme's translated strings.
 *
 * If the current locale exists as a .mo file in the theme's root directory, it
 * will be included in the translated strings by the $domain.
 *
 * The .mo files must be named based on the locale exactly.
 *
 * @since 1.5.0
 * @since 4.6.0 The function now tries to load the .mo file from the languages directory first.
 * @since 6.7.0 Translations are no longer immediately loaded, but handed off to the just-in-time loading mechanism.
 *
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 * @global array<string, WP_Translations|NOOP_Translations> $l10n An array of all currently loaded text domains.
 *
 * @param string       $domain Text domain. Unique identifier for retrieving translated strings.
 * @param string|false $path   Optional. Path to the directory containing the .mo file.
 *                             Default false.
 * @return bool True when textdomain is successfully loaded, false otherwise.
 */
function load_theme_textdomain( $domain, $path = false ) {
	/** @var WP_Textdomain_Registry $wp_textdomain_registry */
	/** @var array<string, WP_Translations|NOOP_Translations> $l10n */
	global $wp_textdomain_registry, $l10n;

	if ( ! is_string( $domain ) ) {
		return false;
	}

	if ( ! $path ) {
		$path = get_template_directory();
	}

	$wp_textdomain_registry->set_custom_path( $domain, $path );

	// If just-in-time loading was triggered before, reset the entry so it can be tried again.
	if ( isset( $l10n[ $domain ] ) && $l10n[ $domain ] instanceof NOOP_Translations ) {
		unset( $l10n[ $domain ] );
	}

	return true;
}

/**
 * Loads the child theme's translated strings.
 *
 * If the current locale exists as a .mo file in the child theme's
 * root directory, it will be included in the translated strings by the $domain.
 *
 * The .mo files must be named based on the locale exactly.
 *
 * @since 2.9.0
 *
 * @param string       $domain Text domain. Unique identifier for retrieving translated strings.
 * @param string|false $path   Optional. Path to the directory containing the .mo file.
 *                             Default false.
 * @return bool True when the theme textdomain is successfully loaded, false otherwise.
 */
function load_child_theme_textdomain( $domain, $path = false ) {
	if ( ! $path ) {
		$path = get_stylesheet_directory();
	}
	return load_theme_textdomain( $domain, $path );
}

/**
 * Loads the script translated strings.
 *
 * @since 5.0.0
 * @since 5.0.2 Uses load_script_translations() to load translation data.
 * @since 5.1.0 The `$domain` parameter was made optional.
 *
 * @see WP_Scripts::set_translations()
 *
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 *
 * @param string $handle Name of the script to register a translation domain to.
 * @param string $domain Optional. Text domain. Default 'default'.
 * @param string $path   Optional. The full file path to the directory containing translation files.
 * @return string|false The translated strings in JSON encoding on success,
 *                      false if the script textdomain could not be loaded.
 */
function load_script_textdomain( $handle, $domain = 'default', $path = '' ) {
	/** @var WP_Textdomain_Registry $wp_textdomain_registry */
	global $wp_textdomain_registry;

	$wp_scripts = wp_scripts();

	if ( ! isset( $wp_scripts->registered[ $handle ] ) ) {
		return false;
	}

	$locale = determine_locale();

	if ( ! $path ) {
		$path = $wp_textdomain_registry->get( $domain, $locale );
	}

	$path = untrailingslashit( $path );

	// If a path was given and the handle file exists simply return it.
	$file_base       = 'default' === $domain ? $locale : $domain . '-' . $locale;
	$handle_filename = $file_base . '-' . $handle . '.json';

	if ( $path ) {
		$translations = load_script_translations( $path . '/' . $handle_filename, $handle, $domain );

		if ( $translations ) {
			return $translations;
		}
	}

	$src = $wp_scripts->registered[ $handle ]->src;

	if ( ! preg_match( '|^(https?:)?//|', $src ) && ! ( $wp_scripts->content_url && str_starts_with( $src, $wp_scripts->content_url ) ) ) {
		$src = $wp_scripts->base_url . $src;
	}

	$relative       = false;
	$languages_path = WP_LANG_DIR;

	$src_url     = wp_parse_url( $src );
	$content_url = wp_parse_url( content_url() );
	$plugins_url = wp_parse_url( plugins_url() );
	$site_url    = wp_parse_url( site_url() );
	$theme_root  = get_theme_root();

	// If the host is the same or it's a relative URL.
	if (
		( ! isset( $content_url['path'] ) || str_starts_with( $src_url['path'], $content_url['path'] ) ) &&
		( ! isset( $src_url['host'] ) || ! isset( $content_url['host'] ) || $src_url['host'] === $content_url['host'] )
	) {
		// Make the src relative the specific plugin or theme.
		if ( isset( $content_url['path'] ) ) {
			$relative = substr( $src_url['path'], strlen( $content_url['path'] ) );
		} else {
			$relative = $src_url['path'];
		}
		$relative = trim( $relative, '/' );
		$relative = explode( '/', $relative );

		/*
		 * Ensure correct languages path when using a custom `WP_PLUGIN_DIR` / `WP_PLUGIN_URL` configuration,
		 * a custom theme root, and/or using Multisite with subdirectories.
		 * See https://core.trac.wordpress.org/ticket/60891 and https://core.trac.wordpress.org/ticket/62016.
		 */

		$theme_dir = array_slice( explode( '/', $theme_root ), -1 );
		$dirname   = $theme_dir[0] === $relative[0] ? 'themes' : 'plugins';

		$languages_path = WP_LANG_DIR . '/' . $dirname;

		$relative = array_slice( $relative, 2 ); // Remove plugins/<plugin name> or themes/<theme name>.
		$relative = implode( '/', $relative );
	} elseif (
		( ! isset( $plugins_url['path'] ) || str_starts_with( $src_url['path'], $plugins_url['path'] ) ) &&
		( ! isset( $src_url['host'] ) || ! isset( $plugins_url['host'] ) || $src_url['host'] === $plugins_url['host'] )
	) {
		// Make the src relative the specific plugin.
		if ( isset( $plugins_url['path'] ) ) {
			$relative = substr( $src_url['path'], strlen( $plugins_url['path'] ) );
		} else {
			$relative = $src_url['path'];
		}
		$relative = trim( $relative, '/' );
		$relative = explode( '/', $relative );

		$languages_path = WP_LANG_DIR . '/plugins';

		$relative = array_slice( $relative, 1 ); // Remove <plugin name>.
		$relative = implode( '/', $relative );
	} elseif ( ! isset( $src_url['host'] ) || ! isset( $site_url['host'] ) || $src_url['host'] === $site_url['host'] ) {
		if ( ! isset( $site_url['path'] ) ) {
			$relative = trim( $src_url['path'], '/' );
		} elseif ( str_starts_with( $src_url['path'], trailingslashit( $site_url['path'] ) ) ) {
			// Make the src relative to the WP root.
			$relative = substr( $src_url['path'], strlen( $site_url['path'] ) );
			$relative = trim( $relative, '/' );
		}
	}

	/**
	 * Filters the relative path of scripts used for finding translation files.
	 *
	 * @since 5.0.2
	 *
	 * @param string|false $relative The relative path of the script. False if it could not be determined.
	 * @param string       $src      The full source URL of the script.
	 */
	$relative = apply_filters( 'load_script_textdomain_relative_path', $relative, $src );

	// If the source is not from WP.
	if ( false === $relative ) {
		return load_script_translations( false, $handle, $domain );
	}

	// Translations are always based on the unminified filename.
	if ( str_ends_with( $relative, '.min.js' ) ) {
		$relative = substr( $relative, 0, -7 ) . '.js';
	}

	$md5_filename = $file_base . '-' . md5( $relative ) . '.json';

	if ( $path ) {
		$translations = load_script_translations( $path . '/' . $md5_filename, $handle, $domain );

		if ( $translations ) {
			return $translations;
		}
	}

	$translations = load_script_translations( $languages_path . '/' . $md5_filename, $handle, $domain );

	if ( $translations ) {
		return $translations;
	}

	return load_script_translations( false, $handle, $domain );
}

/**
 * Loads the translation data for the given script handle and text domain.
 *
 * @since 5.0.2
 *
 * @param string|false $file   Path to the translation file to load. False if there isn't one.
 * @param string       $handle Name of the script to register a translation domain to.
 * @param string       $domain The text domain.
 * @return string|false The JSON-encoded translated strings for the given script handle and text domain.
 *                      False if there are none.
 */
function load_script_translations( $file, $handle, $domain ) {
	/**
	 * Pre-filters script translations for the given file, script handle and text domain.
	 *
	 * Returning a non-null value allows to override the default logic, effectively short-circuiting the function.
	 *
	 * @since 5.0.2
	 *
	 * @param string|false|null $translations JSON-encoded translation data. Default null.
	 * @param string|false      $file         Path to the translation file to load. False if there isn't one.
	 * @param string            $handle       Name of the script to register a translation domain to.
	 * @param string            $domain       The text domain.
	 */
	$translations = apply_filters( 'pre_load_script_translations', null, $file, $handle, $domain );

	if ( null !== $translations ) {
		return $translations;
	}

	/**
	 * Filters the file path for loading script translations for the given script handle and text domain.
	 *
	 * @since 5.0.2
	 *
	 * @param string|false $file   Path to the translation file to load. False if there isn't one.
	 * @param string       $handle Name of the script to register a translation domain to.
	 * @param string       $domain The text domain.
	 */
	$file = apply_filters( 'load_script_translation_file', $file, $handle, $domain );

	if ( ! $file || ! is_readable( $file ) ) {
		return false;
	}

	$translations = file_get_contents( $file );

	/**
	 * Filters script translations for the given file, script handle and text domain.
	 *
	 * @since 5.0.2
	 *
	 * @param string $translations JSON-encoded translation data.
	 * @param string $file         Path to the translation file that was loaded.
	 * @param string $handle       Name of the script to register a translation domain to.
	 * @param string $domain       The text domain.
	 */
	return apply_filters( 'load_script_translations', $translations, $file, $handle, $domain );
}

/**
 * Loads plugin and theme text domains just-in-time.
 *
 * When a textdomain is encountered for the first time, we try to load
 * the translation file from `wp-content/languages`, removing the need
 * to call load_plugin_textdomain() or load_theme_textdomain().
 *
 * @since 4.6.0
 * @access private
 *
 * @global MO[]                   $l10n_unloaded          An array of all text domains that have been unloaded again.
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 *
 * @param string $domain Text domain. Unique identifier for retrieving translated strings.
 * @return bool True when the textdomain is successfully loaded, false otherwise.
 */
function _load_textdomain_just_in_time( $domain ) {
	/** @var WP_Textdomain_Registry $wp_textdomain_registry */
	global $l10n_unloaded, $wp_textdomain_registry;

	$l10n_unloaded = (array) $l10n_unloaded;

	// Short-circuit if domain is 'default' which is reserved for core.
	if ( 'default' === $domain || isset( $l10n_unloaded[ $domain ] ) ) {
		return false;
	}

	if ( ! $wp_textdomain_registry->has( $domain ) ) {
		return false;
	}

	$locale = determine_locale();
	$path   = $wp_textdomain_registry->get( $domain, $locale );
	if ( ! $path ) {
		return false;
	}

	if ( ! doing_action( 'after_setup_theme' ) && ! did_action( 'after_setup_theme' ) ) {
		_doing_it_wrong(
			__FUNCTION__,
			sprintf(
				/* translators: 1: The text domain. 2: 'init'. */
				__( 'Translation loading for the %1$s domain was triggered too early. This is usually an indicator for some code in the plugin or theme running too early. Translations should be loaded at the %2$s action or later.' ),
				'<code>' . $domain . '</code>',
				'<code>init</code>'
			),
			'6.7.0'
		);
	}

	// Themes with their language directory outside of WP_LANG_DIR have a different file name.
	$template_directory   = trailingslashit( get_template_directory() );
	$stylesheet_directory = trailingslashit( get_stylesheet_directory() );
	if ( str_starts_with( $path, $template_directory ) || str_starts_with( $path, $stylesheet_directory ) ) {
		$mofile = "{$path}{$locale}.mo";
	} else {
		$mofile = "{$path}{$domain}-{$locale}.mo";
	}

	return load_textdomain( $domain, $mofile, $locale );
}

/**
 * Returns the Translations instance for a text domain.
 *
 * If there isn't one, returns empty Translations instance.
 *
 * @since 2.8.0
 *
 * @global MO[] $l10n An array of all currently loaded text domains.
 *
 * @param string $domain Text domain. Unique identifier for retrieving translated strings.
 * @return Translations|NOOP_Translations A Translations instance.
 */
function get_translations_for_domain( $domain ) {
	global $l10n;
	if ( isset( $l10n[ $domain ] ) || ( _load_textdomain_just_in_time( $domain ) && isset( $l10n[ $domain ] ) ) ) {
		return $l10n[ $domain ];
	}

	static $noop_translations = null;
	if ( null === $noop_translations ) {
		$noop_translations = new NOOP_Translations();
	}

	$l10n[ $domain ] = &$noop_translations;

	return $noop_translations;
}

/**
 * Determines whether there are translations for the text domain.
 *
 * @since 3.0.0
 *
 * @global MO[] $l10n An array of all currently loaded text domains.
 *
 * @param string $domain Text domain. Unique identifier for retrieving translated strings.
 * @return bool Whether there are translations.
 */
function is_textdomain_loaded( $domain ) {
	global $l10n;
	return isset( $l10n[ $domain ] ) && ! $l10n[ $domain ] instanceof NOOP_Translations;
}

/**
 * Translates role name.
 *
 * Since the role names are in the database and not in the source there
 * are dummy gettext calls to get them into the POT file and this function
 * properly translates them back.
 *
 * The before_last_bar() call is needed, because older installations keep the roles
 * using the old context format: 'Role name|User role' and just skipping the
 * content after the last bar is easier than fixing them in the DB. New installations
 * won't suffer from that problem.
 *
 * @since 2.8.0
 * @since 5.2.0 Added the `$domain` parameter.
 *
 * @param string $name   The role name.
 * @param string $domain Optional. Text domain. Unique identifier for retrieving translated strings.
 *                       Default 'default'.
 * @return string Translated role name on success, original name on failure.
 */
function translate_user_role( $name, $domain = 'default' ) {
	return translate_with_gettext_context( before_last_bar( $name ), 'User role', $domain );
}

/**
 * Gets all available languages based on the presence of *.mo and *.l10n.php files in a given directory.
 *
 * The default directory is WP_LANG_DIR.
 *
 * @since 3.0.0
 * @since 4.7.0 The results are now filterable with the {@see 'get_available_languages'} filter.
 * @since 6.5.0 The initial file list is now cached and also takes into account *.l10n.php files.
 *
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 *
 * @param string $dir A directory to search for language files.
 *                    Default WP_LANG_DIR.
 * @return string[] An array of language codes or an empty array if no languages are present.
 *                  Language codes are formed by stripping the file extension from the language file names.
 */
function get_available_languages( $dir = null ) {
	global $wp_textdomain_registry;

	$languages = array();

	$path       = is_null( $dir ) ? WP_LANG_DIR : $dir;
	$lang_files = $wp_textdomain_registry->get_language_files_from_path( $path );

	if ( $lang_files ) {
		foreach ( $lang_files as $lang_file ) {
			$lang_file = basename( $lang_file, '.mo' );
			$lang_file = basename( $lang_file, '.l10n.php' );

			if ( ! str_starts_with( $lang_file, 'continents-cities' ) && ! str_starts_with( $lang_file, 'ms-' ) &&
				! str_starts_with( $lang_file, 'admin-' ) ) {
				$languages[] = $lang_file;
			}
		}
	}

	/**
	 * Filters the list of available language codes.
	 *
	 * @since 4.7.0
	 *
	 * @param string[] $languages An array of available language codes.
	 * @param string   $dir       The directory where the language files were found.
	 */
	return apply_filters( 'get_available_languages', array_unique( $languages ), $dir );
}

/**
 * Gets installed translations.
 *
 * Looks in the wp-content/languages directory for translations of
 * plugins or themes.
 *
 * @since 3.7.0
 *
 * @global WP_Textdomain_Registry $wp_textdomain_registry WordPress Textdomain Registry.
 *
 * @param string $type What to search for. Accepts 'plugins', 'themes', 'core'.
 * @return array Array of language data.
 */
function wp_get_installed_translations( $type ) {
	global $wp_textdomain_registry;

	if ( 'themes' !== $type && 'plugins' !== $type && 'core' !== $type ) {
		return array();
	}

	$dir = 'core' === $type ? WP_LANG_DIR : WP_LANG_DIR . "/$type";

	if ( ! is_dir( $dir ) ) {
		return array();
	}

	$files = $wp_textdomain_registry->get_language_files_from_path( $dir );
	if ( ! $files ) {
		return array();
	}

	$language_data = array();

	foreach ( $files as $file ) {
		if ( ! preg_match( '/(?:(.+)-)?([a-z]{2,3}(?:_[A-Z]{2})?(?:_[a-z0-9]+)?)\.(?:mo|l10n\.php)/', basename( $file ), $match ) ) {
			continue;
		}

		list( , $textdomain, $language ) = $match;
		if ( '' === $textdomain ) {
			$textdomain = 'default';
		}

		if ( str_ends_with( $file, '.mo' ) ) {
			$pofile = substr_replace( $file, '.po', - strlen( '.mo' ) );

			if ( ! file_exists( $pofile ) ) {
				continue;
			}

			$language_data[ $textdomain ][ $language ] = wp_get_pomo_file_data( $pofile );
		} else {
			$pofile = substr_replace( $file, '.po', - strlen( '.l10n.php' ) );

			// If both a PO and a PHP file exist, prefer the PO file.
			if ( file_exists( $pofile ) ) {
				continue;
			}

			$language_data[ $textdomain ][ $language ] = wp_get_l10n_php_file_data( $file );
		}
	}
	return $language_data;
}

/**
 * Extracts headers from a PO file.
 *
 * @since 3.7.0
 *
 * @param string $po_file Path to PO file.
 * @return string[] Array of PO file header values keyed by header name.
 */
function wp_get_pomo_file_data( $po_file ) {
	$headers = get_file_data(
		$po_file,
		array(
			'POT-Creation-Date'  => '"POT-Creation-Date',
			'PO-Revision-Date'   => '"PO-Revision-Date',
			'Project-Id-Version' => '"Project-Id-Version',
			'X-Generator'        => '"X-Generator',
		)
	);
	foreach ( $headers as $header => $value ) {
		// Remove possible contextual '\n' and closing double quote.
		$headers[ $header ] = preg_replace( '~(\\\n)?"$~', '', $value );
	}
	return $headers;
}

/**
 * Extracts headers from a PHP translation file.
 *
 * @since 6.6.0
 *
 * @param string $php_file Path to a `.l10n.php` file.
 * @return string[] Array of file header values keyed by header name.
 */
function wp_get_l10n_php_file_data( $php_file ) {
	$data = (array) include $php_file;

	unset( $data['messages'] );
	$headers = array(
		'POT-Creation-Date'  => 'pot-creation-date',
		'PO-Revision-Date'   => 'po-revision-date',
		'Project-Id-Version' => 'project-id-version',
		'X-Generator'        => 'x-generator',
	);

	$result = array(
		'POT-Creation-Date'  => '',
		'PO-Revision-Date'   => '',
		'Project-Id-Version' => '',
		'X-Generator'        => '',
	);

	foreach ( $headers as $po_header => $php_header ) {
		if ( isset( $data[ $php_header ] ) ) {
			$result[ $po_header ] = $data[ $php_header ];
		}
	}

	return $result;
}

/**
 * Displays or returns a Language selector.
 *
 * @since 4.0.0
 * @since 4.3.0 Introduced the `echo` argument.
 * @since 4.7.0 Introduced the `show_option_site_default` argument.
 * @since 5.1.0 Introduced the `show_option_en_us` argument.
 * @since 5.9.0 Introduced the `explicit_option_en_us` argument.
 *
 * @see get_available_languages()
 * @see wp_get_available_translations()
 *
 * @param string|array $args {
 *     Optional. Array or string of arguments for outputting the language selector.
 *
 *     @type string   $id                           ID attribute of the select element. Default 'locale'.
 *     @type string   $name                         Name attribute of the select element. Default 'locale'.
 *     @type string[] $languages                    List of installed languages, contain only the locales.
 *                                                  Default empty array.
 *     @type array    $translations                 List of available translations. Default result of
 *                                                  wp_get_available_translations().
 *     @type string   $selected                     Language which should be selected. Default empty.
 *     @type bool|int $echo                         Whether to echo the generated markup. Accepts 0, 1, or their
 *                                                  boolean equivalents. Default 1.
 *     @type bool     $show_available_translations  Whether to show available translations. Default true.
 *     @type bool     $show_option_site_default     Whether to show an option to fall back to the site's locale. Default false.
 *     @type bool     $show_option_en_us            Whether to show an option for English (United States). Default true.
 *     @type bool     $explicit_option_en_us        Whether the English (United States) option uses an explicit value of en_US
 *                                                  instead of an empty value. Default false.
 * }
 * @return string HTML dropdown list of languages.
 */
function wp_dropdown_languages( $args = array() ) {

	$parsed_args = wp_parse_args(
		$args,
		array(
			'id'                          => 'locale',
			'name'                        => 'locale',
			'languages'                   => array(),
			'translations'                => array(),
			'selected'                    => '',
			'echo'                        => 1,
			'show_available_translations' => true,
			'show_option_site_default'    => false,
			'show_option_en_us'           => true,
			'explicit_option_en_us'       => false,
		)
	);

	// Bail if no ID or no name.
	if ( ! $parsed_args['id'] || ! $parsed_args['name'] ) {
		return;
	}

	// English (United States) uses an empty string for the value attribute.
	if ( 'en_US' === $parsed_args['selected'] && ! $parsed_args['explicit_option_en_us'] ) {
		$parsed_args['selected'] = '';
	}

	$translations = $parsed_args['translations'];
	if ( empty( $translations ) ) {
		require_once ABSPATH . 'wp-admin/includes/translation-install.php';
		$translations = wp_get_available_translations();
	}

	/*
	 * $parsed_args['languages'] should only contain the locales. Find the locale in
	 * $translations to get the native name. Fall back to locale.
	 */
	$languages = array();
	foreach ( $parsed_args['languages'] as $locale ) {
		if ( isset( $translations[ $locale ] ) ) {
			$translation = $translations[ $locale ];
			$languages[] = array(
				'language'    => $translation['language'],
				'native_name' => $translation['native_name'],
				'lang'        => current( $translation['iso'] ),
			);

			// Remove installed language from available translations.
			unset( $translations[ $locale ] );
		} else {
			$languages[] = array(
				'language'    => $locale,
				'native_name' => $locale,
				'lang'        => '',
			);
		}
	}

	$translations_available = ( ! empty( $translations ) && $parsed_args['show_available_translations'] );

	// Holds the HTML markup.
	$structure = array();

	// List installed languages.
	if ( $translations_available ) {
		$structure[] = '<optgroup label="' . esc_attr_x( 'Installed', 'translations' ) . '">';
	}

	// Site default.
	if ( $parsed_args['show_option_site_default'] ) {
		$structure[] = sprintf(
			'<option value="site-default" data-installed="1"%s>%s</option>',
			selected( 'site-default', $parsed_args['selected'], false ),
			_x( 'Site Default', 'default site language' )
		);
	}

	if ( $parsed_args['show_option_en_us'] ) {
		$value       = ( $parsed_args['explicit_option_en_us'] ) ? 'en_US' : '';
		$structure[] = sprintf(
			'<option value="%s" lang="en" data-installed="1"%s>English (United States)</option>',
			esc_attr( $value ),
			selected( '', $parsed_args['selected'], false )
		);
	}

	// List installed languages.
	foreach ( $languages as $language ) {
		$structure[] = sprintf(
			'<option value="%s" lang="%s"%s data-installed="1">%s</option>',
			esc_attr( $language['language'] ),
			esc_attr( $language['lang'] ),
			selected( $language['language'], $parsed_args['selected'], false ),
			esc_html( $language['native_name'] )
		);
	}
	if ( $translations_available ) {
		$structure[] = '</optgroup>';
	}

	// List available translations.
	if ( $translations_available ) {
		$structure[] = '<optgroup label="' . esc_attr_x( 'Available', 'translations' ) . '">';
		foreach ( $translations as $translation ) {
			$structure[] = sprintf(
				'<option value="%s" lang="%s"%s>%s</option>',
				esc_attr( $translation['language'] ),
				esc_attr( current( $translation['iso'] ) ),
				selected( $translation['language'], $parsed_args['selected'], false ),
				esc_html( $translation['native_name'] )
			);
		}
		$structure[] = '</optgroup>';
	}

	// Combine the output string.
	$output  = sprintf( '<select name="%s" id="%s">', esc_attr( $parsed_args['name'] ), esc_attr( $parsed_args['id'] ) );
	$output .= implode( "\n", $structure );
	$output .= '</select>';

	if ( $parsed_args['echo'] ) {
		echo $output;
	}

	return $output;
}

/**
 * Determines whether the current locale is right-to-left (RTL).
 *
 * For more information on this and similar theme functions, check out
 * the {@link https://developer.wordpress.org/themes/basics/conditional-tags/
 * Conditional Tags} article in the Theme Developer Handbook.
 *
 * @since 3.0.0
 *
 * @global WP_Locale $wp_locale WordPress date and time locale object.
 *
 * @return bool Whether locale is RTL.
 */
function is_rtl() {
	global $wp_locale;
	if ( ! ( $wp_locale instanceof WP_Locale ) ) {
		return false;
	}
	return $wp_locale->is_rtl();
}

/**
 * Switches the translations according to the given locale.
 *
 * @since 4.7.0
 *
 * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
 *
 * @param string $locale The locale.
 * @return bool True on success, false on failure.
 */
function switch_to_locale( $locale ) {
	/* @var WP_Locale_Switcher $wp_locale_switcher */
	global $wp_locale_switcher;

	if ( ! $wp_locale_switcher ) {
		return false;
	}

	return $wp_locale_switcher->switch_to_locale( $locale );
}

/**
 * Switches the translations according to the given user's locale.
 *
 * @since 6.2.0
 *
 * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
 *
 * @param int $user_id User ID.
 * @return bool True on success, false on failure.
 */
function switch_to_user_locale( $user_id ) {
	/* @var WP_Locale_Switcher $wp_locale_switcher */
	global $wp_locale_switcher;

	if ( ! $wp_locale_switcher ) {
		return false;
	}

	return $wp_locale_switcher->switch_to_user_locale( $user_id );
}

/**
 * Restores the translations according to the previous locale.
 *
 * @since 4.7.0
 *
 * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
 *
 * @return string|false Locale on success, false on error.
 */
function restore_previous_locale() {
	/* @var WP_Locale_Switcher $wp_locale_switcher */
	global $wp_locale_switcher;

	if ( ! $wp_locale_switcher ) {
		return false;
	}

	return $wp_locale_switcher->restore_previous_locale();
}

/**
 * Restores the translations according to the original locale.
 *
 * @since 4.7.0
 *
 * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
 *
 * @return string|false Locale on success, false on error.
 */
function restore_current_locale() {
	/* @var WP_Locale_Switcher $wp_locale_switcher */
	global $wp_locale_switcher;

	if ( ! $wp_locale_switcher ) {
		return false;
	}

	return $wp_locale_switcher->restore_current_locale();
}

/**
 * Determines whether switch_to_locale() is in effect.
 *
 * @since 4.7.0
 *
 * @global WP_Locale_Switcher $wp_locale_switcher WordPress locale switcher object.
 *
 * @return bool True if the locale has been switched, false otherwise.
 */
function is_locale_switched() {
	/* @var WP_Locale_Switcher $wp_locale_switcher */
	global $wp_locale_switcher;

	return $wp_locale_switcher->is_switched();
}

/**
 * Translates the provided settings value using its i18n schema.
 *
 * @since 5.9.0
 * @access private
 *
 * @param string|string[]|array[]|object $i18n_schema I18n schema for the setting.
 * @param string|string[]|array[]        $settings    Value for the settings.
 * @param string                         $textdomain  Textdomain to use with translations.
 *
 * @return string|string[]|array[] Translated settings.
 */
function translate_settings_using_i18n_schema( $i18n_schema, $settings, $textdomain ) {
	if ( empty( $i18n_schema ) || empty( $settings ) || empty( $textdomain ) ) {
		return $settings;
	}

	if ( is_string( $i18n_schema ) && is_string( $settings ) ) {
		return translate_with_gettext_context( $settings, $i18n_schema, $textdomain );
	}
	if ( is_array( $i18n_schema ) && is_array( $settings ) ) {
		$translated_settings = array();
		foreach ( $settings as $value ) {
			$translated_settings[] = translate_settings_using_i18n_schema( $i18n_schema[0], $value, $textdomain );
		}
		return $translated_settings;
	}
	if ( is_object( $i18n_schema ) && is_array( $settings ) ) {
		$group_key           = '*';
		$translated_settings = array();
		foreach ( $settings as $key => $value ) {
			if ( isset( $i18n_schema->$key ) ) {
				$translated_settings[ $key ] = translate_settings_using_i18n_schema( $i18n_schema->$key, $value, $textdomain );
			} elseif ( isset( $i18n_schema->$group_key ) ) {
				$translated_settings[ $key ] = translate_settings_using_i18n_schema( $i18n_schema->$group_key, $value, $textdomain );
			} else {
				$translated_settings[ $key ] = $value;
			}
		}
		return $translated_settings;
	}
	return $settings;
}

/**
 * Retrieves the list item separator based on the locale.
 *
 * @since 6.0.0
 *
 * @global WP_Locale $wp_locale WordPress date and time locale object.
 *
 * @return string Locale-specific list item separator.
 */
function wp_get_list_item_separator() {
	global $wp_locale;

	if ( ! ( $wp_locale instanceof WP_Locale ) ) {
		// Default value of WP_Locale::get_list_item_separator().
		/* translators: Used between list items, there is a space after the comma. */
		return __( ', ' );
	}

	return $wp_locale->get_list_item_separator();
}

/**
 * Retrieves the word count type based on the locale.
 *
 * @since 6.2.0
 *
 * @global WP_Locale $wp_locale WordPress date and time locale object.
 *
 * @return string Locale-specific word count type. Possible values are `characters_excluding_spaces`,
 *                `characters_including_spaces`, or `words`. Defaults to `words`.
 */
function wp_get_word_count_type() {
	global $wp_locale;

	if ( ! ( $wp_locale instanceof WP_Locale ) ) {
		// Default value of WP_Locale::get_word_count_type().
		return 'words';
	}

	return $wp_locale->get_word_count_type();
}

/**
 * Returns a boolean to indicate whether a translation exists for a given string with optional text domain and locale.
 *
 * @since 6.7.0
 *
 * @param string  $singular   Singular translation to check.
 * @param string  $textdomain Optional. Text domain. Default 'default'.
 * @param ?string $locale     Optional. Locale. Default current locale.
 * @return bool  True if the translation exists, false otherwise.
 */
function has_translation( string $singular, string $textdomain = 'default', ?string $locale = null ): bool {
	return WP_Translation_Controller::get_instance()->has_translation( $singular, $textdomain, $locale );
}

```

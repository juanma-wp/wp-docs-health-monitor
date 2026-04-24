/**
 * Registers a new block provided a unique name and an object defining its
 * behavior. Once registered, the block is available as an option to any
 * editor interface where blocks are implemented.
 *
 * @param {string} name     Block name.
 * @param {Object} settings Block settings.
 *
 * @return {?WPBlock} The block, if it has been successfully registered;
 *                    otherwise `undefined`.
 */
export function registerBlockType( name, settings ) {
	if ( typeof name !== 'string' ) {
		console.error( 'Block names must be strings.' );
		return;
	}

	if ( ! /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test( name ) ) {
		console.error(
			'Block names must contain a namespace prefix, include only lowercase alphanumeric characters or dashes, and start with a letter. Example: my-plugin/my-custom-block'
		);
		return;
	}

	if ( select( blocksStore ).getBlockType( name ) ) {
		console.error( 'Block "' + name + '" is already registered.' );
		return;
	}

	settings = applyFilters( 'blocks.registerBlockType', settings, name );

	if ( ! settings || ! isFunction( settings.save ) ) {
		console.error( 'The "save" property must be specified and must be a valid function.' );
		return;
	}

	if ( ! isFunction( settings.edit ) ) {
		console.error( 'The "edit" property must be specified and must be a valid function.' );
		return;
	}

	if ( ! settings.icon ) {
		settings = { ...settings, icon: 'block-default' };
	} else if ( typeof settings.icon !== 'string' && ! isValidIcon( settings.icon ) ) {
		console.error( 'The icon passed is invalid.' );
		return;
	}

	const { name: settingsName, category, attributes, supports } = settings;

	if ( settingsName && settingsName !== name ) {
		console.error(
			'Block names defined in `name` property in block settings must match the `name` argument passed to `registerBlockType()`.'
		);
		return;
	}

	dispatch( blocksStore ).addBlockTypes( {
		name,
		category,
		...settings,
	} );

	return select( blocksStore ).getBlockType( name );
}

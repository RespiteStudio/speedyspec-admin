/**
 * Makes the translation functions callable from component templates.
 *
 * Vue's runtime template compiler resolves identifiers through the component
 * proxy, which never exposes names that start with `_`, so `__( ... )` cannot be
 * written in a template. The same functions are therefore registered once, on
 * the app, as `$__`, `$_x`, `$_n`, `$_nx` and `$sprintf`. String extraction must
 * scan for these names in addition to `__(`, `_x(`, `_n(` and `_nx(`.
 */
import { __, _x, _n, _nx, sprintf } from './text.js';

export function installTemplateI18n( app ) {
	Object.assign( app.config.globalProperties, { $__: __, $_x: _x, $_n: _n, $_nx: _nx, $sprintf: sprintf } );
}

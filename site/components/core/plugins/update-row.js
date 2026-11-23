import { computed } from 'vue';
import { __, _x, sprintf } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';

/*
 * The update row of a Plugins list row, as wp_plugin_update_row() prints it
 * (`tr.plugin-update-tr` with WordPress's message in `div.update-message`), and as updates.js changes
 * it while the update runs: Updating..., then Updated!, or "Update failed: …". A failed delete is
 * shown here too, as updates.js deletePluginError() adds its notice to this row.
 */

/**
 * The classes and text of the update notice for a step of the update (updates.js updatePlugin(),
 * updatePluginSuccess(), updatePluginError()): `text` null shows WordPress's message. Pure.
 *
 * @param {object|null} update The row's update (`compatible`), or null after it ran.
 * @param {object|null} state  `{ phase: 'updating'|'updated'|'failed', message }`, or null.
 * @return {{classes: string[], text: string|null}} The notice.
 */
export function updateNotice( update, state ) {
	if ( state?.phase === 'updating' ) {
		return { classes: [ 'updating-message', 'notice-warning' ], text: __( 'Updating...', 'default' ) };
	}
	if ( state?.phase === 'updated' ) {
		return { classes: [ 'updated-message', 'notice-success' ], text: _x( 'Updated!', 'plugin', 'default' ) };
	}
	if ( state?.phase === 'failed' ) {
		/* translators: %s: Error string for a failed update. */
		return { classes: [ 'notice-error' ], text: sprintf( __( 'Update failed: %s', 'default' ), String( state.message ?? '' ) ) };
	}
	return { classes: [ update?.compatible === false ? 'notice-error' : 'notice-warning' ], text: null };
}

/**
 * The update row (`tr`). Emits `update( item )` for "update now" (the message's `#` link, which
 * WordPress gives only when the update can run here) and `details( slug, section )` for "View
 * version details". Props: `item`, `colspan`, `state` (the update's step, or null), `deleteError`
 * (a failed delete's message, or null).
 */
export default {
	name: 'PluginsUpdateRow',
	components: { InlineMarkup, LegacyHtml },
	props: {
		item: { type: Object, required: true },
		colspan: { type: Number, required: true },
		state: { type: Object, default: null },
		deleteError: { type: String, default: null },
	},
	emits: [ 'update', 'details' ],
	setup( props, { emit } ) {
		const update = computed( () => ( props.item.update && typeof props.item.update === 'object' ? props.item.update : null ) );
		const notice = computed( () => updateNotice( update.value, props.state ) );
		const name = () => String( props.item.name ?? '' );
		const ariaLabel = computed( () => {
			if ( props.state?.phase === 'updating' ) {
				/* translators: %s: Plugin name and version. */
				return sprintf( _x( 'Updating %s...', 'plugin', 'default' ), name() );
			}
			if ( props.state?.phase === 'updated' ) {
				/* translators: %s: Plugin name and version. */
				return sprintf( _x( '%s updated!', 'plugin', 'default' ), String( props.state.pluginName ?? name() ) );
			}
			/* translators: %s: Plugin name and version. */
			return props.state?.phase === 'failed' ? sprintf( _x( '%s update failed.', 'plugin', 'default' ), name() ) : null;
		} );

		/** A click in WordPress's message: "update now" runs the update, "View version details" opens the dialog. */
		function onMessage( event ) {
			const link = event?.target?.closest?.( 'a' );
			if ( ! link || event.defaultPrevented ) {
				return;
			}
			const href = link.getAttribute( 'href' ) ?? '';
			if ( href === '#' ) {
				event.preventDefault();
				if ( update.value?.request ) {
					emit( 'update', props.item );
				}
				return;
			}
			if ( update.value?.detailsSlug && /[?&]tab=plugin-information(?:&|$)/.test( href ) ) {
				event.preventDefault();
				emit( 'details', update.value.detailsSlug, 'changelog' );
			}
		}

		return { update, notice, ariaLabel, onMessage };
	},
	template: `
		<tr :class="[ 'plugin-update-tr', { active: ( item.classes ?? [] ).includes( 'active' ) } ]" :id="item.id + '-update'" :data-slug="item.id" :data-plugin="item.file">
			<td :colspan="String( colspan )" class="plugin-update colspanchange">
				<div v-if="update || state" :class="[ 'update-message', 'notice', 'inline', ...notice.classes, 'notice-alt' ]">
					<p v-if="notice.text !== null" :aria-label="ariaLabel">{{ notice.text }}</p>
					<p v-else @click="onMessage"><InlineMarkup :html="update.message ?? ''" /><LegacyHtml v-if="typeof update.extraHtml === 'string'" tag="span" :html="update.extraHtml" /></p>
				</div>
				<div v-if="deleteError" class="update-message notice inline notice-error notice-alt"><p>{{ deleteError }}</p></div>
			</td>
		</tr>
	`,
};

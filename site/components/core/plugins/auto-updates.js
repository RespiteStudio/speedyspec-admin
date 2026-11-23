import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';

/*
 * The Automatic Updates cell of a Plugins list row, as single_row() prints it (the toggle, or the
 * state as a label, the next update's time, and the hidden error notice), and as updates.js changes
 * it when the toggle is clicked: Enabling... or Disabling... with the spinner, then the label and the
 * next update of the answer, or the error in the notice.
 */

/**
 * A view's label with its count changed by `delta`, never below zero, as updates.js changes the
 * Auto-updates Enabled and Disabled counts after a toggle. Pure.
 *
 * @param {string} labelHtml The view's label (`Auto-updates Enabled <span class="count">(1)</span>`).
 * @param {number} delta     +1 or -1.
 * @return {string} The label.
 */
export const countedLabel = ( labelHtml, delta ) => String( labelHtml ?? '' ).replace( /(<span class="count">\()(\d+)(\)<\/span>)/, ( match, open, count, close ) => open + Math.max( 0, Number( count ) + delta ) + close );

/**
 * The toggle's state after an answer: the answer's, else the row's. Pure.
 *
 * @param {object}      auto  The row's `autoUpdate`.
 * @param {object|null} state `{ busy, error, answer }`, or null.
 * @return {{enabled: boolean, text: string, nextUpdate: string|null, nextUpdateShown: boolean, action: string}} The state.
 */
export function toggleState( auto, state ) {
	const answer = state?.answer ?? null;
	const enabled = answer ? answer.enabled === true : auto?.enabled === true;
	return {
		enabled,
		text: String( ( answer ? answer.text : auto?.text ) ?? '' ),
		nextUpdate: ( answer && typeof answer.nextUpdate === 'string' ? answer.nextUpdate : null ) ?? ( typeof auto?.nextUpdate === 'string' ? auto.nextUpdate : null ),
		// WordPress says whether the time shows: the row's `nextUpdateShown`, then the answer's.
		nextUpdateShown: answer ? answer.nextUpdateShown === true : auto?.nextUpdateShown === true,
		action: enabled ? 'disable' : 'enable',
	};
}

/**
 * The content of the cell. Emits `toggle( item, action )` for the toggle, and `filtered( item,
 * action )` for a toggle in a cell a plugin filtered (`data-wp-action` of its link). Props: `item`
 * (the row), `state` (`{ busy, error, answer }`, or null).
 */
export default {
	name: 'PluginsAutoUpdates',
	components: { InlineMarkup, LegacyHtml },
	props: {
		item: { type: Object, required: true },
		state: { type: Object, default: null },
	},
	emits: [ 'toggle', 'filtered' ],
	setup( props, { emit } ) {
		const auto = computed( () => props.item.autoUpdate ?? {} );
		const shown = computed( () => toggleState( auto.value, props.state ) );
		const busy = computed( () => props.state?.busy === true );
		const label = computed( () => {
			if ( ! busy.value ) {
				return shown.value.text;
			}
			return shown.value.action === 'enable' ? __( 'Enabling...', 'default' ) : __( 'Disabling...', 'default' );
		} );

		function onToggle( event ) {
			event?.preventDefault?.();
			if ( ! busy.value ) {
				emit( 'toggle', props.item, shown.value.action );
			}
		}

		/** A click on a toggle inside a plugin's cell (`.toggle-auto-update` with `data-wp-action`). */
		function onFiltered( event ) {
			const toggle = event?.target?.closest?.( '.toggle-auto-update' );
			const action = toggle?.getAttribute?.( 'data-wp-action' );
			if ( ! toggle || event.defaultPrevented || ( action !== 'enable' && action !== 'disable' ) ) {
				return;
			}
			event.preventDefault();
			if ( ! busy.value ) {
				emit( 'filtered', props.item, action );
			}
		}

		return { auto, shown, busy, label, onToggle, onFiltered };
	},
	template: `
		<LegacyHtml v-if="typeof auto.html === 'string'" tag="span" :html="auto.html" @click="onFiltered" />
		<template v-else>
			<a v-if="auto.request" href="#" class="toggle-auto-update aria-button-if-js" role="button" :data-wp-action="shown.action" @click="onToggle"><span :class="[ 'dashicons', 'dashicons-update', 'spin', { hidden: ! busy } ]" aria-hidden="true"></span><span class="label">{{ label }}</span></a>
			<span v-else class="label">{{ shown.text }}</span>
			<div v-if="shown.nextUpdate" :class="[ 'auto-update-time', { hidden: ! shown.nextUpdateShown } ]"><InlineMarkup :html="shown.nextUpdate" /></div>
		</template>
		<div :class="[ 'notice', 'notice-error', 'notice-alt', 'inline', { hidden: ! state?.error } ]"><p>{{ state?.error ?? '' }}</p></div>
	`,
};

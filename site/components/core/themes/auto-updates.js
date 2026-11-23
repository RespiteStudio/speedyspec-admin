import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import PluginNote from '../list-table-parts/plugin-note.js';

/*
 * The auto-update setting in the theme details, as wp_theme_auto_update_setting_template() prints
 * it (`.theme-autoupdate`: the toggle, or the forced state as a text, the next update's time, and
 * the hidden error notice), and as updates.js changes it when the toggle is clicked: Enabling... or
 * Disabling... with the spinner, then the answer's text and the next update's time, or the error
 * in the notice.
 *
 * WordPress decides the texts, the request and whether the time shows (`nextUpdateShown`); the
 * page posts the request. A plugin's `theme_auto_update_setting_template` is an Underscore
 * template the native page cannot run (`templateFiltered`): WordPress's own setting shows, with a
 * note.
 */

/**
 * The setting's state after an answer: the answer's, else the card's. Pure.
 *
 * @param {object}      auto  The card's `autoUpdate`.
 * @param {object|null} state `{ busy, error, answer }`, or null.
 * @return {{enabled: boolean, text: string, nextUpdate: string|null, nextUpdateShown: boolean, action: string}} The state.
 */
export function settingState( auto, state ) {
	const answer = state?.answer ?? null;
	const enabled = answer ? answer.enabled === true : auto?.enabled === true;
	return {
		enabled,
		text: String( ( answer ? answer.text : auto?.text ) ?? '' ),
		nextUpdate: ( answer && typeof answer.nextUpdate === 'string' ? answer.nextUpdate : null ) ?? ( typeof auto?.nextUpdate === 'string' ? auto.nextUpdate : null ),
		nextUpdateShown: answer ? answer.nextUpdateShown === true : auto?.nextUpdateShown === true,
		action: enabled ? 'disable' : 'enable',
	};
}

/**
 * Props: `auto` (the card's `autoUpdate`), `state` (`{ busy, error, answer }`, or null). Emits
 * `toggle( action )`: `enable` or `disable`.
 */
export default {
	name: 'ThemeAutoUpdate',
	components: { InlineMarkup, PluginNote },
	props: {
		auto: { type: Object, required: true },
		state: { type: Object, default: null },
	},
	emits: [ 'toggle' ],
	setup( props, { emit } ) {
		const shown = computed( () => settingState( props.auto, props.state ) );
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
				emit( 'toggle', shown.value.action );
			}
		}

		return {
			shown, busy, label, onToggle,
			note: () => __( 'A plugin changes this setting\'s template, which this screen does not show.', 'wp-admin-site' ),
		};
	},
	template: `
		<div class="theme-autoupdate">
			<template v-if="auto.supported">
				<button v-if="auto.request" type="button" class="toggle-auto-update button-link" :data-slug="auto.request.body?.stylesheet" :data-wp-action="shown.action" @click="onToggle"><span :class="[ 'dashicons', 'dashicons-update', 'spin', { hidden: ! busy } ]" aria-hidden="true"></span><span class="label">{{ label }}</span></button>
				<template v-else>{{ shown.text }}</template>
			</template>
			<span v-if="shown.nextUpdate" :class="[ 'auto-update-time', { hidden: ! shown.nextUpdateShown } ]"><br /><InlineMarkup :html="shown.nextUpdate" /></span>
			<div :class="[ 'notice', 'notice-error', 'notice-alt', 'inline', { hidden: ! state?.error } ]"><p>{{ state?.error ?? '' }}</p></div>
		</div>
		<PluginNote v-if="auto.templateFiltered" :text="note()" />
	`,
};

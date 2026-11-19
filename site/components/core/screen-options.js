import { computed, nextTick, ref } from 'vue';
import { SlotOutlet } from '../../runtime/slots.js';

/** The layout's choices as WordPress sends them: `{ value, label }`, a positive count and its label. */
const columnChoices = ( columns ) => ( Array.isArray( columns?.choices ) ? columns.choices : [] )
	.filter( ( choice ) => Number.isInteger( choice?.value ) && choice.value > 0 && typeof choice.label === 'string' && choice.label !== '' );

/**
 * Default implementation of core/screen-options: the classic screen's Screen Options panel
 * (`#screen-options-wrap` with `#adv-settings`, a `fieldset.metabox-prefs` per section,
 * `fieldset.columns-prefs` for the layout and the "Additional settings" fieldset with the
 * reordering checkbox) and its "Screen Options" toggle (`#show-settings-link`), so that
 * WordPress's admin styles apply. The panel sits in `.wp-admin-screen-options__panel`, styled
 * as the classic `#screen-meta` (which the Help panel, core/help-tabs, owns).
 *
 * The toggle is a button with `aria-expanded` that opens the panel and moves focus to it, as the
 * classic screen does. Each checkbox has the classic id (`{id}-hide`, `meta-box-reordering`) and
 * reports its change at once, as the classic checkboxes do; there is no submit button.
 */
export default {
	name: 'ScreenOptions',
	components: { SlotOutlet },
	props: {
		sections: { type: Array, required: true },
		reordering: { type: Boolean, default: null },
		columns: { type: Object, default: null },
	},
	emits: [ 'change', 'toggle' ],
	setup( props, { emit } ) {
		const open = ref( false );
		const wrap = ref( null );
		const choices = computed( () => columnChoices( props.columns ) );
		const shownSections = computed( () => props.sections.filter( ( section ) => section && typeof section === 'object' && Array.isArray( section.items ) ) );

		function toggle() {
			open.value = ! open.value;
			emit( 'toggle', open.value );
			if ( open.value ) {
				nextTick( () => wrap.value?.focus?.() );
			}
		}

		const onItem = ( item, event ) => emit( 'change', item.id, Boolean( event?.target?.checked ) );
		const onReordering = ( event ) => emit( 'change', 'meta-box-reordering', Boolean( event?.target?.checked ) );
		const onColumns = ( count ) => emit( 'change', 'screen_columns', count );

		return { open, wrap, choices, shownSections, toggle, onItem, onReordering, onColumns };
	},
	template: `
		<div class="wp-admin-screen-options">
			<div class="wp-admin-screen-options__panel metabox-prefs" :hidden="! open">
				<div id="screen-options-wrap" ref="wrap" tabindex="-1" :aria-label="$__( 'Screen Options Tab', 'default' )">
					<form id="adv-settings" method="post" @submit.prevent>
						<SlotOutlet name="before" :context="{ sections }" />
						<fieldset v-for="section in shownSections" :key="section.id" class="metabox-prefs" :data-section="section.id">
							<legend>{{ section.legend }}</legend>
							<p v-if="section.description">{{ section.description }}</p>
							<div class="metabox-prefs-container">
								<label v-for="item in section.items" :key="item.id" :for="item.id + '-hide'"><input class="hide-postbox-tog" :name="item.id + '-hide'" type="checkbox" :id="item.id + '-hide'" :value="item.id" :checked="item.checked" @change="onItem( item, $event )" />{{ item.label }}</label>
							</div>
						</fieldset>
						<fieldset v-if="choices.length > 0" class="columns-prefs">
							<legend class="screen-layout">{{ $__( 'Layout', 'default' ) }}</legend>
							<label v-for="choice in choices" :key="choice.value" :class="'columns-prefs-' + choice.value">
								<input type="radio" name="screen_columns" :value="String( choice.value )" :checked="columns.value === choice.value" @change="onColumns( choice.value )" />
								{{ choice.label }}
							</label>
						</fieldset>
						<fieldset v-if="reordering !== null" class="metabox-prefs additional-settings-prefs">
							<legend>{{ $__( 'Additional settings', 'default' ) }}</legend>
							<input class="meta-box-reordering-toggle" name="meta-box-reordering" type="checkbox" id="meta-box-reordering" value="enabled" :checked="reordering" @change="onReordering" /><label for="meta-box-reordering">{{ $__( 'Allow screen elements to be rearranged', 'default' ) }}</label>
						</fieldset>
						<SlotOutlet name="after" :context="{ sections }" />
					</form>
				</div>
			</div>
			<div class="wp-admin-screen-options__links">
				<div id="screen-options-link-wrap" class="screen-meta-toggle">
					<button type="button" id="show-settings-link" :class="[ 'button', 'button-compact', 'show-settings', { 'screen-meta-active': open } ]" aria-controls="screen-options-wrap" :aria-expanded="open ? 'true' : 'false'" @click="toggle">{{ $__( 'Screen Options', 'default' ) }}</button>
				</div>
			</div>
		</div>
	`,
};

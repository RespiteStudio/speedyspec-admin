import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import LegacyHtml, { FILLED_EVENT, collectControls } from '../../kit/LegacyHtml.js';
import { __ } from '../../runtime/text.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
// Only categories have the indeterminate state: inline-edit-post.js sets it on
// `input[name="post_category[]"]` alone, and bulk_edit_posts() reads only its field.
export const INDETERMINATE_NAME = 'post_category[]';
const MIXED_FIELD = 'indeterminate_post_category[]';
const mixedLabel = ( text ) => String( text ?? '' ).trim() + ': ' + __( 'Some selected posts have this category', 'default' );
const ids = ( value ) => list( value ).map( Number ).filter( ( id ) => Number.isInteger( id ) && id > 0 );

/** One term and its children, as Walker_Category_Checklist prints them. */
const TermItem = {
	name: 'TermsChecklistItem',
	props: {
		node: { type: Object, required: true },
		ctx: { type: Object, required: true },
	},
	setup( props ) {
		const id = computed( () => Number( props.node.id ) );
		const children = computed( () => list( props.node.children ) );
		const label = computed( () => String( props.node.name ?? '' ) );
		return { id, children, label };
	},
	template: `
		<li :id="ctx.prefix + ctx.taxonomy + '-' + id"><label class="selectit"><input :value="String( id )" type="checkbox" :name="ctx.name" :id="ctx.prefix + 'in-' + ctx.taxonomy + '-' + id" :checked="ctx.isChecked( id )" :indeterminate="ctx.isIndeterminate( id )" :disabled="ctx.disabled" :aria-label="ctx.isIndeterminate( id ) ? ctx.mixedLabel( label ) : null" @change="ctx.toggle( id, $event )" /><input v-if="ctx.isIndeterminate( id )" type="hidden" :name="ctx.mixedField" :value="String( id )" />{{ ' ' + label }}</label><ul v-if="children.length" class="children"><TermsChecklistItem v-for="child in children" :key="child.id" :node="child" :ctx="ctx" /></ul></li>
	`,
};

/**
 * Default implementation of core/terms-checklist: the classic checklist of a hierarchical
 * taxonomy (`ul.cat-checklist.{taxonomy}-checklist`, `li#{taxonomy}-{id}`, `label.selectit` and
 * the checkbox `in-{taxonomy}-{id}` named `name`), from the tree WordPress sent. The ids are the
 * older walker's (this WordPress prints `wp_unique_prefixed_id()` ids); no core script or style on
 * the list reads them.
 *
 * As inline-edit-post.js: an indeterminate box (Bulk Edit: some of the selected posts have the
 * term) is shown indeterminate, with the label "{term}: Some selected posts have this category"
 * and the hidden `indeterminate_{name}` field; changing it (a click checks it, as the browser
 * does) drops the flag, its label and its field.
 *
 * Only the categories checklist (`name` `post_category[]`) has the indeterminate state, as in
 * inline-edit-post.js and bulk_edit_posts(); `indeterminate` is ignored for other names.
 *
 * A plugin's filtered checklist (`html`) is shown through kit/LegacyHtml inside the list. Its
 * boxes are set from `modelValue` and `indeterminate` when it is filled and when the value
 * changes, the indeterminate ones getting the same hidden field and label as inline-edit-post.js
 * gives them (so Bulk Edit keeps the terms no box changed), and read back
 * (`inject( 'termsChecklistControls' )` replaces the reading: tests) when one changes.
 */
export default {
	name: 'TermsChecklist',
	components: { TermItem, LegacyHtml },
	props: {
		taxonomy: { type: String, required: true },
		tree: { type: Array, default: () => [] },
		name: { type: String, required: true },
		modelValue: { type: Array, default: () => [] },
		indeterminate: { type: Array, default: () => [] },
		html: { type: String, default: null },
		disabled: { type: Boolean, default: false },
		idPrefix: { type: String, default: '' },
	},
	emits: [ 'update:modelValue', 'update:indeterminate' ],
	setup( props, { emit } ) {
		const readControls = inject( 'termsChecklistControls', ( root ) => ( root?.querySelectorAll ? [ ...root.querySelectorAll( 'input[type="checkbox"]' ) ] : [] ) );
		const root = ref( null );
		const legacy = computed( () => typeof props.html === 'string' );
		const checked = computed( () => new Set( ids( props.modelValue ) ) );
		const mixed = computed( () => new Set( props.name === INDETERMINATE_NAME ? ids( props.indeterminate ) : [] ) );

		function toggle( id, event ) {
			const on = Boolean( event?.target?.checked );
			const next = ids( props.modelValue ).filter( ( value ) => value !== id );
			if ( on ) {
				next.push( id );
			}
			emit( 'update:modelValue', next );
			if ( mixed.value.has( id ) ) {
				emit( 'update:indeterminate', ids( props.indeterminate ).filter( ( value ) => value !== id ) );
			}
		}

		const ctx = computed( () => ( {
			taxonomy: props.taxonomy,
			name: props.name,
			prefix: props.idPrefix ?? '',
			disabled: props.disabled,
			isChecked: ( id ) => checked.value.has( id ),
			isIndeterminate: ( id ) => mixed.value.has( id ),
			mixedLabel,
			mixedField: MIXED_FIELD,
			toggle,
		} ) );

		// A plugin's checklist: its boxes named `name` follow the value, and are read back.
		const ownBoxes = () => list( [ ...readControls( root.value ) ] ).filter( ( control ) => control?.name === props.name );
		// The hidden indeterminate fields this part added to a plugin's boxes, by box.
		const added = new WeakMap();
		function markMixed( control ) {
			if ( added.has( control ) ) {
				return;
			}
			const doc = control.ownerDocument ?? globalThis.document;
			const field = doc?.createElement?.( 'input' );
			if ( ! field ) {
				return;
			}
			field.type = 'hidden';
			field.name = MIXED_FIELD;
			field.value = String( control.value );
			// As inline-edit-post.js: the field right after the box, the label on the box.
			control.after?.( field );
			const label = control.closest?.( 'label' ) ?? control.parentNode;
			control.setAttribute?.( 'aria-label', mixedLabel( label?.textContent ) );
			added.set( control, field );
		}
		function unmarkMixed( control ) {
			const field = added.get( control );
			if ( field ) {
				field.remove?.();
				control.removeAttribute?.( 'aria-label' );
				added.delete( control );
			}
		}
		function applyToLegacy() {
			if ( ! legacy.value ) {
				return;
			}
			for ( const control of ownBoxes() ) {
				const id = Number( control.value );
				const isMixed = mixed.value.has( id );
				control.checked = checked.value.has( id );
				control.indeterminate = isMixed;
				if ( isMixed ) {
					markMixed( control );
				} else {
					unmarkMixed( control );
				}
			}
		}
		function onListChange( event ) {
			if ( ! legacy.value ) {
				return;
			}
			const boxes = ownBoxes();
			const next = ids( collectControls( boxes ).map( ( pair ) => pair.value ) );
			emit( 'update:modelValue', next );
			const changed = Number( event?.target?.value );
			if ( event?.target?.name === props.name && mixed.value.has( changed ) ) {
				emit( 'update:indeterminate', ids( props.indeterminate ).filter( ( value ) => value !== changed ) );
			}
		}
		onMounted( () => {
			root.value?.addEventListener?.( FILLED_EVENT, applyToLegacy );
			// Also now, for HTML that is already in place (LegacyHtml fills, then says so).
			nextTick( applyToLegacy );
		} );
		watch( [ checked, mixed ], () => nextTick( applyToLegacy ) );

		return { root, legacy, ctx, onListChange };
	},
	template: `
		<ul v-if="legacy" ref="root" :class="[ 'cat-checklist', taxonomy + '-checklist' ]" @change="onListChange"><LegacyHtml :html="html" /></ul>
		<ul v-else ref="root" :class="[ 'cat-checklist', taxonomy + '-checklist' ]"><TermItem v-for="node in tree" :key="node.id" :node="node" :ctx="ctx" /></ul>
	`,
};

import { computed, inject, nextTick, reactive, ref, watch } from 'vue';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import { decodeEntities } from '../../../kit/Interpolate.js';

/*
 * The add form of a terms list (`#col-left`'s `form#addtag`, wp-admin/edit-tags.php), from the
 * page data's `addForm`: the labels and descriptions WordPress computed, the parent dropdown (its
 * options padded as printed, or the HTML a plugin filtered it to), and the plugins' hooks
 * (`{$taxonomy}_pre_add_form`, `{$taxonomy}_add_form_fields`, `{$taxonomy}_add_form`), shown
 * through kit/LegacyHtml with their scripts. Those fields are not saved by the Terms routes (the
 * recorded gap), which a note beside them says.
 *
 * What tags.js does around the submit is the page's (core/edit-tags): this part reads the core
 * fields, shows the spinner while `adding`, marks the name as validateForm() marks it
 * (`nameInvalid`, cleared by a change of the name), and empties every visible field when
 * `cleared` changes, plugin fields included, as tags.js does after an add.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
// The fields tags.js empties: `input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):visible, textarea:visible`.
const KEPT_TYPES = new Set( [ 'checkbox', 'radio', 'button', 'submit', 'reset', 'hidden', 'image', 'file' ] );

/** Whether an element is shown: no ancestor (up to `root`) hidden by `display: none`, `hidden` or the `hidden` class. */
function shown( element, root ) {
	for ( let node = element; node && node !== root?.parentElement; node = node.parentElement ) {
		if ( node.hidden || node.style?.display === 'none' || node.classList?.contains?.( 'hidden' ) ) {
			return false;
		}
	}
	return true;
}

/**
 * Empties the fields of a form as tags.js does after an add: every visible text-like input and
 * textarea, plugin fields included. Changes the DOM of `form`.
 *
 * @param {HTMLFormElement|null} form The form.
 */
export function emptyFields( form ) {
	for ( const control of form?.querySelectorAll?.( 'input, textarea' ) ?? [] ) {
		const type = String( control.type ?? '' ).toLowerCase();
		if ( ( control.tagName === 'TEXTAREA' || ! KEPT_TYPES.has( type ) ) && shown( control, form ) ) {
			control.value = '';
		}
	}
}

/** The class of a parent option (`level-N`), none for None. Pure. */
export const optionClass = ( option ) => ( Number.isInteger( option?.level ) ? 'level-' + option.level : null );

/**
 * Props: `addForm` (the page data's), `parent` (the parent dropdown shown: the data's, then each
 * answer's `parentOptions`), `taxonomy`, `formFields` (the hidden fields), `adding`,
 * `nameInvalid`, `cleared` (a counter: each change empties the form). Emits `submit( fields )`
 * with `{ name, slug, parent, description }` (`parent` only with a parent field) and
 * `name-changed`. Exposes `nameField()`, the name input (tags.js focuses it after the last
 * delete).
 */
export default {
	name: 'EditTagsAddForm',
	components: { InlineMarkup, LegacyHtml },
	props: {
		addForm: { type: Object, required: true },
		parent: { type: Object, default: null },
		formFields: { type: Array, default: () => [] },
		adding: { type: Boolean, default: false },
		nameInvalid: { type: Boolean, default: false },
		cleared: { type: Number, default: 0 },
	},
	emits: [ 'submit', 'name-changed' ],
	setup( props, { emit, expose } ) {
		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );
		const form = ref( null );
		const name = ref( null );
		const v = reactive( { name: '', slug: '', description: '', parent: '-1' } );
		const labels = computed( () => props.addForm?.labels ?? {} );
		const hooks = computed( () => props.addForm?.hooks ?? {} );
		const options = computed( () => list( props.parent?.options ).filter( ( option ) => option && typeof option.value === 'string' ) );
		const parentHtml = computed( () => ( typeof props.parent?.html === 'string' && props.parent.html !== '' ? props.parent.html : null ) );
		// The plugins print fields here that the routes do not save.
		const pluginFields = computed( () => Boolean( hooks.value.fields ) || Boolean( hooks.value.after ) );

		const startParent = () => {
			const selected = text( props.parent?.selected );
			v.parent = selected !== '' ? selected : '-1';
		};
		startParent();
		// The dropdown replaced by an answer keeps the parent chosen, as tags.js leaves the select as it is.
		watch( () => props.parent, () => {
			if ( ! options.value.some( ( option ) => option.value === v.parent ) ) {
				startParent();
			}
		} );

		watch( () => props.cleared, () => {
			v.name = '';
			v.slug = '';
			v.description = '';
			nextTick( () => emptyFields( form.value ) );
		} );

		function submit( event ) {
			event?.preventDefault?.();
			if ( props.adding ) {
				return;
			}
			const entries = new Map( list( readForm( form.value ) ).map( ( [ key, value ] ) => [ key, value ] ) );
			const fields = { name: v.name, slug: v.slug, description: v.description };
			if ( props.parent ) {
				const value = parentHtml.value ? text( entries.get( 'parent' ) ?? '-1' ) : v.parent;
				fields.parent = Number.parseInt( value, 10 );
				if ( ! Number.isInteger( fields.parent ) ) {
					fields.parent = -1;
				}
			}
			emit( 'submit', fields );
		}

		expose( { nameField: () => name.value } );
		return {
			form, name, v, labels, hooks, options, parentHtml, pluginFields, optionClass, submit,
			// The button's text: the label, as submit_button() prints it in `value`.
			buttonText: computed( () => decodeEntities( text( labels.value.addNewItem ).replace( /<[^>]*>/g, '' ) ) ),
			set: ( key ) => ( event ) => {
				v[ key ] = text( event?.target?.value );
			},
			nameChanged: () => emit( 'name-changed' ),
		};
	},
	template: `
		<LegacyHtml v-if="hooks.pre" :html="hooks.pre" />
		<div class="form-wrap">
			<h2><InlineMarkup :html="labels.addNewItem ?? ''" /></h2>
			<form id="addtag" ref="form" method="post" action="edit-tags.php" class="validate" @submit="submit">
				<input v-for="hidden in formFields" :key="hidden.name" type="hidden" :name="hidden.name" :value="hidden.value" />
				<div :class="[ 'form-field', 'form-required', 'term-name-wrap', { 'form-invalid': nameInvalid } ]">
					<label for="tag-name">{{ $_x( 'Name', 'term name', 'default' ) }}</label>
					<input ref="name" name="tag-name" id="tag-name" type="text" :value="v.name" size="40" aria-required="true" aria-describedby="name-description" @input="set( 'name' )( $event )" @change="nameChanged" />
					<p id="name-description"><InlineMarkup :html="labels.nameDescription ?? ''" /></p>
				</div>
				<div class="form-field term-slug-wrap">
					<label for="tag-slug">{{ $__( 'Slug', 'default' ) }}</label>
					<input name="slug" id="tag-slug" type="text" :value="v.slug" size="40" aria-describedby="slug-description" @input="set( 'slug' )( $event )" />
					<p id="slug-description"><InlineMarkup :html="labels.slugDescription ?? ''" /></p>
				</div>
				<div v-if="parent" class="form-field term-parent-wrap">
					<label for="parent"><InlineMarkup :html="labels.parentItem ?? ''" /></label>
					<LegacyHtml v-if="parentHtml" :html="parentHtml" />
					<select v-else name="parent" id="parent" class="postform" aria-describedby="parent-description" :value="v.parent" @change="set( 'parent' )( $event )"><option v-for="option in options" :key="option.value" :class="optionClass( option )" :value="option.value" :selected="option.value === v.parent">{{ option.label }}</option></select>
					<p id="parent-description"><InlineMarkup :html="labels.parentDescription ?? ''" /></p>
				</div>
				<div class="form-field term-description-wrap">
					<label for="tag-description">{{ $__( 'Description', 'default' ) }}</label>
					<textarea name="description" id="tag-description" rows="5" cols="40" aria-describedby="description-description" :value="v.description" @input="set( 'description' )( $event )"></textarea>
					<p id="description-description"><InlineMarkup :html="labels.descDescription ?? ''" /></p>
				</div>
				<LegacyHtml v-if="hooks.fields" :html="hooks.fields" />
				<p v-if="pluginFields" class="description wp-admin-edit-tags-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>
				<p class="submit">
					<input type="submit" name="submit" id="submit" class="button button-primary" :value="buttonText" @click="submit" />
					<span :class="[ 'spinner', { 'is-active': adding } ]"></span>
				</p>
				<LegacyHtml v-if="hooks.after" :html="hooks.after" />
			</form>
		</div>
	`,
};

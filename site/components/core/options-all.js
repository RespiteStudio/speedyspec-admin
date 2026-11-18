import { computed, inject, nextTick, reactive, ref, shallowRef, toRaw, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { noticeElementId } from '../../runtime/notices.js';
import Button from '../../kit/Button.js';
import { createFormState } from './settings-form/state.js';
import { changedRows, editableNames, own, put, rowsOf, valuesOf } from './options-all/state.js';

const ROUTE = 'wp-admin/v1/settings/all';

/**
 * Default implementation of core/options-all: the All Settings screen.
 *
 * The markup is the classic screen's (wp-admin/options.php): the warning, then one row per
 * option in a form table, labelled by the option name, with a text input, or a textarea
 * (30 columns, 5 rows) for a value with a line break; a row that cannot be changed is
 * disabled and has the `disabled` class, as on the classic screen; then "Save Changes"
 * (`#Update`). The rows are core/settings-field instances inside core/form-table, so that a
 * plugin can replace the page, the table or the row component, or add modules to the page's
 * slots. The root carries the classic body class `options-php`.
 *
 * Only the changed rows are sent, a textarea's line breaks as the classic form posts them
 * (CR LF). As on the classic screen, the valid rows of a save with an invalid one are saved:
 * the errors are shown beside their row and as notices, and focus moves to the first invalid
 * row, or to the first notice.
 */
export default {
	name: 'OptionsAll',
	components: { Contracted, SlotOutlet, Button },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const notices = inject( 'notices', null );
		const pageState = inject( 'pageState', null );

		const settings = shallowRef( props.data ); // What the server last said.
		const rows = computed( () => rowsOf( settings.value ) );
		const saved = shallowRef( valuesOf( rows.value ) );
		const values = reactive( { ...saved.value } );
		const errors = ref( {} );
		const errorMarkup = ref( {} ); // The markup of the row errors that have links or code.
		const saving = ref( false );

		const formState = () => {
			const names = editableNames( rows.value );
			return createFormState( { fields: names, keepInput: names } );
		};

		// The values are read through toRaw(): Vue's proxy answers some keys itself (an option
		// named `hasOwnProperty` would read as Vue's function), and it does not track a key named
		// `__proto__`. Every change is counted here instead, which is what the reads depend on.
		const changes = ref( 0 );
		const rawValues = () => ( changes.value >= 0 ? toRaw( values ) : values );
		const dirty = computed( () => Object.keys( changedRows( rows.value, rawValues(), saved.value ) ).length > 0 );
		watch( dirty, ( value ) => pageState?.setDirty( value ), { immediate: true } );

		/**
		 * Sets a row's form value and counts the change. A row named `__proto__` that is not an
		 * own entry yet is defined, as an assignment would set the prototype.
		 */
		function setRow( name, value ) {
			if ( name !== '__proto__' || Object.hasOwn( values, name ) ) {
				values[ name ] = value;
			} else {
				put( values, name, value );
			}
			changes.value++;
		}

		function show( next ) {
			settings.value = next;
			saved.value = valuesOf( rowsOf( next ) );
			for ( const key of Object.keys( values ) ) {
				if ( ! Object.hasOwn( saved.value, key ) ) {
					delete values[ key ];
					changes.value++;
				}
			}
			for ( const [ key, value ] of Object.entries( saved.value ) ) {
				setRow( key, value );
			}
		}

		// A new page entry (the router's answer again, e.g. after the language changed).
		watch( () => props.data, ( next ) => {
			if ( next && next !== settings.value ) {
				errors.value = {};
				errorMarkup.value = {};
				show( next );
			}
		} );

		function setValue( name, value ) {
			if ( Object.hasOwn( saved.value, name ) ) {
				setRow( name, String( value ) );
			}
		}

		const slotContext = computed( () => ( { values, setValue, errors: errors.value } ) );

		function addNotice( notice ) {
			const markup = typeof notice.markup === 'string' && notice.markup !== '' ? { markup: notice.markup } : {};
			return notices?.add( { type: notice.type, message: notice.message, ...markup, dismissible: true, scope: 'page' } ) ?? null;
		}

		async function focusElement( id ) {
			if ( ! id ) {
				return;
			}
			await nextTick();
			globalThis.document?.getElementById( id )?.focus();
		}

		async function save() {
			if ( saving.value ) {
				return;
			}
			saving.value = true;
			errors.value = {};
			errorMarkup.value = {};
			const changed = changedRows( rows.value, rawValues(), saved.value );

			try {
				const answer = await api.post( ROUTE, { changed } );
				const { notices: raised = [], ...next } = answer ?? {};
				show( next );
				const ids = raised.map( addNotice );
				emit( 'saved', next );
				await focusElement( ids[ 0 ] ? noticeElementId( ids[ 0 ] ) : null );
			} catch ( error ) {
				if ( error?.code === 'admin_upstream_unreachable' || error?.status === 0 ) {
					const id = addNotice( { type: 'error', message: __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' ) } );
					await focusElement( id ? noticeElementId( id ) : null );
					return;
				}
				const state = formState();
				const result = state.errorsOf( error, __( 'Your changes could not be saved. Please try again.', 'wp-admin-site' ) );
				if ( result.settings ) {
					// The other rows were saved, as on the classic screen; the invalid ones keep what was typed.
					const input = { ...rawValues() };
					show( result.settings );
					for ( const [ key, value ] of Object.entries( state.valuesAfterPartialSave( input, saved.value, result.fields ) ) ) {
						setRow( key, value );
					}
				}
				errors.value = result.fields;
				errorMarkup.value = result.markup ?? {};
				const ids = result.notices.map( addNotice );
				const field = formState().firstInvalid( result.fields );
				await focusElement( field ?? ( ids[ 0 ] ? noticeElementId( ids[ 0 ] ) : null ) );
			} finally {
				saving.value = false;
			}
		}

		const controlClass = ( row ) => ( row.editable ? 'all-options' : 'all-options disabled' );
		// Rows are looked up by their own names: an option may be named like an Object.prototype member.
		const errorOf = ( name ) => own( errors.value, name ) ?? '';
		const markupOf = ( name ) => own( errorMarkup.value, name ) ?? '';
		const aria = ( name ) => ( {
			'aria-describedby': errorOf( name ) ? name + '-error' : null,
			'aria-invalid': errorOf( name ) ? 'true' : null,
		} );
		const shown = ( row ) => {
			const current = rawValues();
			return row.editable && Object.hasOwn( current, row.name ) ? current[ row.name ] : row.value;
		};

		return { settings, rows, values, errors, errorOf, markupOf, saving, slotContext, save, setValue, controlClass, aria, shown, setRow };
	},
	template: `
		<div class="wp-admin-options-all options-php">
			<div class="notice notice-warning"><p><strong>{{ $__( 'Warning:', 'default' ) }}</strong> {{ $__( 'This page allows direct access to your site settings. You can break things here. Please be cautious!', 'default' ) }}</p></div>

			<form name="form" method="post" id="all-options" @submit.prevent="save">
				<SlotOutlet name="before-fields" :context="slotContext" />

				<Contracted id="core/form-table">
					<Contracted v-for="row in rows" :key="row.name" contract="core/settings-field" :id="row.name" :label="row.name" :error="errorOf( row.name )" :error-markup="markupOf( row.name )">
						<textarea v-if="row.multiline" :class="controlClass( row )" :name="row.name" :id="row.name" cols="30" rows="5" :value="shown( row )" :disabled="! row.editable" @input="setRow( row.name, $event.target.value )" v-bind="aria( row.name )"></textarea>
						<input v-else :class="'regular-text ' + controlClass( row )" type="text" :name="row.name" :id="row.name" :value="shown( row )" :disabled="! row.editable" @input="setRow( row.name, $event.target.value )" v-bind="aria( row.name )">
					</Contracted>
				</Contracted>

				<SlotOutlet name="after-fields" :context="slotContext" />

				<p class="submit">
					<Button variant="primary" type="submit" id="Update" name="Update" :disabled="saving" :busy="saving">{{ $__( 'Save Changes', 'default' ) }}</Button>
				</p>

				<SlotOutlet name="after-submit" :context="slotContext" />
			</form>
		</div>
	`,
};

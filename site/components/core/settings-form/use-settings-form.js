import { computed, inject, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../../runtime/text.js';
import { noticeElementId } from '../../../runtime/notices.js';
import { collectLegacy, legacyNames } from '../../../kit/LegacyHtml.js';
import { createFormState } from './state.js';

/**
 * The state and saving of a settings screen, for its page component's setup().
 *
 * Holds what the server last said (`settings`), the form `values` and the `errors` of the
 * last save, reports unsaved changes to the page host (`pageState`), and saves: the changed
 * fields, and the values of the controls plugins added (see kit/LegacyHtml.js; in the
 * legacy sections, or in the output of an action the screen prints, `legacySections.actions`), are posted
 * to `route`; the settings it returns are shown with its notices. As on the classic screen,
 * the valid fields of a save with an invalid one are saved: the errors are shown beside
 * their field and as notices, and focus moves to the first invalid field, or to the first
 * notice.
 *
 * A checkbox whose classic form posts another value than `1` is named in `checkboxValues`:
 * its value in the form is a boolean, checked when the settings hold its on-value, and it is
 * sent as true or false; the endpoint saves the on- or off-value.
 *
 * The page's template binds `ref="form"` to its form, `@input`/`@change` to `onFormEdit`
 * and `@submit.prevent` to `save`.
 *
 * @param {object}   options
 * @param {Function} options.data             Returns the page data (the router's answer):
 *                                            the settings the endpoint returns.
 * @param {string}   options.route            Settings endpoint, e.g. `wp-admin/v1/settings/general`.
 * @param {string[]} options.fields           Editable fields of the screen, in screen order.
 * @param {string[]} [options.keepInput]      Fields whose input is kept when saving it fails.
 * @param {Object<string, string>} [options.controlIds] The control that takes focus for a field,
 *                                            where its id is not the field name.
 * @param {Object<string, Array>} [options.checkboxValues] Field => [ on-value, off-value ] of
 *                                            checkboxes that do not post `1`.
 * @param {Function} [options.onSaved]        Called with the settings and the posted body after a
 *                                            successful save, before focus moves; may be async.
 * @return {object} State and functions for the template.
 */
export function useSettingsForm( { data, route, fields, keepInput = [], controlIds = {}, checkboxValues = {}, onSaved } ) {
	const notices = inject( 'notices', null );
	const pageState = inject( 'pageState', null );
	const state = createFormState( { fields, keepInput, controlIds } );

	const initial = data();

	/** The form values of a settings answer: checkboxes with an on-value become booleans. */
	function formValues( settings ) {
		const values = state.valuesOf( settings );
		for ( const [ field, onOff ] of Object.entries( checkboxValues ) ) {
			if ( Object.hasOwn( values, field ) && typeof values[ field ] !== 'boolean' ) {
				values[ field ] = String( values[ field ] ) === String( onOff?.[ 0 ] );
			}
		}
		return values;
	}

	const settings = shallowRef( initial ); // What the server last said.
	const saved = shallowRef( formValues( initial ) );
	const values = reactive( { ...saved.value } );
	const errors = ref( {} );
	const saving = ref( false );
	const legacyDirty = ref( false );
	const generation = ref( 0 ); // Lets a page remount controls when the saved settings change.
	const form = ref( null );

	const has = ( field ) => Object.hasOwn( settings.value, field );
	const locked = computed( () => settings.value.locked ?? [] );
	const isLocked = ( field ) => locked.value.includes( field );
	const legacy = computed( () => settings.value.legacySections ?? { sections: [], scripts: [], styles: [] } );
	const sections = computed( () => legacy.value.sections.filter( ( section ) => section.position === 'section' ) );
	// Plugin controls are on the page: in sections, or in the output of an action the screen prints (e.g. Reading's blog_privacy_selector).
	const hasLegacy = computed( () => legacy.value.sections.length > 0 || Object.values( legacy.value.actions ?? {} ).some( ( action ) => action?.hooked === true ) );

	/** The fields plugins add to the section a core table prints, by section id. */
	const legacyRows = ( sectionId ) => legacy.value.sections
		.filter( ( section ) => section.position === 'form-table' && section.id === sectionId )
		.flatMap( ( section ) => section.fields );

	const dirty = computed( () => legacyDirty.value || Object.keys( state.changedFields( values, saved.value, locked.value ) ).length > 0 );
	watch( dirty, ( value ) => pageState?.setDirty( value ), { immediate: true } );

	function show( next ) {
		settings.value = next;
		saved.value = formValues( next );
		for ( const key of Object.keys( values ) ) {
			delete values[ key ];
		}
		Object.assign( values, saved.value );
		legacyDirty.value = false;
		generation.value++;
	}

	// A new page entry (the router's answer again, e.g. after the language changed).
	watch( data, ( next ) => {
		if ( next && next !== settings.value ) {
			errors.value = {};
			show( next );
		}
	} );

	function setValue( name, value ) {
		if ( Object.hasOwn( saved.value, name ) ) {
			values[ name ] = value;
		}
	}

	const slotContext = computed( () => ( { values, setValue, errors: errors.value } ) );

	function addNotice( notice ) {
		const markup = typeof notice.markup === 'string' && notice.markup !== '' ? { markup: notice.markup } : {};
		return notices?.add( { type: notice.type, message: notice.message, ...markup, dismissible: true } ) ?? null;
	}

	async function focusNotice( id ) {
		if ( ! id ) {
			return;
		}
		await nextTick();
		globalThis.document?.getElementById( noticeElementId( id ) )?.focus();
	}

	async function focusField( field ) {
		if ( ! field ) {
			return;
		}
		await nextTick();
		globalThis.document?.getElementById( state.controlId( field ) )?.focus();
	}

	function onFormEdit( event ) {
		if ( event?.target?.closest?.( '.wp-admin-legacy-html' ) ) {
			legacyDirty.value = true;
		}
	}

	async function save() {
		if ( saving.value ) {
			return;
		}
		saving.value = true;
		errors.value = {};
		const body = state.changedFields( values, saved.value, locked.value );
		if ( hasLegacy.value && form.value ) {
			body.legacy = collectLegacy( form.value );
			body.legacyNames = legacyNames( form.value );
		}

		try {
			const answer = await api.post( route, body );
			const { notices: raised = [], ...next } = answer ?? {};
			show( next );
			const ids = raised.map( addNotice );
			await onSaved?.( next, body );
			await focusNotice( ids[ 0 ] );
		} catch ( error ) {
			if ( error?.code === 'admin_upstream_unreachable' || error?.status === 0 ) {
				focusNotice( addNotice( { type: 'error', message: __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' ) } ) );
				return;
			}
			const result = state.errorsOf( error, __( 'Your changes could not be saved. Please try again.', 'wp-admin-site' ) );
			if ( result.settings ) {
				// The other fields were saved, as on the classic screen.
				const input = { ...values };
				show( result.settings );
				Object.assign( values, state.valuesAfterPartialSave( input, saved.value, result.fields ) );
			}
			errors.value = result.fields;
			const ids = result.notices.map( addNotice );
			const field = state.firstInvalid( result.fields );
			if ( field ) {
				await focusField( field );
			} else {
				await focusNotice( ids[ 0 ] );
			}
		} finally {
			saving.value = false;
		}
	}

	const aria = ( field, description = null ) => ( {
		'aria-describedby': state.describedBy( field, description, errors.value ),
		'aria-invalid': errors.value[ field ] ? 'true' : null,
	} );

	return {
		settings, values, errors, saving, generation, form, legacy, sections,
		has, isLocked, legacyRows, setValue, save, slotContext, aria, onFormEdit, show, addNotice,
	};
}

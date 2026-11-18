import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, byTag, byProp, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const { ApiError } = await import( '../site/runtime/api.js' );
const { createFormState } = await import( '../site/components/core/settings-form/state.js' );
const { useSettingsForm } = await import( '../site/components/core/settings-form/use-settings-form.js' );
const { LegacyRows, LegacySections } = await import( '../site/components/core/settings-form/legacy-fields.js' );

const { h, defineComponent } = Vue;

const ROUTE = 'wp-admin/v1/settings/acme';
const FIELDS = [ 'title', 'ping', 'size' ];

beforeEach( () => api.reset() );
afterEach( unmountAll );

/** Settings data as a settings endpoint returns it. */
function settingsData( overrides = {} ) {
	return {
		title: 'Saved',
		ping: 'open',
		size: 10,
		locked: [],
		multisite: false,
		legacySections: { sections: [], scripts: [], styles: [] },
		...overrides,
	};
}

/** A page made of a text field, a checkbox posting `open` and a number. */
function render( data = settingsData(), { keepInput = [ 'title' ], onSaved } = {} ) {
	const dirty = [];
	const added = [];
	let form = null;
	const Page = defineComponent( {
		props: { data: { type: Object, required: true } },
		setup( props ) {
			form = useSettingsForm( {
				data: () => props.data,
				route: ROUTE,
				fields: FIELDS,
				keepInput,
				controlIds: { size: 'size_custom' },
				checkboxValues: { ping: [ 'open', null ] },
				onSaved,
			} );
			return form;
		},
		template: `
			<form ref="form" @submit.prevent="save" @input="onFormEdit" @change="onFormEdit">
				<input id="title" :value="values.title" @input="setValue( 'title', $event.target.value )" v-bind="aria( 'title' )">
				<input id="ping" type="checkbox" :checked="values.ping" @change="setValue( 'ping', $event.target.checked )">
				<input id="size_custom" :value="values.size" @input="setValue( 'size', Number( $event.target.value ) )">
			</form>
		`,
	} );
	const view = mount( () => h( Page, { data } ), {
		provide: {
			notices: { add: ( notice ) => {
				added.push( notice );
				return 'n' + added.length;
			} },
			pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false },
		},
	} );
	return { view, dirty, added, form: () => form };
}

const byId = ( id ) => byProp( 'id', id );
const type = ( view, id, value ) => find( view.container, byId( id ) ).props.onInput( { target: { value } } );
const check = ( view, id, checked ) => find( view.container, byId( id ) ).props.onChange( { target: { checked } } );
const submit = ( view ) => find( view.container, byTag( 'form' ) ).props.onSubmit( { preventDefault() {} } );
const element = ( view ) => find( view.container, byTag( 'form' ) );

test( 'createFormState: bound to its own fields', () => {
	const state = createFormState( { fields: [ 'a', 'b' ], keepInput: [ 'a' ], controlIds: { b: 'b_custom' } } );
	assert.deepEqual( state.valuesOf( { a: 1, b: 2, c: 3 } ), { a: 1, b: 2 } );
	assert.deepEqual( state.changedFields( { a: 1, b: 3, c: 4 }, { a: 1, b: 2, c: 3 } ), { b: 3 } );
	assert.deepEqual( state.changedFields( { a: 2, b: 3 }, { a: 1, b: 2 }, [ 'b' ] ), { a: 2 } );
	assert.deepEqual( state.valuesAfterPartialSave( { a: 'typed', b: 'typed' }, { a: 'old', b: 'old' }, { a: 'bad', b: 'bad' } ), { a: 'typed', b: 'old' } );
	assert.equal( state.firstInvalid( { b: 'x', a: 'y', c: 'z' } ), 'a' );
	assert.equal( state.firstInvalid( { c: 'z' } ), null );
	assert.equal( state.describedBy( 'a', 'a-description', { a: 'bad' } ), 'a-description a-error' );
	assert.equal( state.controlId( 'b' ), 'b_custom' );
	assert.equal( state.controlId( 'a' ), 'a' );
	const failed = state.errorsOf( { code: 'admin_settings_errors', data: { errors: [ { field: 'c', message: 'C', type: 'error' }, { field: 'b', message: 'B', type: 'error' } ] } } );
	assert.deepEqual( failed.fields, { b: 'B' }, 'An error about another screen\'s field is only a notice.' );
	assert.equal( failed.notices.length, 2 );
} );

test( 'useSettingsForm: posts only the changed fields, and the legacy values, to its route', async () => {
	api.respondWith( async () => ( { ...settingsData( { title: 'New' } ), notices: [ { type: 'success', message: 'Settings saved.' } ] } ) );
	const saved = [];
	const legacySections = { sections: [ { id: 'default', position: 'form-table', title: '', before: '', html: '', after: '', fields: [ { id: 'acme', title: 'Acme', html: '<input name="acme_option">', labelFor: '', class: '' } ] } ], scripts: [], styles: [] };
	const { view, dirty, added, form } = render( settingsData( { legacySections } ), { onSaved: ( next, body ) => saved.push( { next, body } ) } );
	await flush();
	assert.equal( dirty.at( -1 ), false );
	assert.deepEqual( form().legacyRows( 'default' ).map( ( field ) => field.id ), [ 'acme' ] );
	assert.deepEqual( form().legacyRows( 'uploads' ), [] );
	type( view, 'title', 'New' );
	await flush();
	assert.equal( dirty.at( -1 ), true );
	element( view ).querySelectorAll = () => [ { tagName: 'INPUT', type: 'text', name: 'acme_option', value: 'typed' } ];
	submit( view );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: ROUTE, payload: { title: 'New', legacy: [ { name: 'acme_option', value: 'typed' } ], legacyNames: [ 'acme_option' ] } } ] );
	assert.equal( added[ 0 ].message, 'Settings saved.' );
	assert.equal( dirty.at( -1 ), false );
	assert.equal( saved.length, 1 );
	assert.equal( saved[ 0 ].next.title, 'New' );
	assert.equal( saved[ 0 ].body.title, 'New' );
	assert.equal( form().has( 'title' ), true );
	assert.equal( form().has( 'missing' ), false );
} );

test( 'useSettingsForm: a checkbox with its own on-value is a boolean in the form and is sent as true or false', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...settingsData( { ping: payload.ping ? 'open' : '' } ), notices: [] } ) );
	const { view, form } = render();
	await flush();
	assert.equal( form().values.ping, true, '`open` is checked.' );
	check( view, 'ping', false );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { ping: false } );
	assert.equal( form().values.ping, false, 'An empty value is unchecked.' );
	check( view, 'ping', true );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 1 ].payload, { ping: true } );
} );

test( 'useSettingsForm: errors focus the first invalid field, by its control id', async () => {
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'admin_settings_errors', message: 'Bad size.', data: {
			status: 400,
			errors: [ { setting: 'size', code: 'bad', message: 'Bad size.', type: 'error', field: 'size' }, { setting: 'title', code: 'bad', message: 'Bad title.', type: 'error', field: 'title' } ],
			settings: settingsData(),
		} } );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view, added, form } = render();
		await flush();
		type( view, 'title', 'Bad' );
		type( view, 'size_custom', '-1' );
		submit( view );
		await flush();
		assert.deepEqual( focused, [ 'title' ], 'The first invalid field in screen order.' );
		assert.equal( added.length, 2 );
		assert.equal( form().errors.value.size, 'Bad size.' );
		assert.equal( find( view.container, byId( 'title' ) ).props[ 'aria-invalid' ], 'true' );
		assert.equal( find( view.container, byId( 'title' ) ).props[ 'aria-describedby' ], 'title-error' );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'useSettingsForm: a partial save keeps the failed inputs that keep their input', async () => {
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'admin_settings_errors', message: 'Bad.', data: {
			status: 400,
			errors: [ { setting: 'title', code: 'bad', message: 'Bad title.', type: 'error', field: 'title' }, { setting: 'size', code: 'bad', message: 'Bad size.', type: 'error', field: 'size' } ],
			settings: settingsData( { title: 'Saved', size: 10 } ),
		} } );
	} );
	const { view, dirty, form } = render();
	await flush();
	type( view, 'title', 'Typed' );
	type( view, 'size_custom', '99' );
	submit( view );
	await flush();
	assert.equal( form().values.title, 'Typed', 'A text field keeps what was typed.' );
	assert.equal( form().values.size, 10, 'Another field shows the saved value again.' );
	assert.equal( dirty.at( -1 ), true );
} );

test( 'useSettingsForm: when WordPress cannot be reached, a notice says so', async () => {
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added, form } = render();
	await flush();
	type( view, 'title', 'Unsaved' );
	submit( view );
	await flush();
	assert.equal( added[ 0 ].message, 'WordPress cannot be reached right now. Please try again in a moment.' );
	assert.equal( form().values.title, 'Unsaved' );
} );

test( 'useSettingsForm: fixed fields are never sent and sections lists those after the tables', async () => {
	const legacySections = { sections: [
		{ id: 'uploads', position: 'form-table', title: '', before: '', html: '', after: '', fields: [ { id: 'x', title: 'X', html: '', labelFor: '', class: '' } ] },
		{ id: 'acme', position: 'section', title: 'Acme', before: '', html: '', after: '', fields: [] },
	], scripts: [], styles: [] };
	const { view, form } = render( settingsData( { locked: [ 'title' ], legacySections } ) );
	await flush();
	assert.equal( form().isLocked( 'title' ), true );
	assert.deepEqual( form().sections.value.map( ( section ) => section.id ), [ 'acme' ] );
	assert.deepEqual( form().legacyRows( 'uploads' ).map( ( field ) => field.id ), [ 'x' ] );
	type( view, 'title', 'Changed' );
	type( view, 'size_custom', '11' );
	element( view ).querySelectorAll = () => [];
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { size: 11, legacy: [], legacyNames: [] } );
} );

test( 'the legacy row and section components are exported from the shared directory', () => {
	assert.equal( LegacyRows.name, 'LegacyRows' );
	assert.equal( LegacySections.name, 'LegacySections' );
} );

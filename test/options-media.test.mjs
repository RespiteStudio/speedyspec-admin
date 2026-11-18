import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush: flushOnce } = await import( './helpers/dom.mjs' );
// The page, its tables and its rows each resolve their contract: several rounds.
const flush = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushOnce();
	}
};
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const state = await import( '../site/components/core/options-media/state.js' );

const { h, defineComponent } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const NAMES = [ 'options-media', 'form-table', 'settings-field' ];
const loaded = {};
for ( const name of NAMES ) {
	loaded[ name ] = {
		contract: await import( '../site/contracts/core/' + name + '.js' ),
		component: await import( '../site/components/core/' + name + '.js' ),
	};
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = loaded[ name ].contract;
	globalThis.__modules[ '/components/core/' + name + '.js' ] = loaded[ name ].component;
}

beforeEach( () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
} );
afterEach( unmountAll );

/** Settings data as wp-admin/v1/settings/media returns it on a single site with the default upload paths. */
function settingsData( overrides = {} ) {
	return {
		thumbnail_size_w: 150,
		thumbnail_size_h: 150,
		thumbnail_crop: true,
		medium_size_w: 300,
		medium_size_h: 300,
		large_size_w: 1024,
		large_size_h: 1024,
		uploads_use_yearmonth_folders: true,
		unshown: [],
		flags: { uploadPaths: false },
		locked: [ 'upload_path', 'upload_url_path' ],
		multisite: false,
		legacySections: { sections: [], scripts: [], styles: [] },
		...overrides,
	};
}

/** Settings data with editable upload paths. */
const withUploadPaths = ( overrides = {} ) => settingsData( { upload_path: 'wp-content/files', upload_url_path: '', flags: { uploadPaths: true }, locked: [], ...overrides } );

/** Settings data on a multisite network. */
function networkData() {
	const data = settingsData( { multisite: true, locked: [] } );
	delete data.uploads_use_yearmonth_folders;
	return data;
}

function render( data = settingsData() ) {
	const dirty = [];
	const added = [];
	const service = { add: ( notice ) => {
		added.push( notice );
		return 'n' + added.length;
	} };
	const view = mount( () => h( Contracted, { id: 'core/options-media', data, page: { path: 'options-media.php', title: 'Media Settings' } } ), {
		provide: { notices: service, pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false } },
	} );
	return { view, dirty, added };
}

const byId = ( id ) => byProp( 'id', id );
const rowOf = ( container, field ) => find( container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] === field );
const headings = ( container ) => findAll( container, byTag( 'h2' ) ).map( ( el ) => [ el.props.id, textOf( el ) ] );
const type = ( view, id, value ) => find( view.container, byId( id ) ).props.onInput( { target: { value } } );
const check = ( view, id, checked ) => find( view.container, byId( id ) ).props.onChange( { target: { checked } } );
const submit = ( view ) => find( view.container, byTag( 'form' ) ).props.onSubmit( { preventDefault() {} } );

test( 'ruling P7: a checkbox over a stored value it cannot show is sent unchecked on every save', async () => {
	api.respondWith( async () => ( { ...settingsData( { thumbnail_crop: false } ), unshown: [], notices: [] } ) );
	const { view } = render( settingsData( { thumbnail_crop: false, unshown: [ 'thumbnail_crop' ] } ) );
	await flush();
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { thumbnail_crop: false } );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 1 ].payload, {}, 'Once stored as the classic save stores it, it is not sent again.' );
	assert.equal( state.classicFields, undefined, 'The shared settings form replays unshown; the page decides nothing.' );
} );

test( 'the contract has the established shape and version 1.0.0', () => {
	const contract = loaded[ 'options-media' ].contract.default;
	assert.equal( contract.id, 'core/options-media' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true, 'A page contract: its files are gated by role.' );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-fields', 'after-fields', 'after-submit' ] );
	for ( const slot of Object.values( contract.slots ) ) {
		assert.deepEqual( Object.keys( slot.props ), [ 'values', 'setValue', 'errors' ] );
	}
	assert.deepEqual( contract.emits, [ 'saved' ] );
	assert.deepEqual( Object.keys( contract ).sort(), [ 'emits', 'id', 'page', 'props', 'slots', 'version' ] );
} );

test( 'the page root has the classic body class, so that core styles for the screen apply', async () => {
	const { view } = render();
	await flush();
	const root = find( view.container, byClass( 'wp-admin-options-media' ) );
	assert.ok( hasClass( root, 'options-media-php' ), 'forms.css styles `.options-media-php [for*="_size_"]`.' );
} );

test( 'renders the image sizes in the classic order, headings, labels and classes', async () => {
	const { view } = render();
	await flush();
	const rows = findAll( view.container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] );
	assert.deepEqual( rows.map( ( row ) => row.props[ 'data-field' ] ), [ 'thumbnail_size', 'medium_size', 'large_size', 'uploads_use_yearmonth_folders' ] );
	assert.deepEqual( headings( view.container ), [ [ 'wp-settings-section-image-sizes', 'Image sizes' ], [ 'wp-settings-section-uploading-files', 'Uploading Files' ] ] );
	assert.ok( findAll( view.container, byTag( 'h2' ) ).every( ( el ) => hasClass( el, 'title' ) ) );
	assert.match( view.text(), /The sizes listed below determine the maximum dimensions in pixels to use when adding an image to the Media Library\./ );

	for ( const [ row, title ] of Object.entries( { thumbnail_size: 'Thumbnail size', medium_size: 'Medium size', large_size: 'Large size' } ) ) {
		assert.equal( textOf( find( rowOf( view.container, row ), byTag( 'th' ) ) ).trim(), title, row + ' title' );
		assert.equal( textOf( find( rowOf( view.container, row ), byTag( 'legend' ) ) ), title, row + ' legend' );
		assert.ok( hasClass( find( rowOf( view.container, row ), byTag( 'legend' ) ), 'screen-reader-text' ) );
	}

	const labels = {
		thumbnail_size_w: 'Width',
		thumbnail_size_h: 'Height',
		medium_size_w: 'Max Width',
		medium_size_h: 'Max Height',
		large_size_w: 'Max Width',
		large_size_h: 'Max Height',
		thumbnail_crop: 'Crop thumbnail to exact dimensions (normally thumbnails are proportional)',
	};
	for ( const [ id, text ] of Object.entries( labels ) ) {
		const label = find( view.container, ( el ) => el.tag === 'label' && el.props.for === id );
		assert.equal( textOf( label ).trim(), text, id + ' label' );
	}
	for ( const id of state.SIZES ) {
		const input = find( view.container, byId( id ) );
		assert.equal( input.props.type, 'number', id );
		assert.equal( input.props.step, '1' );
		assert.equal( input.props.min, '0' );
		assert.equal( input.props.class, 'small-text' );
		assert.equal( input.props.name, id );
	}
	assert.equal( find( view.container, byId( 'thumbnail_size_w' ) ).props.value, 150 );
	assert.equal( find( view.container, byId( 'large_size_h' ) ).props.value, 1024 );
	assert.equal( find( view.container, byId( 'thumbnail_crop' ) ).props.checked, true );
	assert.equal( find( view.container, byId( 'thumbnail_crop' ) ).props.value, '1' );

	const submitButton = find( view.container, byId( 'submit' ) );
	assert.ok( hasClass( submitButton, 'button-primary' ) );
	assert.equal( textOf( submitButton ), 'Save Changes' );
	assert.equal( findAll( view.container, byTag( 'h1' ) ).length, 0, 'The page host renders the heading.' );
	assert.equal( find( view.container, byTag( 'form' ) ).props.novalidate, undefined, 'The classic form is validated by the browser (min 0, step 1).' );
} );

test( 'the year- and month-based folders checkbox is a full-width row', async () => {
	const { view } = render( settingsData( { uploads_use_yearmonth_folders: false } ) );
	await flush();
	const row = rowOf( view.container, 'uploads_use_yearmonth_folders' );
	assert.equal( find( row, byTag( 'th' ) ), null );
	const cell = find( row, byTag( 'td' ) );
	assert.equal( cell.props.colspan, '2' );
	assert.ok( hasClass( cell, 'td-full' ) );
	const label = find( cell, byTag( 'label' ) );
	assert.equal( label.props.for, 'uploads_use_yearmonth_folders' );
	assert.equal( textOf( label ).trim(), 'Organize my uploads into month- and year-based folders' );
	assert.equal( find( label, byId( 'uploads_use_yearmonth_folders' ) ).props.checked, false, 'The label wraps the checkbox.' );
} );

test( 'locked upload paths are not shown, as on the classic screen', async () => {
	const { view } = render();
	await flush();
	assert.equal( find( view.container, byId( 'upload_path' ) ), null );
	assert.equal( find( view.container, byId( 'upload_url_path' ) ), null );
} );

test( 'editable upload paths are shown with their classic descriptions', async () => {
	const { view } = render( withUploadPaths() );
	await flush();
	const rows = findAll( view.container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] );
	assert.deepEqual( rows.map( ( row ) => row.props[ 'data-field' ] ), [ 'thumbnail_size', 'medium_size', 'large_size', 'upload_path', 'upload_url_path', 'uploads_use_yearmonth_folders' ] );

	const path = find( view.container, byId( 'upload_path' ) );
	assert.equal( path.props.value, 'wp-content/files' );
	assert.equal( path.props.class, 'regular-text code' );
	assert.equal( textOf( find( rowOf( view.container, 'upload_path' ), byTag( 'label' ) ) ), 'Store uploads in this folder' );
	const description = find( rowOf( view.container, 'upload_path' ), byClass( 'description' ) );
	assert.equal( textOf( description ), 'Default is wp-content/uploads' );
	assert.equal( textOf( find( description, byTag( 'code' ) ) ), 'wp-content/uploads' );

	assert.equal( textOf( find( rowOf( view.container, 'upload_url_path' ), byTag( 'label' ) ) ), 'Full URL path to files' );
	assert.equal( textOf( find( rowOf( view.container, 'upload_url_path' ), byClass( 'description' ) ) ), 'Configuring this is optional. By default, it should be blank.' );
	assert.equal( find( view.container, byId( 'upload_url_path' ) ).props.class, 'regular-text code' );
} );

test( 'on a multisite network there is no Uploading Files table', async () => {
	const { view } = render( networkData() );
	await flush();
	assert.deepEqual( headings( view.container ).map( ( [ id ] ) => id ), [ 'wp-settings-section-image-sizes' ] );
	assert.equal( find( view.container, byId( 'uploads_use_yearmonth_folders' ) ), null );
	assert.equal( findAll( view.container, byClass( 'form-table' ) ).length, 1 );
} );

test( 'saving posts only the changed fields, booleans for checkboxes and an empty cleared size', async () => {
	let resolve;
	api.respondWith( () => new Promise( ( done ) => ( resolve = done ) ) );
	const { view, dirty, added } = render();
	await flush();
	type( view, 'medium_size_w', '640' );
	type( view, 'large_size_h', '' );
	check( view, 'thumbnail_crop', false );
	check( view, 'uploads_use_yearmonth_folders', false );
	await flush();
	assert.equal( dirty.at( -1 ), true, 'Unsaved changes are reported.' );

	submit( view );
	await flush();
	assert.equal( find( view.container, byId( 'submit' ) ).props.disabled, true );
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/settings/media', payload: { thumbnail_crop: false, medium_size_w: 640, large_size_h: '', uploads_use_yearmonth_folders: false } } );

	resolve( { ...settingsData( { thumbnail_crop: false, medium_size_w: 640, large_size_h: 0, uploads_use_yearmonth_folders: false } ), notices: [ { type: 'success', message: 'Settings saved.' } ] } );
	await flush();
	assert.deepEqual( added, [ { type: 'success', message: 'Settings saved.', dismissible: true, scope: 'page' } ] );
	assert.equal( dirty.at( -1 ), false, 'Saved.' );
	assert.equal( find( view.container, byId( 'large_size_h' ) ).props.value, 0, 'The saved value: 0, as on the classic screen.' );
	assert.equal( find( view.container, byId( 'thumbnail_crop' ) ).props.checked, false );
} );

test( 'typing a size back to its saved value is not a change', async () => {
	const { view, dirty } = render();
	await flush();
	type( view, 'thumbnail_size_w', '200' );
	await flush();
	assert.equal( dirty.at( -1 ), true );
	type( view, 'thumbnail_size_w', '150' );
	await flush();
	assert.equal( dirty.at( -1 ), false );
} );

test( 'the upload paths are saved when they can be edited', async () => {
	api.respondWith( async () => ( { ...withUploadPaths( { upload_url_path: 'https://cdn.example.org' } ), notices: [] } ) );
	const { view } = render( withUploadPaths() );
	await flush();
	type( view, 'upload_url_path', 'https://cdn.example.org' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { upload_url_path: 'https://cdn.example.org' } );
	assert.equal( find( view.container, byId( 'upload_url_path' ) ).props.value, 'https://cdn.example.org' );
} );

test( 'saving the default upload folder hides the upload paths, as the classic screen does after the redirect', async () => {
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	const { view } = render( withUploadPaths() );
	await flush();
	type( view, 'upload_path', 'wp-content/uploads' );
	submit( view );
	await flush();
	assert.equal( find( view.container, byId( 'upload_path' ) ), null );
} );

test( 'a refused parameter is shown beside its control in a grouped row', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'rest_invalid_param', message: 'Invalid parameter(s): medium_size_h', data: { status: 400, params: { medium_size_h: 'medium_size_h is not of type integer,string.' } } } );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view, added } = render();
		await flush();
		type( view, 'medium_size_h', '12' );
		submit( view );
		await flush();
		const input = find( view.container, byId( 'medium_size_h' ) );
		assert.equal( input.props[ 'aria-invalid' ], 'true' );
		assert.equal( input.props[ 'aria-describedby' ], 'medium_size_h-error' );
		assert.equal( textOf( find( view.container, byId( 'medium_size_h-error' ) ) ), 'medium_size_h is not of type integer,string.' );
		assert.ok( find( rowOf( view.container, 'medium_size' ), byId( 'medium_size_h-error' ) ), 'The error is in the row of its control.' );
		assert.equal( input.props.value, 12, 'The input is kept.' );
		assert.equal( added[ 0 ].message, 'Invalid parameter(s): medium_size_h' );
		assert.deepEqual( focused, [ 'medium_size_h' ] );
		assert.equal( find( view.container, byId( 'medium_size_w' ) ).props[ 'aria-invalid' ], null );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'when WordPress cannot be reached, a notice says so and the input is kept', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added, dirty } = render();
	await flush();
	type( view, 'large_size_w', '2048' );
	submit( view );
	await flush();
	assert.equal( added[ 0 ].message, 'WordPress cannot be reached right now. Please try again in a moment.' );
	assert.equal( find( view.container, byId( 'large_size_w' ) ).props.value, 2048 );
	assert.equal( dirty.at( -1 ), true );
} );

/** Legacy sections as the endpoint returns them for fields in each in-table section and a section. */
function legacySections() {
	const field = ( id, section ) => ( { id, title: 'Acme ' + section, html: '<input name="' + id + '" id="' + id + '" value="">', labelFor: id, class: '', error: false } );
	return {
		sections: [
			{ id: 'default', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_default', 'default' ) ] },
			{ id: 'embeds', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_embeds', 'embeds' ) ] },
			{ id: 'uploads', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_uploads', 'uploads' ) ] },
			{ id: 'acme_section', position: 'section', title: 'Acme Section', before: '', html: '<p>Intro</p>', after: '', error: false, fields: [] },
		],
		scripts: [],
		styles: [],
	};
}

test( 'plugin fields render at the end of the table of their section, and their sections after the tables', async () => {
	const { view } = render( withUploadPaths( { legacySections: legacySections() } ) );
	await flush();
	const tables = findAll( view.container, byClass( 'form-table' ) );
	assert.equal( tables.length, 3 );
	const rowIds = ( table ) => findAll( table, byTag( 'tr' ) ).map( ( row ) => row.props[ 'data-field' ] ?? row.props[ 'data-legacy-field' ] );
	assert.deepEqual( rowIds( tables[ 0 ] ), [ 'thumbnail_size', 'medium_size', 'large_size', 'acme_default' ] );
	assert.deepEqual( rowIds( tables[ 1 ] ), [ 'acme_embeds' ] );
	assert.deepEqual( rowIds( tables[ 2 ] ), [ 'upload_path', 'upload_url_path', 'uploads_use_yearmonth_folders', 'acme_uploads' ] );
	assert.deepEqual( headings( view.container ).map( ( [ id ] ) => id ), [ 'wp-settings-section-image-sizes', 'wp-settings-section-embeds', 'wp-settings-section-uploading-files', undefined ] );
	assert.equal( textOf( findAll( view.container, byTag( 'h2' ) )[ 1 ] ), 'Embeds' );
	assert.equal( find( find( view.container, ( el ) => el.props[ 'data-legacy-field' ] === 'acme_uploads' ), byTag( 'label' ) ).props.for, 'acme_uploads' );

	const section = find( view.container, ( el ) => el.props[ 'data-legacy-section' ] === 'acme_section' );
	assert.ok( section );
	const order = find( view.container, byTag( 'form' ) ).children
		.filter( ( el ) => el.type === 'element' )
		.map( ( el ) => el.props[ 'data-legacy-section' ] ?? ( hasClass( el, 'form-table' ) ? 'table' : el.tag ) );
	assert.ok( order.lastIndexOf( 'table' ) < order.indexOf( 'acme_section' ), 'The section follows the last table: ' + order.join( ', ' ) );
	assert.equal( order.at( -1 ), 'p', 'The submit button comes last.' );
} );

test( 'the Embeds table is shown only when plugins add fields to its section', async () => {
	const legacy = legacySections();
	legacy.sections = legacy.sections.filter( ( section ) => section.id !== 'embeds' );
	const { view } = render( settingsData( { legacySections: legacy } ) );
	await flush();
	assert.deepEqual( headings( view.container ).map( ( [ id ] ) => id ).filter( Boolean ), [ 'wp-settings-section-image-sizes', 'wp-settings-section-uploading-files' ] );
} );

test( 'plugin field values are posted with the save', async () => {
	api.respondWith( async () => ( { ...settingsData( { legacySections: legacySections() } ), notices: [] } ) );
	const { view } = render( settingsData( { legacySections: legacySections() } ) );
	await flush();
	const form = find( view.container, byTag( 'form' ) );
	form.querySelectorAll = () => [ { tagName: 'INPUT', type: 'text', name: 'acme_uploads', value: 'typed' } ];
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { legacy: [ { name: 'acme_uploads', value: 'typed' } ], legacyNames: [ 'acme_uploads' ] } );
} );

test( 'slot modules get the values, setValue and the errors', async () => {
	const seen = [];
	const Slot = defineComponent( {
		props: [ 'values', 'setValue', 'errors' ],
		setup( props ) {
			seen.push( props );
			return () => h( 'p', { class: 'slot-module' }, 'Large: ' + props.values.large_size_w );
		},
	} );
	globalThis.__modules[ '/m/om-slot.js' ] = { default: Slot };
	loader.applyImportMap( { 'om-slot': '/m/om-slot.js' } );
	contracts.configure( { replacements: {}, slots: { 'core/options-media': { 'after-fields': [ { module: 'om-slot' } ] } } } );
	const { view } = render();
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Large: 1024' );
	type( view, 'large_size_w', '2000' );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Large: 2000' );
	seen[ 0 ].setValue( 'large_size_w', 999 );
	await flush();
	assert.equal( find( view.container, byId( 'large_size_w' ) ).props.value, 999 );
} );

test( 'a replacement of core/settings-field is used for every settings-field row', async () => {
	const Row = defineComponent( {
		props: [ 'id', 'label', 'description', 'locked', 'error', 'group', 'icon' ],
		setup: ( props, { slots } ) => () => h( 'tr', { class: 'replaced-row', 'data-field': props.id }, [ h( 'th', props.label ), h( 'td', slots.default?.() ) ] ),
	} );
	globalThis.__modules[ '/m/om-row.js' ] = { default: Row, implementsContract: { id: 'core/settings-field', version: '1.0.0' } };
	loader.applyImportMap( { 'om-row': '/m/om-row.js' } );
	contracts.configure( { replacements: { 'core/settings-field': { module: 'om-row', implements: '1.0.0' } }, slots: {} } );
	const { view } = render( withUploadPaths() );
	await flush();
	const replaced = findAll( view.container, byClass( 'replaced-row' ) );
	assert.deepEqual( replaced.map( ( row ) => row.props[ 'data-field' ] ), [ 'thumbnail_size', 'medium_size', 'large_size', 'upload_path', 'upload_url_path' ] );
	assert.ok( find( view.container, byId( 'thumbnail_size_w' ) ), 'The controls are still rendered in it.' );
	assert.ok( ! hasClass( rowOf( view.container, 'uploads_use_yearmonth_folders' ), 'replaced-row' ), 'The full-width row is the screen\'s own markup.' );
} );

test( 'a replacement of core/form-table is used for every table', async () => {
	const Table = defineComponent( { setup: ( props, { slots } ) => () => h( 'table', { class: 'replaced-table' }, [ h( 'tbody', slots.default?.() ) ] ) } );
	globalThis.__modules[ '/m/om-table.js' ] = { default: Table, implementsContract: { id: 'core/form-table', version: '1.0.0' } };
	loader.applyImportMap( { 'om-table': '/m/om-table.js' } );
	contracts.configure( { replacements: { 'core/form-table': { module: 'om-table', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	assert.equal( findAll( view.container, byClass( 'replaced-table' ) ).length, 2 );
	assert.equal( find( view.container, byClass( 'form-table' ) ), null );
} );

test( 'a successful save emits saved with the settings', async () => {
	api.respondWith( async () => ( { ...settingsData( { large_size_w: 1500 } ), notices: [] } ) );
	const saved = [];
	const view = mount( () => h( Contracted, { id: 'core/options-media', data: settingsData(), page: { path: 'options-media.php' }, onSaved: ( value ) => saved.push( value ) } ), {
		provide: { notices: { add: () => null }, pageState: null },
	} );
	await flush();
	submit( view );
	await flush();
	assert.equal( saved.length, 1 );
	assert.equal( saved[ 0 ].large_size_w, 1500 );
	assert.equal( 'notices' in saved[ 0 ], false );
} );

test( 'state: size values and changed fields', () => {
	assert.equal( state.sizeValue( '' ), '' );
	assert.equal( state.sizeValue( '  ' ), '' );
	assert.equal( state.sizeValue( '640' ), 640 );
	assert.deepEqual( state.changedFields( { thumbnail_size_w: 150, upload_path: 'x' }, { thumbnail_size_w: 150, upload_path: 'y' } ), { upload_path: 'x' } );
	assert.equal( state.firstInvalid( { large_size_h: 'x', thumbnail_size_w: 'y' } ), 'thumbnail_size_w' );
} );

// Help -------------------------------------------------------------------------------

async function renderHelp( component, data = settingsData() ) {
	const view = mount( () => h( 'div', null, [ h( component ) ] ), { provide: { framePage: Vue.ref( { path: 'options-media.php', data } ) } } );
	await flush();
	return view;
}

const paragraphs = ( view ) => findAll( view.container, byTag( 'p' ) ).map( textOf );

test( 'the page exports the classic screen\'s help: the Overview tab and the sidebar', () => {
	const { help } = loaded[ 'options-media' ].component;
	assert.deepEqual( help.tabs.map( ( tab ) => tab.id ), [ 'overview' ] );
	assert.equal( help.tabs[ 0 ].title(), 'Overview' );
	assert.equal( typeof help.tabs[ 0 ].component, 'object' );
	assert.equal( typeof help.sidebar, 'object' );
} );

test( 'the Overview help tab has the classic text, with Uploading Files only when the paths can be edited', async () => {
	const { help } = loaded[ 'options-media' ].component;
	const first = 'You can set maximum sizes for images inserted into your written content; you can also insert an image as Full Size.';
	const uploads = 'Uploading Files allows you to choose the folder and path for storing your uploaded files.';
	const last = 'You must click the Save Changes button at the bottom of the screen for new settings to take effect.';

	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 0 ].component ) ), [ first, last ], 'Locked paths.' );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 0 ].component, withUploadPaths() ) ), [ first, uploads, last ], 'Editable paths.' );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 0 ].component, networkData() ) ), [ first, last ], 'A network.' );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 0 ].component, settingsData( { upload_path: 'wp-content/files', flags: { uploadPaths: false } } ) ) ), [ first, last ], 'The flag decides, not the fields.' );
} );

test( 'the help sidebar links the documentation and the support forums', async () => {
	const { help } = loaded[ 'options-media' ].component;
	const view = await renderHelp( help.sidebar );
	assert.deepEqual( paragraphs( view ), [ 'For more information:', 'Documentation on Media Settings', 'Support forums' ] );
	assert.ok( find( view.container, byTag( 'strong' ) ) );
	assert.deepEqual( findAll( view.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [ 'https://wordpress.org/documentation/article/settings-media-screen/', 'https://wordpress.org/support/forums/' ] );
} );

test( 'after a save that locks or unlocks the upload paths, the help follows the page, and the router data once the page is gone', async () => {
	const { help } = loaded[ 'options-media' ].component;
	const uploads = 'Uploading Files allows you to choose the folder and path for storing your uploaded files.';
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	const framePage = Vue.ref( { path: 'options-media.php', data: withUploadPaths() } );
	const view = mount( () => h( 'div', null, [
		h( Contracted, { id: 'core/options-media', data: framePage.value.data, page: { path: 'options-media.php' } } ),
		h( help.tabs[ 0 ].component ),
	] ), { provide: { framePage, notices: { add: () => null }, pageState: null } } );
	await flush();
	const helpText = () => findAll( view.container, byTag( 'p' ) ).map( textOf );
	assert.ok( helpText().includes( uploads ), 'Editable paths before the save.' );

	type( view, 'upload_path', 'wp-content/uploads' );
	submit( view );
	await flush();
	assert.equal( find( view.container, byId( 'upload_path' ) ), null );
	assert.ok( ! helpText().includes( uploads ), 'Locked after the save: the help says so.' );

	unmountAll();
	const alone = await renderHelp( help.tabs[ 0 ].component, withUploadPaths() );
	assert.ok( paragraphs( alone ).includes( uploads ), 'Without the page, the help reads the router data again.' );
} );


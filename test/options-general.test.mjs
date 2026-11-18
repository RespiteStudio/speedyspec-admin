import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush: flushOnce } = await import( './helpers/dom.mjs' );
// The page, its table and its rows each resolve their contract: several rounds.
const flush = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushOnce();
	}
};
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const state = await import( '../site/components/core/options-general/state.js' );
const { PREVIEW_DELAY } = await import( '../site/components/core/options-general/format-choices.js' );

const { h, defineComponent, reactive } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const NAMES = [ 'options-general', 'form-table', 'settings-field' ];
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

/** Settings data as wp-admin/v1/settings/general returns it on a single site. */
function settingsData( overrides = {} ) {
	return {
		blogname: 'My Site',
		blogdescription: 'Just another site',
		site_icon: { id: 0, url: '', alt: '' },
		siteurl: 'http://localhost:8889',
		home: 'http://localhost:8889',
		new_admin_email: 'admin@example.org',
		pending_admin_email: '',
		users_can_register: false,
		default_role: 'subscriber',
		WPLANG: '',
		timezone_string: 'Europe/Lisbon',
		gmt_offset: 0,
		date_format: 'F j, Y',
		time_format: 'g:i a',
		start_of_week: 1,
		choices: {
			roles: [ { value: 'subscriber', label: 'Subscriber' }, { value: 'author', label: 'Author' } ],
			languages: [ { value: '', label: 'English (United States)', lang: 'en', installed: true }, { value: 'de_DE', label: 'Deutsch', lang: 'de', installed: true }, { value: 'fr_FR', label: 'Français', lang: 'fr', installed: false } ],
			languagesComplete: true,
			timezones: [ { group: 'Europe', options: [ { value: 'Europe/Lisbon', label: 'Lisbon' }, { value: 'Europe/Paris', label: 'Paris' } ] }, { group: 'Manual Offsets', options: [ { value: 'UTC+2', label: 'UTC+2' } ] } ],
			dateFormats: [ { value: 'F j, Y', example: 'November 17, 2026' }, { value: 'Y-m-d', example: '2026-11-17' } ],
			timeFormats: [ { value: 'g:i a', example: '10:00 am' }, { value: 'H:i', example: '10:00' } ],
			weekdays: [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ].map( ( label, value ) => ( { value, label } ) ),
		},
		preview: {
			dateFormat: 'November 17, 2026',
			timeFormat: '10:00 am',
			utcTime: { format: 'Universal time is %s.', value: '2026-11-17 10:00:00' },
			localTime: { format: 'Local time is %s.', value: '2026-11-17 10:00:00' },
			timezoneAbbr: 'WET',
			dstNotice: [ { format: 'This timezone is currently in standard time.', value: null }, { format: 'Daylight saving time begins on: %s.', value: 'March 28, 2027 1:00 am' } ],
		},
		locked: [],
		multisite: false,
		legacySections: { sections: [], scripts: [], styles: [] },
		...overrides,
	};
}

function render( data = settingsData(), { notices = null, provide = {} } = {} ) {
	const dirty = [];
	const added = [];
	const service = notices ?? { add: ( notice ) => {
		added.push( notice );
		return 'n' + added.length;
	} };
	const view = mount( () => h( Contracted, { id: 'core/options-general', data, page: { path: 'options-general.php', title: 'General Settings' } } ), {
		provide: { notices: service, pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false }, ...provide },
	} );
	return { view, dirty, added };
}

const byId = ( id ) => byProp( 'id', id );
// flush() waits on setTimeout, which the preview tests mock: these wait on setImmediate.
const settle = async () => {
	for ( let i = 0; i < 60; i++ ) {
		await new Promise( ( resolve ) => setImmediate( resolve ) );
	}
};
const rowOf = ( container, field ) => find( container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] === field );

test( 'the contracts have the established shape and version 1.0.0', () => {
	const expected = {
		'options-general': { props: [ 'data', 'page' ], slots: [ 'before-fields', 'after-fields', 'after-submit' ], emits: [ 'saved' ] },
		'form-table': { props: [], slots: [ 'default', 'before-rows', 'after-rows' ], emits: [] },
		'settings-field': { props: [ 'id', 'label', 'description', 'locked', 'error', 'group', 'icon' ], slots: [ 'default', 'after-control' ], emits: [] },
	};
	for ( const [ name, shape ] of Object.entries( expected ) ) {
		const contract = loaded[ name ].contract.default;
		assert.equal( contract.id, 'core/' + name );
		assert.equal( contract.version, '1.0.0' );
		assert.deepEqual( Object.keys( contract.props ), shape.props, name + ' props' );
		assert.deepEqual( Object.keys( contract.slots ), shape.slots, name + ' slots' );
		assert.deepEqual( contract.emits, shape.emits, name + ' emits' );
		assert.deepEqual( Object.keys( contract ).filter( ( key ) => key !== 'page' ).sort(), [ 'emits', 'id', 'props', 'slots', 'version' ], name + ' keys' );
	}
	// Only the page's own contract is a page (its files are gated by role); the table and row are shared.
	assert.equal( loaded[ 'options-general' ].contract.default.page, true );
	assert.equal( loaded[ 'form-table' ].contract.default.page, undefined );
	assert.equal( loaded[ 'settings-field' ].contract.default.page, undefined );
	for ( const slot of [ 'before-fields', 'after-fields', 'after-submit' ] ) {
		assert.deepEqual( Object.keys( loaded[ 'options-general' ].contract.default.slots[ slot ].props ), [ 'values', 'setValue', 'errors' ] );
	}
	assert.equal( loaded[ 'settings-field' ].contract.default.props.id.required, true );
} );

test( 'renders every field in the classic order, each control labelled by its row', async () => {
	const { view } = render();
	await flush();
	const rows = findAll( view.container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] );
	assert.deepEqual( rows.map( ( row ) => row.props[ 'data-field' ] ), [ 'blogname', 'blogdescription', 'site_icon', 'siteurl', 'home', 'new_admin_email', 'users_can_register', 'default_role', 'WPLANG', 'timezone_string', 'date_format', 'time_format', 'start_of_week' ] );

	const labels = {
		blogname: 'Site Title',
		blogdescription: 'Tagline',
		siteurl: 'WordPress Address (URL)',
		home: 'Site Address (URL)',
		new_admin_email: 'Administration Email Address',
		default_role: 'New User Default Role',
		WPLANG: 'Site Language',
		timezone_string: 'Timezone',
		start_of_week: 'Week Starts On',
	};
	for ( const [ field, text ] of Object.entries( labels ) ) {
		const row = rowOf( view.container, field );
		const label = find( row, byTag( 'label' ) );
		assert.equal( textOf( label ), text, field + ' label' );
		assert.equal( label.props.for, field );
		assert.ok( find( row, byId( field ) ), field + ' control has the id the label is for' );
	}
	for ( const [ field, text ] of Object.entries( { site_icon: 'Site Icon', users_can_register: 'Membership', date_format: 'Date Format', time_format: 'Time Format' } ) ) {
		assert.equal( textOf( find( rowOf( view.container, field ), byTag( 'th' ) ) ).trim(), text );
	}
	assert.ok( find( rowOf( view.container, 'WPLANG' ), byClass( 'dashicons-translation' ) ) );
	assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'My Site' );
	assert.equal( find( view.container, byId( 'blogname' ) ).props.class, 'regular-text' );
	assert.ok( find( view.container, byClass( 'form-table' ) ) );
	const submit = find( view.container, byId( 'submit' ) );
	assert.ok( hasClass( submit, 'button-primary' ) );
	assert.equal( submit.props.type, 'submit' );
	assert.equal( textOf( submit ), 'Save Changes' );
	assert.equal( findAll( view.container, byTag( 'h1' ) ).length, 0, 'The page host renders the heading.' );
} );

test( 'descriptions are wired with aria-describedby and the classic ids', async () => {
	const { view } = render();
	await flush();
	assert.equal( find( view.container, byId( 'blogdescription' ) ).props[ 'aria-describedby' ], 'tagline-description' );
	assert.equal( textOf( find( view.container, byId( 'tagline-description' ) ) ), 'In a few words, explain what this site is about. Example: “Just another WordPress site.”' );
	assert.equal( find( view.container, byId( 'home' ) ).props[ 'aria-describedby' ], 'home-description' );
	const link = find( find( view.container, byId( 'home-description' ) ), byTag( 'a' ) );
	assert.equal( link.props.href, 'https://developer.wordpress.org/advanced-administration/server/wordpress-in-directory/' );
	assert.equal( find( view.container, byId( 'new_admin_email' ) ).props[ 'aria-describedby' ], 'new-admin-email-description' );
	assert.equal( find( view.container, byId( 'timezone_string' ) ).props[ 'aria-describedby' ], 'timezone-description' );
	assert.equal( textOf( find( view.container, byTag( 'abbr' ) ) ), 'UTC' );
	assert.equal( textOf( find( view.container, byId( 'utc-time' ) ) ), 'Universal time is 2026-11-17 10:00:00.' );
	assert.equal( textOf( find( find( view.container, byId( 'local-time' ) ), byTag( 'code' ) ) ), '2026-11-17 10:00:00' );
	assert.match( view.text(), /This timezone is currently in standard time\. Daylight saving time begins on: March 28, 2027 1:00 am\./ );
} );

test( 'the multisite tagline names the network and the network fields are absent', async () => {
	const data = settingsData( { multisite: true, networkName: 'Acme %s <b>Network</b>' } );
	for ( const field of [ 'siteurl', 'home', 'users_can_register', 'default_role' ] ) {
		delete data[ field ];
	}
	delete data.choices.roles;
	const { view } = render( data );
	await flush();
	for ( const field of [ 'siteurl', 'home', 'users_can_register', 'default_role' ] ) {
		assert.equal( rowOf( view.container, field ), null, field );
	}
	const description = find( view.container, byId( 'tagline-description' ) );
	assert.equal( textOf( description ), 'In a few words, explain what this site is about. Example: “Just another Acme %s <b>Network</b> site.”', 'The name is text.' );
	assert.equal( findAll( description, byTag( 'b' ) ).length, 0 );
} );

test( 'a field fixed by a constant is disabled, and the home description is hidden as on the classic screen', async () => {
	const { view } = render( settingsData( { locked: [ 'siteurl', 'home' ] } ) );
	await flush();
	for ( const field of [ 'siteurl', 'home' ] ) {
		const input = find( view.container, byId( field ) );
		assert.equal( input.props.disabled, true, field );
		assert.ok( hasClass( input, 'disabled' ) );
		assert.ok( hasClass( rowOf( view.container, field ), 'is-locked' ) );
	}
	assert.equal( find( view.container, byId( 'home-description' ) ), null );
	for ( const field of [ 'siteurl', 'home' ] ) {
		const description = find( view.container, byId( field + '-locked-description' ) );
		assert.equal( textOf( description ), 'This address is set in the site configuration file and cannot be changed here.' );
		assert.equal( find( view.container, byId( field ) ).props[ 'aria-describedby' ], field + '-locked-description', 'No dangling reference.' );
	}
} );

test( 'the site language row follows the classic condition: translations available though none can be installed', async () => {
	const data = settingsData();
	data.choices.languages = [ data.choices.languages[ 0 ] ];
	data.choices.languageSelector = true;
	const { view } = render( data );
	await flush();
	assert.ok( rowOf( view.container, 'WPLANG' ) );
} );

test( 'the site language selector groups installed and available languages', async () => {
	const { view } = render();
	await flush();
	const select = find( view.container, byId( 'WPLANG' ) );
	const groups = findAll( select, byTag( 'optgroup' ) );
	assert.deepEqual( groups.map( ( group ) => group.props.label ), [ 'Installed', 'Available' ] );
	assert.deepEqual( findAll( groups[ 0 ], byTag( 'option' ) ).map( textOf ), [ 'English (United States)', 'Deutsch' ] );
	assert.deepEqual( findAll( groups[ 1 ], byTag( 'option' ) ).map( ( option ) => option.props.lang ), [ 'fr' ] );
} );

test( 'without languages to choose from there is no site language row', async () => {
	const data = settingsData();
	data.choices.languages = [ data.choices.languages[ 0 ] ];
	const { view } = render( data );
	await flush();
	assert.equal( rowOf( view.container, 'WPLANG' ), null );
} );

test( 'the date format radios, the custom field and its live preview behave as on the classic screen', async ( t ) => {
	t.mock.timers.enable( { apis: [ 'setTimeout' ] } );
	api.respondWith( async ( method, route, payload ) => ( { dateFormat: 'preview of ' + payload.date_format } ) );
	const { view } = render();
	await settle();
	const fieldset = find( rowOf( view.container, 'date_format' ), byTag( 'fieldset' ) );
	const radios = findAll( fieldset, ( el ) => el.tag === 'input' && el.props.type === 'radio' );
	assert.deepEqual( radios.map( ( radio ) => radio.props.value ), [ 'F j, Y', 'Y-m-d', '\\c\\u\\s\\t\\o\\m' ] );
	assert.equal( radios[ 0 ].props.checked, true );
	assert.equal( textOf( find( fieldset, byTag( 'legend' ) ) ), 'Date Format' );
	const custom = find( fieldset, byId( 'date_format_custom' ) );
	assert.equal( find( fieldset, ( el ) => el.tag === 'label' && el.props.for === 'date_format_custom' ) && true, true );
	const example = () => textOf( find( fieldset, byClass( 'example' ) ) );
	assert.equal( example(), 'November 17, 2026' );

	// Choosing a format fills the custom field and shows its example.
	radios[ 1 ].props.onChange();
	await settle();
	assert.equal( find( fieldset, byId( 'date_format_custom' ) ).props.value, 'Y-m-d' );
	assert.equal( example(), '2026-11-17' );

	// Typing selects Custom and asks for a preview once typing pauses.
	custom.props.onInput( { target: { value: 'j F' } } );
	await settle();
	assert.equal( find( fieldset, byId( 'date_format_custom_radio' ) ).props.checked, true );
	assert.equal( api.calls.length, 0, 'Not before the delay.' );
	t.mock.timers.tick( PREVIEW_DELAY );
	await settle();
	assert.deepEqual( api.calls, [ { method: 'GET', route: 'wp-admin/v1/settings/general/preview', payload: { date_format: 'j F' } } ] );
	assert.equal( example(), 'preview of j F' );
} );

test( 'the spinner shows while a preview is pending', async ( t ) => {
	t.mock.timers.enable( { apis: [ 'setTimeout' ] } );
	let answer;
	api.respondWith( () => new Promise( ( resolve ) => ( answer = resolve ) ) );
	const { view } = render();
	await settle();
	const row = () => rowOf( view.container, 'time_format' );
	find( row(), byId( 'time_format_custom' ) ).props.onInput( { target: { value: 'H:i:s' } } );
	t.mock.timers.tick( PREVIEW_DELAY );
	await settle();
	assert.ok( find( row(), byClass( 'spinner' ) ), 'pending' );
	answer( { timeFormat: '10:00:00' } );
	await settle();
	assert.equal( find( row(), byClass( 'spinner' ) ), null );
	assert.equal( textOf( find( row(), byClass( 'example' ) ) ), '10:00:00' );
} );

test( 'a custom format that is not offered starts with Custom selected', async () => {
	const { view } = render( settingsData( { date_format: 'j \\d\\e F' } ) );
	await flush();
	const fieldset = find( rowOf( view.container, 'date_format' ), byTag( 'fieldset' ) );
	assert.equal( find( fieldset, byId( 'date_format_custom_radio' ) ).props.checked, true );
	assert.equal( find( fieldset, byId( 'date_format_custom' ) ).props.value, 'j \\d\\e F' );
} );

/** Edits a text input of the page. */
const type = ( view, id, value ) => find( view.container, byId( id ) ).props.onInput( { target: { value } } );
const submit = ( view ) => find( view.container, byTag( 'form' ) ).props.onSubmit( { preventDefault() {} } );

test( 'saving posts only the changed fields and shows the settings and notices returned', async () => {
	let resolve;
	api.respondWith( () => new Promise( ( done ) => ( resolve = done ) ) );
	const { view, dirty, added } = render();
	await flush();
	type( view, 'blogname', 'New Title' );
	find( view.container, byId( 'start_of_week' ) ).props.onChange( { target: { value: '3' } } );
	find( view.container, byId( 'users_can_register' ) ).props.onChange( { target: { checked: true } } );
	await flush();
	assert.equal( dirty.at( -1 ), true, 'Unsaved changes are reported.' );

	submit( view );
	await flush();
	const button = find( view.container, byId( 'submit' ) );
	assert.equal( button.props.disabled, true );
	assert.equal( button.props[ 'aria-busy' ], 'true' );
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/settings/general', payload: { blogname: 'New Title', users_can_register: true, start_of_week: 3 } } );

	resolve( { ...settingsData( { blogname: 'New Title', users_can_register: true, start_of_week: 3 } ), notices: [ { type: 'success', message: 'Settings saved.' } ] } );
	await flush();
	assert.deepEqual( added, [ { type: 'success', message: 'Settings saved.', dismissible: true } ] );
	assert.equal( dirty.at( -1 ), false, 'Saved.' );
	assert.equal( find( view.container, byId( 'submit' ) ).props.disabled, false );
	assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'New Title' );
} );

test( 'going back to the saved value is not a change', async () => {
	const { view, dirty } = render();
	await flush();
	type( view, 'blogname', 'Other' );
	await flush();
	assert.equal( dirty.at( -1 ), true );
	type( view, 'blogname', 'My Site' );
	await flush();
	assert.equal( dirty.at( -1 ), false );
} );

test( 'a fixed field is never sent', async () => {
	api.respondWith( async () => ( { ...settingsData( { locked: [ 'siteurl' ] } ), notices: [] } ) );
	const { view } = render( settingsData( { locked: [ 'siteurl' ] } ) );
	await flush();
	type( view, 'siteurl', 'http://elsewhere.example' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, {} );
} );

test( 'validation errors show beside their field, as notices, and focus moves to the first invalid field', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	const settings = settingsData( { blogname: 'Saved Title' } );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'admin_settings_errors', message: 'The email address entered did not appear to be a valid email address. Please enter a valid email address.', data: {
			status: 400,
			errors: [ { setting: 'new_admin_email', code: 'invalid_new_admin_email', message: 'The email address entered did not appear to be a valid email address. Please enter a valid email address.', type: 'error', field: 'new_admin_email' } ],
			settings,
		} } );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view, added, dirty } = render();
		await flush();
		type( view, 'blogname', 'Saved Title' );
		type( view, 'new_admin_email', 'not-an-email' );
		submit( view );
		await flush();

		const input = find( view.container, byId( 'new_admin_email' ) );
		assert.equal( input.props[ 'aria-invalid' ], 'true' );
		assert.equal( input.props[ 'aria-describedby' ], 'new-admin-email-description new_admin_email-error' );
		assert.equal( input.props.value, 'not-an-email', 'The input is kept.' );
		assert.equal( textOf( find( view.container, byId( 'new_admin_email-error' ) ) ), 'The email address entered did not appear to be a valid email address. Please enter a valid email address.' );
		assert.equal( added.length, 1 );
		assert.equal( added[ 0 ].type, 'error' );
		assert.deepEqual( focused, [ 'new_admin_email' ] );
		assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'Saved Title', 'The other edit was saved and stays.' );
		assert.equal( dirty.at( -1 ), true, 'The invalid field is still a change.' );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'a refused parameter is shown beside its field', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'rest_invalid_param', message: 'Invalid parameter(s): start_of_week', data: { status: 400, params: { start_of_week: 'start_of_week must be between 0 (inclusive) and 6 (inclusive)' } } } );
	} );
	const { view, added } = render();
	await flush();
	find( view.container, byId( 'start_of_week' ) ).props.onChange( { target: { value: '9' } } );
	submit( view );
	await flush();
	assert.equal( textOf( find( view.container, byId( 'start_of_week-error' ) ) ), 'start_of_week must be between 0 (inclusive) and 6 (inclusive)' );
	assert.equal( find( view.container, byId( 'start_of_week' ) ).props[ 'aria-invalid' ], 'true' );
	assert.equal( added[ 0 ].message, 'Invalid parameter(s): start_of_week' );
} );

test( 'when WordPress cannot be reached, a notice says so and the input is kept', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added, dirty } = render();
	await flush();
	type( view, 'blogname', 'Unsaved' );
	submit( view );
	await flush();
	assert.equal( added[ 0 ].message, 'WordPress cannot be reached right now. Please try again in a moment.' );
	assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'Unsaved' );
	assert.equal( dirty.at( -1 ), true );
} );

test( 'saving a new site language refreshes the router so the admin follows the language', async () => {
	let refreshed = 0;
	api.respondWith( async () => ( { ...settingsData( { WPLANG: 'de_DE' } ), notices: [] } ) );
	const { view } = render( settingsData(), { provide: { router: { refresh: async () => refreshed++ } } } );
	await flush();
	find( view.container, byId( 'WPLANG' ) ).props.onChange( { target: { value: 'de_DE' } } );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { WPLANG: 'de_DE' } );
	assert.equal( refreshed, 1 );
} );

test( 'the pending administration email is shown with its Cancel request button', async () => {
	api.respondWith( async () => settingsData() );
	const { view } = render( settingsData( { pending_admin_email: 'new@example.org' } ) );
	await flush();
	assert.match( view.text(), /The administration email address has not been updated yet\. Please check the inbox at new@example\.org for a confirmation email\./ );
	assert.match( view.text(), /There is a pending change of the administration email to new@example\.org\./ );
	const cancel = findAll( view.container, ( el ) => el.tag === 'button' && textOf( el ) === 'Cancel request' );
	assert.equal( cancel.length, 2 );
	cancel[ 0 ].props.onClick();
	await flush();
	assert.deepEqual( api.calls[ 0 ], { method: 'DELETE', route: 'wp-admin/v1/settings/general/pending-admin-email', payload: undefined } );
	assert.doesNotMatch( view.text(), /pending change/ );
} );

test( 'slot modules get the values, setValue and the errors', async () => {
	const seen = [];
	const Slot = defineComponent( {
		props: [ 'values', 'setValue', 'errors' ],
		setup( props ) {
			seen.push( props );
			return () => h( 'p', { class: 'slot-module' }, 'Title: ' + props.values.blogname );
		},
	} );
	globalThis.__modules[ '/m/og-slot.js' ] = { default: Slot };
	loader.applyImportMap( { 'og-slot': '/m/og-slot.js' } );
	contracts.configure( { replacements: {}, slots: { 'core/options-general': { 'after-fields': [ { module: 'og-slot' } ] } } } );
	const { view } = render();
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Title: My Site' );
	type( view, 'blogname', 'Typed' );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Title: Typed', 'The live title.' );
	seen[ 0 ].setValue( 'blogname', 'From the slot' );
	await flush();
	assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'From the slot' );
	assert.deepEqual( seen[ 0 ].errors, {} );
} );

test( 'a replacement of core/settings-field is used for every row', async () => {
	const Row = defineComponent( {
		props: [ 'id', 'label', 'description', 'locked', 'error', 'group', 'icon' ],
		setup: ( props, { slots } ) => () => h( 'tr', { class: 'replaced-row', 'data-field': props.id }, [ h( 'th', props.label ), h( 'td', slots.default?.() ) ] ),
	} );
	globalThis.__modules[ '/m/og-row.js' ] = { default: Row, implementsContract: { id: 'core/settings-field', version: '1.0.0' } };
	loader.applyImportMap( { 'og-row': '/m/og-row.js' } );
	contracts.configure( { replacements: { 'core/settings-field': { module: 'og-row', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	const rows = findAll( view.container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] );
	assert.equal( rows.length, 13 );
	assert.ok( rows.every( ( row ) => hasClass( row, 'replaced-row' ) ) );
	assert.ok( find( view.container, byId( 'blogname' ) ), 'The controls are still rendered in it.' );
} );

test( 'legacy fields from plugins are rendered in the table and their values are posted', async () => {
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	const legacySections = {
		sections: [
			{ id: 'default', position: 'form-table', title: '', before: '', html: '', after: '', fields: [ { id: 'acme', title: 'Acme <em>field</em>', html: '<input name="acme_option" id="acme_option" value="x">', labelFor: 'acme_option', class: 'acme-row' } ] },
			{ id: 'acme_section', position: 'section', title: 'Acme Section', before: '', html: '<p>Intro</p>', after: '', fields: [] },
		],
		scripts: [],
		styles: [],
	};
	const { view } = render( settingsData( { legacySections } ) );
	await flush();
	const row = find( view.container, ( el ) => el.tag === 'tr' && el.props[ 'data-legacy-field' ] === 'acme' );
	assert.ok( hasClass( row, 'acme-row' ) );
	assert.equal( find( row, byTag( 'label' ) ).props.for, 'acme_option' );
	assert.deepEqual( findAll( row, byClass( 'wp-admin-legacy-html' ) ).map( ( el ) => el.innerHTML ), [ 'Acme <em>field</em>', '<input name="acme_option" id="acme_option" value="x">' ] );
	const section = find( view.container, ( el ) => el.props[ 'data-legacy-section' ] === 'acme_section' );
	assert.ok( section );
	// The fake DOM has no selector engine: the form answers the query LegacyHtml makes.
	const form = find( view.container, byTag( 'form' ) );
	form.querySelectorAll = ( selector ) => {
		assert.match( selector, /\.wp-admin-legacy-html input/ );
		return [ { tagName: 'INPUT', type: 'text', name: 'acme_option', value: 'typed' }, { tagName: 'INPUT', type: 'checkbox', name: 'acme_flag', value: '1', checked: false } ];
	};
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { legacy: [ { name: 'acme_option', value: 'typed' } ], legacyNames: [ 'acme_option', 'acme_flag' ] } );
} );

test( 'the confirmation link of a new administration email shows the classic notice', async () => {
	const added = [];
	mount( () => h( Contracted, { id: 'core/options-general', data: settingsData(), page: { path: 'options-general.php?updated=true&admin_email_updated=true' } } ), {
		provide: { notices: { add: ( notice ) => added.push( notice ) }, pageState: null },
	} );
	await flush();
	assert.deepEqual( added, [ { type: 'success', message: 'Administration email updated.', dismissible: true } ] );
} );

test( 'state: changed fields, partial saves, focus targets', () => {
	const saved = { blogname: 'A', start_of_week: 1, siteurl: 'x' };
	assert.deepEqual( state.changedFields( { blogname: 'B', start_of_week: 1, siteurl: 'y' }, saved, [ 'siteurl' ] ), { blogname: 'B' } );
	assert.deepEqual( state.valuesAfterPartialSave( { blogname: 'typed', timezone_string: 'Barry/Gary' }, { blogname: 'old', timezone_string: 'Europe/Lisbon' }, { blogname: 'bad', timezone_string: 'bad' } ), { blogname: 'typed', timezone_string: 'Europe/Lisbon' } );
	assert.equal( state.firstInvalid( { start_of_week: 'x', blogname: 'y' } ), 'blogname' );
	assert.equal( state.controlId( 'date_format' ), 'date_format_custom' );
	assert.equal( state.describedBy( 'home', 'home-description', { home: 'bad' } ), 'home-description home-error' );
	assert.equal( state.describedBy( 'blogname', null, {} ), null );
	assert.equal( state.emailUpdated( 'options-general.php?admin_email_updated=true' ), true );
	assert.equal( state.emailUpdated( 'options-general.php' ), false );
} );

test( 'a successful save emits saved with the settings', async () => {
	api.respondWith( async () => ( { ...settingsData( { blogname: 'Emitted' } ), notices: [] } ) );
	const saved = [];
	const view = mount( () => h( Contracted, { id: 'core/options-general', data: settingsData(), page: { path: 'options-general.php' }, onSaved: ( value ) => saved.push( value ) } ), {
		provide: { notices: { add: () => null }, pageState: null },
	} );
	await flush();
	submit( view );
	await flush();
	assert.equal( saved.length, 1 );
	assert.equal( saved[ 0 ].blogname, 'Emitted' );
	assert.equal( 'notices' in saved[ 0 ], false );
} );

test( 'a replacement of core/form-table is used for the table', async () => {
	const Table = defineComponent( { setup: ( props, { slots } ) => () => h( 'table', { class: 'replaced-table' }, [ h( 'tbody', slots.default?.() ) ] ) } );
	globalThis.__modules[ '/m/og-table.js' ] = { default: Table, implementsContract: { id: 'core/form-table', version: '1.0.0' } };
	loader.applyImportMap( { 'og-table': '/m/og-table.js' } );
	contracts.configure( { replacements: { 'core/form-table': { module: 'og-table', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	const table = find( view.container, byClass( 'replaced-table' ) );
	assert.ok( table );
	assert.equal( find( view.container, byClass( 'form-table' ) ), null );
	assert.ok( find( table, byId( 'blogname' ) ), 'The rows are inside it.' );
} );

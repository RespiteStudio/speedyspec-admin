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
const state = await import( '../site/components/core/options-writing/state.js' );
const { mergeHelp } = await import( '../site/components/core/help-tabs.js' );

const { h, defineComponent } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const NAMES = [ 'options-writing', 'form-table', 'settings-field' ];
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

const CATEGORIES = [
	{ value: 1, label: 'Uncategorized', depth: 0 },
	{ value: 5, label: 'News', depth: 0 },
	{ value: 6, label: 'Local & Regional', depth: 1 },
	{ value: 7, label: 'City', depth: 2 },
];
const FORMATS = [
	{ value: '0', label: 'Standard' },
	{ value: 'aside', label: 'Aside' },
	{ value: 'gallery', label: 'Gallery' },
];

/** Settings data as wp-admin/v1/settings/writing returns it on a current, public single site. */
function settingsData( overrides = {} ) {
	return {
		default_category: 1,
		default_post_format: '0',
		mailserver_url: 'mail.example.com',
		mailserver_port: '110',
		mailserver_login: 'login@example.com',
		mailserver_pass: 'password',
		default_email_category: 1,
		ping_sites: 'https://rpc.pingomatic.com/',
		choices: { categories: CATEGORIES, postFormats: FORMATS },
		flags: { formatting: false, linkManager: false, postByEmail: true, updateServices: true, blogPublic: true },
		locked: [],
		multisite: false,
		legacySections: { sections: [], scripts: [], styles: [] },
		...overrides,
	};
}

/** Settings data of an old site with the Link Manager: every part of the screen. */
const everyPart = ( overrides = {} ) => settingsData( {
	use_smilies: true,
	use_balanceTags: false,
	default_link_category: 2,
	choices: { categories: CATEGORIES, postFormats: FORMATS, linkCategories: [ { value: 2, label: 'Blogroll', depth: 0 } ] },
	flags: { formatting: true, linkManager: true, postByEmail: true, updateServices: true, blogPublic: true },
	...overrides,
} );

/** Settings data on a multisite network: no post by email, no update services. */
function networkData() {
	const data = settingsData( { multisite: true, flags: { formatting: false, linkManager: false, postByEmail: false, updateServices: false, blogPublic: true } } );
	for ( const field of [ 'mailserver_url', 'mailserver_port', 'mailserver_login', 'mailserver_pass', 'default_email_category', 'ping_sites' ] ) {
		delete data[ field ];
	}
	return data;
}

/** Settings data of a site that asks search engines not to index it. */
function privateData() {
	const data = settingsData( { flags: { formatting: false, linkManager: false, postByEmail: true, updateServices: true, blogPublic: false } } );
	delete data.ping_sites;
	return data;
}

function render( data = settingsData() ) {
	const dirty = [];
	const added = [];
	const service = { add: ( notice ) => {
		added.push( notice );
		return 'n' + added.length;
	} };
	const view = mount( () => h( Contracted, { id: 'core/options-writing', data, page: { path: 'options-writing.php', title: 'Writing Settings' } } ), {
		provide: { notices: service, pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false } },
	} );
	return { view, dirty, added };
}

const byId = ( id ) => byProp( 'id', id );
const rowOf = ( container, field ) => find( container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] === field );
const rowIds = ( container ) => findAll( container, ( el ) => el.tag === 'tr' && ( el.props[ 'data-field' ] || el.props[ 'data-legacy-field' ] ) ).map( ( row ) => row.props[ 'data-field' ] ?? row.props[ 'data-legacy-field' ] );
const headings = ( container ) => findAll( container, byTag( 'h2' ) ).map( ( el ) => [ el.props.id, textOf( el ) ] );
const type = ( view, id, value ) => find( view.container, byId( id ) ).props.onInput( { target: { value } } );
const choose = ( view, id, value ) => find( view.container, byId( id ) ).props.onChange( { target: { value } } );
const check = ( view, id, checked ) => find( view.container, byId( id ) ).props.onChange( { target: { checked } } );
const submit = ( view ) => find( view.container, byTag( 'form' ) ).props.onSubmit( { preventDefault() {} } );
const options = ( select ) => findAll( select, byTag( 'option' ) ).map( ( option ) => [ option.props.value, textOf( option ), option.props.class ?? null, option.props.selected ] );

test( 'the contract has the established shape and version 1.0.0', () => {
	const contract = loaded[ 'options-writing' ].contract.default;
	assert.equal( contract.id, 'core/options-writing' );
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

test( 'renders the fields in the classic order, with the headings, labels and classes', async () => {
	const { view } = render();
	await flush();
	assert.deepEqual( rowIds( view.container ), [ 'default_category', 'default_post_format', 'mailserver_url', 'mailserver_login', 'mailserver_pass', 'default_email_category' ] );
	assert.deepEqual( headings( view.container ), [ [ 'wp-settings-section-post-via-email', 'Post via email' ], [ 'wp-settings-section-update-services', 'Update Services' ] ] );
	assert.ok( findAll( view.container, byTag( 'h2' ) ).every( ( el ) => hasClass( el, 'title' ) ) );
	assert.equal( findAll( view.container, byClass( 'form-table' ) ).length, 2 );

	const labels = {
		default_category: 'Default Post Category',
		default_post_format: 'Default Post Format',
		mailserver_url: 'Mail Server',
		mailserver_port: 'Port',
		mailserver_login: 'Login Name',
		mailserver_pass: 'Password',
		default_email_category: 'Default Mail Category',
	};
	for ( const [ id, text ] of Object.entries( labels ) ) {
		const label = find( view.container, ( el ) => el.tag === 'label' && el.props.for === id );
		assert.equal( textOf( label ).trim(), text, id + ' label' );
	}

	const classes = { mailserver_url: 'regular-text code', mailserver_port: 'small-text', mailserver_login: 'regular-text ltr', mailserver_pass: 'regular-text ltr' };
	for ( const [ id, className ] of Object.entries( classes ) ) {
		const input = find( view.container, byId( id ) );
		assert.equal( input.props.class, className, id );
		assert.equal( input.props.name, id );
	}
	assert.equal( find( view.container, byId( 'mailserver_url' ) ).props.value, 'mail.example.com' );
	assert.equal( find( view.container, byId( 'mailserver_port' ) ).props.value, '110' );
	assert.ok( find( rowOf( view.container, 'mailserver_url' ), byId( 'mailserver_port' ) ), 'The port is in the Mail Server row.' );
	assert.ok( hasClass( rowOf( view.container, 'mailserver_pass' ), 'mailserver-pass-wrap' ) );

	const submitButton = find( view.container, byId( 'submit' ) );
	assert.ok( hasClass( submitButton, 'button-primary' ) );
	assert.equal( textOf( submitButton ), 'Save Changes' );
	assert.equal( findAll( view.container, byTag( 'h1' ) ).length, 0, 'The page host renders the heading.' );
} );

test( 'the category selectors list the tree as the classic selector does, the post formats with the standard one as 0', async () => {
	const { view } = render( settingsData( { default_category: 6, default_post_format: 'aside', default_email_category: 7 } ) );
	await flush();
	const nbsp = ' ';
	const tree = ( selected ) => [
		[ '1', 'Uncategorized', 'level-0', selected === 1 ],
		[ '5', 'News', 'level-0', selected === 5 ],
		[ '6', nbsp.repeat( 3 ) + 'Local & Regional', 'level-1', selected === 6 ],
		[ '7', nbsp.repeat( 6 ) + 'City', 'level-2', selected === 7 ],
	];
	const category = find( view.container, byId( 'default_category' ) );
	assert.equal( category.props.name, 'default_category' );
	assert.equal( category.props.class, 'postform' );
	assert.deepEqual( options( category ), tree( 6 ) );
	assert.deepEqual( options( find( view.container, byId( 'default_email_category' ) ) ), tree( 7 ) );

	const format = find( view.container, byId( 'default_post_format' ) );
	assert.deepEqual( options( format ), [ [ '0', 'Standard', null, false ], [ 'aside', 'Aside', null, true ], [ 'gallery', 'Gallery', null, false ] ] );
} );

test( 'an old site has the Formatting checkboxes, and the Link Manager its category', async () => {
	const { view } = render( everyPart() );
	await flush();
	assert.deepEqual( rowIds( view.container ).slice( 0, 4 ), [ 'formatting', 'default_category', 'default_post_format', 'default_link_category' ] );

	const row = rowOf( view.container, 'formatting' );
	assert.equal( textOf( find( row, byTag( 'th' ) ) ).trim(), 'Formatting' );
	assert.equal( textOf( find( row, byTag( 'legend' ) ) ), 'Formatting' );
	assert.ok( hasClass( find( row, byTag( 'legend' ) ), 'screen-reader-text' ) );
	const smilies = find( row, ( el ) => el.tag === 'label' && el.props.for === 'use_smilies' );
	assert.equal( textOf( smilies ).trim(), 'Convert emoticons like :-) and :-P to graphics on display' );
	assert.deepEqual( findAll( smilies, byTag( 'code' ) ).map( textOf ), [ ':-)', ':-P' ] );
	assert.equal( find( smilies, byId( 'use_smilies' ) ).props.checked, true, 'The label wraps the checkbox.' );
	assert.equal( find( smilies, byId( 'use_smilies' ) ).props.value, '1' );
	const balance = find( row, ( el ) => el.tag === 'label' && el.props.for === 'use_balanceTags' );
	assert.equal( textOf( balance ).trim(), 'WordPress should correct invalidly nested XHTML automatically' );
	assert.equal( find( balance, byId( 'use_balanceTags' ) ).props.checked, false );

	const link = find( view.container, byId( 'default_link_category' ) );
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'default_link_category' ) ), 'Default Link Category' );
	assert.deepEqual( options( link ), [ [ '2', 'Blogroll', 'level-0', true ] ] );
} );

test( 'the Post via email section suggests three random strings, drawn in the browser', async () => {
	const { view } = render();
	await flush();
	const paragraph = findAll( view.container, byTag( 'p' ) ).find( ( p ) => textOf( p ).startsWith( 'To post to WordPress by email' ) );
	assert.ok( paragraph );
	const strings = findAll( paragraph, byTag( 'kbd' ) ).map( textOf );
	assert.equal( strings.length, 3 );
	for ( const value of strings ) {
		assert.match( value, /^[a-zA-Z0-9]{8}$/ );
	}
	assert.equal( textOf( paragraph ), 'To post to WordPress by email, you must set up a secret email account with POP3 access. Any mail received at this address will be posted, so it’s a good idea to keep this address very secret. Here are three random strings you could use: ' + strings.join( ', ' ) + '.' );
} );

test( 'the mail password starts masked; the toggle shows and hides it, and a save masks it again', async () => {
	api.respondWith( async () => ( { ...settingsData( { mailserver_pass: 'changed' } ), notices: [] } ) );
	const { view } = render();
	await flush();
	const input = () => find( view.container, byId( 'mailserver_pass' ) );
	const toggle = () => find( rowOf( view.container, 'mailserver_pass' ), byTag( 'button' ) );
	const icon = () => find( toggle(), byClass( 'dashicons' ) );

	assert.equal( input().props.type, 'password' );
	assert.equal( input().props.value, 'password' );
	assert.equal( input().props.autocomplete, 'off' );
	assert.equal( toggle().props.type, 'button' );
	assert.ok( hasClass( toggle(), 'wp-hide-pw' ) );
	assert.equal( toggle().props[ 'aria-label' ], 'Show password' );
	assert.ok( hasClass( icon(), 'dashicons-visibility' ) );
	assert.equal( icon().props[ 'aria-hidden' ], 'true' );

	toggle().props.onClick();
	await flush();
	assert.equal( input().props.type, 'text' );
	assert.equal( toggle().props[ 'aria-label' ], 'Hide password' );
	assert.ok( hasClass( icon(), 'dashicons-hidden' ) );

	type( view, 'mailserver_pass', 'changed' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { mailserver_pass: 'changed' } );
	assert.equal( input().props.type, 'password', 'Masked again after the save.' );
	assert.equal( toggle().props[ 'aria-label' ], 'Show password' );
} );

test( 'the Update Services field on a public site, with its documentation link', async () => {
	const { view } = render();
	await flush();
	const textarea = find( view.container, byId( 'ping_sites' ) );
	assert.equal( textarea.tag, 'textarea' );
	assert.equal( textarea.props.name, 'ping_sites' );
	assert.equal( textarea.props.class, 'large-text code' );
	assert.equal( textarea.props.rows, '3' );
	assert.equal( textarea.props.value, 'https://rpc.pingomatic.com/' );
	const label = find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'ping_sites' );
	assert.equal( textOf( label ), 'When you publish a new post, WordPress automatically notifies the following site update services. For more about this, see the Update Services documentation article. Separate multiple service URLs with line breaks.' );
	assert.equal( find( label, byTag( 'a' ) ).props.href, 'https://developer.wordpress.org/advanced-administration/wordpress/update-services/' );
} );

test( 'a site that is not public has the classic sentence linking to the documentation and Reading Settings instead', async () => {
	const { view } = render( privateData() );
	await flush();
	assert.equal( find( view.container, byId( 'ping_sites' ) ), null );
	const paragraph = findAll( view.container, byTag( 'p' ) ).find( ( p ) => textOf( p ).startsWith( 'WordPress is not notifying' ) );
	assert.equal( textOf( paragraph ), 'WordPress is not notifying any Update Services because of your site’s visibility settings.' );
	assert.deepEqual( findAll( paragraph, byTag( 'a' ) ).map( ( a ) => [ textOf( a ), a.props.href ] ), [
		[ 'Update Services', 'https://developer.wordpress.org/advanced-administration/wordpress/update-services/' ],
		[ 'visibility settings', '/wp-admin/options-reading.php' ],
	] );
} );

test( 'on a multisite network there is neither Post via email nor Update Services', async () => {
	const { view } = render( networkData() );
	await flush();
	assert.deepEqual( headings( view.container ), [] );
	assert.deepEqual( rowIds( view.container ), [ 'default_category', 'default_post_format' ] );
	assert.equal( findAll( view.container, byClass( 'form-table' ) ).length, 1 );
} );

test( 'saving posts only the changed fields: numbers for categories, booleans for checkboxes', async () => {
	let resolve;
	api.respondWith( () => new Promise( ( done ) => ( resolve = done ) ) );
	const { view, dirty, added } = render( everyPart() );
	await flush();
	choose( view, 'default_category', '6' );
	choose( view, 'default_post_format', 'gallery' );
	choose( view, 'default_link_category', '2' );
	check( view, 'use_smilies', false );
	check( view, 'use_balanceTags', true );
	type( view, 'mailserver_port', '995' );
	type( view, 'ping_sites', 'https://rpc.example.org/' );
	await flush();
	assert.equal( dirty.at( -1 ), true, 'Unsaved changes are reported.' );

	submit( view );
	await flush();
	assert.equal( find( view.container, byId( 'submit' ) ).props.disabled, true );
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/settings/writing', payload: { use_smilies: false, use_balanceTags: true, default_category: 6, default_post_format: 'gallery', mailserver_port: '995', ping_sites: 'https://rpc.example.org/' } } );

	resolve( { ...everyPart( { use_smilies: false, use_balanceTags: true, default_category: 6, default_post_format: 'gallery', mailserver_port: '995', ping_sites: 'https://rpc.example.org/' } ), notices: [ { type: 'success', message: 'Settings saved.' } ] } );
	await flush();
	assert.deepEqual( added, [ { type: 'success', message: 'Settings saved.', dismissible: true, scope: 'page' } ] );
	assert.equal( dirty.at( -1 ), false, 'Saved.' );
	assert.equal( find( view.container, byId( 'use_balanceTags' ) ).props.checked, true );
	assert.deepEqual( options( find( view.container, byId( 'default_category' ) ) ).find( ( option ) => option[ 3 ] )[ 0 ], '6' );
} );

test( 'a refused parameter is shown beside its control in the Mail Server row', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'rest_invalid_param', message: 'Invalid parameter(s): mailserver_port', data: { status: 400, params: { mailserver_port: 'mailserver_port is not of type string,integer.' } } } );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view, added } = render();
		await flush();
		type( view, 'mailserver_port', '12' );
		submit( view );
		await flush();
		const input = find( view.container, byId( 'mailserver_port' ) );
		assert.equal( input.props[ 'aria-invalid' ], 'true' );
		assert.equal( input.props[ 'aria-describedby' ], 'mailserver_port-error' );
		assert.ok( find( rowOf( view.container, 'mailserver_url' ), byId( 'mailserver_port-error' ) ), 'The error is in the row of its control.' );
		assert.equal( input.props.value, '12', 'The input is kept.' );
		assert.equal( added[ 0 ].message, 'Invalid parameter(s): mailserver_port' );
		assert.deepEqual( focused, [ 'mailserver_port' ] );
		assert.equal( find( view.container, byId( 'mailserver_url' ) ).props[ 'aria-invalid' ], null );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'a settings error with a link shows the link beside its field and in its notice', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	const { FakeDOMParser } = await import( './helpers/html-parser.mjs' );
	const markup = 'Not allowed. See <a href="options-general.php">the docs</a>.';
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'admin_settings_errors', message: 'Not allowed. See the docs.', data: {
			status: 400,
			errors: [ { setting: 'default_post_format', code: 'acme', message: 'Not allowed. See the docs.', markup, type: 'error', field: 'default_post_format' } ],
			settings: settingsData(),
		} } );
	} );
	const previous = globalThis.DOMParser;
	globalThis.DOMParser = FakeDOMParser;
	try {
		const { view, added } = render();
		await flush();
		choose( view, 'default_post_format', 'aside' );
		submit( view );
		await flush();
		assert.equal( added[ 0 ].markup, markup );
		const error = find( view.container, byId( 'default_post_format-error' ) );
		assert.equal( textOf( error ), 'Not allowed. See the docs.' );
		const link = find( error, byTag( 'a' ) );
		assert.ok( link, 'The link is shown.' );
		assert.equal( textOf( link ), 'the docs' );
	} finally {
		globalThis.DOMParser = previous;
	}
} );

test( 'when WordPress cannot be reached, a notice says so and the input is kept', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added, dirty } = render();
	await flush();
	type( view, 'mailserver_login', 'other@example.com' );
	submit( view );
	await flush();
	assert.equal( added[ 0 ].message, 'WordPress cannot be reached right now. Please try again in a moment.' );
	assert.equal( find( view.container, byId( 'mailserver_login' ) ).props.value, 'other@example.com' );
	assert.equal( dirty.at( -1 ), true );
} );

/** Legacy sections as the endpoint returns them for fields in each in-table section and a section. */
function legacySections() {
	const field = ( id, section ) => ( { id, title: 'Acme ' + section, html: '<input name="' + id + '" id="' + id + '" value="">', labelFor: id, class: '', error: false } );
	return {
		sections: [
			{ id: 'default', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_default', 'default' ) ] },
			{ id: 'remote_publishing', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_remote', 'remote' ) ] },
			{ id: 'post_via_email', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_mail', 'mail' ) ] },
			{ id: 'acme_section', position: 'section', title: 'Acme Section', before: '', html: '<p>Intro</p>', after: '', error: false, fields: [] },
		],
		scripts: [],
		styles: [],
	};
}

test( 'plugin fields render at the end of the table of their section, and their sections after the screen\'s parts', async () => {
	const { view } = render( settingsData( { legacySections: legacySections() } ) );
	await flush();
	const tables = findAll( view.container, byClass( 'form-table' ) );
	assert.equal( tables.length, 2 );
	assert.deepEqual( rowIds( tables[ 0 ] ), [ 'default_category', 'default_post_format', 'acme_default', 'acme_remote' ] );
	assert.deepEqual( rowIds( tables[ 1 ] ), [ 'mailserver_url', 'mailserver_login', 'mailserver_pass', 'default_email_category', 'acme_mail' ] );
	assert.equal( find( find( view.container, ( el ) => el.props[ 'data-legacy-field' ] === 'acme_mail' ), byTag( 'label' ) ).props.for, 'acme_mail' );

	const order = find( view.container, byTag( 'form' ) ).children
		.filter( ( el ) => el.type === 'element' )
		.map( ( el ) => el.props[ 'data-legacy-section' ] ?? ( hasClass( el, 'form-table' ) ? 'table' : el.props.id ?? el.tag ) );
	assert.ok( order.indexOf( 'ping_sites' ) < order.indexOf( 'acme_section' ), 'The section follows Update Services: ' + order.join( ', ' ) );
	assert.equal( order.at( -1 ), 'p', 'The submit button comes last.' );
} );

test( 'without post by email there is no mail table, so its plugin fields are not shown', async () => {
	const { view } = render( { ...networkData(), legacySections: legacySections() } );
	await flush();
	assert.equal( find( view.container, ( el ) => el.props[ 'data-legacy-field' ] === 'acme_mail' ), null );
	assert.deepEqual( rowIds( view.container ), [ 'default_category', 'default_post_format', 'acme_default', 'acme_remote' ] );
} );

test( 'plugin field values are posted with the save', async () => {
	api.respondWith( async () => ( { ...settingsData( { legacySections: legacySections() } ), notices: [] } ) );
	const { view } = render( settingsData( { legacySections: legacySections() } ) );
	await flush();
	const form = find( view.container, byTag( 'form' ) );
	form.querySelectorAll = () => [ { tagName: 'INPUT', type: 'text', name: 'acme_mail', value: 'typed' } ];
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { legacy: [ { name: 'acme_mail', value: 'typed' } ], legacyNames: [ 'acme_mail' ] } );
} );

test( 'slot modules get the values, setValue and the errors', async () => {
	const seen = [];
	const Slot = defineComponent( {
		props: [ 'values', 'setValue', 'errors' ],
		setup( props ) {
			seen.push( props );
			return () => h( 'p', { class: 'slot-module' }, 'Format: ' + props.values.default_post_format );
		},
	} );
	globalThis.__modules[ '/m/ow-slot.js' ] = { default: Slot };
	loader.applyImportMap( { 'ow-slot': '/m/ow-slot.js' } );
	contracts.configure( { replacements: {}, slots: { 'core/options-writing': { 'after-fields': [ { module: 'ow-slot' } ] } } } );
	const { view } = render();
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Format: 0' );
	choose( view, 'default_post_format', 'aside' );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Format: aside' );
	seen[ 0 ].setValue( 'mailserver_login', 'slot@example.com' );
	await flush();
	assert.equal( find( view.container, byId( 'mailserver_login' ) ).props.value, 'slot@example.com' );
} );

test( 'a replacement of core/settings-field is used for every settings-field row', async () => {
	const Row = defineComponent( {
		props: [ 'id', 'label', 'description', 'locked', 'error', 'group', 'icon' ],
		setup: ( props, { slots } ) => () => h( 'tr', { class: 'replaced-row', 'data-field': props.id }, [ h( 'th', props.label ), h( 'td', slots.default?.() ) ] ),
	} );
	globalThis.__modules[ '/m/ow-row.js' ] = { default: Row, implementsContract: { id: 'core/settings-field', version: '1.0.0' } };
	loader.applyImportMap( { 'ow-row': '/m/ow-row.js' } );
	contracts.configure( { replacements: { 'core/settings-field': { module: 'ow-row', implements: '1.0.0' } }, slots: {} } );
	const { view } = render( everyPart() );
	await flush();
	const replaced = findAll( view.container, byClass( 'replaced-row' ) );
	assert.deepEqual( replaced.map( ( row ) => row.props[ 'data-field' ] ), [ 'formatting', 'default_category', 'default_post_format', 'default_link_category', 'mailserver_url', 'mailserver_login', 'mailserver_pass', 'default_email_category' ] );
	assert.ok( find( view.container, byId( 'mailserver_port' ) ), 'The controls are still rendered in it.' );
} );

test( 'a replacement of core/form-table is used for every table', async () => {
	const Table = defineComponent( { setup: ( props, { slots } ) => () => h( 'table', { class: 'replaced-table' }, [ h( 'tbody', slots.default?.() ) ] ) } );
	globalThis.__modules[ '/m/ow-table.js' ] = { default: Table, implementsContract: { id: 'core/form-table', version: '1.0.0' } };
	loader.applyImportMap( { 'ow-table': '/m/ow-table.js' } );
	contracts.configure( { replacements: { 'core/form-table': { module: 'ow-table', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	assert.equal( findAll( view.container, byClass( 'replaced-table' ) ).length, 2 );
	assert.equal( find( view.container, byClass( 'form-table' ) ), null );
} );

test( 'a successful save emits saved with the settings', async () => {
	api.respondWith( async () => ( { ...settingsData( { default_post_format: 'aside' } ), notices: [] } ) );
	const saved = [];
	const view = mount( () => h( Contracted, { id: 'core/options-writing', data: settingsData(), page: { path: 'options-writing.php' }, onSaved: ( value ) => saved.push( value ) } ), {
		provide: { notices: { add: () => null }, pageState: null },
	} );
	await flush();
	submit( view );
	await flush();
	assert.equal( saved.length, 1 );
	assert.equal( saved[ 0 ].default_post_format, 'aside' );
	assert.equal( 'notices' in saved[ 0 ], false );
} );

test( 'state: random strings, category labels and changed fields', () => {
	let calls = 0;
	const source = { getRandomValues: ( bytes ) => {
		calls++;
		bytes.set( [ 0, 25, 26, 51, 52, 61, 62, 63 ] );
		return bytes;
	} };
	assert.equal( state.randomString( 8, source ), 'azAZ09ab' );
	assert.equal( calls, 1 );
	assert.match( state.randomString(), /^[a-zA-Z0-9]{8}$/, 'The browser\'s crypto by default.' );
	assert.notEqual( state.randomString(), state.randomString() );

	assert.equal( state.categoryLabel( { label: 'Top', depth: 0 } ), 'Top' );
	assert.equal( state.categoryLabel( { label: 'Deep', depth: 2 } ), ' '.repeat( 6 ) + 'Deep' );
	assert.deepEqual( state.changedFields( { default_category: 1, use_smilies: true }, { default_category: 2, use_smilies: true } ), { default_category: 1 } );
	assert.equal( state.firstInvalid( { ping_sites: 'x', mailserver_url: 'y' } ), 'mailserver_url' );
} );

// Help -------------------------------------------------------------------------------

const { help } = loaded[ 'options-writing' ].component;
const paragraphs = ( view ) => findAll( view.container, byTag( 'p' ) ).map( textOf );

async function renderHelp( component ) {
	const view = mount( () => h( 'div', null, [ h( component ) ] ) );
	await flush();
	return view;
}

test( 'the page exports the classic screen\'s help: Overview, Post Via Email and Update Services under their conditions', () => {
	assert.deepEqual( help.tabs.map( ( tab ) => [ tab.id, tab.title() ] ), [ [ 'overview', 'Overview' ], [ 'options-postemail', 'Post Via Email' ], [ 'options-services', 'Update Services' ] ] );
	assert.equal( typeof help.sidebar, 'object' );

	const tabsFor = ( data ) => mergeHelp( help, null, { path: 'options-writing.php', data } ).tabs.map( ( tab ) => tab.id );
	assert.deepEqual( tabsFor( settingsData() ), [ 'overview', 'options-postemail', 'options-services' ] );
	assert.deepEqual( tabsFor( networkData() ), [ 'overview' ], 'A network: neither.' );
	assert.deepEqual( tabsFor( settingsData( { flags: { postByEmail: true, updateServices: false } } ) ), [ 'overview', 'options-postemail' ] );
	assert.deepEqual( tabsFor( privateData() ), [ 'overview', 'options-postemail', 'options-services' ], 'The Update Services tab does not depend on the site being public.' );
} );

test( 'the help tabs have the classic text', async () => {
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 0 ].component ) ), [
		'You can submit content in several different ways; this screen holds the settings for all of them. The top section controls the editor within the dashboard, while the rest control external publishing methods. For more information on any of these methods, use the documentation links.',
		'You must click the Save Changes button at the bottom of the screen for new settings to take effect.',
	] );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 1 ].component ) ), [
		'Post via email settings allow you to send your WordPress installation an email with the content of your post. You must set up a secret email account with POP3 access to use this, and any mail received at this address will be posted, so it’s a good idea to keep this address very secret.',
	] );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 2 ].component ) ), [ 'If desired, WordPress will automatically alert various services of your new posts.' ] );
} );

test( 'the help sidebar links the documentation and the support forums', async () => {
	const view = await renderHelp( help.sidebar );
	assert.deepEqual( paragraphs( view ), [ 'For more information:', 'Documentation on Writing Settings', 'Support forums' ] );
	assert.ok( find( view.container, byTag( 'strong' ) ) );
	assert.deepEqual( findAll( view.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [ 'https://wordpress.org/documentation/article/settings-writing-screen/', 'https://wordpress.org/support/forums/' ] );
} );

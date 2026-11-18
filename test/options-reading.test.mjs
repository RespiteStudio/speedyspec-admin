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
const state = await import( '../site/components/core/options-reading/state.js' );
const { mergeHelp } = await import( '../site/components/core/help-tabs.js' );

const { h, defineComponent } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const NAMES = [ 'options-reading', 'form-table', 'settings-field' ];
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

const PAGES = [
	{ value: 2, label: 'Home', depth: 0 },
	{ value: 3, label: 'Blog', depth: 0 },
	{ value: 4, label: 'Team', depth: 1 },
];

const noAction = () => ( { blog_privacy_selector: { hooked: false, html: '', error: false } } );

/** Settings data as wp-admin/v1/settings/reading returns it on a UTF-8 site with pages. */
function settingsData( overrides = {} ) {
	return {
		show_on_front: 'posts',
		page_on_front: 0,
		page_for_posts: 0,
		posts_per_page: 10,
		posts_per_rss: 10,
		rss_use_excerpt: '0',
		blog_public: false,
		unshown: [],
		choices: { pageOnFront: PAGES, pageForPosts: PAGES },
		flags: { pages: true, privacySelector: false, blogCharset: false },
		warnings: { frontPage: false, privacyPolicy: false },
		locked: [],
		multisite: false,
		legacySections: { sections: [], actions: noAction(), scripts: [], styles: [] },
		...overrides,
	};
}

/** Settings data with the visibility radio buttons and a plugin's extra one. */
const radioData = ( overrides = {} ) => settingsData( {
	blog_public: '1',
	flags: { pages: true, privacySelector: true, blogCharset: false },
	legacySections: { sections: [], actions: { blog_privacy_selector: { hooked: true, html: '<br><input id="blog-members" type="radio" name="blog_public" value="-1"><label for="blog-members">Members only</label>', error: false } }, scripts: [], styles: [] },
	...overrides,
} );

function render( data = settingsData() ) {
	const dirty = [];
	const added = [];
	const service = { add: ( notice ) => {
		added.push( notice );
		return 'n' + added.length;
	} };
	const view = mount( () => h( Contracted, { id: 'core/options-reading', data, page: { path: 'options-reading.php', title: 'Reading Settings' } } ), {
		provide: { notices: service, pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false } },
	} );
	return { view, dirty, added };
}

const byId = ( id ) => byProp( 'id', id );
const rowOf = ( container, field ) => find( container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] === field );
const rowIds = ( container ) => findAll( container, ( el ) => el.tag === 'tr' && ( el.props[ 'data-field' ] || el.props[ 'data-legacy-field' ] ) ).map( ( row ) => row.props[ 'data-field' ] ?? row.props[ 'data-legacy-field' ] );
const radio = ( container, name, value ) => find( container, ( el ) => el.tag === 'input' && el.props.name === name && el.props.value === value );
const type = ( view, id, value ) => find( view.container, byId( id ) ).props.onInput( { target: { value } } );
const choose = ( view, id, value ) => find( view.container, byId( id ) ).props.onChange( { target: { value } } );
const pick = ( view, name, value ) => radio( view.container, name, value ).props.onChange( { target: { value, checked: true } } );
const check = ( view, id, checked ) => find( view.container, byId( id ) ).props.onChange( { target: { checked } } );
const submit = ( view ) => find( view.container, byTag( 'form' ) ).props.onSubmit( { preventDefault() {} } );
const options = ( select ) => findAll( select, byTag( 'option' ) ).map( ( option ) => [ option.props.value, textOf( option ), option.props.class ?? null, option.props.selected ] );

test( 'the page root has the classic body class, as the other settings pages do', async () => {
	const { view } = render();
	await flush();
	assert.ok( hasClass( find( view.container, byClass( 'wp-admin-options-reading' ) ), 'options-reading-php' ) );
} );

test( 'the contract has the established shape and version 1.0.0', () => {
	const contract = loaded[ 'options-reading' ].contract.default;
	assert.equal( contract.id, 'core/options-reading' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true, 'A page contract: its files are gated by role.' );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-fields', 'after-fields', 'after-submit' ] );
	for ( const slot of Object.values( contract.slots ) ) {
		assert.deepEqual( Object.keys( slot.props ), [ 'values', 'setValue', 'errors' ] );
	}
	assert.deepEqual( contract.emits, [ 'saved' ] );
} );

test( 'renders the rows in the classic order, with the labels, ids and classes', async () => {
	const { view } = render();
	await flush();
	assert.deepEqual( rowIds( view.container ), [ 'show_on_front', 'posts_per_page', 'posts_per_rss', 'rss_use_excerpt', 'blog_public' ] );
	assert.equal( findAll( view.container, byClass( 'form-table' ) ).length, 1 );

	const homepage = rowOf( view.container, 'show_on_front' );
	assert.equal( textOf( find( homepage, byTag( 'th' ) ) ).trim(), 'Your homepage displays' );
	assert.equal( textOf( find( homepage, byTag( 'legend' ) ) ), 'Your homepage displays' );
	assert.ok( find( homepage, byId( 'front-static-pages' ) ) );
	assert.equal( radio( homepage, 'show_on_front', 'posts' ).props.checked, true );
	assert.equal( radio( homepage, 'show_on_front', 'page' ).props.checked, false );
	const staticLabel = findAll( homepage, byTag( 'label' ) )[ 1 ];
	assert.equal( textOf( staticLabel ).trim(), 'A static page (select below)' );
	assert.equal( find( staticLabel, byTag( 'a' ) ).props.href, '/wp-admin/edit.php?post_type=page' );

	for ( const [ id, label ] of [ [ 'posts_per_page', 'Number of recent posts shown on archive pages' ], [ 'posts_per_rss', 'Number of recent items shown in syndication feeds' ] ] ) {
		const input = find( view.container, byId( id ) );
		assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === id ) ), label );
		assert.equal( input.props.type, 'number' );
		assert.equal( input.props.min, '1' );
		assert.equal( input.props.step, '1' );
		assert.equal( input.props.class, 'small-text' );
		assert.equal( input.props.value, 10 );
	}

	const feed = rowOf( view.container, 'rss_use_excerpt' );
	assert.equal( textOf( find( feed, byTag( 'th' ) ) ).trim(), 'For each post in a feed, include' );
	assert.equal( find( feed, byTag( 'fieldset' ) ).props[ 'aria-describedby' ], 'rss-use-excerpt-description' );
	assert.equal( find( feed, byId( 'rss-use-full-text' ) ).props.checked, true );
	assert.equal( find( feed, byId( 'rss-use-excerpt' ) ).props.checked, false );
	const description = find( feed, byId( 'rss-use-excerpt-description' ) );
	assert.equal( textOf( description ), 'Your theme determines how content is displayed in browsers. Learn more about feeds.' );
	assert.equal( find( description, byTag( 'a' ) ).props.href, 'https://developer.wordpress.org/advanced-administration/wordpress/feeds/' );

	const visibility = rowOf( view.container, 'blog_public' );
	assert.ok( hasClass( visibility, 'option-site-visibility' ) );
	assert.equal( textOf( find( visibility, byTag( 'th' ) ) ).trim(), 'Search engine visibility' );

	const submitButton = find( view.container, byId( 'submit' ) );
	assert.ok( hasClass( submitButton, 'button-primary' ) );
	assert.equal( textOf( submitButton ), 'Save Changes' );
	assert.equal( findAll( view.container, byTag( 'h1' ) ).length, 0, 'The page host renders the heading.' );
} );

test( 'the page selectors sit inside the core sentences, list the tree and are disabled unless a static page is chosen', async () => {
	const { view } = render( settingsData( { page_on_front: 4 } ) );
	await flush();
	const front = find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'page_on_front' );
	assert.equal( textOf( front ).startsWith( 'Homepage: ' ), true );
	const select = find( front, byId( 'page_on_front' ) );
	assert.equal( select.tag, 'select', 'The selector is the placeholder of the sentence.' );
	assert.equal( select.props.name, 'page_on_front' );
	const nbsp = ' ';
	assert.deepEqual( options( select ), [
		[ '0', '— Select —', null, false ],
		[ '2', 'Home', 'level-0', false ],
		[ '3', 'Blog', 'level-0', false ],
		[ '4', nbsp.repeat( 3 ) + 'Team', 'level-1', true ],
	] );
	const posts = find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'page_for_posts' );
	assert.equal( textOf( posts ).startsWith( 'Posts page: ' ), true );
	assert.equal( options( find( posts, byId( 'page_for_posts' ) ) )[ 0 ][ 3 ], true, '— Select — for none.' );

	assert.equal( select.props.disabled, true );
	pick( view, 'show_on_front', 'page' );
	await flush();
	assert.equal( find( view.container, byId( 'page_on_front' ) ).props.disabled, false );
	assert.equal( find( view.container, byId( 'page_for_posts' ) ).props.disabled, false );
	pick( view, 'show_on_front', 'posts' );
	await flush();
	assert.equal( find( view.container, byId( 'page_on_front' ) ).props.disabled, true );
} );

test( 'state: a sentence around its placeholder, translated or reordered', () => {
	assert.deepEqual( state.aroundPlaceholder( 'Homepage: %s' ), { before: 'Homepage: ', after: '' } );
	assert.deepEqual( state.aroundPlaceholder( '%s : page d&#8217;accueil' ), { before: '', after: ' : page d’accueil' } );
	assert.deepEqual( state.aroundPlaceholder( '100%% %1$s here' ), { before: '100% ', after: ' here' } );
	assert.deepEqual( state.aroundPlaceholder( 'No placeholder' ), { before: 'No placeholder', after: '' } );
	assert.equal( state.pageLabel( { label: 'Deep', depth: 2 } ), ' '.repeat( 6 ) + 'Deep' );
} );

test( 'state: the page decides nothing about what the classic form posts; the endpoint does', () => {
	assert.equal( state.classicFields, undefined );
	assert.equal( state.radioValuesIn, undefined );
	assert.equal( state.isChoice, undefined );
	assert.equal( state.checkboxValuesFor, undefined );
	assert.equal( state.controlIdsFor( true ).blog_public, 'blog-public' );
	assert.equal( state.controlIdsFor( false ).blog_public, 'blog_public' );
} );

test( 'stored values the controls cannot show are shown and sent as the endpoint says', async () => {
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	// A stored -1 (a deactivated privacy plugin) and a homepage that is no longer listed, as the endpoint answers them.
	const { view } = render( settingsData( { show_on_front: 'page', page_on_front: 0, page_for_posts: 3, blog_public: false, unshown: [ 'page_on_front', 'blog_public' ] } ) );
	await flush();
	assert.equal( find( view.container, byId( 'blog_public' ) ).props.checked, false, 'The checkbox shows unchecked, as on the classic screen.' );
	assert.equal( options( find( view.container, byId( 'page_on_front' ) ) )[ 0 ][ 3 ], true, '— Select — is shown.' );
	type( view, 'posts_per_rss', '5' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { posts_per_rss: 5, page_on_front: 0, blog_public: false }, 'The unshown fields are replayed as shown.' );
} );

test( 'with the radio buttons, a stored value none of them has shows none checked and is sent as the endpoint says', async () => {
	api.respondWith( async () => ( { ...radioData(), notices: [] } ) );
	const { view } = render( radioData( { blog_public: false, unshown: [ 'blog_public' ] } ) );
	await flush();
	const row = rowOf( view.container, 'blog_public' );
	assert.equal( find( row, byId( 'blog-public' ) ).props.checked, false );
	assert.equal( find( row, byId( 'blog-norobots' ) ).props.checked, false );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { blog_public: false, legacy: [], legacyNames: [] }, 'None checked: nothing posted, which the endpoint saves as 1.' );
} );

test( 'the warnings from the page data, in the classic markup', async () => {
	const { view } = render( settingsData( { show_on_front: 'page', page_on_front: 2, page_for_posts: 2, warnings: { frontPage: true, privacyPolicy: true } } ) );
	await flush();
	const same = find( view.container, byId( 'front-page-warning' ) );
	assert.ok( hasClass( same, 'notice' ) && hasClass( same, 'notice-warning' ) && hasClass( same, 'inline' ) );
	assert.equal( textOf( same ), 'Warning: these pages should not be the same!' );
	assert.equal( textOf( find( same, byTag( 'strong' ) ) ), 'Warning:' );
	assert.equal( textOf( find( view.container, byId( 'privacy-policy-page-warning' ) ) ), 'Warning: these pages should not be the same as your Privacy Policy page!' );

	unmountAll();
	const quiet = render();
	await flush();
	assert.equal( find( quiet.view.container, byId( 'front-page-warning' ) ), null );
	assert.equal( find( quiet.view.container, byId( 'privacy-policy-page-warning' ) ), null );
} );

test( 'without pages there is no homepage row', async () => {
	const { view } = render( settingsData( { flags: { pages: false, privacySelector: false, blogCharset: false }, choices: { pageOnFront: [], pageForPosts: [] } } ) );
	await flush();
	assert.deepEqual( rowIds( view.container ), [ 'posts_per_page', 'posts_per_rss', 'rss_use_excerpt', 'blog_public' ] );
	assert.equal( find( view.container, byId( 'page_on_front' ) ), null );
} );

test( 'the visibility checkbox: #blog_public, value 0, checked when the site discourages search engines', async () => {
	const { view } = render( settingsData( { blog_public: true } ) );
	await flush();
	const checkbox = find( view.container, byId( 'blog_public' ) );
	assert.equal( checkbox.props.type, 'checkbox' );
	assert.equal( checkbox.props.name, 'blog_public' );
	assert.equal( checkbox.props.value, '0' );
	assert.equal( checkbox.props.checked, true );
	assert.equal( checkbox.props[ 'aria-describedby' ], 'option-site-visibility-description' );
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'blog_public' ) ), 'Discourage search engines from indexing this site' );
	assert.equal( textOf( find( view.container, byId( 'option-site-visibility-description' ) ) ), 'It is up to search engines to honor this request.' );
	assert.equal( find( view.container, byId( 'blog-public' ) ), null );
} );

test( 'saving posts only the changed fields; the checkbox as a boolean; the endpoint saves the disabled selectors', async () => {
	let resolve;
	api.respondWith( () => new Promise( ( done ) => ( resolve = done ) ) );
	const { view, dirty, added } = render( settingsData( { show_on_front: 'page', page_on_front: 2, page_for_posts: 3 } ) );
	await flush();
	pick( view, 'show_on_front', 'posts' );
	type( view, 'posts_per_page', '15' );
	type( view, 'posts_per_rss', '' );
	pick( view, 'rss_use_excerpt', '1' );
	check( view, 'blog_public', true );
	await flush();
	assert.equal( dirty.at( -1 ), true, 'Unsaved changes are reported.' );

	submit( view );
	await flush();
	assert.equal( find( view.container, byId( 'submit' ) ).props.disabled, true );
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/settings/reading', payload: { show_on_front: 'posts', posts_per_page: 15, posts_per_rss: 0, rss_use_excerpt: '1', blog_public: true } } );

	resolve( { ...settingsData( { posts_per_page: 15, posts_per_rss: 1, rss_use_excerpt: '1', blog_public: true } ), notices: [ { type: 'success', message: 'Settings saved.' } ] } );
	await flush();
	assert.deepEqual( added, [ { type: 'success', message: 'Settings saved.', dismissible: true, scope: 'page' } ] );
	assert.equal( dirty.at( -1 ), false, 'Saved.' );
	assert.equal( find( view.container, byId( 'blog_public' ) ).props.checked, true );
	assert.equal( find( view.container, byId( 'posts_per_rss' ) ).props.value, 1 );
} );

test( 'a static page keeps its selectors on save, and a failed save keeps the choices', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added } = render( settingsData( { page_on_front: 2, page_for_posts: 3 } ) );
	await flush();
	type( view, 'posts_per_page', '7' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { posts_per_page: 7 }, 'Latest posts: the endpoint saves the disabled selectors.' );
	assert.equal( added[ 0 ].message, 'WordPress cannot be reached right now. Please try again in a moment.' );
	pick( view, 'show_on_front', 'page' );
	await flush();
	assert.equal( options( find( view.container, byId( 'page_on_front' ) ) ).find( ( option ) => option[ 3 ] )[ 0 ], '2', 'The choice survives the failed save.' );

	api.reset();
	api.respondWith( async () => ( { ...settingsData( { show_on_front: 'page', page_on_front: 4, page_for_posts: 3 } ), notices: [] } ) );
	choose( view, 'page_on_front', '4' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { show_on_front: 'page', page_on_front: 4, posts_per_page: 7 } );
} );

test( 'the visibility radio buttons with a plugin\'s: its chosen value is the field\'s, saved as such', async () => {
	api.respondWith( async () => ( { ...radioData( { blog_public: '-1' } ), notices: [] } ) );
	const { view } = render( radioData() );
	await flush();
	const row = rowOf( view.container, 'blog_public' );
	assert.equal( textOf( find( row, byTag( 'th' ) ) ).trim(), 'Site visibility' );
	assert.equal( find( row, byTag( 'fieldset' ) ).props[ 'aria-describedby' ], 'option-site-visibility-description' );
	assert.equal( find( view.container, byId( 'blog_public' ) ), null, 'No checkbox.' );
	assert.equal( find( row, byId( 'blog-public' ) ).props.checked, true );
	assert.equal( find( row, byId( 'blog-public' ) ).props.value, '1' );
	assert.equal( find( row, byId( 'blog-norobots' ) ).props.value, '0' );
	assert.equal( textOf( find( row, ( el ) => el.tag === 'label' && el.props.for === 'blog-public' ) ), 'Allow search engines to index this site' );
	assert.equal( textOf( find( row, byId( 'option-site-visibility-description' ) ) ), 'Note: Neither of these options blocks access to your site — it is up to search engines to honor your request.' );
	const island = find( row, byClass( 'wp-admin-legacy-html' ) );
	assert.ok( island, 'The action\'s output is a LegacyHtml island inside the fieldset.' );

	// The plugin's radio button is chosen.
	const pluginRadio = { name: 'blog_public', value: '-1', checked: true, closest: ( selector ) => ( selector === '.wp-admin-legacy-html' ? {} : null ) };
	find( row, byTag( 'fieldset' ) ).props.onChange( { target: pluginRadio } );
	await flush();
	assert.equal( find( row, byId( 'blog-public' ) ).props.checked, false );

	const form = find( view.container, byTag( 'form' ) );
	form.querySelectorAll = () => [ { tagName: 'INPUT', type: 'radio', ...pluginRadio } ];
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { blog_public: '-1', legacy: [ { name: 'blog_public', value: '-1' } ], legacyNames: [ 'blog_public' ] } );

	// A core radio button again.
	api.reset();
	api.respondWith( async () => ( { ...radioData( { blog_public: '0' } ), notices: [] } ) );
	pick( view, 'blog_public', '0' );
	form.querySelectorAll = () => [];
	submit( view );
	await flush();
	assert.equal( api.calls[ 0 ].payload.blog_public, '0' );
} );

test( 'a failing privacy selector callback shows a message instead of its output', async () => {
	const { view } = render( radioData( { legacySections: { sections: [], actions: { blog_privacy_selector: { hooked: true, html: '', error: true } }, scripts: [], styles: [] } } ) );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'wp-admin-legacy-failure' ) ) ), 'This setting could not be displayed.' );
} );

test( 'the encoding field on a site that does not use UTF-8, after the plugin fields', async () => {
	const field = { id: 'acme_default', title: 'Acme', html: '<input name="acme_default" id="acme_default" value="">', labelFor: 'acme_default', class: '', error: false };
	const { view } = render( settingsData( {
		blog_charset: 'ISO-8859-1',
		flags: { pages: true, privacySelector: false, blogCharset: true },
		legacySections: { sections: [ { id: 'default', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field ] }, { id: 'acme_section', position: 'section', title: 'Acme Section', before: '', html: '<p>Intro</p>', after: '', error: false, fields: [] } ], actions: noAction(), scripts: [], styles: [] },
	} ) );
	await flush();
	assert.deepEqual( rowIds( view.container ), [ 'show_on_front', 'posts_per_page', 'posts_per_rss', 'rss_use_excerpt', 'blog_public', 'acme_default', 'blog_charset' ] );
	const input = find( view.container, byId( 'blog_charset' ) );
	assert.equal( input.props.class, 'regular-text' );
	assert.equal( input.props.value, 'ISO-8859-1' );
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'blog_charset' ) ), 'Encoding for pages and feeds' );
	const description = find( view.container, byId( 'blog_charset-description' ) );
	assert.equal( textOf( description ), 'The character encoding of your site (UTF-8 is recommended)' );
	assert.equal( find( description, byTag( 'a' ) ).props.href, 'https://wordpress.org/documentation/article/wordpress-glossary/#character-set' );

	const order = find( view.container, byTag( 'form' ) ).children
		.filter( ( el ) => el.type === 'element' )
		.map( ( el ) => el.props[ 'data-legacy-section' ] ?? ( hasClass( el, 'form-table' ) ? 'table' : el.tag ) );
	assert.ok( order.indexOf( 'table' ) < order.indexOf( 'acme_section' ), order.join( ', ' ) );
	assert.equal( order.at( -1 ), 'p', 'The submit button comes last.' );
} );

test( 'a refused parameter is shown beside its control and takes focus', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'rest_invalid_param', message: 'Invalid parameter(s): posts_per_page', data: { status: 400, params: { posts_per_page: 'posts_per_page is not of type integer.' } } } );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view } = render();
		await flush();
		type( view, 'posts_per_page', '3' );
		submit( view );
		await flush();
		const input = find( view.container, byId( 'posts_per_page' ) );
		assert.equal( input.props[ 'aria-invalid' ], 'true' );
		assert.equal( input.props[ 'aria-describedby' ], 'posts_per_page-error' );
		assert.equal( input.props.value, 3, 'The input is kept.' );
		assert.deepEqual( focused, [ 'posts_per_page' ] );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'a URL fragment naming a control of the page scrolls to it and focuses it once rendered', async () => {
	const previous = { document: globalThis.document, location: globalThis.location };
	const landed = [];
	let rootElement = null;
	const target = { scrollIntoView: () => landed.push( 'scroll' ), focus: () => landed.push( 'focus' ) };
	globalThis.location = { pathname: '/wp-admin/options-reading.php', search: '', hash: '#blog_public' };
	globalThis.document = { getElementById: ( id ) => ( id === 'blog_public' && rootElement ? target : null ) };
	try {
		const { view } = render();
		await flush();
		rootElement = find( view.container, byClass( 'wp-admin-options-reading' ) );
		rootElement.contains = ( element ) => element === target;
		await new Promise( ( done ) => setTimeout( done, 120 ) );
		assert.deepEqual( landed, [ 'scroll', 'focus' ] );
	} finally {
		globalThis.document = previous.document;
		globalThis.location = previous.location;
	}
} );

test( 'slot modules get the values, setValue and the errors', async () => {
	const Slot = defineComponent( {
		props: [ 'values', 'setValue', 'errors' ],
		setup: ( props ) => () => h( 'p', { class: 'slot-module' }, 'Posts: ' + props.values.posts_per_page ),
	} );
	globalThis.__modules[ '/m/or-slot.js' ] = { default: Slot };
	loader.applyImportMap( { 'or-slot': '/m/or-slot.js' } );
	contracts.configure( { replacements: {}, slots: { 'core/options-reading': { 'after-fields': [ { module: 'or-slot' } ] } } } );
	const { view } = render();
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Posts: 10' );
	type( view, 'posts_per_page', '12' );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Posts: 12' );
} );

test( 'a replacement of core/settings-field is used for every settings-field row', async () => {
	const Row = defineComponent( {
		props: [ 'id', 'label', 'description', 'locked', 'error', 'group', 'icon' ],
		setup: ( props, { slots } ) => () => h( 'tr', { class: 'replaced-row', 'data-field': props.id }, [ h( 'th', props.label ), h( 'td', slots.default?.() ) ] ),
	} );
	globalThis.__modules[ '/m/or-row.js' ] = { default: Row, implementsContract: { id: 'core/settings-field', version: '1.0.0' } };
	loader.applyImportMap( { 'or-row': '/m/or-row.js' } );
	contracts.configure( { replacements: { 'core/settings-field': { module: 'or-row', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	assert.deepEqual( findAll( view.container, byClass( 'replaced-row' ) ).map( ( row ) => row.props[ 'data-field' ] ), [ 'show_on_front', 'posts_per_page', 'posts_per_rss', 'rss_use_excerpt', 'blog_public' ] );
	assert.ok( find( view.container, byId( 'page_on_front' ) ), 'The controls are still rendered in it.' );
} );

test( 'a replacement of core/form-table is used for the table', async () => {
	const Table = defineComponent( { setup: ( props, { slots } ) => () => h( 'table', { class: 'replaced-table' }, [ h( 'tbody', slots.default?.() ) ] ) } );
	globalThis.__modules[ '/m/or-table.js' ] = { default: Table, implementsContract: { id: 'core/form-table', version: '1.0.0' } };
	loader.applyImportMap( { 'or-table': '/m/or-table.js' } );
	contracts.configure( { replacements: { 'core/form-table': { module: 'or-table', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	assert.equal( findAll( view.container, byClass( 'replaced-table' ) ).length, 1 );
	assert.equal( find( view.container, byClass( 'form-table' ) ), null );
} );

test( 'a successful save emits saved with the settings', async () => {
	api.respondWith( async () => ( { ...settingsData( { posts_per_page: 5 } ), notices: [] } ) );
	const saved = [];
	const view = mount( () => h( Contracted, { id: 'core/options-reading', data: settingsData(), page: { path: 'options-reading.php' }, onSaved: ( value ) => saved.push( value ) } ), {
		provide: { notices: { add: () => null }, pageState: null },
	} );
	await flush();
	submit( view );
	await flush();
	assert.equal( saved.length, 1 );
	assert.equal( saved[ 0 ].posts_per_page, 5 );
	assert.equal( 'notices' in saved[ 0 ], false );
} );

// Help -------------------------------------------------------------------------------

const { help } = loaded[ 'options-reading' ].component;
const paragraphs = ( view ) => findAll( view.container, byTag( 'p' ) ).map( textOf );

async function renderHelp( component ) {
	const view = mount( () => h( 'div', null, [ h( component ) ] ) );
	await flush();
	return view;
}

test( 'the page exports the classic help: Overview, and the visibility tab titled after the privacy selector', () => {
	const tabsFor = ( data ) => mergeHelp( help, null, { path: 'options-reading.php', data } ).tabs.map( ( tab ) => [ tab.id, tab.title ] );
	assert.deepEqual( tabsFor( settingsData() ), [ [ 'overview', 'Overview' ], [ 'site-visibility', 'Search engine visibility' ] ] );
	assert.deepEqual( tabsFor( radioData() ), [ [ 'overview', 'Overview' ], [ 'site-visibility', 'Site visibility' ] ] );
	assert.equal( typeof help.sidebar, 'object' );
} );

test( 'the help tabs have the classic text and links', async () => {
	const overview = await renderHelp( help.tabs[ 0 ].component );
	assert.deepEqual( paragraphs( overview ), [
		'This screen contains the settings that affect the display of your content.',
		'You can choose what’s displayed on the homepage of your site. It can be posts in reverse chronological order (classic blog), or a fixed/static page. To set a static homepage, you first need to create two Pages. One will become the homepage, and the other will be where your posts are displayed.',
		'You can also control the display of your content in RSS feeds, including the maximum number of posts to display and whether to show full text or an excerpt. Learn more about feeds.',
		'You must click the Save Changes button at the bottom of the screen for new settings to take effect.',
	] );
	assert.deepEqual( findAll( overview.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [ '/wp-admin/post-new.php?post_type=page', 'https://developer.wordpress.org/advanced-administration/wordpress/feeds/' ] );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 1 ].component ) ), [
		'You can choose whether or not your site will be crawled by robots, ping services, and spiders. If you want those services to ignore your site, click the checkbox next to “Discourage search engines from indexing this site” and click the Save Changes button at the bottom of the screen.',
		'Note that even when set to discourage search engines, your site is still visible on the web and not all search engines adhere to this directive.',
		'When this setting is in effect, a reminder is shown in the At a Glance box of the Dashboard that says, “Search engines discouraged”, to remind you that you have directed search engines to not crawl your site.',
	] );
} );

test( 'the help sidebar links the documentation and the support forums', async () => {
	const view = await renderHelp( help.sidebar );
	assert.deepEqual( paragraphs( view ), [ 'For more information:', 'Documentation on Reading Settings', 'Support forums' ] );
	assert.deepEqual( findAll( view.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [ 'https://wordpress.org/documentation/article/settings-reading-screen/', 'https://wordpress.org/support/forums/' ] );
} );

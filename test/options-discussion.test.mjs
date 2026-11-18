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
const state = await import( '../site/components/core/options-discussion/state.js' );
const { mergeHelp } = await import( '../site/components/core/help-tabs.js' );

const { h, defineComponent } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const NAMES = [ 'options-discussion', 'form-table', 'settings-field' ];
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

const AVATAR_ACTION = '_wp_admin_discussion_avatar_list';
const AVATARS = [
	{ value: 'mystery', label: 'Mystery Person', url: 'https://secure.gravatar.com/avatar/abc?s=32&d=mm&f=y&r=g' },
	{ value: 'blank', label: 'Blank', url: 'https://secure.gravatar.com/avatar/abc?s=32&d=blank&f=y&r=g' },
	{ value: 'identicon', label: 'Identicon (Generated)', url: 'https://secure.gravatar.com/avatar/abc?s=32&d=identicon&f=y&r=g' },
];
const noAction = ( overrides = {} ) => ( { [ AVATAR_ACTION ]: { hooked: false, html: '', error: false, ...overrides } } );

/** Settings data as wp-admin/v1/settings/discussion returns it on a single site. */
function settingsData( overrides = {} ) {
	return {
		default_pingback_flag: true,
		default_ping_status: true,
		default_comment_status: true,
		require_name_email: true,
		comment_registration: false,
		close_comments_for_old_posts: false,
		close_comments_days_old: 14,
		show_comments_cookies_opt_in: true,
		thread_comments: true,
		thread_comments_depth: 5,
		page_comments: false,
		comments_per_page: 50,
		default_comments_page: 'newest',
		comment_order: 'asc',
		comments_notify: true,
		moderation_notify: true,
		wp_notes_notify: true,
		comment_moderation: false,
		comment_previously_approved: true,
		comment_max_links: 2,
		moderation_keys: '',
		disallowed_keys: '',
		show_avatars: true,
		avatar_rating: 'G',
		avatar_default: 'mystery',
		unshown: [],
		choices: { threadCommentsDepthMax: 10, avatarDefault: AVATARS },
		avatarHtml: null,
		flags: { signupDisabled: false },
		locked: [],
		multisite: false,
		legacySections: { sections: [], actions: noAction(), scripts: [], styles: [] },
		...overrides,
	};
}

/** The classic avatar list as a plugin filtering it leaves it. */
const LIST_HTML = "\n\t<label><input type='radio' name='avatar_default' id='avatar_mystery' value='mystery' checked=\"checked\" /> <img alt='' src='https://example.org/m.png' class='avatar avatar-32 photo' height='32' width='32' /> Mystery Person</label><br />"
	+ "\n\t<label><input type='radio' name='avatar_default' id='avatar_acme' value='https://example.org/acme.png' /> <img alt='' src='https://example.org/acme.png' class='avatar' /> Acme</label><br />";

/** Settings data with the classic avatar list. */
const listData = ( overrides = {} ) => settingsData( {
	avatarHtml: LIST_HTML,
	legacySections: { sections: [], actions: noAction( { hooked: true, html: LIST_HTML } ), scripts: [], styles: [] },
	...overrides,
} );

function render( data = settingsData() ) {
	const dirty = [];
	const added = [];
	const service = { add: ( notice ) => {
		added.push( notice );
		return 'n' + added.length;
	} };
	const view = mount( () => h( Contracted, { id: 'core/options-discussion', data, page: { path: 'options-discussion.php', title: 'Discussion Settings' } } ), {
		provide: { notices: service, pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false } },
	} );
	return { view, dirty, added };
}

const byId = ( id ) => byProp( 'id', id );
const rowOf = ( container, field ) => find( container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] === field );
const rowIds = ( container ) => findAll( container, ( el ) => el.tag === 'tr' && ( el.props[ 'data-field' ] || el.props[ 'data-legacy-field' ] ) ).map( ( row ) => row.props[ 'data-field' ] ?? row.props[ 'data-legacy-field' ] );
const radio = ( container, name, value ) => find( container, ( el ) => el.tag === 'input' && el.props.name === name && el.props.value === value );
const labelFor = ( container, id ) => find( container, ( el ) => el.tag === 'label' && el.props.for === id );
const type = ( view, id, value ) => find( view.container, byId( id ) ).props.onInput( { target: { value } } );
const choose = ( view, id, value ) => find( view.container, byId( id ) ).props.onChange( { target: { value } } );
const pick = ( view, name, value ) => radio( view.container, name, value ).props.onChange( { target: { value, checked: true } } );
const check = ( view, id, checked ) => find( view.container, byId( id ) ).props.onChange( { target: { checked } } );
const submit = ( view ) => find( view.container, byTag( 'form' ) ).props.onSubmit( { preventDefault() {} } );
const options = ( select ) => findAll( select, byTag( 'option' ) ).map( ( option ) => [ option.props.value, textOf( option ), option.props.selected ] );
const shown = ( el ) => el.props.style?.display !== 'none';

test( 'the contract has the established shape and version 1.0.0', () => {
	const contract = loaded[ 'options-discussion' ].contract.default;
	assert.equal( contract.id, 'core/options-discussion' );
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

test( 'renders the two tables in the classic order, with the headings, legends and the Avatars heading', async () => {
	const { view } = render();
	await flush();
	assert.deepEqual( rowIds( view.container ), [ 'default_post_settings', 'other_comment_settings', 'comment_pagination', 'email_me_whenever', 'before_comment_appears', 'comment_moderation_keys', 'disallowed_comment_keys', 'avatar_display', 'avatar_rating', 'avatar_default' ] );
	const tables = findAll( view.container, byClass( 'form-table' ) );
	assert.equal( tables.length, 2 );
	assert.ok( hasClass( tables[ 0 ], 'indent-children' ), 'The main table keeps its classic class.' );
	assert.ok( hasClass( find( view.container, byClass( 'wp-admin-options-discussion' ) ), 'options-discussion-php' ), 'The classic body class, for edit.css\'s `.options-discussion-php .indent-children ul`.' );
	const titles = {
		default_post_settings: 'Default post settings',
		other_comment_settings: 'Other comment settings',
		comment_pagination: 'Comment Pagination',
		email_me_whenever: 'Email me whenever',
		before_comment_appears: 'Before a comment appears',
		comment_moderation_keys: 'Comment Moderation',
		disallowed_comment_keys: 'Disallowed Comment Keys',
		avatar_rating: 'Maximum Rating',
		avatar_default: 'Default Avatar',
	};
	for ( const [ row, title ] of Object.entries( titles ) ) {
		assert.equal( textOf( find( rowOf( view.container, row ), byTag( 'th' ) ) ).trim(), title, row + ' title' );
		const legend = find( rowOf( view.container, row ), byTag( 'legend' ) );
		assert.equal( textOf( legend ), title, row + ' legend' );
		assert.ok( hasClass( legend, 'screen-reader-text' ) );
	}
	assert.equal( textOf( find( rowOf( view.container, 'avatar_display' ), byTag( 'th' ) ) ).trim(), 'Avatar Display' );
	const heading = find( view.container, byId( 'wp-settings-section-avatars' ) );
	assert.equal( heading.tag, 'h2' );
	assert.ok( hasClass( heading, 'title' ) );
	assert.equal( textOf( heading ), 'Avatars' );
	assert.match( view.text(), /An avatar is an image that can be associated with a user across multiple websites\. In this area, you can choose to display avatars of users who interact with the site\./ );
	assert.equal( textOf( find( view.container, byId( 'submit' ) ) ), 'Save Changes' );
} );

test( 'the checkboxes have the classic labels, values and states', async () => {
	const { view } = render( settingsData( { flags: { signupDisabled: false } } ) );
	await flush();
	const labels = {
		default_pingback_flag: [ 'Attempt to notify any blogs linked to from the post', '1' ],
		default_ping_status: [ 'Allow link notifications from other blogs (pingbacks and trackbacks) on new posts', 'open' ],
		default_comment_status: [ 'Allow people to submit comments on new posts', 'open' ],
		require_name_email: [ 'Comment author must fill out name and email', '1' ],
		comment_registration: [ 'Users must be registered and logged in to comment', '1' ],
		close_comments_for_old_posts: [ 'Automatically close comments on old posts', '1' ],
		show_comments_cookies_opt_in: [ 'Show comments cookies opt-in checkbox, allowing comment author cookies to be set', '1' ],
		thread_comments: [ 'Enable threaded (nested) comments', '1' ],
		page_comments: [ 'Break comments into pages', '1' ],
		comments_notify: [ 'Anyone posts a comment', '1' ],
		moderation_notify: [ 'A comment is held for moderation', '1' ],
		wp_notes_notify: [ 'Anyone posts a note', '1' ],
		comment_moderation: [ 'Comment must be manually approved', '1' ],
		comment_previously_approved: [ 'Comment author must have a previously approved comment', '1' ],
		show_avatars: [ 'Show Avatars', '1' ],
	};
	const data = settingsData();
	for ( const [ id, [ text, value ] ] of Object.entries( labels ) ) {
		const input = find( view.container, byId( id ) );
		assert.equal( input.props.type, 'checkbox', id );
		assert.equal( input.props.name, id );
		assert.equal( input.props.value, value, id + ' posts ' + value );
		assert.equal( input.props.checked, data[ id ], id + ' state' );
		assert.equal( textOf( labelFor( view.container, id ) ).trim(), text, id + ' label' );
	}
	assert.match( textOf( rowOf( view.container, 'default_post_settings' ) ), /Individual posts may override these settings\. Changes here will only be applied to new posts\./ );
	assert.doesNotMatch( textOf( labelFor( view.container, 'comment_registration' ) ), /Signup has been disabled/ );
} );

test( 'on a network with signup disabled, the comment registration label says so', async () => {
	const { view } = render( settingsData( { multisite: true, flags: { signupDisabled: true } } ) );
	await flush();
	assert.equal( textOf( labelFor( view.container, 'comment_registration' ) ).replace( /\s+/g, ' ' ).trim(), 'Users must be registered and logged in to comment (Signup has been disabled. Only members of this site can comment.)' );
} );

test( 'the number inputs, selects and text areas sit under their checkboxes, as on the classic screen', async () => {
	const { view } = render();
	await flush();
	for ( const id of state.NUMBERS ) {
		const input = find( view.container, byId( id ) );
		assert.equal( input.props.type, 'number', id );
		assert.equal( input.props.step, '1' );
		assert.equal( input.props.min, '0' );
		assert.equal( input.props.class, 'small-text' );
	}
	assert.equal( find( view.container, byId( 'close_comments_days_old' ) ).props.value, 14 );
	assert.equal( textOf( labelFor( view.container, 'close_comments_days_old' ) ), 'Close comments when post is how many days old' );
	assert.equal( textOf( labelFor( view.container, 'comments_per_page' ) ), 'Top level comments per page' );
	assert.equal( textOf( labelFor( view.container, 'thread_comments_depth' ) ), 'Number of levels for threaded (nested) comments' );
	assert.equal( textOf( labelFor( view.container, 'default_comments_page' ) ), 'Comments page to display by default' );
	assert.equal( textOf( labelFor( view.container, 'comment_order' ) ), 'Comments to display at the top of each page' );
	assert.equal( textOf( labelFor( view.container, 'comment_max_links' ) ), 'Number of links to allow in a comment before holding for moderation:' );

	// Each sub-control is in an `ul > li`, after its checkbox.
	for ( const id of [ 'close_comments_days_old', 'thread_comments_depth', 'comments_per_page', 'default_comments_page', 'comment_order' ] ) {
		const item = find( view.container, ( el ) => el.tag === 'li' && find( el, byId( id ) ) );
		assert.ok( item, id + ' is in a list item' );
	}

	const depth = find( view.container, byId( 'thread_comments_depth' ) );
	assert.deepEqual( options( depth ).map( ( option ) => option[ 0 ] ), [ '2', '3', '4', '5', '6', '7', '8', '9', '10' ] );
	assert.equal( options( depth ).find( ( option ) => option[ 2 ] )[ 0 ], '5' );
	assert.deepEqual( options( find( view.container, byId( 'default_comments_page' ) ) ), [ [ 'newest', 'last page', true ], [ 'oldest', 'first page', false ] ] );
	assert.deepEqual( options( find( view.container, byId( 'comment_order' ) ) ), [ [ 'asc', 'older', true ], [ 'desc', 'newer', false ] ] );

	const links = find( view.container, byId( 'comment_max_links' ) );
	assert.equal( links.props[ 'aria-describedby' ], 'comment_links_moderation_desc' );
	assert.equal( textOf( find( view.container, byId( 'comment_links_moderation_desc' ) ) ), '(A common characteristic of comment spam is a large number of hyperlinks.)' );

	for ( const id of [ 'moderation_keys', 'disallowed_keys' ] ) {
		const area = find( view.container, byId( id ) );
		assert.equal( area.tag, 'textarea' );
		assert.equal( area.props.rows, '10' );
		assert.equal( area.props.cols, '50' );
		assert.equal( area.props.class, 'large-text code' );
	}
	const moderation = labelFor( view.container, 'moderation_keys' );
	assert.equal( textOf( moderation ), 'When a comment contains any of these words in its content, author name, URL, email, IP address, or browser’s user agent string, it will be held in the moderation queue. One word or IP address per line. It will match inside words, so “press” will match “WordPress”.' );
	assert.equal( find( moderation, byTag( 'a' ) ).props.href, '/wp-admin/edit-comments.php?comment_status=moderated' );
	assert.equal( textOf( labelFor( view.container, 'disallowed_keys' ) ), 'When a comment contains any of these words in its content, author name, URL, email, IP address, or browser’s user agent string, it will be put in the Trash. One word or IP address per line. It will match inside words, so “press” will match “WordPress”.' );
} );

test( 'the thread depth select lists the levels up to the filtered maximum', async () => {
	const { view } = render( settingsData( { thread_comments_depth: 2, choices: { threadCommentsDepthMax: 4, avatarDefault: AVATARS } } ) );
	await flush();
	assert.deepEqual( options( find( view.container, byId( 'thread_comments_depth' ) ) ), [ [ '2', '2', true ], [ '3', '3', false ], [ '4', '4', false ] ] );
} );

test( 'the rating radio buttons and the default avatars with their images', async () => {
	const { view } = render( settingsData( { avatar_rating: 'PG', avatar_default: 'identicon' } ) );
	await flush();
	const ratings = findAll( rowOf( view.container, 'avatar_rating' ), ( el ) => el.tag === 'input' );
	assert.deepEqual( ratings.map( ( input ) => [ input.props.type, input.props.name, input.props.value, input.props.checked ] ), [
		[ 'radio', 'avatar_rating', 'G', false ],
		[ 'radio', 'avatar_rating', 'PG', true ],
		[ 'radio', 'avatar_rating', 'R', false ],
		[ 'radio', 'avatar_rating', 'X', false ],
	] );
	assert.deepEqual( findAll( rowOf( view.container, 'avatar_rating' ), byTag( 'label' ) ).map( ( label ) => textOf( label ).trim() ), [
		'G — Suitable for all audiences',
		'PG — Possibly offensive, usually for audiences 13 and above',
		'R — Intended for adult audiences above 17',
		'X — Even more mature than above',
	] );

	const picker = find( rowOf( view.container, 'avatar_default' ), byClass( 'defaultavatarpicker' ) );
	assert.ok( picker );
	assert.match( textOf( picker ), /For users without a custom avatar of their own, you can either display a generic logo or a generated one based on their email address\./ );
	const avatars = findAll( picker, ( el ) => el.tag === 'input' );
	assert.deepEqual( avatars.map( ( input ) => [ input.props.id, input.props.value, input.props.checked ] ), [
		[ 'avatar_mystery', 'mystery', false ],
		[ 'avatar_blank', 'blank', false ],
		[ 'avatar_identicon', 'identicon', true ],
	] );
	const images = findAll( picker, byTag( 'img' ) );
	assert.deepEqual( images.map( ( img ) => img.props.src ), AVATARS.map( ( avatar ) => avatar.url ) );
	assert.equal( images[ 0 ].props.class, 'avatar avatar-32 photo avatar-default' );
	assert.equal( images[ 0 ].props.alt, '' );
	assert.equal( String( images[ 0 ].props.width ), '32' );
	assert.deepEqual( findAll( picker, byTag( 'label' ) ).map( ( label ) => textOf( label ).trim() ), [ 'Mystery Person', 'Blank', 'Identicon (Generated)' ] );
	assert.equal( find( view.container, byClass( 'wp-admin-legacy-html' ) ), null );
} );

test( 'the rating and default avatar rows are shown only while Show Avatars is checked', async () => {
	const { view } = render( settingsData( { show_avatars: false } ) );
	await flush();
	const rows = () => [ rowOf( view.container, 'avatar_rating' ), rowOf( view.container, 'avatar_default' ) ];
	assert.ok( rows().every( ( row ) => hasClass( row, 'avatar-settings' ) ) );
	assert.deepEqual( rows().map( shown ), [ false, false ] );
	check( view, 'show_avatars', true );
	await flush();
	assert.deepEqual( rows().map( shown ), [ true, true ] );
	check( view, 'show_avatars', false );
	await flush();
	assert.deepEqual( rows().map( shown ), [ false, false ] );
} );

test( 'saving posts only the changed fields: checkboxes as booleans, numbers as numbers', async () => {
	let resolve;
	api.respondWith( () => new Promise( ( done ) => ( resolve = done ) ) );
	const { view, dirty, added } = render();
	await flush();
	check( view, 'default_comment_status', false );
	check( view, 'comment_moderation', true );
	type( view, 'comments_per_page', '20' );
	type( view, 'close_comments_days_old', '' );
	choose( view, 'thread_comments_depth', '7' );
	choose( view, 'default_comments_page', 'oldest' );
	choose( view, 'comment_order', 'desc' );
	type( view, 'moderation_keys', 'spam\neggs' );
	pick( view, 'avatar_rating', 'R' );
	pick( view, 'avatar_default', 'blank' );
	await flush();
	assert.equal( dirty.at( -1 ), true, 'Unsaved changes are reported.' );

	submit( view );
	await flush();
	assert.equal( find( view.container, byId( 'submit' ) ).props.disabled, true );
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/settings/discussion', payload: {
		default_comment_status: false,
		close_comments_days_old: '',
		thread_comments_depth: 7,
		comments_per_page: 20,
		default_comments_page: 'oldest',
		comment_order: 'desc',
		comment_moderation: true,
		moderation_keys: 'spam\neggs',
		avatar_rating: 'R',
		avatar_default: 'blank',
	} } );

	resolve( { ...settingsData( { default_comment_status: false, comment_moderation: true, comments_per_page: 20, close_comments_days_old: 0 } ), notices: [ { type: 'success', message: 'Settings saved.' } ] } );
	await flush();
	assert.deepEqual( added, [ { type: 'success', message: 'Settings saved.', dismissible: true, scope: 'page' } ] );
	assert.equal( dirty.at( -1 ), false, 'Saved.' );
	assert.equal( find( view.container, byId( 'default_comment_status' ) ).props.checked, false );
	assert.equal( find( view.container, byId( 'close_comments_days_old' ) ).props.value, 0 );
} );

test( 'state: what the classic form posts for the fields the controls cannot show', () => {
	const values = { default_comment_status: false, thread_comments_depth: 2, avatar_default: '', comments_per_page: 50 };
	assert.deepEqual( state.classicFields( values, { unshown: [ 'default_comment_status', 'thread_comments_depth', 'avatar_default', 'unknown' ] } ), { default_comment_status: false, thread_comments_depth: 2, avatar_default: '' } );
	assert.deepEqual( state.classicFields( values, { unshown: [] } ), {} );
	assert.deepEqual( state.classicFields( values, {} ), {} );
	assert.deepEqual( state.classicFields( values, { unshown: [] }, { avatarFromList: 'retro' } ), { avatar_default: 'retro' } );
	assert.deepEqual( state.classicFields( values, { unshown: [ 'avatar_default' ] }, { avatarFromList: '' } ), { avatar_default: '' } );

	assert.deepEqual( state.radiosIn( LIST_HTML, 'avatar_default' ), [ { value: 'mystery', checked: true }, { value: 'https://example.org/acme.png', checked: false } ] );
	assert.equal( state.checkedAvatarIn( LIST_HTML ), 'mystery' );
	assert.equal( state.checkedAvatarIn( LIST_HTML.replace( 'checked="checked" ', '' ) ), '', 'None checked: nothing is posted.' );
	assert.deepEqual( state.radiosIn( '<input type=radio name=avatar_default value=a checked><input type="checkbox" name="avatar_default" value="b">', 'avatar_default' ), [ { value: 'a', checked: true } ] );
	assert.equal( state.numberValue( '' ), '' );
	assert.equal( state.numberValue( ' 7 ' ), 7 );
	assert.deepEqual( state.controlIdsFor( settingsData() ), { avatar_rating: 'avatar_rating_G', avatar_default: 'avatar_mystery' } );
} );

test( 'stored values the controls cannot show are sent as shown at every save, as the classic form posts them', async () => {
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	const { view, dirty } = render( settingsData( {
		default_ping_status: false,
		thread_comments_depth: 2,
		avatar_rating: '',
		avatar_default: '',
		unshown: [ 'default_ping_status', 'thread_comments_depth', 'avatar_rating', 'avatar_default' ],
	} ) );
	await flush();
	assert.equal( dirty.at( -1 ), false, 'Nothing to warn about on load.' );
	assert.ok( findAll( rowOf( view.container, 'avatar_rating' ), ( el ) => el.tag === 'input' ).every( ( input ) => input.props.checked === false ), 'No rating checked.' );
	assert.ok( findAll( rowOf( view.container, 'avatar_default' ), ( el ) => el.tag === 'input' ).every( ( input ) => input.props.checked === false ), 'No avatar checked.' );
	type( view, 'comment_max_links', '3' );
	pick( view, 'avatar_rating', 'X' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { comment_max_links: 3, avatar_rating: 'X', default_ping_status: false, thread_comments_depth: 2, avatar_default: '' } );
} );

test( 'the classic avatar list of a plugin: its checked radio button gives the default avatar', async () => {
	api.respondWith( async () => ( { ...listData( { avatar_default: 'https://example.org/acme.png' } ), notices: [] } ) );
	const { view } = render( listData() );
	await flush();
	const row = rowOf( view.container, 'avatar_default' );
	const island = find( row, byClass( 'wp-admin-legacy-html' ) );
	assert.ok( island, 'The list is a LegacyHtml island inside the picker.' );
	assert.equal( find( row, ( el ) => el.tag === 'img' && hasClass( el, 'avatar-default' ) ), null, 'No native list.' );

	// Unchanged: the radio button the markup checks.
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { avatar_default: 'mystery', legacy: [], legacyNames: [] } );

	// The plugin's radio button is chosen.
	api.reset();
	api.respondWith( async () => ( { ...listData( { avatar_default: 'https://example.org/acme.png' } ), notices: [] } ) );
	const acme = { name: 'avatar_default', value: 'https://example.org/acme.png', checked: true, closest: ( selector ) => ( selector === '.wp-admin-legacy-html' ? {} : null ) };
	find( row, byClass( 'defaultavatarpicker' ) ).props.onChange( { target: acme } );
	await flush();
	submit( view );
	await flush();
	assert.equal( api.calls[ 0 ].payload.avatar_default, 'https://example.org/acme.png' );

	// In a document, the checked radio button of the list decides; none checked posts nothing.
	api.reset();
	api.respondWith( async () => ( { ...listData(), notices: [] } ) );
	const form = find( view.container, byTag( 'form' ) );
	form.querySelector = ( selector ) => ( selector.includes( ':checked' ) ? null : null );
	submit( view );
	await flush();
	assert.equal( api.calls[ 0 ].payload.avatar_default, '' );
} );

test( 'a failing avatar list filter shows a message instead of the list, and a save keeps the default avatar', async () => {
	const failed = listData( { avatar_default: 'https://example.org/acme.png', avatarHtml: '', legacySections: { sections: [], actions: noAction( { hooked: true, error: true } ), scripts: [], styles: [] } } );
	api.respondWith( async () => ( { ...failed, notices: [] } ) );
	const { view } = render( failed );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'wp-admin-legacy-failure' ) ) ), 'This setting could not be displayed.' );
	type( view, 'comment_max_links', '3' );
	const form = find( view.container, byTag( 'form' ) );
	form.querySelector = () => null;
	form.querySelectorAll = () => [];
	submit( view );
	await flush();
	assert.equal( 'avatar_default' in api.calls[ 0 ].payload, false, 'Nothing is sent for the default avatar: the stored one is kept.' );
	assert.equal( api.calls[ 0 ].payload.comment_max_links, 3 );
} );

test( 'with a failed avatar list, a default avatar the endpoint lists in unshown is not sent either', async () => {
	const failedActions = { sections: [], actions: noAction( { hooked: true, error: true } ), scripts: [], styles: [] };
	// A stored value that is not a choice (shown as none checked), and a missing one (shown as Mystery Person).
	for ( const shown of [ '', 'mystery' ] ) {
		api.reset();
		const failed = listData( { avatar_default: shown, unshown: [ 'avatar_default', 'thread_comments_depth' ], thread_comments_depth: 2, avatarHtml: '', legacySections: failedActions } );
		api.respondWith( async () => ( { ...failed, notices: [] } ) );
		const { view } = render( failed );
		await flush();
		const form = find( view.container, byTag( 'form' ) );
		form.querySelector = () => null;
		form.querySelectorAll = () => [];
		submit( view );
		await flush();
		assert.deepEqual( api.calls[ 0 ].payload, { thread_comments_depth: 2, legacy: [], legacyNames: [] }, 'shown ' + JSON.stringify( shown ) );
		unmountAll();
	}
	const failed = { unshown: [ 'avatar_default' ], avatarHtml: '', legacySections: failedActions };
	assert.deepEqual( state.classicFields( { avatar_default: '' }, failed ), {}, 'Not from unshown.' );
	assert.deepEqual( state.classicFields( { avatar_default: '' }, failed, { avatarFromList: 'retro' } ), {}, 'Not from the list.' );
	assert.equal( state.avatarListFailed( failed ), true );
	assert.equal( state.avatarListFailed( listData() ), false );
	assert.equal( state.avatarListFailed( settingsData() ), false );
} );

test( 'a number stored empty or not a number shows an empty input, and is saved as the classic form saves it', async () => {
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	const { view } = render( settingsData( { comments_per_page: '', unshown: [ 'comments_per_page' ] } ) );
	await flush();
	assert.equal( find( view.container, byId( 'comments_per_page' ) ).props.value, '' );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { comments_per_page: '' } );
} );

test( 'with a depth maximum below 2 the select has no levels and posts nothing', async () => {
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	const { view } = render( settingsData( { thread_comments_depth: '', unshown: [ 'thread_comments_depth' ], choices: { threadCommentsDepthMax: 1, avatarDefault: AVATARS } } ) );
	await flush();
	assert.deepEqual( options( find( view.container, byId( 'thread_comments_depth' ) ) ), [] );
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { thread_comments_depth: '' } );
} );

test( 'plugin fields of the default and avatars sections end their tables; sections follow the tables', async () => {
	const field = ( id ) => ( { id, title: 'Acme ' + id, html: '<input name="' + id + '" id="' + id + '" value="">', labelFor: id, class: '', error: false } );
	const { view } = render( settingsData( {
		legacySections: {
			sections: [
				{ id: 'default', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_default' ) ] },
				{ id: 'avatars', position: 'form-table', title: '', before: '', html: '', after: '', error: false, fields: [ field( 'acme_avatars' ) ] },
				{ id: 'acme_section', position: 'section', title: 'Acme Section', before: '', html: '<p>Intro</p>', after: '', error: false, fields: [] },
			],
			actions: noAction(),
			scripts: [],
			styles: [],
		},
	} ) );
	await flush();
	assert.deepEqual( rowIds( view.container ), [ 'default_post_settings', 'other_comment_settings', 'comment_pagination', 'email_me_whenever', 'before_comment_appears', 'comment_moderation_keys', 'disallowed_comment_keys', 'acme_default', 'avatar_display', 'avatar_rating', 'avatar_default', 'acme_avatars' ] );
	const tables = findAll( view.container, byClass( 'form-table' ) );
	const legacyRow = ( table, id ) => find( table, ( el ) => el.tag === 'tr' && el.props[ 'data-legacy-field' ] === id );
	assert.ok( legacyRow( tables[ 0 ], 'acme_default' ), 'The default section ends the main table.' );
	assert.ok( legacyRow( tables[ 1 ], 'acme_avatars' ), 'The avatars section ends the Avatars table.' );

	const order = find( view.container, byTag( 'form' ) ).children
		.filter( ( el ) => el.type === 'element' )
		.map( ( el ) => el.props[ 'data-legacy-section' ] ?? ( hasClass( el, 'form-table' ) ? 'table' : el.tag ) );
	assert.ok( order.lastIndexOf( 'table' ) < order.indexOf( 'acme_section' ), order.join( ', ' ) );
	assert.equal( order.at( -1 ), 'p', 'The submit button comes last.' );

	// Their values are posted with the save.
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );
	const form = find( view.container, byTag( 'form' ) );
	form.querySelectorAll = () => [ { tagName: 'INPUT', type: 'text', name: 'acme_avatars', value: 'blue', closest: () => ( {} ) } ];
	submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { legacy: [ { name: 'acme_avatars', value: 'blue' } ], legacyNames: [ 'acme_avatars' ] } );
} );

test( 'a refused parameter is shown beside its control and takes focus', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'rest_invalid_param', message: 'Invalid parameter(s): comments_per_page', data: { status: 400, params: { comments_per_page: 'comments_per_page is not of type integer,string.' } } } );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view } = render();
		await flush();
		type( view, 'comments_per_page', '3' );
		submit( view );
		await flush();
		const input = find( view.container, byId( 'comments_per_page' ) );
		assert.equal( input.props[ 'aria-invalid' ], 'true' );
		assert.equal( input.props[ 'aria-describedby' ], 'comments_per_page-error' );
		assert.equal( textOf( find( view.container, byId( 'comments_per_page-error' ) ) ), 'comments_per_page is not of type integer,string.' );
		assert.equal( input.props.value, 3, 'The input is kept.' );
		assert.deepEqual( focused, [ 'comments_per_page' ] );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'an error on a radio group focuses its first radio button', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'rest_invalid_param', message: 'Invalid parameter(s): avatar_rating', data: { status: 400, params: { avatar_rating: 'Not one of G, PG, R, X.' } } } );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view } = render();
		await flush();
		pick( view, 'avatar_rating', 'X' );
		submit( view );
		await flush();
		assert.deepEqual( focused, [ 'avatar_rating_G' ] );
		assert.equal( find( view.container, byId( 'avatar_rating_G' ) ).props[ 'aria-describedby' ], 'avatar_rating-error' );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'WordPress unreachable: a notice, and the input is kept', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added } = render();
	await flush();
	check( view, 'page_comments', true );
	submit( view );
	await flush();
	assert.equal( added[ 0 ].message, 'WordPress cannot be reached right now. Please try again in a moment.' );
	assert.equal( find( view.container, byId( 'page_comments' ) ).props.checked, true );
} );

test( 'slot modules get the values, setValue and the errors', async () => {
	const Slot = defineComponent( {
		props: [ 'values', 'setValue', 'errors' ],
		setup: ( props ) => () => h( 'p', { class: 'slot-module' }, 'Per page: ' + props.values.comments_per_page ),
	} );
	globalThis.__modules[ '/m/od-slot.js' ] = { default: Slot };
	loader.applyImportMap( { 'od-slot': '/m/od-slot.js' } );
	contracts.configure( { replacements: {}, slots: { 'core/options-discussion': { 'after-fields': [ { module: 'od-slot' } ] } } } );
	const { view } = render();
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Per page: 50' );
	type( view, 'comments_per_page', '12' );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'slot-module' ) ) ), 'Per page: 12' );
} );

test( 'a replacement of core/settings-field is used for every settings-field row', async () => {
	const Row = defineComponent( {
		props: [ 'id', 'label', 'description', 'locked', 'error', 'group', 'icon' ],
		setup: ( props, { slots } ) => () => h( 'tr', { class: 'replaced-row', 'data-field': props.id }, [ h( 'th', props.label ), h( 'td', slots.default?.() ) ] ),
	} );
	globalThis.__modules[ '/m/od-row.js' ] = { default: Row, implementsContract: { id: 'core/settings-field', version: '1.0.0' } };
	loader.applyImportMap( { 'od-row': '/m/od-row.js' } );
	contracts.configure( { replacements: { 'core/settings-field': { module: 'od-row', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	assert.equal( findAll( view.container, byClass( 'replaced-row' ) ).length, 10 );
	assert.ok( find( view.container, byId( 'comments_per_page' ) ), 'The controls are still rendered in it.' );
} );

test( 'a replacement of core/form-table is used for both tables', async () => {
	const Table = defineComponent( { setup: ( props, { slots } ) => () => h( 'table', { class: 'replaced-table' }, [ h( 'tbody', slots.default?.() ) ] ) } );
	globalThis.__modules[ '/m/od-table.js' ] = { default: Table, implementsContract: { id: 'core/form-table', version: '1.0.0' } };
	loader.applyImportMap( { 'od-table': '/m/od-table.js' } );
	contracts.configure( { replacements: { 'core/form-table': { module: 'od-table', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	assert.equal( findAll( view.container, byClass( 'replaced-table' ) ).length, 2 );
	assert.equal( find( view.container, byClass( 'form-table' ) ), null );
} );

test( 'a successful save emits saved with the settings', async () => {
	api.respondWith( async () => ( { ...settingsData( { comments_per_page: 5 } ), notices: [] } ) );
	const saved = [];
	const view = mount( () => h( Contracted, { id: 'core/options-discussion', data: settingsData(), page: { path: 'options-discussion.php' }, onSaved: ( value ) => saved.push( value ) } ), {
		provide: { notices: { add: () => null }, pageState: null },
	} );
	await flush();
	submit( view );
	await flush();
	assert.equal( saved.length, 1 );
	assert.equal( saved[ 0 ].comments_per_page, 5 );
	assert.equal( 'notices' in saved[ 0 ], false );
} );

// Help -------------------------------------------------------------------------------

const { help } = loaded[ 'options-discussion' ].component;
const paragraphs = ( view ) => findAll( view.container, byTag( 'p' ) ).map( textOf );

async function renderHelp( component ) {
	const view = mount( () => h( 'div', null, [ h( component ) ] ) );
	await flush();
	return view;
}

test( 'the page exports the classic help: the Overview tab and the sidebar', async () => {
	assert.deepEqual( mergeHelp( help, null, { path: 'options-discussion.php', data: settingsData() } ).tabs.map( ( tab ) => [ tab.id, tab.title ] ), [ [ 'overview', 'Overview' ] ] );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 0 ].component ) ), [
		'This screen provides many options for controlling the management and display of comments and links to your posts/pages. So many, in fact, they will not all fit here! :) Use the documentation links to get information on what each discussion setting does.',
		'You must click the Save Changes button at the bottom of the screen for new settings to take effect.',
	] );
	const sidebar = await renderHelp( help.sidebar );
	assert.deepEqual( paragraphs( sidebar ), [ 'For more information:', 'Documentation on Discussion Settings', 'Support forums' ] );
	assert.deepEqual( findAll( sidebar.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [ 'https://wordpress.org/documentation/article/settings-discussion-screen/', 'https://wordpress.org/support/forums/' ] );
} );

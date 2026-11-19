import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, focused, Vue } = await import( './helpers/render.mjs' );
const render = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );
const contractFile = await import( '../site/contracts/core/screen-options.js' );

const { h, reactive, defineComponent, inject, onBeforeUnmount, onMounted } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'frame', 'menu', 'admin-bar', 'notices', 'help-tabs', 'screen-options' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}

afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

const SECTIONS = [ {
	id: 'meta-boxes',
	legend: 'Screen elements',
	description: 'Some screen elements can be shown or hidden by using the checkboxes.',
	items: [
		{ id: 'dashboard_right_now', label: 'At a Glance', checked: true },
		{ id: 'dashboard_activity', label: 'Activity', checked: false },
	],
} ];

async function panelOnly( props = {}, listeners = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/screen-options', sections: SECTIONS, reordering: true, columns: null, ...props, ...listeners } ) );
	await flush();
	return view;
}

const toggle = ( view ) => find( view.container, byProp( 'id', 'show-settings-link' ) );
const panel = ( view ) => find( view.container, byClass( 'wp-admin-screen-options__panel' ) );
const checkbox = ( view, id ) => find( view.container, byProp( 'id', id ) );

// Contract ------------------------------------------------------------------------

test( 'the core/screen-options contract has its props, slots and events', () => {
	assert.deepEqual( Object.keys( contractFile ), [ 'default' ] );
	const contract = contractFile.default;
	assert.equal( contract.id, 'core/screen-options' );
	// 1.1.0: the list table options (columns, pagination, view mode, plugin settings) and `apply`.
	assert.equal( contract.version, '1.1.0' );
	assert.notEqual( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'sections', 'reordering', 'columns', 'tableColumns', 'pagination', 'viewMode', 'settingsHtml' ] );
	assert.equal( contract.props.sections.required, true );
	for ( const spec of Object.values( contract.props ) ) {
		assert.deepEqual( Object.keys( spec ).sort(), [ 'required', 'type' ] );
	}
	assert.deepEqual( Object.keys( contract.slots ), [ 'before', 'after' ] );
	assert.deepEqual( contract.emits, [ 'change', 'toggle', 'apply' ] );
} );

// The panel ------------------------------------------------------------------------

test( 'the panel shows each section as a fieldset of classic checkboxes, closed behind its toggle', async () => {
	const view = await panelOnly();
	const button = toggle( view );
	assert.equal( textOf( button ), 'Screen Options' );
	assert.equal( button.props[ 'aria-controls' ], 'screen-options-wrap' );
	assert.equal( button.props[ 'aria-expanded' ], 'false' );
	assert.equal( panel( view ).props.hidden, true );
	const wrap = find( view.container, byProp( 'id', 'screen-options-wrap' ) );
	assert.equal( wrap.props[ 'aria-label' ], 'Screen Options Tab' );

	const fieldset = find( view.container, ( el ) => el.tag === 'fieldset' && el.props[ 'data-section' ] === 'meta-boxes' );
	assert.ok( hasClass( fieldset, 'metabox-prefs' ) );
	assert.equal( textOf( find( fieldset, byTag( 'legend' ) ) ), 'Screen elements' );
	assert.equal( textOf( find( fieldset, byTag( 'p' ) ) ), 'Some screen elements can be shown or hidden by using the checkboxes.' );
	const labels = findAll( fieldset, byTag( 'label' ) );
	assert.deepEqual( labels.map( textOf ), [ 'At a Glance', 'Activity' ] );
	assert.equal( labels[ 0 ].props.for, 'dashboard_right_now-hide' );
	const input = checkbox( view, 'dashboard_right_now-hide' );
	assert.ok( hasClass( input, 'hide-postbox-tog' ) );
	assert.equal( input.props.value, 'dashboard_right_now' );
	assert.equal( input.props.checked, true );
	assert.equal( checkbox( view, 'dashboard_activity-hide' ).props.checked, false );
} );

test( 'the toggle opens the panel, moves focus to it and reports it', async () => {
	const toggles = [];
	const view = await panelOnly( {}, { onToggle: ( open ) => toggles.push( open ) } );
	toggle( view ).props.onClick();
	await flush();
	assert.equal( toggle( view ).props[ 'aria-expanded' ], 'true' );
	assert.ok( hasClass( toggle( view ), 'screen-meta-active' ) );
	assert.equal( panel( view ).props.hidden, false );
	assert.equal( render.focused?.props.id, 'screen-options-wrap' );
	toggle( view ).props.onClick();
	await flush();
	assert.equal( panel( view ).props.hidden, true );
	assert.deepEqual( toggles, [ true, false ] );
} );

test( 'each checkbox reports its change at once: item ids, the reordering switch and the layout, whose labels come as data', async () => {
	const changes = [];
	const view = await panelOnly( { columns: { value: 1, choices: [ { value: 1, label: '1 column' }, { value: 2, label: '2 columns' } ] } }, { onChange: ( id, value ) => changes.push( [ id, value ] ) } );
	checkbox( view, 'dashboard_activity-hide' ).props.onChange( { target: { checked: true } } );
	const reorder = checkbox( view, 'meta-box-reordering' );
	assert.ok( hasClass( reorder, 'meta-box-reordering-toggle' ) );
	assert.equal( reorder.props.checked, true );
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'meta-box-reordering' ) ), 'Allow screen elements to be rearranged' );
	reorder.props.onChange( { target: { checked: false } } );
	const layout = find( view.container, byClass( 'columns-prefs' ) );
	assert.equal( textOf( find( layout, byTag( 'legend' ) ) ), 'Layout' );
	const radios = findAll( layout, byTag( 'input' ) );
	assert.deepEqual( findAll( layout, byTag( 'label' ) ).map( ( label ) => textOf( label ).trim() ), [ '1 column', '2 columns' ] );
	assert.deepEqual( radios.map( ( radio ) => radio.props.checked ), [ true, false ] );
	radios[ 1 ].props.onChange();
	assert.deepEqual( changes, [ [ 'dashboard_activity', true ], [ 'meta-box-reordering', false ], [ 'screen_columns', 2 ] ] );
} );

test( 'without a reordering option or layout, those fieldsets are not shown', async () => {
	const view = await panelOnly( { reordering: null, columns: null } );
	assert.equal( checkbox( view, 'meta-box-reordering' ), null );
	assert.equal( find( view.container, byClass( 'additional-settings-prefs' ) ), null );
	assert.equal( find( view.container, byClass( 'columns-prefs' ) ), null );
} );

// In the frame ------------------------------------------------------------------------

let seq = 0;
function module( component, extra = {} ) {
	const specifier = 'so-m' + seq++;
	const url = '/m/' + specifier + '.js';
	globalThis.__modules[ url ] = { default: component, ...extra };
	loader.applyImportMap( { [ specifier ]: url } );
	return specifier;
}
const pageContract = ( id ) => ( { id, version: '1.0.0', props: {}, slots: {}, emits: [] } );
const MANIFEST = { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] };
const pageFor = ( path, component, extra = {} ) => ( { path, title: 'Title of ' + path, component, data: {}, textDomains: [], help: { tabs: [], sidebar: null }, ...extra } );

/** A page that gives the frame screen options, and records what the panel changes. */
function optionsPage( changes, options = {} ) {
	return defineComponent( {
		setup() {
			const screenOptions = inject( 'screenOptions' );
			let release = null;
			onMounted( () => {
				release = screenOptions.set( { sections: SECTIONS, reordering: true, columns: null, onChange: ( id, value ) => changes.push( [ id, value ] ), ...options } );
			} );
			onBeforeUnmount( () => release?.() );
			return () => h( 'p', { class: 'page-body' }, 'Body' );
		},
	} );
}

async function frame( page ) {
	const notices = createNotices( { reactive } );
	const pageRef = Vue.shallowRef( page );
	const view = mount( () => h( Contracted, { id: 'core/frame', manifest: MANIFEST, page: pageRef.value, current: pageRef.value.path, base: '/wp-admin/', siteName: 'S' } ), { provide: { notices } } );
	await flush();
	return { view, pageRef };
}

test( 'the frame shows Screen Options for a page that gives them, before Help, and passes the changes on', async () => {
	const changes = [];
	const specifier = module( optionsPage( changes ), { contract: pageContract( 'acme/options' ) } );
	const { view } = await frame( pageFor( 'acme.php', 'acme/options', { module: specifier, help: { tabs: [ { id: 'plugin', title: 'Plugin', content: '<p>Help</p>', priority: 10 } ], sidebar: null } } ) );
	const meta = find( view.container, byClass( 'wp-admin-screen-meta' ) );
	assert.ok( meta );
	const order = findAll( meta, ( el ) => el.props.id === 'show-settings-link' || el.props.id === 'contextual-help-link' ).map( ( el ) => el.props.id );
	assert.deepEqual( order, [ 'show-settings-link', 'contextual-help-link' ] );
	checkbox( view, 'dashboard_right_now-hide' ).props.onChange( { target: { checked: false } } );
	assert.deepEqual( changes, [ [ 'dashboard_right_now', false ] ] );

	toggle( view ).props.onClick();
	await flush();
	assert.ok( hasClass( find( view.container, byClass( 'wp-admin-screen-meta' ) ), 'wp-admin-screen-meta--screen-options-open' ), 'the Help toggle is hidden while Screen Options is open' );
	find( view.container, byProp( 'id', 'show-settings-link' ) ).props.onClick();
	find( view.container, byProp( 'id', 'contextual-help-link' ) ).props.onClick();
	await flush();
	assert.ok( hasClass( find( view.container, byClass( 'wp-admin-screen-meta' ) ), 'wp-admin-screen-meta--help-open' ) );
} );

test( 'the frame shows no Screen Options for a page that gives none, and drops them when the page goes', async () => {
	const plain = module( defineComponent( { render: () => h( 'p', 'Plain' ) } ), { contract: pageContract( 'acme/plain' ) } );
	const { view, pageRef } = await frame( pageFor( 'plain.php', 'acme/plain', { module: plain } ) );
	assert.equal( toggle( view ), null );
	assert.equal( find( view.container, byClass( 'wp-admin-screen-meta' ) ), null );

	const withOptions = module( optionsPage( [] ), { contract: pageContract( 'acme/with-options' ) } );
	pageRef.value = pageFor( 'options.php', 'acme/with-options', { module: withOptions } );
	await flush();
	assert.ok( toggle( view ) );

	pageRef.value = pageFor( 'plain.php', 'acme/plain', { module: plain } );
	await flush();
	assert.equal( toggle( view ), null, 'withdrawn with the page' );
} );

test( 'the frame announces speak() messages in a polite live region, the same one twice', async () => {
	let speak;
	const specifier = module( defineComponent( {
		setup() {
			speak = inject( 'speak' );
			return () => h( 'p', 'Speaker' );
		},
	} ), { contract: pageContract( 'acme/speaker' ) } );
	const { view } = await frame( pageFor( 'speak.php', 'acme/speaker', { module: specifier } ) );
	const region = () => find( view.container, byProp( 'id', 'wp-admin-speak' ) );
	assert.equal( region().props[ 'aria-live' ], 'polite' );
	assert.equal( region().props[ 'aria-relevant' ], 'additions text' );
	assert.ok( hasClass( region(), 'screen-reader-text' ) );
	speak( 'Screen Options updated.' );
	await flush();
	assert.equal( textOf( region() ), 'Screen Options updated.' );
	speak( 'Screen Options updated.' );
	await flush();
	assert.equal( textOf( region() ), 'Screen Options updated. ', 'changed, so that it is read again' );
} );

// List table options (1.1.0) -------------------------------------------------------------

const TABLE_COLUMNS = [
	{ key: 'author', label: 'Author', hidden: false },
	{ key: 'response', label: 'In response to', hidden: true },
	{ key: 'date', label: 'Submitted on', hidden: false },
];
const PAGINATION = { option: 'edit_comments_per_page', value: 20, label: 'Number of items per page:', min: 1, max: 999 };
const VIEW_MODE = { value: 'list', choices: [ { value: 'list', label: 'Compact view' }, { value: 'excerpt', label: 'Extended view' } ] };

async function listOptions( props = {}, listeners = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/screen-options', sections: [], tableColumns: TABLE_COLUMNS, pagination: PAGINATION, viewMode: VIEW_MODE, ...props, ...listeners } ) );
	await flush();
	return view;
}

test( 'the list table options are the classic Columns, Pagination and View mode fieldsets, with Apply', async () => {
	const view = await listOptions();
	const fieldsets = findAll( view.container, byTag( 'fieldset' ) );
	assert.deepEqual( fieldsets.map( ( el ) => textOf( find( el, byTag( 'legend' ) ) ) ), [ 'Columns', 'Pagination', 'View mode' ] );
	assert.ok( hasClass( fieldsets[ 0 ], 'metabox-prefs' ) );
	assert.ok( hasClass( fieldsets[ 1 ], 'screen-options' ) );
	assert.ok( hasClass( fieldsets[ 2 ], 'metabox-prefs' ) && hasClass( fieldsets[ 2 ], 'view-mode' ) );

	assert.deepEqual( findAll( fieldsets[ 0 ], byTag( 'label' ) ).map( textOf ), [ 'Author', 'In response to', 'Submitted on' ] );
	const response = checkbox( view, 'response-hide' );
	assert.ok( hasClass( response, 'hide-column-tog' ) );
	assert.equal( response.props.name, 'response-hide' );
	assert.equal( response.props.value, 'response' );
	assert.equal( response.props.checked, false, 'a hidden column is unchecked' );
	assert.equal( checkbox( view, 'author-hide' ).props.checked, true );

	const label = find( fieldsets[ 1 ], byTag( 'label' ) );
	assert.equal( label.props.for, 'edit_comments_per_page' );
	assert.equal( textOf( label ), 'Number of items per page:' );
	const perPage = checkbox( view, 'edit_comments_per_page' );
	assert.deepEqual( [ perPage.props.type, perPage.props.step, perPage.props.min, perPage.props.max, perPage.props.name, String( perPage.props.value ) ], [ 'number', '1', '1', '999', 'wp_screen_options[value]', '20' ] );
	assert.ok( hasClass( perPage, 'screen-per-page' ) && hasClass( perPage, 'small-text' ) );
	const hiddenOption = find( fieldsets[ 1 ], ( el ) => el.tag === 'input' && el.props.type === 'hidden' );
	assert.deepEqual( [ hiddenOption.props.name, hiddenOption.props.value ], [ 'wp_screen_options[option]', 'edit_comments_per_page' ] );

	const radios = findAll( fieldsets[ 2 ], byTag( 'input' ) );
	assert.deepEqual( radios.map( ( radio ) => [ radio.props.id, radio.props.name, radio.props.value, radio.props.checked ] ), [ [ 'list-view-mode', 'mode', 'list', true ], [ 'excerpt-view-mode', 'mode', 'excerpt', false ] ] );
	assert.deepEqual( findAll( fieldsets[ 2 ], byTag( 'label' ) ).map( ( el ) => textOf( el ).trim() ), [ 'Compact view', 'Extended view' ] );

	const apply = checkbox( view, 'screen-options-apply' );
	assert.deepEqual( [ apply.props.type, apply.props.name, apply.props.value ], [ 'submit', 'screen-options-apply', 'Apply' ] );
	assert.ok( hasClass( apply, 'button' ) && hasClass( apply, 'button-primary' ) );
	assert.ok( hasClass( apply.parent, 'submit' ) );
} );

test( 'a column checkbox reports its change at once; Apply reports the items per page and the view mode', async () => {
	const changes = [];
	const applied = [];
	const view = await listOptions( {}, { onChange: ( id, value ) => changes.push( [ id, value ] ), onApply: ( value ) => applied.push( value ) } );
	checkbox( view, 'response-hide' ).props.onChange( { target: { checked: true } } );
	checkbox( view, 'author-hide' ).props.onChange( { target: { checked: false } } );
	assert.deepEqual( changes, [ [ 'hide-column', { key: 'response', hidden: false } ], [ 'hide-column', { key: 'author', hidden: true } ] ] );
	assert.deepEqual( applied, [], 'nothing applied yet' );

	checkbox( view, 'edit_comments_per_page' ).props.onInput( { target: { value: '50' } } );
	checkbox( view, 'excerpt-view-mode' ).props.onChange( { target: { checked: true } } );
	const form = find( view.container, byProp( 'id', 'adv-settings' ) );
	form.props.onSubmit( { preventDefault() {} } );
	assert.deepEqual( applied, [ { perPage: 50, mode: 'excerpt' } ] );
	assert.deepEqual( changes.length, 2, 'per page and mode wait for Apply' );
} );

test( 'without pagination or a view mode, Apply reports null for them; without either there is no Apply', async () => {
	const applied = [];
	const view = await listOptions( { viewMode: null }, { onApply: ( value ) => applied.push( value ) } );
	find( view.container, byProp( 'id', 'adv-settings' ) ).props.onSubmit( { preventDefault() {} } );
	assert.deepEqual( applied, [ { perPage: 20, mode: null } ] );
	unmountAll();
	const bare = await listOptions( { pagination: null, viewMode: null } );
	assert.equal( checkbox( bare, 'screen-options-apply' ), null );
	assert.ok( checkbox( bare, 'author-hide' ), 'columns change at once, without Apply' );
} );

test( 'a pagination option without a label has only its hidden option field, as classic prints it', async () => {
	const view = await listOptions( { pagination: { ...PAGINATION, label: '' } } );
	assert.equal( checkbox( view, 'edit_comments_per_page' ), null );
	assert.ok( find( view.container, ( el ) => el.tag === 'input' && el.props.name === 'wp_screen_options[option]' ) );
} );

test( 'settingsHtml from screen_settings is shown after the view mode, as LegacyHtml', async () => {
	const view = await listOptions( { settingsHtml: '<fieldset class="acme"><legend>Acme</legend></fieldset>' } );
	const legacy = find( view.container, byClass( 'wp-admin-legacy-html' ) );
	assert.ok( legacy, 'the plugin\'s settings' );
	const form = find( view.container, byProp( 'id', 'adv-settings' ) );
	const order = findAll( form, ( el ) => el.tag === 'fieldset' || hasClass( el, 'wp-admin-legacy-html' ) || el.props.id === 'screen-options-apply' ).map( ( el ) => el.props.id ?? ( hasClass( el, 'wp-admin-legacy-html' ) ? 'settings' : el.tag ) );
	assert.deepEqual( order, [ 'fieldset', 'fieldset', 'fieldset', 'settings', 'screen-options-apply' ] );
} );

test( 'the frame shows a page\'s list table options and passes changes and Apply on', async () => {
	const changes = [];
	const applied = [];
	const specifier = module( defineComponent( {
		setup() {
			const screenOptions = inject( 'screenOptions' );
			let release = null;
			onMounted( () => {
				release = screenOptions.set( { tableColumns: TABLE_COLUMNS, pagination: PAGINATION, viewMode: VIEW_MODE, settingsHtml: null, onChange: ( id, value ) => changes.push( [ id, value ] ), onApply: ( value ) => applied.push( value ) } );
			} );
			onBeforeUnmount( () => release?.() );
			return () => h( 'p', 'List' );
		},
	} ), { contract: pageContract( 'acme/list' ) } );
	const { view } = await frame( pageFor( 'list.php', 'acme/list', { module: specifier } ) );
	assert.ok( toggle( view ), 'Screen Options shows for list table options alone' );
	checkbox( view, 'date-hide' ).props.onChange( { target: { checked: false } } );
	find( view.container, byProp( 'id', 'adv-settings' ) ).props.onSubmit( { preventDefault() {} } );
	assert.deepEqual( changes, [ [ 'hide-column', { key: 'date', hidden: true } ] ] );
	assert.deepEqual( applied, [ { perPage: 20, mode: 'list' } ] );
} );

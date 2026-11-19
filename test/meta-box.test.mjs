import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const render = await import( './helpers/render.mjs' );
const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = render;
const { flush, createFakeElement, enableQueries } = await import( './helpers/dom.mjs' );
const apiStub = await import( './helpers/api-stub.mjs' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );
const holderModule = await import( '../site/components/core/meta-box-holder.js' );
const { normaliseLayout, placeBox, stepBox, positions, emptyContainers, dropIndex, preferencesRoute } = holderModule;
const holderContract = await import( '../site/contracts/core/meta-box-holder.js' );
const boxContract = await import( '../site/contracts/core/meta-box.js' );

const { h, reactive, defineComponent, shallowRef } = Vue;

enableQueries();

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'frame', 'menu', 'admin-bar', 'notices', 'help-tabs', 'screen-options', 'meta-box', 'meta-box-holder' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}

// The screen the tests show: the Dashboard's four containers.
const BOXES = {
	dashboard_browser_nag: { id: 'dashboard_browser_nag', title: 'Your browser is out of date!', basename: 'Your browser is out of date!', classes: [ 'browser-nag' ], closed: false, hidden: false, pinned: true, warning: false },
	dashboard_right_now: { id: 'dashboard_right_now', title: 'At a Glance', basename: 'At a Glance', classes: [], closed: false, hidden: false, pinned: false, warning: false },
	dashboard_activity: { id: 'dashboard_activity', title: 'Activity', basename: 'Activity', classes: [], closed: false, hidden: true, pinned: false, warning: false },
	dashboard_quick_press: { id: 'dashboard_quick_press', title: 'Quick Draft <a href="https://example.org/drafts">Drafts</a>', basename: 'Quick Draft', classes: [ 'initial' ], closed: false, hidden: false, pinned: false, warning: false },
	dashboard_primary: { id: 'dashboard_primary', title: 'WordPress Events and News', basename: 'WordPress Events and News', classes: [], closed: true, hidden: false, pinned: false, warning: false },
	dashboard_php_nag: { id: 'dashboard_php_nag', title: 'PHP Update Recommended', basename: 'PHP Update Recommended', classes: [ 'php-insecure' ], closed: false, hidden: false, pinned: false, warning: true },
};
const LAYOUT = { contexts: {
	normal: [ 'dashboard_browser_nag', 'dashboard_right_now', 'dashboard_activity' ],
	side: [ 'dashboard_quick_press', 'dashboard_primary', 'dashboard_php_nag' ],
	column3: [],
	column4: [],
} };
const SECTIONS = [ { id: 'meta-boxes', legend: 'Screen elements', description: 'Some screen elements can be shown or hidden by using the checkboxes.', items: [
	{ id: 'dashboard_right_now', label: 'At a Glance', checked: true },
	{ id: 'dashboard_activity', label: 'Activity', checked: false },
	{ id: 'wp_welcome_panel', label: 'Welcome', checked: true },
] } ];

let spoken = [];
let screenOptions = null;
let view = null;
const ROUTE = preferencesRoute( 'dashboard' );

beforeEach( () => {
	spoken = [];
	screenOptions = null;
	globalThis.document = {
		createElement: createFakeElement,
		getElementById: ( id ) => ( view ? find( view.container, byProp( 'id', id ) ) : null ),
	};
} );

afterEach( () => {
	unmountAll();
	view = null;
	apiStub.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	delete globalThis.document;
	delete globalThis.jQuery;
} );

const provide = () => ( {
	speak: ( message ) => spoken.push( message ),
	screenOptions: { set: ( options ) => {
		screenOptions = options;
		return () => {
			if ( screenOptions === options ) {
				screenOptions = null;
			}
		};
	} },
} );

/** The test page: the holder with the Dashboard's ids, each box's content in its slot. */
async function holder( props = {}, listeners = {} ) {
	const slots = {};
	for ( const id of Object.keys( BOXES ) ) {
		slots[ id ] = () => h( 'p', { class: 'content-' + id }, 'Content of ' + id );
	}
	slots[ 'header-actions' ] = ( { box } ) => ( box.id === 'dashboard_primary' ? h( 'a', { class: 'configure', href: '#dashboard_primary' }, 'Configure' ) : null );
	view = mount( () => h( Contracted, { contract: 'core/meta-box-holder', id: 'dashboard-widgets', screen: 'dashboard', layout: LAYOUT, boxes: BOXES, reordering: true, columns: 0, sections: SECTIONS, columnChoices: [], ...props, ...listeners }, slots ), { provide: provide() } );
	await flush();
	return view;
}

const byId = ( id ) => find( view.container, byProp( 'id', id ) );
const idsIn = ( context ) => findAll( byId( context + '-sortables' ), byClass( 'postbox' ) ).map( ( el ) => el.props.id );
const button = ( id, name ) => find( byId( id ), byClass( name ) );
const preferenceCalls = () => apiStub.calls.filter( ( c ) => c.route === ROUTE ).map( ( c ) => [ c.method, c.payload ] );

// Contracts ---------------------------------------------------------------------------

test( 'the meta box contracts have their props, slots and events', () => {
	for ( const [ file, id ] of [ [ holderContract, 'core/meta-box-holder' ], [ boxContract, 'core/meta-box' ] ] ) {
		assert.deepEqual( Object.keys( file ), [ 'default' ] );
		const contract = file.default;
		assert.equal( contract.id, id );
		assert.equal( contract.version, '1.0.0' );
		assert.notEqual( contract.page, true );
		for ( const spec of Object.values( contract.props ) ) {
			assert.deepEqual( Object.keys( spec ).sort(), [ 'required', 'type' ] );
		}
		for ( const slot of Object.values( contract.slots ) ) {
			assert.deepEqual( Object.keys( slot ), [ 'props' ] );
		}
	}
	assert.deepEqual( Object.keys( holderContract.default.props ), [ 'id', 'screen', 'layout', 'boxes', 'reordering', 'columns', 'sections', 'columnChoices' ] );
	assert.deepEqual( Object.keys( holderContract.default.slots ), [ 'before-containers', 'after-containers' ] );
	assert.deepEqual( holderContract.default.emits, [ 'order', 'toggle', 'hide', 'reordering', 'columns', 'option' ] );
	assert.deepEqual( Object.keys( boxContract.default.props ), [ 'box', 'index', 'count', 'reordering' ] );
	assert.deepEqual( Object.keys( boxContract.default.slots ), [ 'default', 'header-actions' ] );
	assert.deepEqual( boxContract.default.emits, [ 'move', 'toggle' ] );
} );

// Pure parts ------------------------------------------------------------------------------

test( 'normaliseLayout keeps the contexts in order and each described box once', () => {
	assert.deepEqual( normaliseLayout( { contexts: { normal: [ 'a', 'gone', 'b', 'a' ], side: [ 'b', 'c', 7 ], empty: [] } }, { a: {}, b: {}, c: {} } ), {
		names: [ 'normal', 'side', 'empty' ],
		contexts: { normal: [ 'a', 'b' ], side: [ 'c' ], empty: [] },
	} );
	assert.deepEqual( normaliseLayout( null, {} ), { names: [], contexts: {} } );
} );

test( 'placeBox moves a box before another one, or to the end of a context', () => {
	const contexts = { normal: [ 'a', 'b' ], side: [ 'c' ] };
	assert.deepEqual( placeBox( contexts, 'a', 'side', 'c' ), { normal: [ 'b' ], side: [ 'a', 'c' ] } );
	assert.deepEqual( placeBox( contexts, 'a', 'side', null ), { normal: [ 'b' ], side: [ 'c', 'a' ] } );
	assert.deepEqual( placeBox( contexts, 'b', 'normal', 'a' ), { normal: [ 'b', 'a' ], side: [ 'c' ] } );
	assert.deepEqual( contexts, { normal: [ 'a', 'b' ], side: [ 'c' ] }, 'pure' );
} );

test( 'stepBox moves past the next shown box, across containers, and reports the edges', () => {
	const names = [ 'normal', 'side', 'column3' ];
	const contexts = { normal: [ 'a', 'hidden', 'b' ], side: [ 'c' ], column3: [] };
	const shown = ( id ) => id !== 'hidden';
	assert.deepEqual( stepBox( names, contexts, 'a', 1, { shown } ), { contexts: { normal: [ 'hidden', 'b', 'a' ], side: [ 'c' ], column3: [] } }, 'past the hidden box, after b' );
	assert.deepEqual( stepBox( names, contexts, 'b', -1, { shown } ), { contexts: { normal: [ 'b', 'a', 'hidden' ], side: [ 'c' ], column3: [] } } );
	assert.deepEqual( stepBox( names, contexts, 'b', 1, { shown } ), { contexts: { normal: [ 'a', 'hidden' ], side: [ 'b', 'c' ], column3: [] } }, 'to the start of the next container' );
	assert.deepEqual( stepBox( names, contexts, 'c', -1, { shown } ), { contexts: { normal: [ 'a', 'hidden', 'b', 'c' ], side: [], column3: [] } }, 'to the end of the previous container' );
	assert.deepEqual( stepBox( names, contexts, 'c', 1, { shown } ), { contexts: { normal: [ 'a', 'hidden', 'b' ], side: [], column3: [ 'c' ] } }, 'into an empty container' );
	assert.deepEqual( stepBox( names, contexts, 'c', 1, { shown, containerShown: ( name ) => name !== 'column3' } ), { edge: 'last' }, 'a container the width hides does not count' );
	assert.deepEqual( stepBox( names, contexts, 'a', -1, { shown } ), { edge: 'first' } );
	assert.equal( stepBox( names, contexts, 'nope', 1 ), null );
} );

test( 'positions count an empty first or last container as a position, and give hidden boxes -1', () => {
	const names = [ 'normal', 'side', 'column3' ];
	const shown = ( id ) => id !== 'hidden';
	const at = positions( names, { normal: [ 'a', 'hidden' ], side: [ 'b' ], column3: [] }, { shown } );
	assert.deepEqual( Object.fromEntries( at ), { a: { index: 0, count: 3 }, hidden: { index: -1, count: 3 }, b: { index: 1, count: 3 } } );
	const leading = positions( names, { normal: [], side: [ 'a', 'b' ], column3: [ 'c' ] } );
	assert.deepEqual( Object.fromEntries( leading ), { a: { index: 1, count: 4 }, b: { index: 2, count: 4 }, c: { index: 3, count: 4 } } );
	const hiddenLast = positions( names, { normal: [ 'a' ], side: [ 'b' ], column3: [] }, { containerShown: ( name ) => name !== 'column3' } );
	assert.deepEqual( Object.fromEntries( hiddenLast ), { a: { index: 0, count: 2 }, b: { index: 1, count: 2 } } );
} );

test( 'emptyContainers marks every container without a shown box, whatever its measured visibility', () => {
	const names = [ 'normal', 'side', 'column3' ];
	const hidesColumn3 = { containerShown: ( name ) => name !== 'column3' };
	assert.deepEqual( emptyContainers( names, { normal: [ 'a', 'b' ], side: [], column3: [] }, hidesColumn3 ), { empty: new Set( [ 'side', 'column3' ] ), allEmpty: false } );
	assert.deepEqual( emptyContainers( names, { normal: [ 'a' ], side: [], column3: [] }, hidesColumn3 ), { empty: new Set( [ 'column3' ] ), allEmpty: false }, 'one box shown: only the shown containers stay unmarked' );
	assert.deepEqual( emptyContainers( names, { normal: [], side: [], column3: [ 'a' ] }, hidesColumn3 ), { empty: new Set( [ 'normal', 'side' ] ), allEmpty: true }, 'a box in a hidden container does not count for allEmpty' );
} );

test( 'emptyContainers marks containers without a shown box, none when one box is shown in all', () => {
	const names = [ 'normal', 'side', 'column3' ];
	assert.deepEqual( emptyContainers( names, { normal: [ 'a', 'b' ], side: [], column3: [] } ), { empty: new Set( [ 'side', 'column3' ] ), allEmpty: false } );
	assert.deepEqual( emptyContainers( names, { normal: [ 'a' ], side: [], column3: [] } ), { empty: new Set(), allEmpty: false }, 'one box shown: postbox.js marks none' );
	assert.deepEqual( emptyContainers( names, { normal: [ 'a' ], side: [], column3: [] }, { shown: () => false } ), { empty: new Set( names ), allEmpty: true } );
} );

test( 'dropIndex lands before the first box whose middle is below the pointer', () => {
	const rects = [ { top: 0, height: 100 }, { top: 100, height: 100 } ];
	assert.equal( dropIndex( rects, 10 ), 0 );
	assert.equal( dropIndex( rects, 60 ), 1 );
	assert.equal( dropIndex( rects, 160 ), 2 );
	assert.equal( dropIndex( [], 5 ), 0 );
} );

// The box -----------------------------------------------------------------------------

test( 'a box is the classic postbox: region, heading, header buttons with tooltips, and its content inside', async () => {
	await holder();
	const box = byId( 'dashboard_quick_press' );
	assert.ok( hasClass( box, 'postbox' ) && hasClass( box, 'initial' ) );
	assert.equal( box.props.role, 'region' );
	assert.equal( box.props[ 'aria-label' ], 'Quick Draft <a href="https://example.org/drafts">Drafts</a>', 'outside a browser the markup is its own text' );
	const heading = byId( 'dashboard_quick_press-title' );
	assert.equal( heading.tag, 'h2' );
	assert.ok( hasClass( heading, 'hndle' ) );
	assert.equal( heading.props.draggable, 'true' );

	const actions = find( box, byClass( 'handle-actions' ) );
	assert.ok( hasClass( actions, 'hide-if-no-js' ) );
	const tooltips = findAll( actions, byClass( 'wp-tooltip' ) );
	assert.equal( tooltips.length, 3 );
	const [ up, down, toggle ] = tooltips.map( ( tooltip ) => find( tooltip, byTag( 'button' ) ) );
	assert.ok( hasClass( up, 'handle-order-higher' ) && hasClass( up, 'wp-tooltip__toggle' ) );
	assert.equal( up.props[ 'aria-label' ], 'Move up' );
	assert.equal( up.props[ 'aria-describedby' ], 'dashboard_quick_press-title' );
	assert.equal( textOf( find( up, byClass( 'screen-reader-text' ) ) ), 'Move up' );
	assert.ok( find( up, byClass( 'order-higher-indicator' ) ) );
	assert.equal( down.props[ 'aria-label' ], 'Move down' );
	assert.ok( hasClass( toggle, 'handlediv' ) );
	assert.equal( toggle.props[ 'aria-label' ], 'Show or hide panel' );
	assert.equal( toggle.props[ 'aria-expanded' ], 'true' );
	const bubble = find( tooltips[ 0 ], byClass( 'wp-tooltip__bubble' ) );
	assert.equal( bubble.props.popover, 'hint' );
	assert.equal( bubble.props.role, 'tooltip' );
	assert.equal( bubble.props.id, 'dashboard_quick_press-handle-order-higher-description' );
	assert.equal( textOf( bubble ), 'Move up' );
	assert.ok( hasClass( bubble, 'hidden' ), 'hidden where popovers are not supported' );
	assert.equal( find( tooltips[ 2 ], byClass( 'wp-tooltip__bubble' ) ).props.id, 'dashboard_quick_press-handlediv' );

	assert.equal( textOf( find( box, byClass( 'inside' ) ) ), 'Content of dashboard_quick_press' );
	assert.ok( hasClass( byId( 'dashboard_primary' ), 'closed' ) );
	assert.equal( button( 'dashboard_primary', 'handlediv' ).props[ 'aria-expanded' ], 'false' );
	assert.ok( find( find( byId( 'dashboard_primary' ), byClass( 'postbox-header' ) ), byClass( 'configure' ) ), 'header-actions from the page' );
} );

test( 'the warning box has the icon and hidden text; the pinned box has no buttons and cannot be toggled', async () => {
	await holder();
	const heading = byId( 'dashboard_php_nag-title' );
	assert.ok( find( heading, byClass( 'dashicons-warning' ) ) );
	assert.equal( textOf( find( heading, byClass( 'screen-reader-text' ) ) ), 'Warning: ' );
	const nag = byId( 'dashboard_browser_nag' );
	assert.equal( find( nag, byClass( 'handle-actions' ) ), null );
	assert.equal( byId( 'dashboard_browser_nag-title' ).props.draggable, null );
	byId( 'dashboard_browser_nag-title' ).props.onClick( { target: byId( 'dashboard_browser_nag-title' ) } );
	await flush();
	assert.ok( ! hasClass( byId( 'dashboard_browser_nag' ), 'closed' ) );
	assert.deepEqual( preferenceCalls(), [] );
} );

test( 'the move buttons are aria-disabled on the first and last position only', async () => {
	await holder( { layout: { contexts: { normal: [ 'dashboard_right_now', 'dashboard_quick_press' ], side: [ 'dashboard_primary' ] } } } );
	assert.equal( button( 'dashboard_right_now', 'handle-order-higher' ).props[ 'aria-disabled' ], 'true' );
	assert.equal( button( 'dashboard_right_now', 'handle-order-lower' ).props[ 'aria-disabled' ], 'false' );
	assert.equal( button( 'dashboard_quick_press', 'handle-order-higher' ).props[ 'aria-disabled' ], 'false' );
	assert.equal( button( 'dashboard_primary', 'handle-order-lower' ).props[ 'aria-disabled' ], 'true' );
} );

// The holder -----------------------------------------------------------------------------

test( 'the holder shows the classic containers with each box in its place, and the empty ones marked', async () => {
	await holder();
	const root = find( view.container, byClass( 'wp-admin-meta-boxes' ) );
	assert.ok( hasClass( root, 'js' ) );
	assert.ok( ! hasClass( root, 'meta-box-reordering-disabled' ) );
	const holderEl = byId( 'dashboard-widgets' );
	assert.ok( hasClass( holderEl, 'metabox-holder' ) );
	assert.ok( ! holderEl.props.class.includes( 'columns-' ) );
	assert.deepEqual( findAll( holderEl, byClass( 'postbox-container' ) ).map( ( el ) => el.props.id ), [ 'postbox-container-1', 'postbox-container-2', 'postbox-container-3', 'postbox-container-4' ] );
	assert.deepEqual( idsIn( 'normal' ), [ 'dashboard_browser_nag', 'dashboard_right_now', 'dashboard_activity' ] );
	assert.deepEqual( idsIn( 'side' ), [ 'dashboard_quick_press', 'dashboard_primary', 'dashboard_php_nag' ] );
	assert.ok( hasClass( byId( 'dashboard_activity' ), 'hide-if-js' ) );
	for ( const name of [ 'normal', 'side' ] ) {
		assert.ok( ! hasClass( byId( name + '-sortables' ), 'empty-container' ) );
		assert.equal( byId( name + '-sortables' ).props[ 'data-emptystring' ], null );
	}
	for ( const name of [ 'column3', 'column4' ] ) {
		assert.ok( hasClass( byId( name + '-sortables' ), 'empty-container' ) );
		assert.equal( byId( name + '-sortables' ).props[ 'data-emptystring' ], 'Drag boxes here' );
	}
} );

test( 'with every box hidden the containers say to add boxes from Screen Options; columns-N is set when chosen', async () => {
	const hiddenBoxes = Object.fromEntries( Object.entries( BOXES ).map( ( [ id, box ] ) => [ id, { ...box, hidden: true } ] ) );
	await holder( { boxes: hiddenBoxes, columns: 2 } );
	assert.equal( byId( 'normal-sortables' ).props[ 'data-emptystring' ], 'Add boxes from the Screen Options menu' );
	assert.ok( hasClass( byId( 'dashboard-widgets' ), 'columns-2' ) );
} );

test( 'toggling a box closes it and saves the complete closed and hidden lists, then announces it', async () => {
	const toggles = [];
	const events = [];
	const triggered = [];
	globalThis.jQuery = ( target ) => ( { target, trigger: ( type, arg ) => triggered.push( [ target, type, arg.target ] ) } );
	await holder( {}, { onToggle: ( id, closed ) => toggles.push( [ id, closed ] ) } );
	byId( 'dashboard_right_now' ).dispatchEvent = ( event ) => events.push( [ event.type, event.detail, event.bubbles ] );
	button( 'dashboard_right_now', 'handlediv' ).props.onClick();
	await flush();
	assert.ok( hasClass( byId( 'dashboard_right_now' ), 'closed' ) );
	assert.equal( button( 'dashboard_right_now', 'handlediv' ).props[ 'aria-expanded' ], 'false' );
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { closed: [ 'dashboard_right_now', 'dashboard_primary' ], hidden: [ 'dashboard_activity' ] } ] ] );
	assert.deepEqual( spoken, [ 'Screen Options updated.' ] );
	assert.deepEqual( toggles, [ [ 'dashboard_right_now', true ] ] );
	assert.deepEqual( events, [ [ 'postbox-toggled', { id: 'dashboard_right_now', closed: true, hidden: false }, false ] ] );
	assert.deepEqual( triggered, [ [ globalThis.document, 'postbox-toggled', byId( 'dashboard_right_now' ) ] ] );

	// The heading toggles too, but not a link in it.
	// (Outside a browser InlineMarkup shows the title as text: a link stands in for the one in it.)
	byId( 'dashboard_quick_press-title' ).props.onClick( { target: { closest: ( selector ) => ( selector === 'a' ? { tag: 'a' } : null ) } } );
	await flush();
	assert.ok( ! hasClass( byId( 'dashboard_quick_press' ), 'closed' ) );
	byId( 'dashboard_quick_press-title' ).props.onClick( { target: byId( 'dashboard_quick_press-title' ) } );
	await flush();
	assert.ok( hasClass( byId( 'dashboard_quick_press' ), 'closed' ) );
	assert.deepEqual( preferenceCalls()[ 1 ], [ 'POST', { closed: [ 'dashboard_right_now', 'dashboard_quick_press', 'dashboard_primary' ], hidden: [ 'dashboard_activity' ] } ] );
} );

test( 'a failed save is not announced', async ( t ) => {
	t.mock.method( console, 'warn', () => {} );
	apiStub.respondWith( async () => {
		throw new Error( 'unreachable' );
	} );
	await holder();
	button( 'dashboard_right_now', 'handlediv' ).props.onClick();
	await flush();
	assert.equal( preferenceCalls().length, 1 );
	assert.deepEqual( spoken, [] );
} );

test( 'the holder gives the frame its Screen Options; a box checkbox hides or shows the box and saves', async () => {
	const hides = [];
	await holder( {}, { onHide: ( id, hidden ) => hides.push( [ id, hidden ] ) } );
	assert.equal( screenOptions.reordering, true );
	assert.equal( screenOptions.columns, null, 'no layout choice without columnChoices' );
	assert.deepEqual( screenOptions.sections[ 0 ].items.map( ( item ) => [ item.id, item.checked ] ), [ [ 'dashboard_right_now', true ], [ 'dashboard_activity', false ], [ 'wp_welcome_panel', true ] ] );

	screenOptions.onChange( 'dashboard_right_now', false );
	await flush();
	assert.ok( hasClass( byId( 'dashboard_right_now' ), 'hide-if-js' ) );
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { closed: [ 'dashboard_primary' ], hidden: [ 'dashboard_right_now', 'dashboard_activity' ] } ] ] );
	assert.deepEqual( spoken, [ 'Screen Options updated.' ] );
	assert.equal( screenOptions.sections[ 0 ].items[ 0 ].checked, false, 'the panel follows' );

	screenOptions.onChange( 'dashboard_activity', true );
	await flush();
	assert.ok( ! hasClass( byId( 'dashboard_activity' ), 'hide-if-js' ) );
	assert.deepEqual( preferenceCalls()[ 1 ], [ 'POST', { closed: [ 'dashboard_primary' ], hidden: [ 'dashboard_right_now' ] } ] );
	assert.deepEqual( hides, [ [ 'dashboard_right_now', true ], [ 'dashboard_activity', false ] ] );
} );

test( 'the reordering switch saves reordering alone and announces it; reordering off disables moves and drags', async () => {
	const changes = [];
	await holder( {}, { onReordering: ( enabled ) => changes.push( enabled ) } );
	screenOptions.onChange( 'meta-box-reordering', false );
	await flush();
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { reordering: false } ] ] );
	assert.deepEqual( spoken, [ 'Rearranging screen elements disabled.' ] );
	assert.deepEqual( changes, [ false ] );
	assert.ok( hasClass( find( view.container, byClass( 'wp-admin-meta-boxes' ) ), 'meta-box-reordering-disabled' ) );
	assert.equal( byId( 'dashboard_right_now-title' ).props.draggable, null );
	assert.ok( hasClass( byId( 'dashboard_right_now-title' ), 'is-non-sortable' ) );
	assert.equal( screenOptions.reordering, false );

	button( 'dashboard_right_now', 'handle-order-lower' ).props.onClick();
	await flush();
	assert.equal( preferenceCalls().length, 1, 'no move' );

	screenOptions.onChange( 'meta-box-reordering', true );
	await flush();
	assert.deepEqual( preferenceCalls()[ 1 ], [ 'POST', { reordering: true } ] );
	assert.deepEqual( spoken.at( -1 ), 'Rearranging screen elements enabled.' );
} );

test( 'moving a box saves every context\'s complete order with the columns, keeps its content and focus', async () => {
	const orders = [];
	await holder( {}, { onOrder: ( contexts ) => orders.push( contexts ) } );
	const content = find( view.container, byClass( 'content-dashboard_right_now' ) );
	// Last shown box of normal (Activity is hidden): to the start of side.
	button( 'dashboard_right_now', 'handle-order-lower' ).props.onClick();
	await flush();
	const order = { normal: [ 'dashboard_browser_nag', 'dashboard_activity' ], side: [ 'dashboard_right_now', 'dashboard_quick_press', 'dashboard_primary', 'dashboard_php_nag' ], column3: [], column4: [] };
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { order, columns: 0 } ] ] );
	assert.deepEqual( orders, [ order ] );
	assert.deepEqual( spoken, [ 'The boxes order has been saved.' ] );
	assert.deepEqual( idsIn( 'side' ), [ 'dashboard_right_now', 'dashboard_quick_press', 'dashboard_primary', 'dashboard_php_nag' ] );
	assert.deepEqual( idsIn( 'normal' ), [ 'dashboard_browser_nag', 'dashboard_activity' ] );
	assert.equal( find( view.container, byClass( 'content-dashboard_right_now' ) ), content, 'the same content, moved, not rendered again' );
	assert.equal( render.focused, button( 'dashboard_right_now', 'handle-order-lower' ), 'focus stays on the button' );

	button( 'dashboard_quick_press', 'handle-order-higher' ).props.onClick();
	await flush();
	assert.deepEqual( idsIn( 'side' ), [ 'dashboard_quick_press', 'dashboard_right_now', 'dashboard_primary', 'dashboard_php_nag' ] );
	assert.equal( render.focused, button( 'dashboard_quick_press', 'handle-order-higher' ) );
} );

test( 'on the first or last position a move announces it and saves nothing', async () => {
	await holder( { layout: { contexts: { normal: [ 'dashboard_right_now' ], side: [ 'dashboard_primary' ] } } } );
	button( 'dashboard_right_now', 'handle-order-higher' ).props.onClick();
	button( 'dashboard_primary', 'handle-order-lower' ).props.onClick();
	await flush();
	assert.deepEqual( spoken, [ 'The box is on the first position', 'The box is on the last position' ] );
	assert.deepEqual( preferenceCalls(), [] );
} );

test( 'a column the width hides is skipped by a move', async () => {
	await holder( { layout: { contexts: { normal: [ 'dashboard_right_now' ], side: [ 'dashboard_primary' ], column3: [] } } } );
	const hidden = byId( 'column3-sortables' );
	hidden.offsetWidth = 0;
	hidden.offsetHeight = 0;
	hidden.getClientRects = () => [];
	button( 'dashboard_primary', 'handle-order-lower' ).props.onClick();
	await flush();
	assert.deepEqual( spoken, [ 'The box is on the last position' ] );
	assert.equal( button( 'dashboard_primary', 'handle-order-lower' ).props[ 'aria-disabled' ], 'true' );
} );

test( 'empty columns that WordPress\'s styles hide by their empty-container class stay marked, and moves skip them', async () => {
	await holder();
	// dashboard.css: an empty third or fourth column is not displayed at some widths.
	for ( const name of [ 'column3', 'column4' ] ) {
		const element = byId( name + '-sortables' );
		const displayed = () => ! hasClass( element, 'empty-container' );
		Object.defineProperty( element, 'offsetWidth', { get: () => ( displayed() ? 300 : 0 ), configurable: true } );
		Object.defineProperty( element, 'offsetHeight', { get: () => ( displayed() ? 250 : 0 ), configurable: true } );
		element.getClientRects = () => ( displayed() ? [ {} ] : [] );
	}
	// Hiding a box measures the containers again.
	screenOptions.onChange( 'dashboard_right_now', false );
	await flush();
	for ( const name of [ 'column3', 'column4' ] ) {
		assert.ok( hasClass( byId( name + '-sortables' ), 'empty-container' ), name + ' keeps its mark while hidden' );
	}
	assert.equal( button( 'dashboard_php_nag', 'handle-order-lower' ).props[ 'aria-disabled' ], 'true' );
	button( 'dashboard_php_nag', 'handle-order-lower' ).props.onClick();
	await flush();
	assert.equal( spoken.at( -1 ), 'The box is on the last position', 'as on a classic screen' );
	assert.deepEqual( idsIn( 'column3' ), [] );

	// The reordering switch measures them again too.
	screenOptions.onChange( 'meta-box-reordering', false );
	await flush();
	assert.ok( hasClass( byId( 'column3-sortables' ), 'empty-container' ) );
} );

test( 'a box\'s Dismiss link hides the box and saves, as its Screen Options checkbox does', async () => {
	await holder();
	const nag = byId( 'dashboard_browser_nag' );
	const link = createFakeElement( 'a' );
	link.setAttribute( 'class', 'dismiss' );
	find( nag, byClass( 'inside' ) ).appendChild( link );
	let prevented = false;
	find( view.container, byClass( 'wp-admin-meta-boxes' ) ).props.onClick( { target: link, preventDefault: () => {
		prevented = true;
	} } );
	await flush();
	assert.ok( prevented );
	assert.ok( hasClass( byId( 'dashboard_browser_nag' ), 'hide-if-js' ) );
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { closed: [ 'dashboard_primary' ], hidden: [ 'dashboard_browser_nag', 'dashboard_activity' ] } ] ] );
	assert.deepEqual( spoken, [ 'Screen Options updated.' ] );

	// Other clicks do nothing.
	find( view.container, byClass( 'wp-admin-meta-boxes' ) ).props.onClick( { target: byId( 'dashboard_right_now-title' ), preventDefault() {} } );
	await flush();
	assert.equal( preferenceCalls().length, 1 );
} );

test( 'without the frame\'s speak(), announcements go to wp.a11y.speak() when it is loaded', async () => {
	const heard = [];
	globalThis.wp = { a11y: { speak: ( message ) => heard.push( message ) } };
	try {
		view = mount( () => h( Contracted, { contract: 'core/meta-box-holder', screen: 'dashboard', layout: LAYOUT, boxes: BOXES }, {} ) );
		await flush();
		button( 'dashboard_right_now', 'handlediv' ).props.onClick();
		await flush();
		assert.deepEqual( heard, [ 'Screen Options updated.' ] );
	} finally {
		delete globalThis.wp;
	}
} );

test( 'the layout choice sets columns-N and saves the order with the columns', async () => {
	const counts = [];
	const choices = [ 1, 2, 3, 4 ].map( ( value ) => ( { value, label: value + ( value === 1 ? ' column' : ' columns' ) } ) );
	await holder( { columnChoices: choices }, { onColumns: ( count ) => counts.push( count ) } );
	assert.deepEqual( screenOptions.columns, { value: 0, choices } );
	screenOptions.onChange( 'screen_columns', 2 );
	await flush();
	assert.ok( hasClass( byId( 'dashboard-widgets' ), 'columns-2' ) );
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { order: LAYOUT.contexts, columns: 2 } ] ] );
	assert.deepEqual( counts, [ 2 ] );
	assert.deepEqual( screenOptions.columns, { value: 2, choices } );
} );

test( 'a Screen Options change that is not the holder\'s goes to the page', async () => {
	const options = [];
	await holder( {}, { onOption: ( id, value ) => options.push( [ id, value ] ) } );
	screenOptions.onChange( 'wp_welcome_panel', false );
	await flush();
	assert.deepEqual( options, [ [ 'wp_welcome_panel', false ] ] );
	assert.deepEqual( preferenceCalls(), [] );
} );

/** Gives each shown box a rect, stacked 100px high in its container, for a drag. */
function stack() {
	for ( const name of [ 'normal', 'side' ] ) {
		findAll( byId( name + '-sortables' ), byClass( 'postbox' ) ).filter( ( el ) => ! hasClass( el, 'hide-if-js' ) ).forEach( ( el, index ) => {
			el.getBoundingClientRect = () => ( { top: index * 100, height: 100, left: 0 } );
		} );
	}
}
const dataTransfer = () => ( { data: {}, setData( type, value ) {
	this.data[ type ] = value;
}, setDragImage() {} } );

test( 'dragging a box by its heading shows a placeholder where it lands and saves the order on drop', async () => {
	await holder();
	stack();
	const root = find( view.container, byClass( 'wp-admin-meta-boxes' ) );
	const transfer = dataTransfer();
	root.props.onDragstart( { target: byId( 'dashboard_right_now-title' ), dataTransfer: transfer, clientX: 5, clientY: 5 } );
	await flush();
	assert.equal( transfer.data[ 'text/plain' ], 'dashboard_right_now' );
	assert.equal( transfer.effectAllowed, 'move' );
	assert.ok( hasClass( find( view.container, byClass( 'wp-admin-meta-boxes' ) ), 'is-dragging-metaboxes' ) );

	let prevented = false;
	byId( 'side-sortables' ).props.onDragover( { clientY: 120, dataTransfer: transfer, preventDefault: () => {
		prevented = true;
	} } );
	assert.ok( prevented, 'the container accepts the drop' );
	const side = byId( 'side-sortables' );
	const placeholder = find( side, byClass( 'sortable-placeholder' ) );
	assert.ok( placeholder );
	assert.equal( placeholder.props.style, 'height: 100px' );
	assert.deepEqual( side.childNodes.map( ( node ) => node.props[ 'data-box' ] ?? node.props.class ), [ 'dashboard_quick_press', 'sortable-placeholder', 'dashboard_primary', 'dashboard_php_nag' ] );

	const events = [];
	const triggered = [];
	byId( 'dashboard_right_now' ).dispatchEvent = ( event ) => events.push( [ event.type, event.detail, event.bubbles ] );
	globalThis.jQuery = ( target ) => ( { target, trigger: ( type, arg ) => triggered.push( [ type, arg.target ] ) } );
	side.props.onDrop( { clientY: 120, dataTransfer: transfer, preventDefault() {} } );
	root.props.onDragend();
	await flush();
	assert.deepEqual( events, [ [ 'postbox-moved', { id: 'dashboard_right_now', from: 'normal', to: 'side' }, false ] ] );
	assert.deepEqual( triggered, [ [ 'postbox-moved', byId( 'dashboard_right_now' ) ] ] );
	assert.equal( find( view.container, byClass( 'sortable-placeholder' ) ), null );
	assert.ok( ! hasClass( find( view.container, byClass( 'wp-admin-meta-boxes' ) ), 'is-dragging-metaboxes' ) );
	assert.deepEqual( idsIn( 'side' ), [ 'dashboard_quick_press', 'dashboard_right_now', 'dashboard_primary', 'dashboard_php_nag' ] );
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { order: { normal: [ 'dashboard_browser_nag', 'dashboard_activity' ], side: [ 'dashboard_quick_press', 'dashboard_right_now', 'dashboard_primary', 'dashboard_php_nag' ], column3: [], column4: [] }, columns: 0 } ] ] );
	assert.deepEqual( spoken, [ 'The boxes order has been saved.' ] );
} );

test( 'nothing lands before the pinned box; the pinned box and a box with reordering off do not drag', async () => {
	await holder();
	stack();
	const root = find( view.container, byClass( 'wp-admin-meta-boxes' ) );
	root.props.onDragstart( { target: byId( 'dashboard_quick_press-title' ), dataTransfer: dataTransfer(), clientX: 0, clientY: 0 } );
	byId( 'normal-sortables' ).props.onDragover( { clientY: 10, preventDefault() {} } );
	assert.equal( find( byId( 'normal-sortables' ), byClass( 'sortable-placeholder' ) ), null );
	byId( 'normal-sortables' ).props.onDrop( { clientY: 10, preventDefault() {} } );
	await flush();
	assert.deepEqual( preferenceCalls(), [], 'cancelled' );

	root.props.onDragstart( { target: byId( 'dashboard_browser_nag-title' ), dataTransfer: dataTransfer(), clientX: 0, clientY: 0 } );
	byId( 'side-sortables' ).props.onDragover( { clientY: 10, preventDefault() {} } );
	assert.equal( find( view.container, byClass( 'sortable-placeholder' ) ), null, 'the pinned box does not drag' );
} );

test( 'new layout data from the page is shown as it comes', async () => {
	const layout = shallowRef( LAYOUT );
	view = mount( () => h( Contracted, { contract: 'core/meta-box-holder', screen: 'dashboard', layout: layout.value, boxes: BOXES }, {} ), { provide: provide() } );
	await flush();
	layout.value = { contexts: { normal: [ 'dashboard_php_nag' ], side: [ 'dashboard_right_now' ] } };
	await flush();
	assert.deepEqual( idsIn( 'normal' ), [ 'dashboard_php_nag' ] );
	assert.deepEqual( idsIn( 'side' ), [ 'dashboard_right_now' ] );
	assert.equal( byId( 'column3-sortables' ), null );
	assert.equal( byId( 'dashboard_quick_press' ), null );
} );

test( 'without a document the boxes render in their containers', async () => {
	delete globalThis.document;
	view = mount( () => h( Contracted, { contract: 'core/meta-box-holder', screen: 'dashboard', layout: LAYOUT, boxes: BOXES }, {} ), { provide: provide() } );
	await flush();
	assert.deepEqual( idsIn( 'side' ), [ 'dashboard_quick_press', 'dashboard_primary', 'dashboard_php_nag' ] );
} );

// The test page in the frame -----------------------------------------------------------

test( 'a page with meta boxes in the frame: Screen Options lists the boxes and hides one', async () => {
	const Page = defineComponent( {
		props: [ 'data', 'page' ],
		setup: () => () => h( Contracted, { contract: 'core/meta-box-holder', id: 'dashboard-widgets', screen: 'dashboard', layout: LAYOUT, boxes: BOXES, reordering: true, sections: SECTIONS }, {
			dashboard_right_now: () => h( 'p', { class: 'glance' }, 'Glance' ),
		} ),
	} );
	globalThis.__modules[ '/m/meta-box-page.js' ] = { default: Page, contract: { id: 'acme/meta-box-page', version: '1.0.0', props: {}, slots: {}, emits: [] } };
	loader.applyImportMap( { 'meta-box-page': '/m/meta-box-page.js' } );
	const notices = createNotices( { reactive } );
	const page = { path: 'index.php', title: 'Dashboard', component: 'acme/meta-box-page', module: 'meta-box-page', data: {}, textDomains: [], help: { tabs: [], sidebar: null } };
	view = mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page, current: page.path, base: '/wp-admin/' } ), { provide: { notices } } );
	await flush();
	assert.ok( byId( 'show-settings-link' ), 'the Screen Options toggle' );
	assert.equal( textOf( find( byId( 'dashboard_right_now' ), byClass( 'inside' ) ) ), 'Glance' );
	const checkbox = byId( 'dashboard_right_now-hide' );
	assert.equal( checkbox.props.checked, true );
	checkbox.props.onChange( { target: { checked: false } } );
	await flush();
	assert.ok( hasClass( byId( 'dashboard_right_now' ), 'hide-if-js' ) );
	assert.equal( byId( 'dashboard_right_now-hide' ).props.checked, false );
	assert.deepEqual( preferenceCalls(), [ [ 'POST', { closed: [ 'dashboard_primary' ], hidden: [ 'dashboard_right_now', 'dashboard_activity' ] } ] ] );
	assert.equal( textOf( byId( 'wp-admin-speak' ) ), 'Screen Options updated.' );
} );

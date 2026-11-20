import test, { afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { FakeDOMParser, FakeNode, FakeElement, fakeTemplateDocument, serialize } from './helpers/html-parser.mjs';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { useSelection } = await import( '../site/components/core/list-table-parts/selection.js' );
const { pagedPath } = await import( '../site/components/core/list-table-parts/pagination.js' );

const { h, ref, nextTick } = Vue;
const NAMES = [ 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav' ];

globalThis.__modules = globalThis.__modules ?? {};
const contractFiles = {};
for ( const name of NAMES ) {
	contractFiles[ name ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = contractFiles[ name ];
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}

let savedParser;
before( () => {
	savedParser = globalThis.DOMParser;
	globalThis.DOMParser = FakeDOMParser;
} );
after( () => {
	globalThis.DOMParser = savedParser;
} );
afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

// Comparing markup -------------------------------------------------------------------------

const squash = ( text ) => text.replace( /\s+/g, ' ' ).trim();
// Text nodes next to each other are one text (whitespace squashed), however they were split.
const TEXT = Symbol( 'text' );
const joinChildren = ( parts ) => {
	const out = [];
	for ( const part of parts ) {
		if ( typeof part === 'object' && part?.[ TEXT ] !== undefined ) {
			if ( typeof out[ out.length - 1 ] === 'object' ) {
				out[ out.length - 1 ][ TEXT ] += part[ TEXT ];
			} else {
				out.push( { [ TEXT ]: part[ TEXT ] } );
			}
		} else if ( part ) {
			out.push( part );
		}
	}
	return out.map( ( part ) => ( typeof part === 'object' ? squash( part[ TEXT ] ) : part ) ).filter( Boolean ).join( '' );
};
const sortedClasses = ( value ) => String( value ).split( /\s+/ ).filter( Boolean ).sort().join( ' ' );

/** A rendered fake element (helpers/dom.mjs) as a comparable string: tag, attributes sorted, children. */
function fromRendered( node ) {
	if ( node.type === 'text' ) {
		return { [ TEXT ]: node.text };
	}
	if ( node.type !== 'element' ) {
		return '';
	}
	const attributes = Object.entries( node.props )
		// A select's value is a DOM property, not an attribute.
		.filter( ( [ key, value ] ) => ! /^on[A-Z]/.test( key ) && typeof value !== 'function' && value !== null && value !== undefined && value !== false && key !== 'key' && key !== 'ref' && ! ( node.tag === 'select' && key === 'value' ) )
		.map( ( [ key, value ] ) => [ key, key === 'class' ? sortedClasses( value ) : value === true ? '' : String( value ) ] )
		.sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) )
		.filter( ( [ key, value ] ) => ! ( key === 'class' && value === '' ) );
	return '<' + node.tag + attributes.map( ( [ k, v ] ) => ' ' + k + '="' + v + '"' ).join( '' ) + '>' + joinChildren( node.children.map( fromRendered ) ) + '</' + node.tag + '>';
}

/** A parsed classic fixture (helpers/html-parser.mjs) as the same comparable string. */
function fromParsed( node ) {
	if ( node.nodeType === 3 ) {
		return { [ TEXT ]: node.nodeValue };
	}
	if ( node.nodeType !== 1 ) {
		return '';
	}
	const attributes = node.attributes
		.map( ( { name, value } ) => [ name, name === 'class' ? sortedClasses( value ) : value ] )
		.sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) );
	return '<' + node.localName + attributes.map( ( [ k, v ] ) => ' ' + k + '="' + v + '"' ).join( '' ) + '>' + joinChildren( node.childNodes.map( fromParsed ) ) + '</' + node.localName + '>';
}

/** The children of a classic fixture row, wrapped as `<tr>` so that the parser keeps them. */
const classic = ( html ) => joinChildren( new FakeDOMParser().parseFromString( html, 'text/html' ).body.childNodes.map( fromParsed ) );
const rendered = ( el ) => joinChildren( el.children.map( fromRendered ) );

// Data as wp_admin_list_table_columns() gives it -------------------------------------------------

const sortable = ( orderby, order, extra = {} ) => ( { orderby, initialDesc: false, abbr: null, description: null, url: 'edit-comments.php?orderby=' + orderby + '&order=' + order, ...extra } );
const COLUMNS = [
	{ key: 'cb', label: '', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'author', label: 'Author', primary: false, hidden: false, core: true, sortable: sortable( 'comment_author', 'asc' ), sorted: null },
	{ key: 'comment', label: 'Comment', primary: true, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'response', label: 'In response to', primary: false, hidden: true, core: true, sortable: sortable( 'comment_post_ID', 'desc', { initialDesc: true } ), sorted: null },
	{ key: 'date', label: 'Submitted on', primary: false, hidden: false, core: true, sortable: sortable( 'comment_date', 'asc', { abbr: 'Date', description: 'Ordered by Date.' } ), sorted: 'desc' },
	{ key: 'acme', label: '<em>Acme</em> &amp; Co', primary: false, hidden: false, core: false, sortable: null, sorted: null },
];

const INDICATORS = '<span class="sorting-indicators"><span class="sorting-indicator asc" aria-hidden="true"></span><span class="sorting-indicator desc" aria-hidden="true"></span></span>';

/** print_column_headers(), as WP_List_Table prints it for COLUMNS (`$with_id`, the select-all counter). */
const classicHeaders = ( withId, counter ) => {
	const id = ( key ) => ( withId ? ` id='${ key }'` : '' );
	return `
	<td ${ id( 'cb' ) } class='manage-column column-cb check-column'><input id="cb-select-all-${ counter }" type="checkbox" />
			<label for="cb-select-all-${ counter }"><span class="screen-reader-text">Select All</span></label></td>
	<th scope="col" ${ id( 'author' ) } class='manage-column column-author sortable desc'><a href="/wp-admin/edit-comments.php?orderby=comment_author&amp;order=asc"><span>Author</span>${ INDICATORS } <span class="screen-reader-text">Sort ascending.</span></a></th>
	<th scope="col" ${ id( 'comment' ) } class='manage-column column-comment column-primary'>Comment</th>
	<th scope="col" ${ id( 'response' ) } class='manage-column column-response hidden sortable asc'><a href="/wp-admin/edit-comments.php?orderby=comment_post_ID&amp;order=desc"><span>In response to</span>${ INDICATORS } <span class="screen-reader-text">Sort descending.</span></a></th>
	<th scope="col" ${ id( 'date' ) } class='manage-column column-date sorted desc' aria-sort="descending" abbr="Date"><a href="/wp-admin/edit-comments.php?orderby=comment_date&amp;order=asc"><span>Submitted on</span>${ INDICATORS }</a></th>
	<th scope="col" ${ id( 'acme' ) } class='manage-column column-acme'><em>Acme</em> &amp; Co</th>`;
};

/** single_row_columns() for an item whose cells print `{id}:{key}`, with the Comments checkbox. */
const classicRow = ( id ) => `
	<td class="check-column"><input id="cb-select-${ id }" type="checkbox" name="delete_comments[]" value="${ id }" />
		<label for="cb-select-${ id }"><span class="screen-reader-text">Select comment</span></label></td>
	<td class='author column-author' data-colname="Author"><span>${ id }:author</span></td>
	<th class='comment column-comment has-row-actions column-primary' data-colname="Comment" scope="row"><span>${ id }:comment</span><button type="button" class="toggle-row"><span class="screen-reader-text">Show more details</span></button></th>
	<td class='response column-response hidden' data-colname="In response to"><span>${ id }:response</span></td>
	<td class='date column-date' data-colname="Submitted on"><span>${ id }:date</span></td>
	<td class='acme column-acme' data-colname="Acme &amp; Co"><span>${ id }:acme</span></td>`;

const ITEMS = [ { id: 5, status: 'approved' }, { id: 6, status: 'unapproved' }, { id: 7, status: 'approved', locked: true } ];

async function table( props = {}, { slots = {} } = {} ) {
	const selected = ref( props.selected ?? [] );
	const updates = [];
	const view = mount( () => h( Contracted, {
		id: 'core/list-table',
		columns: COLUMNS,
		caption: 'Comments list. Ordered by Date.',
		classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'comments' ],
		items: ITEMS,
		bodyId: 'the-comment-list',
		rowId: ( item ) => 'comment-' + item.id,
		rowClasses: ( item ) => [ 'comment', item.status ],
		selectable: ( item ) => ! item.locked,
		checkboxLabel: () => 'Select comment',
		checkboxName: 'delete_comments[]',
		noItems: 'No comments found.',
		...props,
		selected: selected.value,
		'onUpdate:selected': ( value ) => {
			updates.push( value );
			selected.value = value;
		},
	}, {
		cell: ( { item, column } ) => h( 'span', item.id + ':' + column.key ),
		...slots,
	} ) );
	await flush();
	return { view, selected, updates };
}

const tableOf = ( view ) => find( view.container, byTag( 'table' ) );
const section = ( view, tag ) => find( tableOf( view ), byTag( tag ) );
const rowOf = ( view, id ) => find( view.container, byProp( 'id', 'comment-' + id ) );
const box = ( view, id ) => find( view.container, byProp( 'id', id ) );
const click = ( el, checked, extra = {} ) => el.props.onClick( { target: { checked }, shiftKey: false, ...extra } );

// Contracts -----------------------------------------------------------------------------------

test( 'the four list table contracts are shared parts, not pages, with their props, slots and events', () => {
	const expected = {
		'list-table': { props: [ 'columns', 'caption', 'classes', 'items', 'itemKey', 'bodyId', 'rowId', 'rowClasses', 'rowStyle', 'selectable', 'checkboxLabel', 'checkboxName', 'selected', 'noItems', 'rowHeaderLabel' ], slots: [ 'cell', 'after-row', 'no-items', 'cb-extra', 'before-rows' ], emits: [ 'update:selected' ] },
		'list-table-views': { props: [ 'views', 'viewsHtml', 'heading' ], slots: [ 'before', 'after' ], emits: [] },
		'list-table-search': { props: [ 'search' ], slots: [], emits: [ 'search' ] },
		'list-table-nav': { props: [ 'which', 'bulkActions', 'pagination', 'heading', 'hasItems', 'bulkValue' ], slots: [ 'extra' ], emits: [ 'bulk', 'update:bulkValue' ] },
	};
	for ( const [ name, shape ] of Object.entries( expected ) ) {
		const contract = contractFiles[ name ].default;
		assert.deepEqual( Object.keys( contractFiles[ name ] ), [ 'default' ], name );
		assert.equal( contract.id, 'core/' + name );
		// 1.1.0: list-table's `rowStyle`; 1.2.0: `selectable` may be false, `rowHeaderLabel`, `num` and `labelHtml`;
		// 1.3.0: the `cb-extra` slot; 1.4.0: the `before-rows` slot. list-table-views 1.1.0: a view's `labelHtml`.
		assert.equal( contract.version, { 'list-table': '1.4.0', 'list-table-views': '1.1.0' }[ name ] ?? '1.0.0' );
		assert.notEqual( contract.page, true, name + ' is shared' );
		assert.deepEqual( Object.keys( contract.props ), shape.props, name );
		assert.deepEqual( Object.keys( contract.slots ), shape.slots, name );
		assert.deepEqual( contract.emits, shape.emits, name );
		for ( const spec of Object.values( contract.props ) ) {
			assert.deepEqual( Object.keys( spec ).sort(), [ 'required', 'type' ] );
		}
	}
	assert.equal( contractFiles[ 'list-table' ].default.props.selectable.required, false, 'Optional, as in 1.1.0: additive (I1).' );
} );

// The table -------------------------------------------------------------------------------------

test( 'the table: classes, hidden caption, and header and footer equal print_column_headers() for the same columns', async () => {
	const { view } = await table();
	const el = tableOf( view );
	assert.deepEqual( el.props.class.split( ' ' ), [ 'wp-list-table', 'widefat', 'fixed', 'striped', 'table-view-list', 'comments' ] );
	const caption = find( el, byTag( 'caption' ) );
	assert.ok( hasClass( caption, 'screen-reader-text' ) );
	assert.equal( textOf( caption ), 'Comments list. Ordered by Date.' );
	assert.equal( rendered( find( section( view, 'thead' ), byTag( 'tr' ) ) ), classic( classicHeaders( true, 1 ) ) );
	assert.equal( rendered( find( section( view, 'tfoot' ), byTag( 'tr' ) ) ), classic( classicHeaders( false, 2 ) ) );
} );

test( 'the rows: cells equal single_row_columns() for the same columns, with the row id, classes and the body id', async () => {
	const { view } = await table();
	const body = section( view, 'tbody' );
	assert.equal( body.props.id, 'the-comment-list' );
	const rows = findAll( body, byTag( 'tr' ) );
	assert.deepEqual( rows.map( ( row ) => row.props.id ), [ 'comment-5', 'comment-6', 'comment-7' ] );
	assert.deepEqual( rows.map( ( row ) => row.props.class ), [ 'comment approved', 'comment unapproved', 'comment approved' ] );
	assert.equal( rendered( rows[ 0 ] ), classic( classicRow( 5 ) ) );
	assert.equal( rendered( rows[ 1 ] ), classic( classicRow( 6 ) ) );
	// A row that may not be selected has an empty check column, as column_cb() prints nothing.
	assert.equal( fromRendered( rows[ 2 ].children.find( ( c ) => c.type === 'element' ) ), '<td class="check-column"></td>' );
} );

test( 'the caption is left out when there is none; the cell default is the item\'s cell HTML, inert for core columns (I2)', async () => {
	const saved = { document: globalThis.document, Node: globalThis.Node, Element: globalThis.Element };
	Object.assign( globalThis, { document: fakeTemplateDocument(), Node: FakeNode, Element: FakeElement } );
	try {
		const cells = { acme: { html: '<b>Plugin</b>', error: false }, comment: { html: '<p>Hi <img src=x onerror="alert(1)"></p><script>globalThis.ranCell = 1</script>', error: false } };
		const { view } = await table( { caption: null, items: [ { id: 5, status: 'approved', cells } ] }, { slots: { cell: undefined } } );
		assert.equal( find( tableOf( view ), byTag( 'caption' ) ), null );
		const plugin = find( find( rowOf( view, 5 ), byClass( 'column-acme' ) ), byClass( 'wp-admin-legacy-html' ) );
		assert.ok( plugin, 'a plugin column (core: false) is LegacyHtml' );
		assert.equal( plugin.innerHTML, '<b>Plugin</b>' );
		const comment = find( rowOf( view, 5 ), byClass( 'column-comment' ) );
		assert.equal( find( comment, byClass( 'wp-admin-legacy-html' ) ), null );
		const core = find( comment, byClass( 'wp-admin-inert-html' ) );
		assert.ok( core, 'a core column is InertHtml' );
		assert.equal( core.children.map( ( child ) => serialize( child ) ).join( '' ), '<p>Hi <img src="x"></p>' );
		assert.equal( globalThis.ranCell, undefined );
	} finally {
		Object.assign( globalThis, saved );
	}
} );

test( 'hidden and sorted columns follow the data: the header classes, aria-sort and the cells', async () => {
	const columns = COLUMNS.map( ( column ) => ( column.key === 'response' ? { ...column, hidden: false, sorted: 'asc' } : column.key === 'date' ? { ...column, hidden: true, sorted: null } : column ) );
	const { view } = await table( { columns } );
	const header = ( key ) => find( section( view, 'thead' ), byProp( 'id', key ) );
	assert.deepEqual( header( 'response' ).props.class.split( ' ' ), [ 'manage-column', 'column-response', 'sorted', 'asc' ] );
	assert.equal( header( 'response' ).props[ 'aria-sort' ], 'ascending' );
	assert.equal( find( header( 'response' ), byClass( 'screen-reader-text' ) ), null, 'no sort text on the sorted column' );
	assert.ok( hasClass( header( 'date' ), 'hidden' ) && hasClass( header( 'date' ), 'sortable' ) );
	assert.ok( header( 'date' ).props[ 'aria-sort' ] == null );
	assert.ok( hasClass( find( rowOf( view, 5 ), byClass( 'column-date' ) ), 'hidden' ) );
	assert.ok( ! hasClass( find( rowOf( view, 5 ), byClass( 'column-response' ) ), 'hidden' ) );
} );

test( 'no items: the classic no-items row across the shown columns, or the no-items slot', async () => {
	const { view } = await table( { items: [] } );
	const row = find( section( view, 'tbody' ), byTag( 'tr' ) );
	assert.equal( fromRendered( row ), '<tr class="no-items"><td class="colspanchange" colspan="5">No comments found.</td></tr>', 'one column is hidden' );
	unmountAll();
	const slotted = await table( { items: [], columns: COLUMNS.map( ( column ) => ( { ...column, hidden: false } ) ) }, { slots: { 'no-items': () => h( 'em', 'Nothing' ) } } );
	assert.equal( fromRendered( find( section( slotted.view, 'tbody' ), byTag( 'tr' ) ) ), '<tr class="no-items"><td class="colspanchange" colspan="6"><em>Nothing</em></td></tr>' );
} );

test( 'after-row slot rows follow their item\'s row', async () => {
	const { view } = await table( {}, { slots: { 'after-row': ( { item } ) => ( item.id === 6 ? h( 'tr', { id: 'replyrow' } ) : null ) } } );
	assert.deepEqual( findAll( section( view, 'tbody' ), byTag( 'tr' ) ).map( ( row ) => row.props.id ), [ 'comment-5', 'comment-6', 'replyrow', 'comment-7' ] );
} );

test( 'Show more details toggles the row open, as common.js does', async () => {
	const { view } = await table();
	find( rowOf( view, 5 ), byClass( 'toggle-row' ) ).props.onClick();
	await flush();
	assert.ok( hasClass( rowOf( view, 5 ), 'is-expanded' ) );
	assert.ok( ! hasClass( rowOf( view, 6 ), 'is-expanded' ) );
	find( rowOf( view, 5 ), byClass( 'toggle-row' ) ).props.onClick();
	await flush();
	assert.ok( ! hasClass( rowOf( view, 5 ), 'is-expanded' ) );
} );

test( 'a page omitting selectable still shows checkboxes on every row, as in 1.1.0 (I1)', async () => {
	const { view } = await table( { selectable: undefined } );
	for ( const id of [ 5, 6, 7 ] ) {
		assert.ok( box( view, 'cb-select-' + id ) !== null, 'row ' + id );
	}
	assert.ok( box( view, 'cb-select-all-1' ) !== null && box( view, 'cb-select-all-2' ) !== null );
} );

test( 'no row selectable: with selectable false, no row checkbox and no select-all cells (M9)', async () => {
	const { view } = await table( { selectable: false } );
	for ( const id of [ 5, 6, 7 ] ) {
		assert.ok( box( view, 'cb-select-' + id ) === null, 'row ' + id );
	}
	assert.ok( box( view, 'cb-select-all-1' ) === null && box( view, 'cb-select-all-2' ) === null, 'no select-all checkboxes' );
	const header = find( section( view, 'thead' ), byProp( 'id', 'cb' ) );
	assert.equal( fromRendered( header ), '<td class="check-column column-cb manage-column" id="cb"></td>' );
	const rows = findAll( section( view, 'tbody' ), byTag( 'tr' ) );
	assert.equal( fromRendered( rows[ 0 ].children.find( ( c ) => c.type === 'element' ) ), '<td class="check-column"></td>' );
} );

test( 'num class from data: the header is `num` when the column says so, whatever its key (M5)', async () => {
	const columns = [
		...COLUMNS,
		{ key: 'comments', label: 'Comments', primary: false, hidden: false, num: false, core: true, sortable: null, sorted: null },
		{ key: 'acme_count', label: 'Count', primary: false, hidden: false, num: true, core: false, sortable: null, sorted: null },
	];
	const { view } = await table( { columns } );
	const header = ( key ) => find( section( view, 'thead' ), byProp( 'id', key ) );
	assert.ok( ! hasClass( header( 'comments' ), 'num' ), 'no client copy of the rule' );
	assert.ok( hasClass( header( 'acme_count' ), 'num' ) );
	assert.ok( ! hasClass( header( 'author' ), 'num' ) );
} );

test( 'row header aria-label: the primary th has the label rowHeaderLabel( item ) gives, none for null (M8)', async () => {
	const { view } = await table( { rowHeaderLabel: ( item ) => ( item.id === 5 ? '“Hello” (Edit)' : null ) } );
	const primary = ( id ) => find( rowOf( view, id ), byClass( 'column-primary' ) );
	assert.equal( primary( 5 ).tag, 'th' );
	assert.equal( primary( 5 ).props[ 'aria-label' ], '“Hello” (Edit)' );
	assert.ok( primary( 6 ).props[ 'aria-label' ] == null );
	assert.ok( find( rowOf( view, 5 ), byClass( 'column-author' ) ).props[ 'aria-label' ] == null, 'only the primary cell' );
	unmountAll();
	const plain = await table();
	assert.ok( find( rowOf( plain.view, 5 ), byClass( 'column-primary' ) ).props[ 'aria-label' ] == null, 'without the prop, as classic without an override' );
} );

test( 'header labelHtml keeps the icon span, through InlineMarkup with spans; data-colname stays the label\'s text (M7c)', async () => {
	const labelHtml = '<span class="vers comment-grey-bubble" title="Comments" aria-hidden="true"></span><span class="screen-reader-text">Comments</span>';
	const columns = [ ...COLUMNS, { key: 'comments', label: 'Comments', labelHtml, primary: false, hidden: false, num: true, core: true, sortable: sortable( 'comment_count', 'desc', { initialDesc: true } ), sorted: null } ];
	const { view } = await table( { columns } );
	for ( const part of [ 'thead', 'tfoot' ] ) {
		const header = find( section( view, part ), ( el ) => el.tag === 'th' && hasClass( el, 'column-comments' ) );
		const icon = find( header, byClass( 'comment-grey-bubble' ) );
		assert.ok( icon, part + ': the icon' );
		assert.deepEqual( [ icon.props.class, icon.props.title, icon.props[ 'aria-hidden' ] ], [ 'vers comment-grey-bubble', 'Comments', 'true' ] );
		assert.equal( textOf( find( header, byClass( 'screen-reader-text' ) ) ), 'Comments' );
		assert.ok( hasClass( header, 'num' ) );
	}
	assert.equal( find( rowOf( view, 5 ), byClass( 'column-comments' ) ).props[ 'data-colname' ], 'Comments' );
	// A label without labelHtml keeps no span.
	const acme = find( section( view, 'thead' ), byProp( 'id', 'acme' ) );
	assert.ok( ( find( acme, byTag( 'span' ) ) ) === null );
} );

test( 'cb-extra: the slot follows the row checkbox in the check column, as column_cb() prints the lock indicator (1.3.0)', async () => {
	const indicator = ( { item } ) => h( 'div', { class: 'locked-indicator' }, [
		h( 'span', { class: 'locked-indicator-icon', 'aria-hidden': 'true' } ),
		h( 'span', { class: 'screen-reader-text' }, '\u201c' + item.id + '\u201d is locked' ),
	] );
	const { view } = await table( {}, { slots: { 'cb-extra': indicator } } );
	const cell = ( id ) => rowOf( view, id ).children.find( ( c ) => c.type === 'element' );
	assert.equal( fromRendered( cell( 5 ) ), classic( `<table><tbody><tr><td class="check-column"><input id="cb-select-5" type="checkbox" name="delete_comments[]" value="5" />
		<label for="cb-select-5"><span class="screen-reader-text">Select comment</span></label>
		<div class="locked-indicator"><span class="locked-indicator-icon" aria-hidden="true"></span><span class="screen-reader-text">\u201c5\u201d is locked</span></div></td></tr></tbody></table>` ).replace( /^<table><tbody><tr>|<\/tr><\/tbody><\/table>$/g, '' ) );
	// A row without a checkbox has no indicator either: column_cb() prints both or neither.
	assert.equal( fromRendered( cell( 7 ) ), '<td class="check-column"></td>' );
	unmountAll();
	const plain = await table();
	assert.equal( find( rowOf( plain.view, 5 ), byClass( 'locked-indicator' ) ), null, 'nothing without the slot' );
} );

test( 'before-rows: rows at the top of tbody, before the items, as inline-edit-post.js prepends Bulk Edit (1.4.0)', async () => {
	const bulk = () => [ h( 'tr', { class: 'hidden' } ), h( 'tr', { id: 'bulk-edit' }, [ h( 'td', {}, 'Bulk' ) ] ) ];
	const { view } = await table( {}, { slots: { 'before-rows': bulk } } );
	const body = find( tableOf( view ), byTag( 'tbody' ) );
	const ids = body.children.filter( ( c ) => c.type === 'element' ).map( ( c ) => c.props.id ?? c.props.class );
	assert.deepEqual( ids.slice( 0, 3 ), [ 'hidden', 'bulk-edit', 'comment-5' ] );
	unmountAll();
	const plain = await table();
	assert.equal( find( tableOf( plain.view ), byProp( 'id', 'bulk-edit' ) ), null, 'nothing without the slot' );
} );

// Selecting -------------------------------------------------------------------------------------

test( 'select-all checks every row that has a checkbox, and both select-all checkboxes follow', async () => {
	const { view, updates, selected } = await table();
	click( box( view, 'cb-select-all-1' ), true );
	await flush();
	assert.deepEqual( updates.at( -1 ), [ 5, 6 ] );
	assert.equal( box( view, 'cb-select-5' ).props.checked, true );
	assert.equal( box( view, 'cb-select-all-1' ).props.checked, true );
	assert.equal( box( view, 'cb-select-all-2' ).props.checked, true );

	click( box( view, 'cb-select-6' ), false );
	await flush();
	assert.deepEqual( selected.value, [ 5 ] );
	assert.equal( box( view, 'cb-select-all-1' ).props.checked, false, 'no longer all' );

	click( box( view, 'cb-select-all-2' ), false );
	await flush();
	assert.deepEqual( selected.value, [] );
} );

test( 'Shift with select-all inverts each row; a selected prop from the page is shown', async () => {
	const { view, selected } = await table( { selected: [ 5 ] } );
	assert.equal( box( view, 'cb-select-5' ).props.checked, true );
	click( box( view, 'cb-select-all-1' ), true, { shiftKey: true } );
	await flush();
	assert.deepEqual( selected.value, [ 6 ] );
} );

test( 'the select-all checkboxes after a Shift-click are unchecked, and the one clicked shows it, as common.js sets them (M2)', async () => {
	const { view, selected } = await table( { selected: [ 5 ] } );
	const target = { checked: true };
	box( view, 'cb-select-all-1' ).props.onClick( { target, shiftKey: true } );
	await flush();
	assert.deepEqual( selected.value, [ 6 ] );
	assert.equal( box( view, 'cb-select-all-1' ).props.checked, false );
	assert.equal( box( view, 'cb-select-all-2' ).props.checked, false );
	assert.equal( target.checked, false, 'The clicked checkbox is unchecked too.' );

	// Then all rows: a row click sets them from the rows, as common.js does.
	click( box( view, 'cb-select-5' ), true );
	await flush();
	assert.deepEqual( selected.value, [ 5, 6 ] );
	assert.equal( box( view, 'cb-select-all-1' ).props.checked, true );
} );

test( 'with no row to select, a select-all checkbox stays as clicked and both follow it, as common.js sets them (M2)', async () => {
	const { view, selected } = await table( { items: [ { id: 7, status: 'approved', locked: true } ] } );
	const target = { checked: true };
	box( view, 'cb-select-all-2' ).props.onClick( { target, shiftKey: false } );
	await flush();
	assert.deepEqual( selected.value, [] );
	assert.equal( box( view, 'cb-select-all-1' ).props.checked, true );
	assert.equal( box( view, 'cb-select-all-2' ).props.checked, true );
	assert.equal( target.checked, true );

	box( view, 'cb-select-all-1' ).props.onClick( { target: { checked: false }, shiftKey: false } );
	await flush();
	assert.equal( box( view, 'cb-select-all-2' ).props.checked, false );
} );

test( 'the select-all checkboxes follow a selection the page sets (M2)', async () => {
	const { view, selected } = await table();
	click( box( view, 'cb-select-all-1' ), true );
	await flush();
	assert.equal( box( view, 'cb-select-all-1' ).props.checked, true );
	selected.value = [];
	await flush();
	assert.equal( box( view, 'cb-select-all-1' ).props.checked, false );
	assert.equal( box( view, 'cb-select-all-2' ).props.checked, false );
} );

test( 'a Shift-click sets the range from the row clicked last, as common.js does', async () => {
	const items = [ 1, 2, 3, 4, 5 ].map( ( id ) => ( { id, status: 'approved' } ) );
	const { view, selected } = await table( { items } );
	click( box( view, 'cb-select-2' ), true );
	await flush();
	click( box( view, 'cb-select-4' ), true, { shiftKey: true } );
	await flush();
	assert.deepEqual( selected.value, [ 2, 3, 4 ] );
	click( box( view, 'cb-select-1' ), false, { shiftKey: true } );
	await flush();
	assert.deepEqual( selected.value, [ 4 ], 'upwards, from the row clicked to the one before the row clicked last (checks.slice( last, first ))' );
	click( box( view, 'cb-select-5' ), true, { shiftKey: true } );
	await flush();
	assert.deepEqual( selected.value, [ 1, 2, 3, 4, 5 ], 'downwards, from the row clicked last to the row clicked' );
} );

test( 'useSelection: toggle, ranges, toggleAll and clear, and keys that go are dropped', async () => {
	const keys = ref( [ 'a', 'b', 'c', 'd' ] );
	const selection = useSelection( keys );
	selection.toggle( 'b', { target: { checked: true } } );
	selection.toggle( 'd', { target: { checked: true }, shiftKey: true } );
	assert.deepEqual( selection.selected.value, [ 'b', 'c', 'd' ] );
	assert.equal( selection.allSelected.value, false );
	selection.toggleAll( true );
	assert.deepEqual( selection.selected.value, [ 'a', 'b', 'c', 'd' ] );
	assert.equal( selection.allSelected.value, true );
	keys.value = [ 'a', 'c' ];
	await nextTick();
	assert.deepEqual( selection.selected.value, [ 'a', 'c' ] );
	selection.clear();
	assert.deepEqual( selection.selected.value, [] );
	selection.toggle( 'a' );
	assert.deepEqual( selection.selected.value, [ 'a' ], 'without an event it flips' );
} );

// Views -----------------------------------------------------------------------------------------

const VIEWS = [
	{ key: 'all', label: 'All (3)', format: 'All <span class="count">(%s)</span>', countText: '3', countClass: 'all-count', count: 3, url: 'edit-comments.php?comment_status=all', current: true },
	{ key: 'moderated', label: 'Pending (1)', format: 'Pending <span class="count">(%s)</span>', countText: '1', countClass: 'pending-count', count: 1, url: 'edit-comments.php?comment_status=moderated', current: false },
];

test( 'views: ul.subsubsub as views() prints get_views_links(), the current one marked, the counts in their spans', async () => {
	const view = mount( () => h( Contracted, { id: 'core/list-table-views', views: VIEWS, viewsHtml: null, heading: 'Filter comments list' } ) );
	await flush();
	const heading = find( view.container, byTag( 'h2' ) );
	assert.ok( hasClass( heading, 'screen-reader-text' ) );
	assert.equal( textOf( heading ), 'Filter comments list' );
	const list = find( view.container, byClass( 'subsubsub' ) );
	assert.equal( fromRendered( list ), '<ul class="subsubsub">' + classic( `
		<li class='all'><a href="/wp-admin/edit-comments.php?comment_status=all" class="current" aria-current="page">All <span class="count">(<span class="all-count">3</span>)</span></a> |</li>
		<li class='moderated'><a href="/wp-admin/edit-comments.php?comment_status=moderated">Pending <span class="count">(<span class="pending-count">1</span>)</span></a></li>` ) + '</ul>' );
} );

test( 'views: a view\'s labelHtml (the Posts get_views() labels) keeps its count span, through InlineMarkup with spans (1.1.0)', async () => {
	const views = [
		{ key: 'all', labelHtml: 'All <span class="count">(3)</span>', url: 'edit.php?post_type=post', current: true },
		{ key: 'trash', labelHtml: 'Trash <span class="count">(1)</span><script>x()</script>', url: 'edit.php?post_status=trash&post_type=post', current: false },
	];
	const view = mount( () => h( Contracted, { id: 'core/list-table-views', views } ) );
	await flush();
	assert.equal( fromRendered( find( view.container, byClass( 'subsubsub' ) ) ), '<ul class="subsubsub">' + classic( `
		<li class='all'><a href="/wp-admin/edit.php?post_type=post" class="current" aria-current="page">All <span class="count">(3)</span></a> |</li>
		<li class='trash'><a href="/wp-admin/edit.php?post_status=trash&amp;post_type=post">Trash <span class="count">(1)</span></a></li>` ) + '</ul>' );
} );

test( 'views: a filtered list is shown as LegacyHtml in place of the views, as a map or a list; an empty one shows nothing', async () => {
	const view = mount( () => h( Contracted, { id: 'core/list-table-views', views: VIEWS, viewsHtml: { all: '<a href="x">All</a>', acme: '<a href="y">Acme</a>' } } ) );
	await flush();
	const items = findAll( view.container, byTag( 'li' ) );
	assert.deepEqual( items.map( ( li ) => li.props.class ), [ 'all', 'acme' ] );
	assert.ok( find( items[ 0 ], byClass( 'wp-admin-legacy-html' ) ) );
	assert.equal( textOf( items[ 0 ] ).trim(), '|' );
	unmountAll();
	const listed = mount( () => h( Contracted, { id: 'core/list-table-views', views: VIEWS, viewsHtml: [ { key: 'mine', html: '<a>Mine</a>' } ] } ) );
	await flush();
	assert.deepEqual( findAll( listed.container, byTag( 'li' ) ).map( ( li ) => li.props.class ), [ 'mine' ] );
	unmountAll();
	const empty = mount( () => h( Contracted, { id: 'core/list-table-views', views: VIEWS, viewsHtml: [] } ) );
	await flush();
	assert.equal( find( empty.container, byClass( 'subsubsub' ) ), null );
} );

// Search ----------------------------------------------------------------------------------------

const SEARCH = { shown: true, value: 'hello', label: 'Search Comments', inputId: 'comment-search-input', keep: [ { name: 'orderby', value: 'comment_date' }, { name: 'order', value: 'asc' } ] };

test( 'search: the hidden fields it keeps, then p.search-box as search_box() prints it', async () => {
	const view = mount( () => h( 'div', { class: 'root' }, [ h( Contracted, { id: 'core/list-table-search', search: SEARCH } ) ] ) );
	await flush();
	const root = find( view.container, byClass( 'root' ) );
	assert.equal( rendered( root ), classic( `<input type="hidden" name="orderby" value="comment_date" /><input type="hidden" name="order" value="asc" /><p class="search-box">
	<label class="screen-reader-text" for="comment-search-input">Search Comments:</label>
	<input type="search" id="comment-search-input" name="s" value="hello" />
		<input type="submit" id="search-submit" class="button button-compact" value="Search Comments"  /></p>` ) );
} );

test( 'search: the button and Enter emit the term typed; nothing is shown unless shown', async () => {
	const searched = [];
	const view = mount( () => h( Contracted, { id: 'core/list-table-search', search: SEARCH, onSearch: ( value ) => searched.push( value ) } ) );
	await flush();
	const input = box( view, 'comment-search-input' );
	input.props.onInput( { target: { value: 'world' } } );
	await flush();
	let prevented = 0;
	box( view, 'search-submit' ).props.onClick( { preventDefault: () => prevented++ } );
	input.props.onKeydown( { key: 'Enter', isComposing: false, preventDefault: () => prevented++ } );
	input.props.onKeydown( { key: 'a', preventDefault: () => prevented++ } );
	assert.deepEqual( searched, [ 'world', 'world' ] );
	assert.equal( prevented, 2 );
	unmountAll();
	const hidden = mount( () => h( Contracted, { id: 'core/list-table-search', search: { ...SEARCH, shown: false } } ) );
	await flush();
	assert.equal( find( hidden.container, byClass( 'search-box' ) ), null );
} );

// Navigation and pagination ------------------------------------------------------------------------

const BULK = [ { value: 'unapprove', label: 'Unapprove' }, { value: 'edit', label: 'Edit' }, { label: 'Acme', options: [ { value: 'acme-a', label: 'Acme A' } ] } ];
const PAGES = { total: 45, totalText: '45 items', perPage: 20, page: 2, pages: 3, pagesText: '3', links: { first: 'edit-comments.php?comment_status=all', prev: 'edit-comments.php?comment_status=all&paged=1', next: 'edit-comments.php?comment_status=all&paged=3', last: 'edit-comments.php?comment_status=all&paged=3' } };

async function nav( props = {}, slots = {} ) {
	const events = [];
	const view = mount( () => h( Contracted, { id: 'core/list-table-nav', which: 'top', bulkActions: BULK, pagination: PAGES, heading: 'Comments list navigation', onBulk: ( value ) => events.push( [ 'bulk', value ] ), 'onUpdate:bulkValue': ( value ) => events.push( [ 'bulkValue', value ] ), ...props }, slots ) );
	await flush();
	return { view, events };
}

const LINKS_TOP = `<span class="pagination-links"><a class='first-page button' href='/wp-admin/edit-comments.php?comment_status=all'><span class='screen-reader-text'>First page</span><span aria-hidden='true'>&#171;</span></a>
<a class='prev-page button' href='/wp-admin/edit-comments.php?comment_status=all&#038;paged=1'><span class='screen-reader-text'>Previous page</span><span aria-hidden='true'>&#8249;</span></a>
<span class="paging-input"><label for="current-page-selector" class="screen-reader-text">Current Page</label><input class='current-page' id='current-page-selector' type='text'
					name='paged' value='2' size='1' aria-describedby='table-paging' /><span class='tablenav-paging-text'> of <span class='total-pages'>3</span></span></span>
<a class='next-page button' href='/wp-admin/edit-comments.php?comment_status=all&#038;paged=3'><span class='screen-reader-text'>Next page</span><span aria-hidden='true'>&#8250;</span></a>
<a class='last-page button' href='/wp-admin/edit-comments.php?comment_status=all&#038;paged=3'><span class='screen-reader-text'>Last page</span><span aria-hidden='true'>&#187;</span></a></span>`;

test( 'nav: div.tablenav with the bulk actions, the extra slot and the pagination, as display_tablenav() prints them', async () => {
	const { view } = await nav( {}, { extra: ( { which } ) => h( 'div', { class: 'alignleft actions' }, 'extra ' + which ) } );
	const el = find( view.container, byClass( 'tablenav' ) );
	assert.deepEqual( el.props.class.split( ' ' ), [ 'tablenav', 'top' ] );
	assert.equal( rendered( el ), classic( `<div class="alignleft actions bulkactions">
		<label for="bulk-action-selector-top" class="screen-reader-text">Select bulk action</label><select name="action" id="bulk-action-selector-top">
<option value="-1">Bulk actions</option>
	<option value="unapprove">Unapprove</option>
	<option value="edit" class="hide-if-no-js">Edit</option>
	<optgroup label="Acme">
		<option value="acme-a">Acme A</option>
	</optgroup>
</select>
<input type="submit" name="bulk_action" id="doaction" class="button action button-compact" value="Apply"  />
		</div>
		<div class="alignleft actions">extra top</div>
		<h2 class="screen-reader-text">Comments list navigation</h2><div class='tablenav-pages'><span class="displaying-num">45 items</span>
${ LINKS_TOP }</div>
		<br class="clear" />` ) );
} );

test( 'nav: the bottom one names its controls action2 and doaction2 and shows the page as text', async () => {
	const { view } = await nav( { which: 'bottom', pagination: { ...PAGES, page: 1, links: { first: null, prev: null, next: PAGES.links.next, last: PAGES.links.last } } } );
	assert.equal( box( view, 'bulk-action-selector-bottom' ).props.name, 'action2' );
	assert.equal( box( view, 'doaction2' ).props.name, 'bulk_action' );
	assert.equal( find( view.container, byTag( 'h2' ) ), null, 'the heading is printed above the table only' );
	const pages = find( view.container, byClass( 'tablenav-pages' ) );
	assert.equal( rendered( find( pages, byClass( 'pagination-links' ) ) ), classic( `<span class="tablenav-pages-navspan button disabled" aria-hidden="true">&#171;</span>
<span class="tablenav-pages-navspan button disabled" aria-hidden="true">&#8249;</span>
<span class="screen-reader-text">Current Page</span><span id="table-paging" class="paging-input"><span class="tablenav-paging-text">1 of <span class='total-pages'>3</span></span></span>
<a class='next-page button' href='/wp-admin/edit-comments.php?comment_status=all&#038;paged=3'><span class='screen-reader-text'>Next page</span><span aria-hidden='true'>&#8250;</span></a>
<a class='last-page button' href='/wp-admin/edit-comments.php?comment_status=all&#038;paged=3'><span class='screen-reader-text'>Last page</span><span aria-hidden='true'>&#187;</span></a>` ) );
} );

test( 'nav: one page, and no items (bulk actions hidden, "0 items")', async () => {
	const one = await nav( { pagination: { ...PAGES, total: 2, totalText: '2 items', page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } } } );
	assert.ok( hasClass( find( one.view.container, byClass( 'tablenav-pages' ) ), 'one-page' ) );
	assert.equal( find( one.view.container, byTag( 'h2' ) ), null, 'no heading for one page' );
	unmountAll();
	const none = await nav( { pagination: { total: 0, totalText: '0 items', perPage: 20, page: 1, pages: 0, pagesText: '0', links: { first: null, prev: null, next: null, last: null } } } );
	assert.ok( hasClass( find( none.view.container, byClass( 'bulkactions' ) ), 'hidden' ) );
	assert.equal( fromRendered( find( none.view.container, byClass( 'tablenav-pages' ) ) ), classic( '<div class="tablenav-pages no-pages"><span class="displaying-num">0 items</span></div>' ) );
} );

test( 'nav: Apply emits the bulk action chosen; the select is a v-model the page can share between top and bottom', async () => {
	const { view, events } = await nav( { bulkValue: 'edit' } );
	assert.equal( box( view, 'bulk-action-selector-top' ).props.value, 'edit' );
	box( view, 'bulk-action-selector-top' ).props.onChange( { target: { value: 'unapprove' } } );
	await flush();
	let prevented = 0;
	box( view, 'doaction' ).props.onClick( { preventDefault: () => prevented++ } );
	assert.deepEqual( events, [ [ 'bulkValue', 'unapprove' ], [ 'bulk', 'unapprove' ] ] );
	assert.equal( prevented, 1 );
} );

test( 'pagination: Enter in the current page field opens that page through the router', async () => {
	const opened = [];
	const router = { navigate: ( url ) => opened.push( url ) };
	const view = mount( () => h( Contracted, { id: 'core/list-table-nav', which: 'top', bulkActions: [], pagination: PAGES } ), { provide: { router } } );
	await flush();
	const input = box( view, 'current-page-selector' );
	input.props.onInput( { target: { value: '3' } } );
	await flush();
	let prevented = 0;
	input.props.onKeydown( { key: 'Enter', isComposing: false, preventDefault: () => prevented++ } );
	assert.deepEqual( opened, [ '/wp-admin/edit-comments.php?comment_status=all&paged=3' ] );
	assert.equal( prevented, 1 );
} );

test( 'pagedPath: the list\'s path with `paged` set, its other arguments kept as they are written', () => {
	assert.equal( pagedPath( PAGES.links, 3 ), 'edit-comments.php?comment_status=all&paged=3' );
	assert.equal( pagedPath( { first: null, prev: 'edit-comments.php?s=a%2Fb&paged=1', next: null, last: null }, 2 ), 'edit-comments.php?s=a%2Fb&paged=2' );
	assert.equal( pagedPath( { first: 'edit-comments.php', prev: null, next: null, last: null }, 0 ), 'edit-comments.php?paged=1' );
	assert.equal( pagedPath( { first: 'edit-comments.php?paged=2&x=1', prev: null, next: null, last: null }, 'abc' ), 'edit-comments.php?x=1&paged=1' );
	assert.equal( pagedPath( { first: null, prev: null, next: null, last: null }, 2 ), null );
} );

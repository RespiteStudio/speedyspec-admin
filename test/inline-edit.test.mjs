import test, { afterEach } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';


const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { classic, renderedNode } = await import( './helpers/markup.mjs' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { formFields, classicFormFields } = await import( '../site/components/core/list-table-parts/form-fields.js' );

const { h } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const contractFile = await import( '../site/contracts/core/inline-edit.js' );
globalThis.__modules[ '/contracts/core/inline-edit.js' ] = contractFile;
globalThis.__modules[ '/components/core/inline-edit.js' ] = await import( '../site/components/core/inline-edit.js' );

afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

const QUICK_CLASSES = [ 'inline-edit-row', 'inline-edit-row-post', 'quick-edit-row', 'quick-edit-row-post', 'inline-edit-post' ];
const BULK_CLASSES = [ 'inline-edit-row', 'inline-edit-row-post', 'bulk-edit-row', 'bulk-edit-row-post', 'bulk-edit-post' ];

// Slot content as the page will give it: classic markup, so that the row can be compared whole.
const LEFT = () => h( 'label', [ h( 'span', { class: 'title' }, 'Title' ), h( 'span', { class: 'input-text-wrap' }, [ h( 'input', { type: 'text', name: 'post_title', class: 'ptitle', value: '' } ) ] ) ] );
const CENTER = () => h( 'span', { class: 'title inline-edit-categories-label' }, 'Categories' );
const RIGHT = () => h( 'div', { class: 'inline-edit-group wp-clearfix' }, [ h( 'label', { class: 'inline-edit-status alignleft' }, [ h( 'span', { class: 'title' }, 'Status' ) ] ) ] );

async function editor( props = {}, { slots = { left: LEFT, center: CENTER, right: RIGHT }, provide = {} } = {} ) {
	const events = [];
	const spoken = [];
	const view = mount( () => h( Contracted, {
		id: 'core/inline-edit',
		kind: 'quick',
		classes: QUICK_CLASSES,
		colspan: 7,
		rowId: 'edit-5',
		...props,
		onSave: ( fields ) => events.push( [ 'save', fields ] ),
		onCancel: () => events.push( [ 'cancel' ] ),
	}, slots ), { provide: { speak: ( message ) => spoken.push( message ), ...provide } } );
	await flush();
	return { view, events, spoken, row: find( view.container, byTag( 'tr' ) ) };
}

// inline_edit() for a post type with categories (`inline-edit-row-post`), Quick Edit as
// inline-edit-post.js shows it (the row cloned as `edit-{id}`, `inline-editor`, shown). The nonce
// and the hidden post_view, screen and post_author fields are left out: the REST routes take
// none of them (they are named after classic's Ajax handler).
const CLASSIC_QUICK = `
<tr id="edit-5" class="inline-edit-row inline-edit-row-post quick-edit-row quick-edit-row-post inline-edit-post inline-editor">
<td colspan="7" class="colspanchange">
<div class="inline-edit-wrapper" role="region" aria-labelledby="quick-edit-legend">
<fieldset class="inline-edit-col-left">
	<legend class="inline-edit-legend" id="quick-edit-legend">Quick Edit</legend>
	<div class="inline-edit-col">
		<label>
			<span class="title">Title</span>
			<span class="input-text-wrap"><input type="text" name="post_title" class="ptitle" value="" /></span>
		</label>
	</div>
</fieldset>
<fieldset class="inline-edit-col-center inline-edit-categories">
	<div class="inline-edit-col">
		<span class="title inline-edit-categories-label">Categories</span>
	</div>
</fieldset>
<fieldset class="inline-edit-col-right">
	<div class="inline-edit-col">
		<div class="inline-edit-group wp-clearfix"><label class="inline-edit-status alignleft"><span class="title">Status</span></label></div>
	</div>
</fieldset>
<div class="submit inline-edit-save">
	<button type="button" class="button button-primary save">Update</button>
	<button type="button" class="button cancel">Cancel</button>
	<span class="spinner"></span>
	<div class="notice notice-error notice-alt inline hidden"><p class="error"></p></div>
</div>
</div>
</td></tr>`;

// The same for Bulk Edit (`#bulk-edit`; submit_button( 'Update', 'primary', 'bulk_edit', false )).
const CLASSIC_BULK = `
<tr id="bulk-edit" class="inline-edit-row inline-edit-row-post bulk-edit-row bulk-edit-row-post bulk-edit-post inline-editor">
<td colspan="7" class="colspanchange">
<div class="inline-edit-wrapper" role="region" aria-labelledby="bulk-edit-legend">
<fieldset class="inline-edit-col-left">
	<legend class="inline-edit-legend" id="bulk-edit-legend">Bulk Edit</legend>
	<div class="inline-edit-col"><div id="bulk-title-div"><div id="bulk-titles"></div></div></div>
</fieldset>
<fieldset class="inline-edit-col-right">
	<div class="inline-edit-col">
		<div class="inline-edit-group wp-clearfix"><label class="inline-edit-status alignleft"><span class="title">Status</span></label></div>
	</div>
</fieldset>
<div class="submit inline-edit-save">
	<input type="submit" name="bulk_edit" id="bulk_edit" class="button button-primary" value="Update" />
	<button type="button" class="button cancel">Cancel</button>
	<div class="notice notice-error notice-alt inline hidden"><p class="error"></p></div>
</div>
</div>
</td></tr>`;

const key = ( name, extra = {} ) => ( { key: name, isComposing: false, defaultPrevented: false, preventDefault() {
	this.defaultPrevented = true;
}, stopPropagation() {}, target: { classList: { contains: () => false } }, ...extra } );

// Contract ---------------------------------------------------------------------------------------

test( 'core/inline-edit is a shared contract with its props, slots and events', () => {
	const contract = contractFile.default;
	assert.deepEqual( Object.keys( contractFile ), [ 'default' ] );
	assert.equal( contract.id, 'core/inline-edit' );
	assert.equal( contract.version, '1.0.0' );
	assert.notEqual( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'kind', 'legend', 'classes', 'colspan', 'saving', 'error', 'customBoxes', 'rowId' ] );
	assert.equal( contract.props.kind.required, true );
	assert.deepEqual( Object.keys( contract.slots ), [ 'left', 'center', 'right' ] );
	assert.deepEqual( contract.emits, [ 'save', 'cancel' ] );
} );

// Markup -----------------------------------------------------------------------------------------

test( 'Quick Edit: the row equals the classic #inline-edit row, shown as edit-{id}', async () => {
	const { row } = await editor();
	assert.equal( renderedNode( row ), classic( CLASSIC_QUICK ) );
} );

test( 'Bulk Edit: the row equals the classic #bulk-edit row; no center fieldset without its slot', async () => {
	const bulkLeft = () => h( 'div', { id: 'bulk-title-div' }, [ h( 'div', { id: 'bulk-titles' } ) ] );
	const { row } = await editor( { kind: 'bulk', classes: BULK_CLASSES, rowId: 'bulk-edit' }, { slots: { left: bulkLeft, right: RIGHT } } );
	assert.equal( renderedNode( row ), classic( CLASSIC_BULK ) );
} );

test( 'the legend prop replaces the default legend; the colspan follows the data', async () => {
	const { row } = await editor( { legend: 'Quick Edit Book', colspan: 4 } );
	assert.equal( textOf( find( row, byClass( 'inline-edit-legend' ) ) ), 'Quick Edit Book' );
	assert.equal( find( row, byTag( 'td' ) ).props.colspan, '4' );
} );

test( 'plugin boxes come after the right fieldset, before the buttons, each through LegacyHtml', async () => {
	const customBoxes = [
		{ column: 'acme', html: '<fieldset class="inline-edit-col-right"><input name="acme_note"></fieldset>', error: false },
		{ column: 'empty', html: '', error: false },
	];
	const { row } = await editor( { customBoxes } );
	const wrapper = find( row, byClass( 'inline-edit-wrapper' ) );
	const children = wrapper.children.filter( ( child ) => child.type === 'element' );
	assert.deepEqual( children.map( ( child ) => child.props.class ), [ 'inline-edit-col-left', 'inline-edit-col-center inline-edit-categories', 'inline-edit-col-right', 'wp-admin-legacy-html', 'submit inline-edit-save' ] );
	assert.equal( children[ 3 ].innerHTML, customBoxes[ 0 ].html );
} );

// Behaviour --------------------------------------------------------------------------------------

test( 'Escape cancels (keyup on the row, as inline-edit-post.js), in both modes; not while composing', async () => {
	const quick = await editor();
	quick.row.props.onKeyup( key( 'Escape', { isComposing: true } ) );
	quick.row.props.onKeyup( key( 'Escape' ) );
	assert.deepEqual( quick.events, [ [ 'cancel' ] ] );
	unmountAll();
	const bulk = await editor( { kind: 'bulk', classes: BULK_CLASSES } );
	bulk.row.props.onKeyup( key( 'Escape' ) );
	assert.deepEqual( bulk.events, [ [ 'cancel' ] ] );
} );

test( 'Enter in Quick Edit saves, except on Cancel and while composing; Bulk Edit does not save on Enter', async () => {
	const { row, events } = await editor();
	const td = find( row, byTag( 'td' ) );
	const enter = key( 'Enter' );
	td.props.onKeydown( enter );
	assert.equal( events.length, 1 );
	assert.equal( events[ 0 ][ 0 ], 'save' );
	assert.equal( enter.defaultPrevented, true, 'the form is not submitted' );
	td.props.onKeydown( key( 'Enter', { target: { classList: { contains: ( name ) => name === 'cancel' } } } ) );
	td.props.onKeydown( key( 'Enter', { isComposing: true } ) );
	td.props.onKeydown( key( 'Enter', { defaultPrevented: true } ) );
	td.props.onKeydown( key( 'a' ) );
	assert.equal( events.length, 1 );
	unmountAll();
	const bulk = await editor( { kind: 'bulk', classes: BULK_CLASSES } );
	find( bulk.row, byTag( 'td' ) ).props.onKeydown?.( key( 'Enter' ) );
	assert.deepEqual( bulk.events, [] );
} );

test( 'Update and Cancel emit save and cancel; Bulk Edit\'s submit does not submit the page\'s form', async () => {
	const { row, events } = await editor();
	find( row, byClass( 'save' ) ).props.onClick();
	find( row, byClass( 'cancel' ) ).props.onClick();
	assert.deepEqual( events.map( ( event ) => event[ 0 ] ), [ 'save', 'cancel' ] );
	unmountAll();
	const bulk = await editor( { kind: 'bulk', classes: BULK_CLASSES } );
	const click = key( 'click' );
	find( bulk.row, byProp( 'id', 'bulk_edit' ) ).props.onClick( click );
	assert.equal( click.defaultPrevented, true );
	assert.deepEqual( bulk.events.map( ( event ) => event[ 0 ] ), [ 'save' ] );
} );

test( 'while saving: the spinner is active, the buttons are disabled, and nothing saves again', async () => {
	const { row, events } = await editor( { saving: true } );
	assert.ok( hasClass( find( row, byClass( 'spinner' ) ), 'is-active' ) );
	assert.equal( find( row, byClass( 'save' ) ).props.disabled, true );
	assert.equal( find( row, byClass( 'cancel' ) ).props.disabled, true );
	find( row, byTag( 'td' ) ).props.onKeydown( key( 'Enter' ) );
	assert.deepEqual( events, [] );
	unmountAll();
	const bulk = await editor( { kind: 'bulk', classes: BULK_CLASSES, saving: true } );
	assert.ok( hasClass( find( bulk.row, byClass( 'spinner' ) ), 'is-active' ), 'Bulk Edit shows a spinner while it saves' );
	assert.equal( find( bulk.row, byProp( 'id', 'bulk_edit' ) ).props.disabled, true );
} );

test( 'an error shows in the notice, as text, and is spoken', async () => {
	const { row, spoken } = await editor( { error: 'Saving is disabled: <b>Ed</b> is currently editing this post.' } );
	const notice = find( row, byClass( 'notice-error' ) );
	assert.ok( ! hasClass( notice, 'hidden' ) );
	assert.equal( textOf( find( notice, byClass( 'error' ) ) ), 'Saving is disabled: <b>Ed</b> is currently editing this post.' );
	assert.equal( find( notice, byTag( 'b' ) ), null, 'text, never HTML' );
	assert.deepEqual( spoken, [ 'Saving is disabled: <b>Ed</b> is currently editing this post.' ] );
} );

test( 'save carries the row\'s fields as classic posts them, with an empty value for an unchecked box', async () => {
	const control = ( props ) => ( { type: 'text', disabled: false, checked: false, value: '', tagName: 'INPUT', ...props } );
	const controls = [
		control( { name: 'post_title', value: 'Hello' } ),
		control( { name: 'post_password', value: '', disabled: true } ),
		control( { name: 'keep_private', type: 'checkbox', value: 'private', checked: true } ),
		control( { name: 'comment_status', type: 'checkbox', value: 'open', checked: false } ),
		control( { name: 'post_category[]', type: 'hidden', value: '0' } ),
		control( { name: 'post_category[]', type: 'checkbox', value: '3', checked: true } ),
		control( { name: 'post_category[]', type: 'checkbox', value: '4', checked: false } ),
		control( { name: 'tax_input[genre][]', type: 'checkbox', value: '9', checked: true } ),
		control( { name: 'tax_input[post_tag]', tagName: 'TEXTAREA', type: 'textarea', value: 'a, b' } ),
		control( { name: 'acme_note', value: 'x' } ),
		control( { type: 'button', name: '', value: 'Update' } ),
	];
	const { row, events } = await editor( {}, { provide: { inlineEditControls: () => controls } } );
	find( row, byClass( 'save' ) ).props.onClick();
	assert.deepEqual( events[ 0 ][ 1 ], {
		post_title: 'Hello',
		keep_private: 'private',
		post_category: [ '0', '3' ],
		tax_input: { genre: [ '9' ], post_tag: 'a, b' },
		acme_note: 'x',
		comment_status: '',
	} );
} );

// Form fields ------------------------------------------------------------------------------------

test( 'formFields reads names as PHP does: a[] lists, a[b] keys, the last scalar wins; prototype keys are dropped', () => {
	assert.deepEqual( formFields( [
		{ name: 'a', value: '1' }, { name: 'a', value: '2' },
		{ name: 'l[]', value: 'x' }, { name: 'l[]', value: 'y' },
		{ name: 't[k]', value: 'v' }, { name: 't[m][]', value: 'w' },
		{ name: '__proto__[x]', value: 'p' }, { name: 'o[constructor]', value: 'c' },
	] ), { a: '2', l: [ 'x', 'y' ], t: { k: 'v', m: [ 'w' ] }, o: {} } );
	assert.equal( Object.getPrototypeOf( formFields( [] ) ), Object.prototype );
} );

test( 'classicFormFields leaves an unchecked list box out, and a name posted by another control is kept', () => {
	const box = ( name, value, checked ) => ( { name, type: 'checkbox', value, checked, disabled: false, tagName: 'INPUT' } );
	assert.deepEqual( classicFormFields( [ box( 'sticky', 'sticky', false ), box( 'post_category[]', '3', false ), { name: 'sticky', type: 'hidden', value: '1', disabled: false, tagName: 'INPUT' } ] ), { sticky: '1' } );
} );

test( 'a plugin box whose callback failed shows the site\'s failure message in its place, as other captured boxes (I3)', async () => {
	const customBoxes = [
		{ column: 'broken', html: '', error: true },
		{ column: 'partial', html: '<p>half</p>', error: true },
		{ column: 'acme', html: '<fieldset></fieldset>', error: false },
	];
	const { row } = await editor( { customBoxes } );
	const wrapper = find( row, byClass( 'inline-edit-wrapper' ) );
	const failures = findAll( wrapper, byClass( 'wp-admin-legacy-failure' ) );
	assert.equal( failures.length, 2 );
	for ( const failure of failures ) {
		assert.equal( failure.tag, 'p' );
		assert.equal( failure.props.role, 'alert' );
		assert.equal( textOf( failure ), 'This box could not be displayed.' );
	}
	const legacy = findAll( wrapper, byClass( 'wp-admin-legacy-html' ) );
	assert.deepEqual( legacy.map( ( el ) => el.innerHTML ), [ '<fieldset></fieldset>' ] );
	const order = wrapper.children.filter( ( child ) => child.type === 'element' ).map( ( child ) => child.props.class );
	assert.deepEqual( order.slice( 3 ), [ 'wp-admin-legacy-failure', 'wp-admin-legacy-failure', 'wp-admin-legacy-html', 'submit inline-edit-save' ], 'where inline_edit() fires the hooks' );
} );

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { classic, renderedNode } = await import( './helpers/markup.mjs' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );

const { h, ref } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const contractFile = await import( '../site/contracts/core/terms-checklist.js' );
globalThis.__modules[ '/contracts/core/terms-checklist.js' ] = contractFile;
globalThis.__modules[ '/components/core/terms-checklist.js' ] = await import( '../site/components/core/terms-checklist.js' );

afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

// The terms tree as wp-admin/v1 sends it (inlineEdit.fields.taxonomies[].tree).
const TREE = [
	{ id: 1, name: 'Uncategorized', children: [] },
	{ id: 2, name: 'News & Views', children: [ { id: 3, name: 'Local', children: [ { id: 4, name: 'Town', children: [] } ] } ] },
	{ id: 5, name: 'Sport', children: [] },
];

async function checklist( props = {}, { provide = {} } = {} ) {
	const model = ref( props.modelValue ?? [] );
	const indeterminate = ref( props.indeterminate ?? [] );
	const events = [];
	const view = mount( () => h( Contracted, {
		id: 'core/terms-checklist',
		taxonomy: 'category',
		tree: TREE,
		name: 'post_category[]',
		...props,
		modelValue: model.value,
		indeterminate: indeterminate.value,
		'onUpdate:modelValue': ( value ) => {
			events.push( [ 'model', value ] );
			model.value = value;
		},
		'onUpdate:indeterminate': ( value ) => {
			events.push( [ 'indeterminate', value ] );
			indeterminate.value = value;
		},
	} ), { provide } );
	await flush();
	return { view, model, indeterminate, events, list: find( view.container, byTag( 'ul' ) ) };
}

const box = ( view, id ) => find( view.container, byProp( 'id', 'in-category-' + id ) );

test( 'core/terms-checklist is a shared contract with its props and events', () => {
	const contract = contractFile.default;
	assert.deepEqual( Object.keys( contractFile ), [ 'default' ] );
	assert.equal( contract.id, 'core/terms-checklist' );
	assert.equal( contract.version, '1.0.0' );
	assert.notEqual( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'taxonomy', 'tree', 'name', 'modelValue', 'indeterminate', 'html', 'disabled', 'idPrefix' ] );
	assert.deepEqual( Object.keys( contract.slots ), [] );
	assert.deepEqual( contract.emits, [ 'update:modelValue', 'update:indeterminate' ] );
} );

test( 'the tree with nesting equals the classic checklist (Walker_Category_Checklist in ul.cat-checklist)', async () => {
	const { list } = await checklist();
	assert.equal( renderedNode( list ), classic( `
		<ul class="cat-checklist category-checklist">
		<li id="category-1"><label class="selectit"><input value="1" type="checkbox" name="post_category[]" id="in-category-1" /> Uncategorized</label></li>
		<li id="category-2"><label class="selectit"><input value="2" type="checkbox" name="post_category[]" id="in-category-2" /> News &amp; Views</label><ul class="children">
			<li id="category-3"><label class="selectit"><input value="3" type="checkbox" name="post_category[]" id="in-category-3" /> Local</label><ul class="children">
				<li id="category-4"><label class="selectit"><input value="4" type="checkbox" name="post_category[]" id="in-category-4" /> Town</label></li>
			</ul></li>
		</ul></li>
		<li id="category-5"><label class="selectit"><input value="5" type="checkbox" name="post_category[]" id="in-category-5" /> Sport</label></li>
		</ul>` ) );
} );

test( 'another taxonomy: its classes, ids and field name; an id prefix keeps a second list\'s ids apart', async () => {
	const { view, list } = await checklist( { taxonomy: 'genre', name: 'tax_input[genre][]', idPrefix: 'bulk-edit-' } );
	assert.equal( list.props.class, 'cat-checklist genre-checklist' );
	const input = find( view.container, byProp( 'id', 'bulk-edit-in-genre-3' ) );
	assert.equal( input.props.name, 'tax_input[genre][]' );
	assert.ok( find( view.container, byProp( 'id', 'bulk-edit-genre-3' ) ) );
} );

test( 'the boxes follow modelValue; checking and unchecking emit the new list', async () => {
	const { view, events, model } = await checklist( { modelValue: [ 3 ] } );
	assert.equal( box( view, 3 ).props.checked, true );
	assert.equal( box( view, 2 ).props.checked, false );
	box( view, 5 ).props.onChange( { target: { checked: true } } );
	await flush();
	assert.deepEqual( model.value, [ 3, 5 ] );
	box( view, 3 ).props.onChange( { target: { checked: false } } );
	await flush();
	assert.deepEqual( model.value, [ 5 ] );
	assert.deepEqual( events.map( ( event ) => event[ 0 ] ), [ 'model', 'model' ] );
} );

test( 'an indeterminate box: its flag, label and hidden field; clicking it makes it checked, as inline-edit-post.js', async () => {
	const { view, events, model, indeterminate } = await checklist( { modelValue: [ 1 ], indeterminate: [ 2 ] } );
	const input = box( view, 2 );
	assert.equal( input.props.indeterminate, true );
	assert.equal( input.props.checked, false );
	assert.equal( input.props[ 'aria-label' ], 'News & Views: Some selected posts have this category' );
	const label = find( find( view.container, byProp( 'id', 'category-2' ) ), byTag( 'label' ) );
	const hidden = find( label, byProp( 'type', 'hidden' ) );
	assert.deepEqual( [ hidden.props.name, hidden.props.value ], [ 'indeterminate_post_category[]', '2' ] );
	assert.equal( box( view, 1 ).props.indeterminate, false );

	input.props.onChange( { target: { checked: true } } );
	await flush();
	assert.deepEqual( model.value, [ 1, 2 ] );
	assert.deepEqual( indeterminate.value, [] );
	assert.deepEqual( events.map( ( event ) => event[ 0 ] ).sort(), [ 'indeterminate', 'model' ] );
	assert.equal( box( view, 2 ).props.indeterminate, false );
	assert.ok( box( view, 2 ).props[ 'aria-label' ] == null, 'the label is removed with the flag' );
	assert.equal( findAll( view.container, byProp( 'type', 'hidden' ) ).length, 0 );
} );

test( 'disabled: every box is disabled (no assign_terms)', async () => {
	const { view } = await checklist( { disabled: true } );
	for ( const id of [ 1, 2, 3, 4, 5 ] ) {
		assert.equal( box( view, id ).props.disabled, true );
	}
} );

test( 'html: a hooked checklist shows through LegacyHtml in the list, and its checked boxes are read back', async () => {
	const html = '<li id="category-9"><label class="selectit"><input value="9" type="checkbox" name="post_category[]"> Plugin</label></li>';
	const controls = [
		{ name: 'post_category[]', type: 'checkbox', value: '9', checked: true, disabled: false, tagName: 'INPUT' },
		{ name: 'post_category[]', type: 'checkbox', value: '10', checked: false, disabled: false, tagName: 'INPUT' },
		{ name: 'other', type: 'checkbox', value: '11', checked: true, disabled: false, tagName: 'INPUT' },
	];
	const { list, model } = await checklist( { html }, { provide: { termsChecklistControls: () => controls } } );
	assert.equal( list.props.class, 'cat-checklist category-checklist' );
	const legacy = find( list, byClass( 'wp-admin-legacy-html' ) );
	assert.equal( legacy.innerHTML, html );
	assert.equal( find( list, byTag( 'li' ) ), null, 'no tree of its own' );
	list.props.onChange( { target: controls[ 0 ] } );
	await flush();
	assert.deepEqual( model.value, [ 9 ] );
} );

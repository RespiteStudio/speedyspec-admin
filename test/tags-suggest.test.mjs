import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byProp, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { classic, renderedNode } = await import( './helpers/markup.mjs' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );

const { h, ref } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const contractFile = await import( '../site/contracts/core/tags-suggest.js' );
globalThis.__modules[ '/contracts/core/tags-suggest.js' ] = contractFile;
globalThis.__modules[ '/components/core/tags-suggest.js' ] = await import( '../site/components/core/tags-suggest.js' );

afterEach( () => {
	unmountAll();
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
} );

const deferred = () => {
	let resolve;
	const promise = new Promise( ( res ) => {
		resolve = res;
	} );
	return { promise, resolve };
};

async function suggest( props = {} ) {
	const model = ref( props.modelValue ?? '' );
	const spoken = [];
	const view = mount( () => h( Contracted, {
		id: 'core/tags-suggest',
		taxonomy: 'post_tag',
		name: 'tax_input[post_tag]',
		minChars: 2,
		label: 'Tags',
		'aria-describedby': 'inline-edit-post_tag-desc',
		...props,
		modelValue: model.value,
		'onUpdate:modelValue': ( value ) => {
			model.value = value;
		},
	} ), { provide: { speak: ( message ) => spoken.push( message ), tagsSuggestDelay: 0 } } );
	await flush();
	const field = () => find( view.container, byTag( 'textarea' ) );
	const listbox = () => find( view.container, byProp( 'role', 'listbox' ) );
	const type = async ( value ) => {
		field().props.onInput( { target: { value } } );
		await flush();
	};
	return { view, model, spoken, field, listbox, type };
}

const key = ( name ) => ( { key: name, isComposing: false, defaultPrevented: false, propagationStopped: false, preventDefault() {
	this.defaultPrevented = true;
}, stopPropagation() {
	this.propagationStopped = true;
} } );
const options = ( listbox ) => findAll( listbox, byProp( 'role', 'option' ) ).map( textOf );
const shown = ( listbox ) => listbox.props.style !== 'display: none';

test( 'core/tags-suggest is a shared contract with its props and events', () => {
	const contract = contractFile.default;
	assert.deepEqual( Object.keys( contractFile ), [ 'default' ] );
	assert.equal( contract.id, 'core/tags-suggest' );
	assert.equal( contract.version, '1.0.0' );
	assert.notEqual( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'taxonomy', 'name', 'modelValue', 'minChars', 'searchEnabled', 'label' ] );
	assert.deepEqual( contract.emits, [ 'update:modelValue' ] );
} );

test( 'the field: the classic Quick Edit tags label and textarea, with the combobox attributes tags-suggest.js sets', async () => {
	const { view, field, listbox } = await suggest( { modelValue: 'a, b' } );
	const label = find( view.container, byTag( 'label' ) );
	const id = listbox().props.id;
	assert.equal( field().props.value, 'a, b' );
	// A textarea's value is its DOM property (classic prints it as the content, empty in the form).
	delete field().props.value;
	assert.equal( renderedNode( label ), classic( `<label class="inline-edit-tags">
		<span class="title">Tags</span>
		<textarea data-wp-taxonomy="post_tag" cols="22" rows="1" name="tax_input[post_tag]" class="tax_input_post_tag" aria-describedby="inline-edit-post_tag-desc" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-owns="${ id }"></textarea>
	</label>` ) );
	assert.equal( shown( listbox() ), false );
	unmountAll();
	const bare = await suggest( { label: '' } );
	assert.equal( find( bare.view.container, byTag( 'label' ) ), null, 'without a label, the textarea alone' );
	assert.ok( bare.field() );
} );

test( 'no request below minChars characters of the last term', async () => {
	const { type } = await suggest();
	await type( 'a' );
	await type( 'apple, b' );
	await type( 'apple,  b ' );
	assert.deepEqual( api.calls, [] );
} );

test( 'after minChars characters of the last term, GET terms/search; the names are offered and counted aloud', async () => {
	api.respondWith( async () => ( { names: [ 'banana', 'bandana' ] } ) );
	const { type, listbox, field, spoken } = await suggest();
	await type( 'apple, ba' );
	assert.deepEqual( api.calls, [ { method: 'GET', route: 'wp-admin/v1/terms/search', payload: { taxonomy: 'post_tag', q: 'ba', number: 20 } } ] );
	assert.deepEqual( options( listbox() ), [ 'banana', 'bandana' ] );
	assert.ok( shown( listbox() ) );
	assert.equal( field().props[ 'aria-expanded' ], 'true' );
	assert.deepEqual( spoken, [ '%d results found. Use up and down arrow keys to navigate.'.replace( '%d', '2' ) ] );
} );

test( 'answers are ordered: a newer answer that arrives first wins, and the older one is dropped', async () => {
	const first = deferred();
	const second = deferred();
	const pending = [ first, second ];
	api.respondWith( () => pending.shift().promise );
	const { type, listbox } = await suggest();
	await type( 'ba' );
	await type( 'bat' );
	assert.equal( api.calls.length, 2 );
	second.resolve( { names: [ 'batch' ] } );
	await flush();
	assert.deepEqual( options( listbox() ), [ 'batch' ] );
	first.resolve( { names: [ 'banana' ] } );
	await flush();
	assert.deepEqual( options( listbox() ), [ 'batch' ], 'the older answer is dropped' );
} );

test( 'an answer after the field is gone is dropped', async () => {
	const answer = deferred();
	api.respondWith( () => answer.promise );
	const { type } = await suggest();
	await type( 'ba' );
	unmountAll();
	answer.resolve( { names: [ 'banana' ] } );
	await flush();
} );

test( 'choosing a name replaces the last term and adds the delimiter and a space', async () => {
	api.respondWith( async () => ( { names: [ 'banana', 'bandana' ] } ) );
	const { type, listbox, model, field } = await suggest();
	await type( 'apple, ba' );
	findAll( listbox(), byProp( 'role', 'option' ) )[ 1 ].props.onMousedown( key( 'mousedown' ) );
	await flush();
	assert.equal( model.value, 'apple, bandana, ' );
	assert.equal( field().props.value, 'apple, bandana, ' );
	assert.equal( shown( listbox() ), false );
} );

test( 'keys: arrows move through the names, Enter chooses without saving the form; Escape closes the list and goes on, as jQuery UI', async () => {
	api.respondWith( async () => ( { names: [ 'banana', 'bandana' ] } ) );
	const { type, listbox, model, field } = await suggest();
	await type( 'ba' );
	field().props.onKeydown( key( 'ArrowDown' ) );
	field().props.onKeydown( key( 'ArrowDown' ) );
	await flush();
	const active = findAll( listbox(), byProp( 'role', 'option' ) )[ 1 ];
	assert.equal( field().props[ 'aria-activedescendant' ], active.props.id );
	assert.match( active.props.id, /^wp-tags-autocomplete-\d+$/ );
	const enter = key( 'Enter' );
	field().props.onKeydown( enter );
	await flush();
	assert.equal( model.value, 'bandana, ' );
	assert.ok( enter.defaultPrevented && enter.propagationStopped, 'Quick Edit does not save' );

	await type( 'bandana, ba' );
	const escape = key( 'Escape' );
	field().props.onKeydown( escape );
	await flush();
	assert.equal( shown( listbox() ), false );
	assert.ok( escape.defaultPrevented, 'as jQuery UI\'s keydown' );
	assert.equal( escape.propagationStopped, false, 'the key goes on: in Quick Edit its keyup closes the form too, as classic' );
	assert.equal( field().props.onKeyup, undefined, 'the keyup is the form\'s' );
	const plainEnter = key( 'Enter' );
	field().props.onKeydown( plainEnter );
	assert.equal( plainEnter.defaultPrevented, false, 'with no list, Enter is the form\'s' );
} );

test( 'Tab on a highlighted name chooses it and says so', async () => {
	api.respondWith( async () => ( { names: [ 'banana' ] } ) );
	const { type, field, model, spoken } = await suggest();
	await type( 'ba' );
	field().props.onKeydown( key( 'ArrowDown' ) );
	const tab = key( 'Tab' );
	field().props.onKeydown( tab );
	await flush();
	assert.equal( model.value, 'banana, ' );
	assert.equal( spoken.at( -1 ), 'Term selected.' );
} );

test( 'no names: the list stays closed and "No results found." is spoken; a failed search closes it', async () => {
	api.respondWith( async () => ( { names: [] } ) );
	const { type, listbox, spoken } = await suggest();
	await type( 'zz' );
	assert.equal( shown( listbox() ), false );
	assert.deepEqual( spoken, [ 'No results found.' ] );
	api.respondWith( async () => {
		throw new Error( 'nope' );
	} );
	await type( 'zzz' );
	assert.equal( shown( listbox() ), false );
} );

test( 'a cached search makes an older answer still in flight stale', async () => {
	const pending = [];
	api.respondWith( () => {
		const next = deferred();
		pending.push( next );
		return next.promise;
	} );
	const { type, listbox } = await suggest();
	await type( 'ba' );
	pending[ 0 ].resolve( { names: [ 'banana' ] } );
	await flush();
	await type( 'bat' );
	assert.equal( api.calls.length, 2 );
	await type( 'ba' );
	assert.equal( api.calls.length, 2, 'the cache answers' );
	assert.deepEqual( options( listbox() ), [ 'banana' ] );
	pending[ 1 ].resolve( { names: [ 'batch' ] } );
	await flush();
	assert.deepEqual( options( listbox() ), [ 'banana' ], 'the older bat answer is dropped' );
	// And the cache was not replaced by it: the same text is still answered from the cache.
	await type( 'b' );
	await type( 'ba' );
	assert.equal( api.calls.length, 2 );
	assert.deepEqual( options( listbox() ), [ 'banana' ] );
} );

test( 'WordPress decides the threshold: bytes as strlen() counts them, and no search at all when it is off', async () => {
	api.respondWith( async () => ( { names: [ 'neko' ] } ) );
	const { type } = await suggest( { minChars: 3 } );
	await type( 'a, \u732b' );
	assert.equal( api.calls.length, 1, 'one character, three bytes: the server would answer, so the site asks' );
	assert.equal( api.calls[ 0 ].payload.q, '\u732b' );
	await type( 'a, ab' );
	assert.equal( api.calls.length, 1, 'two bytes are below 3' );
	unmountAll();
	api.reset();
	const off = await suggest( { minChars: 0, searchEnabled: false } );
	await off.type( 'apple, banana' );
	await off.type( '' );
	assert.deepEqual( api.calls, [], 'searchEnabled false: never' );
	unmountAll();
	const zero = await suggest( { minChars: 0 } );
	await zero.type( 'a, ' );
	assert.equal( api.calls.length, 1, 'a 0 threshold with the search on (a negative filter value) refuses nothing' );
} );

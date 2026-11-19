import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mountQuicktagsEditor } from '../site/runtime/quicktags.js';

// A small document: elements with attributes, children, listeners and focus, found by id.
function fakeDocument() {
	const doc = { focused: null, body: null };
	const all = ( node ) => [ node, ...node.children.flatMap( all ) ];
	const element = ( tag ) => {
		const el = {
			tagName: tag.toUpperCase(),
			attributes: {},
			children: [],
			parentNode: null,
			listeners: {},
			value: '',
			ownerDocument: doc,
			get id() {
				return this.attributes.id ?? '';
			},
			set id( value ) {
				this.attributes.id = value;
			},
			get className() {
				return this.attributes.class ?? '';
			},
			set className( value ) {
				this.attributes.class = value;
			},
			setAttribute( name, value ) {
				this.attributes[ name ] = String( value );
			},
			getAttribute( name ) {
				return this.attributes[ name ] ?? null;
			},
			appendChild( child ) {
				child.parentNode?.removeChild( child );
				child.parentNode = this;
				this.children.push( child );
				return child;
			},
			insertBefore( child, ref ) {
				child.parentNode?.removeChild( child );
				child.parentNode = this;
				const at = this.children.indexOf( ref );
				this.children.splice( at < 0 ? this.children.length : at, 0, child );
				return child;
			},
			removeChild( child ) {
				this.children.splice( this.children.indexOf( child ), 1 );
				child.parentNode = null;
				return child;
			},
			remove() {
				this.parentNode?.removeChild( this );
			},
			addEventListener( type, fn ) {
				( this.listeners[ type ] ??= [] ).push( fn );
			},
			removeEventListener( type, fn ) {
				this.listeners[ type ] = ( this.listeners[ type ] ?? [] ).filter( ( f ) => f !== fn );
			},
			dispatch( type ) {
				for ( const fn of this.listeners[ type ] ?? [] ) {
					fn( { type, target: this } );
				}
			},
			focus() {
				doc.focused = this;
			},
		};
		return el;
	};
	doc.createElement = element;
	doc.body = element( 'body' );
	doc.getElementById = ( id ) => all( doc.body ).find( ( el ) => el.id === id ) ?? null;
	return doc;
}

/** Stubs of core's quicktags() and QTags, recording what they are called with. */
function stubQuicktags( doc ) {
	const calls = [];
	const QTags = {
		instances: {},
		_buttonsInit( id ) {
			calls.push( [ '_buttonsInit', id ] );
		},
	};
	globalThis.QTags = QTags;
	globalThis.quicktags = ( settings ) => {
		calls.push( [ 'quicktags', settings ] );
		const canvas = doc.getElementById( settings.id );
		const toolbar = doc.createElement( 'div' );
		toolbar.id = 'qt_' + settings.id + '_toolbar';
		canvas.parentNode.insertBefore( toolbar, canvas );
		QTags.instances[ settings.id ] = { id: settings.id, canvas, toolbar };
		return QTags.instances[ settings.id ];
	};
	return { calls, QTags };
}

afterEach( () => {
	delete globalThis.quicktags;
	delete globalThis.QTags;
	delete globalThis.document;
} );

const SETTINGS = { id: 'replycontent', buttons: 'strong,em,link,block,del,ins,img,ul,ol,li,code,close' };

function hostIn( doc ) {
	globalThis.document = doc;
	const host = doc.createElement( 'div' );
	doc.body.appendChild( host );
	return host;
}

test( 'mountQuicktagsEditor creates the classic textarea in the host, with its value', () => {
	const doc = fakeDocument();
	const host = hostIn( doc );
	const editor = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', value: 'Hello' } );
	assert.equal( host.children.length, 1 );
	const textarea = host.children[ 0 ];
	assert.equal( textarea.tagName, 'TEXTAREA' );
	assert.deepEqual( textarea.attributes, { id: 'replycontent', class: 'wp-editor-area', name: 'replycontent', rows: '20', cols: '40', autocomplete: 'off' } );
	assert.equal( textarea.value, 'Hello' );
	editor.setValue( 'Changed' );
	assert.equal( textarea.value, 'Changed' );
	editor.focus();
	assert.equal( doc.focused, textarea );
	editor.destroy();
	assert.equal( host.children.length, 0, 'the textarea goes with it' );
} );

test( 'what is typed, and what a Quicktags button inserts (a change event), is reported', () => {
	const doc = fakeDocument();
	const host = hostIn( doc );
	const typed = [];
	const editor = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', value: '', onInput: ( value ) => typed.push( value ) } );
	const textarea = host.children[ 0 ];
	textarea.value = 'a';
	textarea.dispatch( 'input' );
	textarea.value = 'a<strong></strong>';
	textarea.dispatch( 'change' );
	assert.deepEqual( typed, [ 'a', 'a<strong></strong>' ] );
	editor.destroy();
	textarea.dispatch( 'input' );
	assert.equal( typed.length, 2, 'no report after destroy' );
} );

test( 'once the screen assets are ready, quicktags( settings ) and QTags._buttonsInit() run; destroy removes the toolbar and the instance', async () => {
	const doc = fakeDocument();
	const host = hostIn( doc );
	const { calls, QTags } = stubQuicktags( doc );
	let release;
	const ready = new Promise( ( resolve ) => {
		release = resolve;
	} );
	const editor = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', value: '', settings: SETTINGS, ready: () => ready } );
	await Promise.resolve();
	assert.deepEqual( calls, [], 'not before the assets are ready' );
	release();
	await editor.started;
	assert.deepEqual( calls, [ [ 'quicktags', SETTINGS ], [ '_buttonsInit', undefined ] ] );
	assert.ok( doc.getElementById( 'qt_replycontent_toolbar' ) );
	assert.ok( QTags.instances.replycontent );

	editor.destroy();
	assert.equal( doc.getElementById( 'qt_replycontent_toolbar' ), null );
	assert.equal( QTags.instances.replycontent, undefined );
	assert.equal( host.children.length, 0 );

	// A revisit creates it again.
	const again = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', value: '', settings: SETTINGS } );
	await again.started;
	assert.equal( calls.filter( ( [ name ] ) => name === 'quicktags' ).length, 2 );
	assert.ok( QTags.instances.replycontent );
	assert.ok( doc.getElementById( 'qt_replycontent_toolbar' ) );
	again.destroy();
} );

test( 'the settings start Quicktags on this editor\'s textarea only', async () => {
	const doc = fakeDocument();
	const host = hostIn( doc );
	const { calls } = stubQuicktags( doc );
	const editor = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', settings: { id: 'content', buttons: 'strong' } } );
	await editor.started;
	assert.deepEqual( calls[ 0 ], [ 'quicktags', { id: 'replycontent', buttons: 'strong' } ] );
	editor.destroy();
} );

test( 'an editor destroyed before the assets are ready never starts Quicktags', async () => {
	const doc = fakeDocument();
	const host = hostIn( doc );
	const { calls } = stubQuicktags( doc );
	let release;
	const editor = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', settings: SETTINGS, ready: () => new Promise( ( resolve ) => {
		release = resolve;
	} ) } );
	editor.destroy();
	release();
	await editor.started;
	assert.deepEqual( calls, [] );
} );

test( 'without quicktags, or without settings (Quicktags off), the plain textarea stays', async () => {
	const doc = fakeDocument();
	const host = hostIn( doc );
	const plain = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', settings: SETTINGS } );
	await plain.started;
	assert.equal( host.children.length, 1 );
	assert.equal( host.children[ 0 ].tagName, 'TEXTAREA' );
	plain.destroy();

	const { calls } = stubQuicktags( doc );
	for ( const settings of [ [], null, {}, undefined ] ) {
		const off = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', settings } );
		await off.started;
		off.destroy();
	}
	assert.deepEqual( calls, [] );
} );

test( 'a ready() that fails still starts Quicktags, as LegacyHtml goes on after failed screen assets', async () => {
	const doc = fakeDocument();
	const host = hostIn( doc );
	const { calls } = stubQuicktags( doc );
	const editor = mountQuicktagsEditor( host, { id: 'replycontent', name: 'replycontent', settings: SETTINGS, ready: () => Promise.reject( new Error( 'no assets' ) ) } );
	await editor.started;
	assert.equal( calls[ 0 ][ 0 ], 'quicktags' );
	editor.destroy();
} );

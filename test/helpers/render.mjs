// Mounting real components on the fake DOM (helpers/dom.mjs) with the template
// translation helpers installed, plus small queries over the rendered tree.
// The specifiers it reaches resolve through moduleNameMapper (jest.config.mjs).
import { createNodeOps } from './dom.mjs';

const Vue = await import( '../../site/vendor/vue.esm-browser.prod.js' );
const { installTemplateI18n } = await import( '../../site/runtime/template-i18n.js' );

const mounted = [];
export let focused = null;

export function unmountAll() {
	while ( mounted.length ) {
		mounted.pop().unmount();
	}
	focused = null;
}

export function mount( root, { provide = {} } = {} ) {
	const { ops, text } = createNodeOps();
	const createElement = ops.createElement;
	ops.createElement = ( tag ) => {
		const el = createElement( tag );
		el.focus = () => {
			focused = el;
		};
		return el;
	};
	const container = ops.createElement( 'div' );
	const app = Vue.createRenderer( ops ).createApp( { render: () => ( typeof root === 'function' ? root() : root ) } );
	installTemplateI18n( app );
	for ( const [ key, value ] of Object.entries( provide ) ) {
		app.provide( key, value );
	}
	app.config.errorHandler = ( error ) => {
		throw error;
	};
	app.mount( container );
	mounted.push( app );
	return { container, text: () => text( container ), app };
}

export const textOf = ( node ) => ( node.type === 'text' ? node.text : node.type === 'comment' ? '' : node.children.map( textOf ).join( '' ) );

/** All elements under `node` (depth first) for which `test(el)` holds. */
export function findAll( node, test ) {
	const out = [];
	const walk = ( n ) => {
		if ( n.type === 'element' ) {
			if ( test( n ) ) {
				out.push( n );
			}
			n.children.forEach( walk );
		}
	};
	node.children.forEach( walk );
	return out;
}

export const find = ( node, test ) => findAll( node, test )[ 0 ] ?? null;

/** Class list of a rendered element (Vue passes the normalised class string). */
export const classes = ( el ) => String( el.props.class ?? '' ).split( /\s+/ ).filter( Boolean );
export const hasClass = ( el, name ) => classes( el ).includes( name );
export const byTag = ( tag ) => ( el ) => el.tag === tag;
export const byClass = ( name ) => ( el ) => hasClass( el, name );
export const byProp = ( key, value ) => ( el ) => el.props[ key ] === value;

export { Vue };

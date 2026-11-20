import { collectControls } from '../../../kit/LegacyHtml.js';

// Keys that would reach an object's prototype: a control named after them is left out.
const UNSAFE = new Set( [ '__proto__', 'constructor', 'prototype' ] );
const NAME = /^([^[\]]+)((?:\[[^[\]]*\])*)$/;

/**
 * The fields of a form as PHP reads a posted form into `$_POST`: `a[]` appends to a list,
 * `a[b]` sets a key of an object (to any depth, `tax_input[genre][]`), and a plain name keeps
 * the last value posted. Values stay strings, as posted. Pure.
 *
 * @param {{name: string, value: string}[]} pairs The pairs a form submits, in document order.
 * @return {Object} The fields.
 */
export function formFields( pairs ) {
	const out = {};
	for ( const { name, value } of Array.isArray( pairs ) ? pairs : [] ) {
		const match = NAME.exec( String( name ?? '' ) );
		if ( ! match ) {
			continue;
		}
		const keys = [ match[ 1 ], ...[ ...match[ 2 ].matchAll( /\[([^[\]]*)\]/g ) ].map( ( part ) => part[ 1 ] ) ];
		if ( keys.some( ( part ) => UNSAFE.has( part ) ) ) {
			// Its parents are still made, as PHP makes them; the unsafe key is not.
			let target = out;
			for ( const part of keys.slice( 0, keys.findIndex( ( k ) => UNSAFE.has( k ) ) ) ) {
				if ( target[ part ] === null || typeof target[ part ] !== 'object' ) {
					target[ part ] = {};
				}
				target = target[ part ];
			}
			continue;
		}
		let target = out;
		keys.forEach( ( part, index ) => {
			if ( target === null ) {
				return;
			}
			const last = index === keys.length - 1;
			if ( part === '' ) {
				if ( ! Array.isArray( target ) ) {
					target = null;
					return;
				}
				if ( last ) {
					target.push( String( value ) );
				} else {
					const next = keys[ index + 1 ] === '' ? [] : {};
					target.push( next );
					target = next;
				}
				return;
			}
			if ( last ) {
				target[ part ] = String( value );
				return;
			}
			const wantList = keys[ index + 1 ] === '';
			const current = Object.hasOwn( target, part ) ? target[ part ] : undefined;
			if ( current === null || typeof current !== 'object' || Array.isArray( current ) !== wantList ) {
				target[ part ] = wantList ? [] : {};
			}
			target = target[ part ];
		} );
	}
	return out;
}

/**
 * The fields a classic inline form posts (inline-edit-post.js serializes the row's controls),
 * read as formFields() reads them, for the wp-admin/v1 routes. One difference, so that the route
 * stores what the classic handler stores: an unchecked checkbox with a plain name
 * (`comment_status`, `ping_status`, `sticky`, `keep_private`) posts nothing to the classic
 * handler, which reads that as "off"; the route reads a missing field as "keep the post's", so it
 * is sent as `''` ("off"). A box named as a list (`post_category[]`) is left out, as classic
 * leaves it out; a name another control posts keeps that control's value.
 *
 * @param {Iterable<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>} controls In document order.
 * @return {Object} The fields.
 */
export function classicFormFields( controls ) {
	const list = [ ...( controls ?? [] ) ];
	const pairs = collectControls( list );
	const fields = formFields( pairs );
	const posted = new Set( pairs.map( ( pair ) => pair.name ) );
	for ( const control of list ) {
		const name = String( control?.name ?? '' );
		const type = String( control?.type ?? '' ).toLowerCase();
		if ( type === 'checkbox' && name !== '' && ! name.includes( '[' ) && ! UNSAFE.has( name ) && ! posted.has( name ) && ! control.disabled ) {
			fields[ name ] = '';
			posted.add( name );
		}
	}
	return fields;
}

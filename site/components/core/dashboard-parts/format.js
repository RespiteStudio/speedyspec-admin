import { decodeEntities } from '../../../kit/Interpolate.js';

/*
 * <Format :text="$__( 'From %1$s on %2$s %3$s', 'default' )">
 *     <template #arg1>…</template> …
 * </Format>
 *
 * A translated sentence whose placeholders hold markup of the page (a link inside a `cite`),
 * which kit/Interpolate cannot nest: the text between the placeholders is shown as text
 * (character references decoded, never HTML) and each placeholder `%N$s` (or the Nth `%s`) is
 * the slot `argN`. `%%` is a percent sign. A placeholder without a slot shows nothing.
 */
const PLACEHOLDER = /%%|%(?:(\d+)\$)?s/g;

/**
 * The parts of a sentence: text, and `{ slot }` for each placeholder. Pure.
 *
 * @param {string} text Sentence.
 * @return {Array<string|{slot: string}>} Parts in order.
 */
export function formatParts( text ) {
	const parts = [];
	const source = String( text ?? '' );
	let last = 0;
	let next = 0;
	const pushText = ( value ) => {
		if ( value !== '' ) {
			parts.push( value );
		}
	};
	for ( const match of source.matchAll( PLACEHOLDER ) ) {
		pushText( decodeEntities( source.slice( last, match.index ) ) );
		last = match.index + match[ 0 ].length;
		if ( match[ 0 ] === '%%' ) {
			pushText( '%' );
			continue;
		}
		parts.push( { slot: 'arg' + ( match[ 1 ] ? Number( match[ 1 ] ) : ++next ) } );
	}
	pushText( decodeEntities( source.slice( last ) ) );
	return parts;
}

export default {
	name: 'DashboardFormat',
	props: {
		text: { type: String, required: true },
	},
	setup( props, { slots } ) {
		return () => formatParts( props.text ).flatMap( ( part ) => ( typeof part === 'string' ? [ part ] : slots[ part.slot ]?.() ?? [] ) );
	},
};

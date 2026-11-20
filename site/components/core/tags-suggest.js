import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { __, _n, _x, sprintf } from '../../runtime/text.js';
import { ANSWER_TIMEOUT } from './list-table-parts/ordered-answers.js';

export const SEARCH_ROUTE = 'wp-admin/v1/terms/search';
// As tags-suggest.js asks the classic handler for.
const NUMBER = 20;
let fieldCount = 0;
let optionCount = 0; // tags-suggest.js's tempID: every option of the visit has its own id.

const escapeRegExp = ( text ) => text.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );

/** The tag delimiter (a translation, verbatim from core) and tags-suggest.js's split(). */
export function delimiter() {
	return _x( ',', 'tag delimiter', 'default' ) || ',';
}
export const splitNames = ( value, separator = delimiter() ) => String( value ?? '' ).split( new RegExp( escapeRegExp( separator ) + '\\s*' ) );

/** tags-suggest.js's select(): the last name replaced by `name`, then the delimiter and a space. Pure. */
export function withChosen( value, name, separator = delimiter() ) {
	const names = splitNames( value, separator );
	names.pop();
	names.push( name, '' );
	return names.join( separator + ' ' );
}

/**
 * Default implementation of core/tags-suggest: tags-suggest.js's field, without jQuery UI.
 *
 * - Typing (after `tagsSuggestDelay` ms, 300 as jQuery UI's autocomplete; injectable: tests)
 *   searches the last name once it has `minChars` characters; focusing the field searches too
 *   when there is a last name. The same text is not searched twice in a row (tags-suggest.js's
 *   cache).
 * - Only the answer of the newest search is shown: an older one, early or late, is dropped (as
 *   jQuery UI's autocomplete keeps the last request's), and so is any answer after unmount.
 * - The names are offered in a `ul[role=listbox]` (`li[role=option]#wp-tags-autocomplete-{n}`);
 *   the count, or "No results found.", is spoken, as jQuery UI's live region says it.
 * - Up and Down move through the names (`aria-activedescendant`); Enter or a click chooses one,
 *   Tab chooses it and says "Term selected."; choosing replaces the last name and adds the
 *   delimiter and a space. Enter on a name never reaches the inline form (no save); Escape with
 *   the list open closes it and never reaches the inline form (no cancel).
 */
export default {
	name: 'TagsSuggest',
	inheritAttrs: false,
	props: {
		taxonomy: { type: String, required: true },
		name: { type: String, required: true },
		modelValue: { type: String, default: '' },
		minChars: { type: Number, default: 2 },
		label: { type: String, default: '' },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit, attrs } ) {
		const speak = inject( 'speak', null ) ?? ( ( message, politeness ) => globalThis.wp?.a11y?.speak?.( message, politeness ) );
		const delay = inject( 'tagsSuggestDelay', 300 );
		const listId = 'wp-tags-suggest-' + ++fieldCount;
		const value = ref( String( props.modelValue ?? '' ) );
		const names = ref( [] ); // [ { id, name } ]
		const open = ref( false );
		const active = ref( -1 );
		const loading = ref( false );
		let latest = 0;
		let timer = null;
		let alive = true;
		let lastSearched = null;
		let cache = null;
		let swallowEscape = false;

		watch( () => props.modelValue, ( next ) => {
			value.value = String( next ?? '' );
		} );

		function close() {
			open.value = false;
			active.value = -1;
		}
		function show( found ) {
			names.value = found;
			active.value = -1;
			open.value = found.length > 0;
			speak( found.length > 0
				? sprintf( _n( '%d result found. Use up and down arrow keys to navigate.', '%d results found. Use up and down arrow keys to navigate.', found.length, 'default' ), found.length )
				: __( 'No results found.', 'default' ) );
		}

		function search() {
			const text = value.value;
			const term = splitNames( text ).pop();
			if ( term.trim().length < Math.max( 0, Number( props.minChars ) || 0 ) ) {
				latest++;
				loading.value = false;
				close();
				return;
			}
			if ( text === lastSearched && cache ) {
				show( cache );
				return;
			}
			const mine = ++latest;
			loading.value = true;
			api.get( SEARCH_ROUTE, { taxonomy: props.taxonomy, q: term, number: NUMBER }, { timeout: ANSWER_TIMEOUT } ).then( ( answer ) => {
				if ( ! alive || mine !== latest ) {
					return;
				}
				loading.value = false;
				const found = ( Array.isArray( answer?.names ) ? answer.names : [] ).filter( ( item ) => typeof item === 'string' ).map( ( item ) => ( { id: ++optionCount, name: item } ) );
				lastSearched = text;
				cache = found;
				show( found );
			}, () => {
				if ( ! alive || mine !== latest ) {
					return;
				}
				loading.value = false;
				close();
			} );
		}
		function schedule() {
			globalThis.clearTimeout( timer );
			if ( delay > 0 ) {
				timer = globalThis.setTimeout( search, delay );
			} else {
				search();
			}
		}

		function choose( index, { tab = false } = {} ) {
			const item = names.value[ index ];
			if ( ! item ) {
				return;
			}
			value.value = withChosen( value.value, item.name );
			emit( 'update:modelValue', value.value );
			close();
			if ( tab ) {
				speak( __( 'Term selected.', 'default' ), 'assertive' );
			}
		}

		function onInput( event ) {
			value.value = String( event?.target?.value ?? '' );
			emit( 'update:modelValue', value.value );
			schedule();
		}
		function onBlur() {
			// A search still to run or to answer is not shown once the field is left.
			globalThis.clearTimeout( timer );
			latest++;
			loading.value = false;
			close();
		}
		function onFocus() {
			if ( splitNames( value.value ).pop() ) {
				schedule();
			}
		}
		function onKeydown( event ) {
			if ( event?.isComposing ) {
				return;
			}
			const count = names.value.length;
			switch ( event?.key ) {
				case 'ArrowDown':
				case 'ArrowUp':
					if ( ! open.value ) {
						search();
						return;
					}
					event.preventDefault?.();
					active.value = event.key === 'ArrowDown' ? ( active.value + 1 ) % count : ( active.value <= 0 ? count - 1 : active.value - 1 );
					return;
				case 'Enter':
					if ( open.value && active.value >= 0 ) {
						event.preventDefault?.();
						event.stopPropagation?.();
						choose( active.value );
					}
					return;
				case 'Tab':
					if ( open.value && active.value >= 0 ) {
						event.preventDefault?.();
						choose( active.value, { tab: true } );
					}
					return;
				case 'Escape':
					if ( open.value ) {
						event.preventDefault?.();
						event.stopPropagation?.();
						swallowEscape = true;
						close();
					}
					return;
				default:
			}
		}
		function onKeyup( event ) {
			if ( event?.key === 'Escape' && swallowEscape ) {
				swallowEscape = false;
				event.stopPropagation?.();
			}
		}

		onBeforeUnmount( () => {
			alive = false;
			globalThis.clearTimeout( timer );
		} );

		const optionId = ( item ) => 'wp-tags-autocomplete-' + item.id;
		const field = computed( () => ( {
			...attrs,
			'data-wp-taxonomy': props.taxonomy,
			cols: '22',
			rows: '1',
			name: props.name,
			class: [ 'tax_input_' + props.taxonomy, { 'ui-autocomplete-loading': loading.value }, attrs.class ],
			role: 'combobox',
			'aria-autocomplete': 'list',
			'aria-expanded': String( open.value ),
			'aria-owns': listId,
			'aria-activedescendant': open.value && active.value >= 0 ? optionId( names.value[ active.value ] ) : null,
			value: value.value,
			onInput,
			onFocus,
			onBlur,
			onKeydown,
			onKeyup,
		} ) );

		return { listId, names, open, active, field, optionId, choose };
	},
	template: `
		<label v-if="label" class="inline-edit-tags"><span class="title">{{ label }}</span><textarea v-bind="field"></textarea></label>
		<textarea v-else v-bind="field"></textarea>
		<ul :id="listId" role="listbox" class="ui-menu ui-widget ui-widget-content ui-autocomplete ui-front wp-tags-autocomplete" :style="open ? null : 'display: none'">
			<li v-for="( item, index ) in names" :key="item.id" :id="optionId( item )" role="option" :class="{ 'ui-state-active': index === active }" :aria-selected="index === active ? 'true' : 'false'" @mousedown.prevent="choose( index )">{{ item.name }}</li>
		</ul>
	`,
};

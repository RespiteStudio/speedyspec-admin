import { onBeforeUnmount, ref } from 'vue';

/*
 * The live search of the classic list screens, as updates.js runs it on the Plugins screens:
 * after a pause in typing (each screen's own: `delay`), the address of the term is opened with
 * the history entry replaced; nothing below `min` characters unless the previous search was
 * longer; the same term is not searched twice (unless asked again, as a type change does);
 * Escape clears the field; the form's submit opens the search at once in a new history entry.
 */

const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/**
 * The live search of a page. Call it in the page's `setup()`; its timer stops on unmount.
 *
 * @param {object}   options
 * @param {number}   options.delay    The pause in typing, in ms.
 * @param {number}   [options.min]    The fewest characters searched. Default 2.
 * @param {( term: string ) => string} options.path The admin path of a term's search.
 * @param {( path: string, options?: object ) => unknown} options.navigate Opens an admin path.
 * @return {{term: import('vue').Ref<string>, onInput: Function, onSubmit: Function, again: Function, reset: Function, stop: Function}}
 *         `onInput( event )` for `input` and `keyup`; `onSubmit( event )`; `again()` searches the
 *         term again after the pause; `reset( term )` sets the term the page shows; `stop()`.
 */
export function useLiveSearch( { delay, min = 2, path, navigate } ) {
	const term = ref( '' );
	let timer = null;
	let lastSearched = '';
	let previousLength = 0;

	function stop() {
		if ( timer !== null ) {
			globalThis.clearTimeout( timer );
			timer = null;
		}
	}

	function schedule( again = false ) {
		stop();
		timer = globalThis.setTimeout( () => {
			timer = null;
			const length = term.value.length;
			const should = length >= min || previousLength > min;
			previousLength = length;
			if ( ! should || ( term.value === lastSearched && ! again ) ) {
				return;
			}
			lastSearched = term.value;
			navigate( path( term.value ), { replace: true } );
		}, delay );
	}

	function onInput( event ) {
		term.value = text( event?.target?.value );
		if ( event?.type === 'keyup' && event.key === 'Escape' ) {
			term.value = '';
			if ( event.target ) {
				event.target.value = '';
			}
		}
		schedule();
	}

	function onSubmit( event ) {
		event?.preventDefault?.();
		stop();
		lastSearched = term.value;
		navigate( path( term.value ) );
	}

	function reset( value ) {
		stop();
		term.value = text( value );
		lastSearched = term.value;
		previousLength = term.value.length;
	}

	onBeforeUnmount( stop );

	return { term, onInput, onSubmit, again: () => schedule( true ), reset, stop };
}

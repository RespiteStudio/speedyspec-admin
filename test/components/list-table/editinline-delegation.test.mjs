/** @jest-environment jsdom */
// The delegated `.editinline` rule shared by the list pages (inline-edit-post.js, inline-edit-tax.js):
// a click on an element with the class inside the row actions yields it, unless the click was
// prevented by the plugin's own handler.
import { afterEach, expect, test } from '@jest/globals';
import { editinlineTrigger } from '../../../site/components/core/list-table-parts/row-actions.js';

afterEach( () => {
	document.body.innerHTML = '';
} );

function click( { prevent = false, target = '.editinline' } = {} ) {
	document.body.innerHTML = '<div class="row-actions"><span class="inline"><button type="button" class="button-link editinline"><i class="inner">Quick</i></button> | </span><a class="other" href="#">Other</a></div>';
	const root = document.querySelector( '.row-actions' );
	let result;
	root.addEventListener( 'click', ( event ) => {
		if ( prevent ) {
			event.preventDefault();
		}
		result = editinlineTrigger( event );
	} );
	document.querySelector( target ).dispatchEvent( new MouseEvent( 'click', { bubbles: true, cancelable: true } ) );
	return result;
}

test( 'a click on .editinline inside the row actions returns it', () => {
	expect( click() ).toBe( document.querySelector( '.editinline' ) );
} );

test( 'a click on an element inside .editinline returns the .editinline element', () => {
	expect( click( { target: '.inner' } ) ).toBe( document.querySelector( '.editinline' ) );
} );

test( 'a defaultPrevented click returns null', () => {
	expect( click( { prevent: true } ) ).toBeNull();
} );

test( 'a click elsewhere in the row actions returns null', () => {
	expect( click( { target: '.other' } ) ).toBeNull();
} );

/** @jest-environment jsdom */
// One notice in the classic markup: its type classes, text or markup, the Dismiss button
// with its screen reader name, and the action button, which runs its action and then dismisses.
import { expect, test, jest } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import NoticeItem from '../../../site/components/core/notice-item.js';
import { noticeElementId } from '../../../site/runtime/notices.js';

const notice = ( extra = {} ) => ( { id: 'notice-3', type: 'warning', message: 'Careful.', dismissible: true, ...extra } );
// `onDismiss` is the parent's listener for the `dismiss` event: the frame's own.
const show = ( n, onDismiss = () => {} ) => mountPart( NoticeItem, { props: { notice: n, onDismiss } } );

test( 'shows the message in the classic notice markup, and can take focus by its id', () => {
	const wrapper = show( notice() );
	const root = wrapper.find( 'div.notice' );
	expect( root.classes() ).toEqual( [ 'notice', 'notice-warning', 'is-dismissible' ] );
	expect( root.attributes( 'id' ) ).toBe( noticeElementId( 'notice-3' ) );
	expect( root.attributes( 'tabindex' ) ).toBe( '-1' );
	expect( wrapper.find( 'p' ).text() ).toBe( 'Careful.' );
} );

test( 'Dismiss emits the notice id, and its button is named for assistive technology', async () => {
	const dismissed = jest.fn();
	const wrapper = show( notice(), dismissed );
	const button = wrapper.find( 'button.notice-dismiss' );
	expect( button.find( '.screen-reader-text' ).text() ).toBe( 'Dismiss this notice.' );
	expect( dismissed ).not.toHaveBeenCalled();

	await button.trigger( 'click' );
	expect( dismissed ).toHaveBeenCalledTimes( 1 );
	expect( dismissed ).toHaveBeenCalledWith( 'notice-3' );
} );

test( 'a notice that is not dismissible has no Dismiss button and no is-dismissible class', () => {
	const wrapper = show( notice( { dismissible: false } ) );
	expect( wrapper.find( 'button.notice-dismiss' ).exists() ).toBe( false );
	expect( wrapper.find( 'div.notice' ).classes() ).not.toContain( 'is-dismissible' );
} );

test( 'the action button shows its label, runs the action once and then dismisses the notice', async () => {
	const order = [];
	const run = jest.fn( () => order.push( 'run' ) );
	const dismissed = jest.fn( ( id ) => order.push( 'dismiss ' + id ) );
	const wrapper = show( notice( { action: { label: 'Reload this screen', run } } ), dismissed );

	const button = wrapper.find( 'button.button' );
	expect( button.text() ).toBe( 'Reload this screen' );
	expect( run ).not.toHaveBeenCalled();

	await button.trigger( 'click' );
	expect( run ).toHaveBeenCalledTimes( 1 );
	expect( order ).toEqual( [ 'run', 'dismiss notice-3' ] );
} );

test( 'a notice without an action has no action button', () => {
	expect( show( notice() ).find( 'button.button' ).exists() ).toBe( false );
} );

test( 'markup shows its links through the inline markup and never as HTML; plain text stays text', () => {
	const marked = show( notice( { markup: 'See <a href="https://example.org/">the docs</a><script>window.__ran = true</script>' } ) );
	expect( marked.find( 'p a' ).attributes( 'href' ) ).toBe( 'https://example.org/' );
	expect( marked.find( 'script' ).exists() ).toBe( false );
	expect( globalThis.window.__ran ).toBeUndefined();

	const plain = show( notice( { message: 'Use <b>bold</b>.' } ) );
	expect( plain.find( 'b' ).exists() ).toBe( false );
	expect( plain.find( 'p' ).text() ).toBe( 'Use <b>bold</b>.' );
} );

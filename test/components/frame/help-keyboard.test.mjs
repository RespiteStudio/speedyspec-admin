/** @jest-environment jsdom */
// The keyboard of the Help panel's tab list (core/help-tabs): a vertical ARIA tab list where
// only the selected tab is in the tab order, the arrow keys wrap, Home and End go to the ends,
// the selection follows focus and any other key is left alone.
import { expect, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import HelpTabs from '../../../site/components/core/help-tabs.js';

const TABS = [
	{ id: 'overview', title: 'Overview', content: '<p>One</p>', priority: 10 },
	{ id: 'layout', title: 'Layout', content: '<p>Two</p>', priority: 10 },
	{ id: 'actions', title: 'Actions', content: '<p>Three</p>', priority: 10 },
];

const open = ( tabs = TABS ) => mountPart( HelpTabs, { props: { tabs, sidebar: null } } );
const tabs = ( wrapper ) => wrapper.findAll( '[role="tab"]' );
const selected = ( wrapper ) => tabs( wrapper ).filter( ( tab ) => tab.attributes( 'aria-selected' ) === 'true' ).map( ( tab ) => tab.text() );
const inTabOrder = ( wrapper ) => tabs( wrapper ).filter( ( tab ) => tab.attributes( 'tabindex' ) === '0' ).map( ( tab ) => tab.text() );
const visiblePanels = ( wrapper ) => wrapper.findAll( '[role="tabpanel"]' ).filter( ( panel ) => panel.attributes( 'hidden' ) === undefined ).map( ( panel ) => panel.text() );
const focused = () => document.activeElement?.textContent;

async function press( wrapper, index, key ) {
	await tabs( wrapper )[ index ].trigger( 'keydown', { key } );
	await flushPromises();
}

test( 'the first tab starts selected and alone in the tab order, with its panel shown', () => {
	const wrapper = open();
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( inTabOrder( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( tabs( wrapper ).map( ( tab ) => tab.attributes( 'tabindex' ) ) ).toEqual( [ '0', '-1', '-1' ] );
	expect( visiblePanels( wrapper ) ).toEqual( [ 'One' ] );
	expect( wrapper.find( '[role="tablist"]' ).attributes( 'aria-orientation' ) ).toBe( 'vertical' );
} );

test( 'ArrowDown moves to the next tab, takes focus there and moves the tab order and the panel with it', async () => {
	const wrapper = open();
	await press( wrapper, 0, 'ArrowDown' );
	expect( selected( wrapper ) ).toEqual( [ 'Layout' ] );
	expect( inTabOrder( wrapper ) ).toEqual( [ 'Layout' ] );
	expect( focused() ).toBe( 'Layout' );
	expect( visiblePanels( wrapper ) ).toEqual( [ 'Two' ] );
} );

test( 'ArrowDown on the last tab wraps to the first; ArrowUp on the first wraps to the last', async () => {
	const wrapper = open();
	await press( wrapper, 2, 'ArrowDown' );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( focused() ).toBe( 'Overview' );

	await press( wrapper, 0, 'ArrowUp' );
	expect( selected( wrapper ) ).toEqual( [ 'Actions' ] );
	expect( focused() ).toBe( 'Actions' );
} );

test( 'ArrowUp moves to the previous tab', async () => {
	const wrapper = open();
	await press( wrapper, 2, 'ArrowUp' );
	expect( selected( wrapper ) ).toEqual( [ 'Layout' ] );
	expect( focused() ).toBe( 'Layout' );
} );

test( 'Home goes to the first tab and End to the last, from wherever the key is pressed', async () => {
	const wrapper = open();
	await press( wrapper, 1, 'End' );
	expect( selected( wrapper ) ).toEqual( [ 'Actions' ] );
	expect( focused() ).toBe( 'Actions' );

	await press( wrapper, 2, 'Home' );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( focused() ).toBe( 'Overview' );
} );

test( 'a key that moves the selection is cancelled, and any other key is left alone', async () => {
	const wrapper = open();
	const press1 = ( key ) => {
		const event = new KeyboardEvent( 'keydown', { key, bubbles: true, cancelable: true } );
		tabs( wrapper )[ 0 ].element.dispatchEvent( event );
		return event.defaultPrevented;
	};
	// The keys that do move prove that the handler is listening at all.
	for ( const key of [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ] ) {
		expect( press1( key ) ).toBe( true );
	}
	await flushPromises();
	const before = selected( wrapper );
	for ( const key of [ 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', ' ', 'a', 'PageDown' ] ) {
		expect( press1( key ) ).toBe( false );
	}
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( before );
} );

test( 'a click selects a tab and does not follow its link', async () => {
	const wrapper = open();
	const event = new MouseEvent( 'click', { bubbles: true, cancelable: true } );
	tabs( wrapper )[ 2 ].element.dispatchEvent( event );
	await flushPromises();
	expect( event.defaultPrevented ).toBe( true );
	expect( selected( wrapper ) ).toEqual( [ 'Actions' ] );
	expect( inTabOrder( wrapper ) ).toEqual( [ 'Actions' ] );
} );

test( 'a single tab stays selected under every navigation key', async () => {
	const wrapper = open( [ TABS[ 0 ] ] );
	for ( const key of [ 'ArrowDown', 'ArrowUp', 'Home', 'End' ] ) {
		await press( wrapper, 0, key );
		expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	}
	expect( focused() ).toBe( 'Overview' );
} );

test( 'the chosen tab that goes away leaves the first selected', async () => {
	const wrapper = open();
	await press( wrapper, 0, 'End' );
	expect( selected( wrapper ) ).toEqual( [ 'Actions' ] );

	await wrapper.setProps( { tabs: TABS.slice( 0, 2 ) } );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( inTabOrder( wrapper ) ).toEqual( [ 'Overview' ] );
} );

test( 'the Help button opens the panel and moves focus into it, and a second press closes it', async () => {
	const wrapper = open();
	const button = wrapper.find( '#contextual-help-link' );
	expect( wrapper.find( '#screen-meta' ).attributes( 'hidden' ) ).toBeDefined();

	await button.trigger( 'click' );
	await flushPromises();
	expect( button.attributes( 'aria-expanded' ) ).toBe( 'true' );
	expect( wrapper.find( '#screen-meta' ).attributes( 'hidden' ) ).toBeUndefined();
	expect( document.activeElement.id ).toBe( 'contextual-help-wrap' );

	await button.trigger( 'click' );
	expect( button.attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( wrapper.find( '#screen-meta' ).attributes( 'hidden' ) ).toBeDefined();
} );

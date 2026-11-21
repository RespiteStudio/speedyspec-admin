/** @jest-environment jsdom */
// kit/LegacyHtml `tag`: `tbody` parses its HTML in a table context so rows survive (kit 1.8.0),
// `span` stays a span, and any other value is a div, as before.
import { afterEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import LegacyHtml from '../../../site/kit/LegacyHtml.js';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';

const ROW = '<tr class="x"><th>A</th><td><input name="n"></td></tr>';

afterEach( () => {
	delete globalThis.__tbodyRuns;
} );

const mountTag = async ( tag, html ) => {
	const wrapper = mountPart( { render: () => h( 'table', [ h( LegacyHtml, { tag, html } ) ] ) } );
	await settle();
	return wrapper;
};

test( 'tbody keeps the rows: tbody.wp-admin-legacy-html > tr.x > td > input', async () => {
	const wrapper = await mountTag( 'tbody', ROW );
	expect( wrapper.find( 'tbody.wp-admin-legacy-html > tr.x > td > input[name="n"]' ).exists() ).toBe( true );
	expect( wrapper.find( 'tbody.wp-admin-legacy-html > tr.x > th' ).text() ).toBe( 'A' );
} );

test( 'an inline script in the tbody HTML runs once', async () => {
	globalThis.__tbodyRuns = 0;
	await mountTag( 'tbody', ROW + '<script>globalThis.__tbodyRuns++;</script>' );
	expect( globalThis.__tbodyRuns ).toBe( 1 );
} );

test( 'span stays a span, and any other tag is a div', async () => {
	const span = mountPart( { render: () => h( LegacyHtml, { tag: 'span', html: '<b>x</b>' } ) } );
	expect( span.element.tagName ).toBe( 'SPAN' );
	const other = mountPart( { render: () => h( LegacyHtml, { tag: 'section', html: '<b>x</b>' } ) } );
	expect( other.element.tagName ).toBe( 'DIV' );
	const plain = mountPart( { render: () => h( LegacyHtml, { html: '<b>x</b>' } ) } );
	expect( plain.element.tagName ).toBe( 'DIV' );
} );

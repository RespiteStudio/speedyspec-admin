import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { toWpLocale, browserLocales } = await import( '../site/runtime/locale.js' );

test( 'toWpLocale turns every hyphen of a language tag into an underscore', () => {
	assert.equal( toWpLocale( 'de-DE' ), 'de_DE' );
	assert.equal( toWpLocale( 'de-DE-formal' ), 'de_DE_formal' );
	assert.equal( toWpLocale( 'pt-PT-ao90' ), 'pt_PT_ao90' );
	assert.equal( toWpLocale( 'en_US' ), 'en_US' );
} );

test( 'a bare language is kept as it is (the translations endpoint cannot list the installed locales)', () => {
	assert.equal( toWpLocale( 'de' ), 'de' );
	assert.deepEqual( browserLocales( { languages: [ 'de-CH-1996', 'de', 'en-US' ] } ), [ 'de_CH_1996', 'de', 'en_US' ] );
} );

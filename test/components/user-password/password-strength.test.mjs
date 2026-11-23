/** @jest-environment jsdom */
// The adapter over core's wp.passwordStrength (runtime/password-strength.js): the score and the
// label as user-profile.js maps them, with core's pwsL10n strings; -1 until the meter is loaded.
import { afterEach, expect, jest, test } from '@jest/globals';
import { strength } from '../../../site/runtime/password-strength.js';

const L10N = { unknown: 'Password strength unknown', short: 'Very weak', bad: 'Weak', good: 'Medium', strong: 'Strong', mismatch: 'Mismatch' };

afterEach( () => {
	delete window.wp;
	delete window.pwsL10n;
} );

function meterReturning( score ) {
	const calls = [];
	window.wp = { passwordStrength: { meter: ( ...args ) => {
		calls.push( args );
		return score;
	} } };
	window.pwsL10n = L10N;
	return calls;
}

test( 'a score of 4 is strong, with core\'s label', async () => {
	meterReturning( 4 );
	expect( await strength( 'x', [], 'x' ) ).toEqual( { score: 4, label: 'Strong', className: 'strong' } );
} );

test( 'user-profile.js\'s other scores: 3 good, 2 bad, 0 and 1 short, 5 mismatch', async () => {
	const expected = { 3: [ 'Medium', 'good' ], 2: [ 'Weak', 'bad' ], 1: [ 'Very weak', 'short' ], 0: [ 'Very weak', 'short' ], 5: [ 'Mismatch', 'short' ] };
	for ( const [ score, [ label, className ] ] of Object.entries( expected ) ) {
		meterReturning( Number( score ) );
		expect( await strength( 'x', [], 'x' ) ).toEqual( { score: Number( score ), label, className } );
	}
} );

test( 'a score of 2 is bad', async () => {
	meterReturning( 2 );
	expect( ( await strength( 'abc', [], 'abc' ) ).className ).toBe( 'bad' );
} );

test( 'the meter gets the password, the disallowed words and the confirmation, once', async () => {
	const calls = meterReturning( 3 );
	await strength( 'secret', [ 'alice', 'example' ], 'secret2' );
	expect( calls ).toEqual( [ [ 'secret', [ 'alice', 'example' ], 'secret2' ] ] );
} );

test( 'a label without core\'s pwsL10n falls back to the translated core string', async () => {
	meterReturning( 4 );
	delete window.pwsL10n;
	expect( ( await strength( 'x', [], 'x' ) ).label ).toBe( 'Strong' );
} );

test( 'before the meter is loaded, and while zxcvbn is not there (the meter answers -1), the score is -1 and nothing else', async () => {
	expect( await strength( 'x', [], 'x' ) ).toEqual( { score: -1, label: '', className: '' } );
	window.wp = {};
	expect( await strength( 'x', [], 'x' ) ).toEqual( { score: -1, label: '', className: '' } );
	meterReturning( -1 );
	expect( await strength( 'x', [], 'x' ) ).toEqual( { score: -1, label: '', className: '' } );
} );

// zxcvbn-async.js inserts zxcvbn's script on the window's `load`, which a native page's scripts
// arrive after: the adapter inserts it once itself, from core's _zxcvbnSettings (root-relative in
// a native screen's assets), as that load would, and only from the admin's own origin.
test( 'zxcvbn not loaded: a cross-origin src is refused; the root-relative one is inserted once, async; none once loaded', async () => {
	const { loadZxcvbn } = await import( '../../../site/runtime/password-strength.js' );
	const zxcvbnScripts = () => [ ...document.querySelectorAll( 'script' ) ].filter( ( script ) => /zxcvbn\.min\.js$/.test( script.src ) );
	const warn = jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	try {
		meterReturning( -1 );
		expect( loadZxcvbn() ).toBe( false );
		expect( zxcvbnScripts() ).toHaveLength( 0 );
		window._zxcvbnSettings = { src: 'http://localhost:8889/wp-includes/js/zxcvbn.min.js' };
		expect( loadZxcvbn() ).toBe( false );
		expect( zxcvbnScripts() ).toHaveLength( 0 );
		expect( warn ).toHaveBeenCalledWith( 'Not loading zxcvbn: not on the admin origin.' );
		window._zxcvbnSettings = { src: '/wp-includes/js/zxcvbn.min.js' };
		expect( await strength( 'x', [], 'x' ) ).toEqual( { score: -1, label: '', className: '' } );
		await strength( 'y', [], 'y' );
		expect( zxcvbnScripts().map( ( script ) => script.src ) ).toEqual( [ window.location.origin + '/wp-includes/js/zxcvbn.min.js' ] );
		expect( zxcvbnScripts()[ 0 ].async ).toBe( true );
		window.zxcvbn = () => ( {} );
		zxcvbnScripts()[ 0 ].remove();
		expect( loadZxcvbn() ).toBe( false );
		expect( zxcvbnScripts() ).toHaveLength( 0 );
	} finally {
		warn.mockRestore();
		delete window._zxcvbnSettings;
		delete window.zxcvbn;
	}
} );

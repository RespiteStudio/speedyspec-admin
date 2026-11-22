/** @jest-environment jsdom */
// core/user-password: the password rows of user-profile.js. `new` (Add User) shows the generated
// password, the Hide/Show toggle, the strength meter and the weak-password row; `change` (Profile,
// Edit User) reveals the field on "Set New Password" and empties it on Cancel.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { flushPromises } from '@vue/test-utils';
import { mountPart } from '../../helpers/mount.mjs';
import UserPassword, { disallowedWords } from '../../../site/components/core/user-password.js';
import contract from '../../../site/contracts/core/user-password.js';

const L10N = { unknown: 'Password strength unknown', short: 'Very weak', bad: 'Weak', good: 'Medium', strong: 'Strong', mismatch: 'Mismatch' };
const INITIAL = 'Zq3!initial-generated-password';
let score;

beforeEach( () => {
	score = 4;
	window.wp = { passwordStrength: { meter: () => score } };
	window.pwsL10n = L10N;
} );
afterEach( () => {
	delete window.wp;
	delete window.pwsL10n;
	jest.useRealTimers();
} );

async function part( props = {} ) {
	// The rows sit in a table, as the page puts them.
	// The part's root is a fragment, so what it emits is recorded by the host's listeners.
	const events = {};
	const record = ( name ) => ( value ) => ( events[ name ] ??= [] ).push( value );
	const Host = {
		components: { UserPassword },
		props: [ 'p' ],
		methods: { password: record( 'update:password' ), weak: record( 'update:weakConfirmed' ), submit: record( 'update:canSubmit' ) },
		template: '<table><tbody><UserPassword v-bind="p" @update:password="password" @update:weakConfirmed="weak" @update:canSubmit="submit" /></tbody></table>',
	};
	const host = mountPart( Host, { props: { p: { mode: 'new', initialPassword: INITIAL, disallowed: [], labels: {}, ...props } } } );
	host.events = events;
	await flushPromises();
	return host;
}

const input = ( host ) => host.get( 'input#pass1' );
const lastEmitted = ( host, name ) => host.events[ name ]?.at( -1 );

test( 'the contract: shared, two segments, 1.0.0, the props and emits the page reads', () => {
	expect( contract.id ).toBe( 'core/user-password' );
	expect( contract.version ).toBe( '1.0.0' );
	expect( Object.keys( contract.props ).sort() ).toEqual( [ 'disallowed', 'generate', 'initialPassword', 'labels', 'mode', 'pollMs' ] );
	expect( contract.emits ).toEqual( [ 'update:password', 'update:weakConfirmed', 'update:canSubmit' ] );
} );

test( 'new: the generated password is shown, with the meter and the Hide toggle', async () => {
	const host = await part();
	expect( input( host ).element.value ).toBe( INITIAL );
	expect( input( host ).attributes( 'type' ) ).toBe( 'text' );
	expect( input( host ).attributes( 'name' ) ).toBe( 'pass1' );
	expect( input( host ).attributes( 'autocomplete' ) ).toBe( 'new-password' );
	const toggle = host.get( 'button.wp-hide-pw' );
	expect( toggle.attributes( 'aria-label' ) ).toBe( 'Hide password' );
	expect( toggle.get( '.text' ).text() ).toBe( 'Hide' );
	const meter = host.get( '#pass-strength-result' );
	expect( meter.attributes( 'aria-live' ) ).toBe( 'polite' );
	expect( meter.classes() ).toContain( 'strong' );
	expect( meter.text() ).toBe( 'Strong' );
	expect( input( host ).classes() ).toContain( 'strong' );
	expect( host.find( 'button.wp-cancel-pw' ).exists() ).toBe( false );
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( false );
	expect( lastEmitted( host, 'update:password' ) ).toBe( INITIAL );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( true );
} );

test( 'new: Hide sets type=password and the label "Show password"; Show reverses it', async () => {
	const host = await part();
	await host.get( 'button.wp-hide-pw' ).trigger( 'click' );
	expect( input( host ).attributes( 'type' ) ).toBe( 'password' );
	expect( host.get( 'button.wp-hide-pw' ).attributes( 'aria-label' ) ).toBe( 'Show password' );
	expect( host.get( 'button.wp-hide-pw .text' ).text() ).toBe( 'Show' );
	await host.get( 'button.wp-hide-pw' ).trigger( 'click' );
	expect( input( host ).attributes( 'type' ) ).toBe( 'text' );
	expect( host.get( 'button.wp-hide-pw' ).attributes( 'aria-label' ) ).toBe( 'Hide password' );
} );

test( 'new: a bad score shows the weak row, and canSubmit is false until it is checked', async () => {
	score = 2;
	const host = await part();
	expect( host.get( '#pass-strength-result' ).classes() ).toContain( 'bad' );
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( true );
	// Core's forms.css hides .pw-weak; user-profile.js's $weakRow.show() sets it inline.
	expect( host.get( 'tr.pw-weak' ).element.style.display ).toBe( 'table-row' );
	expect( host.get( 'tr.pw-weak input.pw-checkbox' ).attributes( 'name' ) ).toBe( 'pw_weak' );
	expect( host.get( 'tr.pw-weak' ).text() ).toContain( 'Confirm use of weak password' );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( false );
	expect( lastEmitted( host, 'update:weakConfirmed' ) ).toBe( false );
	await host.get( 'input.pw-checkbox' ).setValue( true );
	expect( lastEmitted( host, 'update:weakConfirmed' ) ).toBe( true );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( true );
	await host.get( 'input.pw-checkbox' ).setValue( false );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( false );
} );

test( 'new: a short score shows the weak row too; a good one does not', async () => {
	score = 1;
	const weak = await part();
	expect( weak.find( 'tr.pw-weak' ).exists() ).toBe( true );
	score = 3;
	const fine = await part();
	expect( fine.find( 'tr.pw-weak' ).exists() ).toBe( false );
} );

test( 'typing re-checks the strength and emits the password', async () => {
	const host = await part();
	score = 1;
	await input( host ).setValue( 'abc' );
	await flushPromises();
	expect( lastEmitted( host, 'update:password' ) ).toBe( 'abc' );
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( true );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( false );
	score = 4;
	await input( host ).setValue( 'a-much-better-passphrase' );
	await flushPromises();
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( false );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( true );
} );

test( 'an empty password cannot be submitted, and un-checks the weak confirmation', async () => {
	score = 1;
	const host = await part();
	await host.get( 'input.pw-checkbox' ).setValue( true );
	await input( host ).setValue( '' );
	await flushPromises();
	expect( host.get( '#pass-strength-result' ).classes() ).toContain( 'empty' );
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( false );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( false );
	expect( lastEmitted( host, 'update:weakConfirmed' ) ).toBe( false );
} );

test( 'the disallowed words reach the meter as words of four letters or more, once each', async () => {
	const seen = [];
	window.wp.passwordStrength.meter = ( ...args ) => {
		seen.push( args[ 1 ] );
		return 4;
	};
	await part( { disallowed: [ "O'Brien & Sons", 'sons', 'ab', '', 'alice.smith@example.org' ] } );
	expect( seen.at( -1 ) ).toEqual( [ 'Brien', 'Sons', 'sons', 'alice', 'smith', 'example' ] );
	expect( disallowedWords( [ 'aaaa aaaa', 'abc' ] ) ).toEqual( [ 'aaaa' ] );
} );

test( 'before the meter loads the weak row is asked for (as classic shows -1 as bad); once it loads, a poll re-checks', async () => {
	jest.useFakeTimers( { doNotFake: [ 'nextTick', 'setImmediate', 'queueMicrotask' ] } );
	delete window.wp;
	const host = await part( { pollMs: 50 } );
	expect( host.get( '#pass-strength-result' ).classes() ).toContain( 'bad' );
	expect( host.get( '#pass-strength-result' ).text() ).toBe( 'Password strength unknown' );
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( true );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( false );
	window.wp = { passwordStrength: { meter: () => 4 } };
	await jest.advanceTimersByTimeAsync( 50 );
	await flushPromises();
	expect( host.get( '#pass-strength-result' ).text() ).toBe( 'Strong' );
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( false );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( true );
} );

test( 'new: Generate calls generate() and shows its answer', async () => {
	const generate = jest.fn( async () => 'Fresh-generated-24-chars-ok' );
	const host = await part( { generate } );
	await host.get( 'button.wp-generate-pw' ).trigger( 'click' );
	await flushPromises();
	expect( generate ).toHaveBeenCalledTimes( 1 );
	expect( input( host ).element.value ).toBe( 'Fresh-generated-24-chars-ok' );
	expect( lastEmitted( host, 'update:password' ) ).toBe( 'Fresh-generated-24-chars-ok' );
	expect( host.get( 'button.wp-generate-pw' ).text() ).toBe( 'Generate password' );
} );

test( 'new: a failing generate() keeps the password; without generate() there is no Generate button', async () => {
	const host = await part( { generate: async () => {
		throw new Error( 'down' );
	} } );
	await host.get( 'button.wp-generate-pw' ).trigger( 'click' );
	await flushPromises();
	expect( input( host ).element.value ).toBe( INITIAL );
	const plain = await part();
	expect( plain.find( 'button.wp-generate-pw' ).exists() ).toBe( false );
} );

test( 'the labels come from the page data when given', async () => {
	const host = await part( { generate: async () => 'x', labels: { password: 'Passwort', generate: 'Passwort erzeugen', hide: 'Verbergen', hidePassword: 'Passwort verbergen', weakRow: 'Passwort bestätigen', weakConfirm: 'Schwaches Passwort bestätigen' } } );
	expect( host.get( 'th label' ).text() ).toBe( 'Passwort' );
	expect( host.get( 'button.wp-generate-pw' ).text() ).toBe( 'Passwort erzeugen' );
	expect( host.get( 'button.wp-hide-pw' ).attributes( 'aria-label' ) ).toBe( 'Passwort verbergen' );
	expect( host.get( 'button.wp-hide-pw .text' ).text() ).toBe( 'Verbergen' );
	score = 1;
	await input( host ).setValue( 'abc' );
	await flushPromises();
	expect( host.get( 'tr.pw-weak th' ).text() ).toBe( 'Passwort bestätigen' );
	expect( host.get( 'tr.pw-weak' ).text() ).toContain( 'Schwaches Passwort bestätigen' );
} );

test( 'change: the field is hidden until "Set New Password"; it then shows initialPassword, with aria-expanded=true', async () => {
	const host = await part( { mode: 'change' } );
	expect( host.find( 'input#pass1' ).exists() ).toBe( false );
	const set = host.get( 'button.wp-generate-pw' );
	expect( set.text() ).toBe( 'Set New Password' );
	expect( set.attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( lastEmitted( host, 'update:password' ) ).toBe( '' );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( true );
	await set.trigger( 'click' );
	await flushPromises();
	expect( host.get( 'button.wp-generate-pw' ).attributes( 'aria-expanded' ) ).toBe( 'true' );
	expect( input( host ).element.value ).toBe( INITIAL );
	expect( input( host ).attributes( 'type' ) ).toBe( 'text' );
	expect( host.find( 'button.wp-cancel-pw' ).exists() ).toBe( true );
	expect( host.get( 'button.wp-cancel-pw' ).attributes( 'aria-label' ) ).toBe( 'Cancel password change' );
	expect( lastEmitted( host, 'update:password' ) ).toBe( INITIAL );
} );

test( 'change: Cancel empties the password, hides the field and lets the form be submitted', async () => {
	score = 1;
	const host = await part( { mode: 'change' } );
	await host.get( 'button.wp-generate-pw' ).trigger( 'click' );
	await flushPromises();
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( false );
	await host.get( 'input.pw-checkbox' ).setValue( true );
	await host.get( 'button.wp-cancel-pw' ).trigger( 'click' );
	await flushPromises();
	expect( host.find( 'input#pass1' ).exists() ).toBe( false );
	expect( host.find( 'tr.pw-weak' ).exists() ).toBe( false );
	expect( host.get( 'button.wp-generate-pw' ).attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( lastEmitted( host, 'update:password' ) ).toBe( '' );
	expect( lastEmitted( host, 'update:weakConfirmed' ) ).toBe( false );
	expect( lastEmitted( host, 'update:canSubmit' ) ).toBe( true );
} );

test( 'change: opening asks generate() for the next password, which the next opening shows', async () => {
	const generate = jest.fn( async () => 'Next-password-from-the-server' );
	const host = await part( { mode: 'change', generate } );
	await host.get( 'button.wp-generate-pw' ).trigger( 'click' );
	await flushPromises();
	expect( generate ).toHaveBeenCalledTimes( 1 );
	expect( input( host ).element.value ).toBe( INITIAL );
	await host.get( 'button.wp-cancel-pw' ).trigger( 'click' );
	await host.get( 'button.wp-generate-pw' ).trigger( 'click' );
	await flushPromises();
	expect( input( host ).element.value ).toBe( 'Next-password-from-the-server' );
	expect( generate ).toHaveBeenCalledTimes( 2 );
} );

test( 'a password is text: markup in it or in a label is never interpreted', async () => {
	const host = await part( { mode: 'change', initialPassword: '<img src=x onerror="window.__ran=1">', labels: { generate: '<b>Set</b>' } } );
	expect( host.get( 'button.wp-generate-pw' ).text() ).toBe( '<b>Set</b>' );
	await host.get( 'button.wp-generate-pw' ).trigger( 'click' );
	expect( input( host ).element.value ).toBe( '<img src=x onerror="window.__ran=1">' );
	expect( host.findAll( 'img' ) ).toHaveLength( 0 );
	expect( window.__ran ).toBeUndefined();
} );

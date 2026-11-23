/** @jest-environment jsdom */
// The admin email verification after sign-in (core/admin-email-confirm) as WordPress's data
// describes it (wp_admin_admin_email_verification(), the classic wp-login.php?action=
// confirm_admin_email screen): the classic form's markup, what plugins print on its two actions,
// Update to General Settings, "The email is correct" and Remind me later through the router's
// answer, a failed answer's error, and an email that runs nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import contract from '../../../site/contracts/core/admin-email-confirm.js';

const HOSTILE = 'o\'brien&<img src=x onerror="window.__ran=1">@example.org';

/** The step's data. `over` replaces any of its keys. */
const verification = ( over = {} ) => ( {
	title: 'Confirm your administration email',
	email: 'owner@example.org',
	helpUrl: 'https://wordpress.org/documentation/article/settings-general-screen/#email-address',
	changePath: 'options-general.php?highlight=confirm_admin_email',
	remindLater: true,
	texts: {
		heading: 'Administration email verification',
		details: 'Please verify that the <strong>administration email</strong> for this website is still correct.',
		why: 'Why is this important?',
		newTab: '(opens in a new tab)',
		current: 'Current administration email: <strong>owner@example.org</strong>',
		different: 'This email may be different from your personal email address.',
		update: 'Update',
		correct: 'The email is correct',
		remind: 'Remind me later',
	},
	hooks: { confirm: null, form: null },
	redirectTo: 'http://localhost/wp-admin/edit.php',
	...over,
} );

/** Mounts the step with `data` and an `answer` that records the actions and answers `reply`. */
async function mountStep( data = verification(), reply = async () => true ) {
	const asked = [];
	const answer = ( action ) => {
		asked.push( action );
		return reply( action );
	};
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/admin-email-confirm', data, answer } ) }, { attachTo: document.body } );
	await settle();
	wrapper.asked = asked;
	return wrapper;
}

beforeEach( async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'admin-email-confirm' ] );
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	delete window.__ran;
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	delete window.__ran;
	document.body.innerHTML = '';
} );

test( 'the contract: shared (not a page), two segments, 1.0.0, data and answer', () => {
	expect( contract.id ).toBe( 'core/admin-email-confirm' );
	expect( contract.version ).toBe( '1.0.0' );
	expect( contract.page ).toBeUndefined();
	expect( Object.keys( contract.props ).sort() ).toEqual( [ 'answer', 'data' ] );
	expect( contract.props.data ).toEqual( { type: 'Object', required: true } );
	expect( contract.props.answer ).toEqual( { type: 'Function', required: true } );
} );

test( 'markup from data: the classic form, heading, details, help link in a new tab, the email, Update, The email is correct and Remind me later', async () => {
	const wrapper = await mountStep();
	const form = wrapper.find( 'form.admin-email-confirm-form' );
	expect( form.attributes( 'name' ) ).toBe( 'admin-email-confirm-form' );
	expect( form.find( 'h1.admin-email__heading' ).text() ).toBe( 'Administration email verification' );
	const details = form.findAll( 'p.admin-email__details' );
	expect( details.map( ( p ) => p.text().replace( /\s+/g, ' ' ) ) ).toEqual( [
		'Please verify that the administration email for this website is still correct. Why is this important? (opens in a new tab)',
		'Current administration email: owner@example.org',
		'This email may be different from your personal email address.',
	] );
	expect( details[ 0 ].find( 'strong' ).text() ).toBe( 'administration email' );
	const help = details[ 0 ].find( 'a' );
	expect( [ help.attributes( 'href' ), help.attributes( 'target' ) ] ).toEqual( [ 'https://wordpress.org/documentation/article/settings-general-screen/#email-address', '_blank' ] );
	expect( help.find( 'span.screen-reader-text' ).text() ).toBe( '(opens in a new tab)' );
	expect( details[ 1 ].find( 'strong' ).text() ).toBe( 'owner@example.org' );

	const primary = form.find( '.admin-email__actions .admin-email__actions-primary' );
	const update = primary.find( 'a' );
	expect( update.classes() ).toEqual( [ 'button', 'button-large' ] );
	expect( update.text() ).toBe( 'Update' );
	expect( update.attributes( 'href' ) ).toBe( '/wp-admin/options-general.php?highlight=confirm_admin_email' );
	const correct = primary.find( 'input#correct-admin-email' );
	expect( [ correct.attributes( 'type' ), correct.attributes( 'name' ), correct.element.value ] ).toEqual( [ 'submit', 'correct-admin-email', 'The email is correct' ] );
	expect( correct.classes() ).toEqual( [ 'button', 'button-primary', 'button-large' ] );
	expect( form.find( '.admin-email__actions-secondary a' ).text() ).toBe( 'Remind me later' );
	expect( wrapper.find( '#login_error' ).exists() ).toBe( false );
} );

test( 'Update on a subsite opens that site\'s General Settings', async () => {
	history.replaceState( null, '', '/sites/3/wp-admin/edit.php' );
	try {
		const wrapper = await mountStep();
		expect( wrapper.find( '.admin-email__actions-primary a' ).attributes( 'href' ) ).toBe( '/sites/3/wp-admin/options-general.php?highlight=confirm_admin_email' );
	} finally {
		history.replaceState( null, '', '/' );
	}
} );

test( 'confirm posts: The email is correct asks the router\'s answer for confirm, once, while it is answered', async () => {
	let finish;
	const wrapper = await mountStep( verification(), () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) );
	await wrapper.find( 'form.admin-email-confirm-form' ).trigger( 'submit' );
	await wrapper.find( 'input#correct-admin-email' ).trigger( 'click' );
	await settle();
	expect( wrapper.asked ).toEqual( [ 'confirm' ] );
	expect( wrapper.find( 'input#correct-admin-email' ).element.disabled ).toBe( true );
	finish( true );
	await settle();
} );

test( 'remind posts: Remind me later asks the router\'s answer for remind, and the link goes nowhere itself', async () => {
	const wrapper = await mountStep();
	const link = wrapper.find( '.admin-email__actions-secondary a' );
	const event = new window.MouseEvent( 'click', { bubbles: true, cancelable: true } );
	link.element.dispatchEvent( event );
	await settle();
	expect( event.defaultPrevented ).toBe( true );
	expect( wrapper.asked ).toEqual( [ 'remind' ] );
} );

test( 'no remind link: without a reminder interval (remindLater false) Remind me later is not offered', async () => {
	const wrapper = await mountStep( verification( { remindLater: false } ) );
	expect( wrapper.find( '.admin-email__actions-secondary' ).exists() ).toBe( false );
	expect( wrapper.text() ).not.toContain( 'Remind me later' );
	expect( wrapper.find( 'input#correct-admin-email' ).exists() ).toBe( true );
} );

test( 'hooks: admin_email_confirm prints before the form, admin_email_confirm_form inside it before the heading, their scripts run', async () => {
	const wrapper = await mountStep( verification( { hooks: {
		confirm: '<div class="plugin-confirm">Plugin confirm</div>',
		form: '<div class="plugin-form">Plugin form</div><script>window.__ran = "form";</script>',
	} } ) );
	await settle();
	const confirm = wrapper.find( '.plugin-confirm' );
	expect( confirm.text() ).toBe( 'Plugin confirm' );
	expect( confirm.element.closest( 'form' ) ).toBe( null );
	const form = wrapper.find( 'form.admin-email-confirm-form' );
	const plugin = form.find( '.plugin-form' );
	expect( plugin.text() ).toBe( 'Plugin form' );
	expect( plugin.element.compareDocumentPosition( form.find( 'h1' ).element ) & window.Node.DOCUMENT_POSITION_FOLLOWING ).toBeTruthy();
	expect( window.__ran ).toBe( 'form' );
} );

test( 'a failed answer: WordPress\'s message shows in the login error box, focused, and the buttons work again', async () => {
	let fail = true;
	const wrapper = await mountStep( verification(), async () => {
		if ( fail ) {
			throw Object.assign( new Error( 'Sorry, you are not allowed to do that.' ), { status: 403, code: 'rest_forbidden' } );
		}
		return true;
	} );
	await wrapper.find( 'form.admin-email-confirm-form' ).trigger( 'submit' );
	await settle();
	const error = wrapper.find( '#login_error' );
	expect( error.text() ).toBe( 'Sorry, you are not allowed to do that.' );
	expect( error.attributes( 'role' ) ).toBe( 'alert' );
	expect( document.activeElement ).toBe( error.element );
	expect( wrapper.find( 'input#correct-admin-email' ).element.disabled ).toBe( false );

	fail = false;
	await wrapper.find( '.admin-email__actions-secondary a' ).trigger( 'click' );
	await settle();
	expect( wrapper.asked ).toEqual( [ 'confirm', 'remind' ] );
	expect( wrapper.find( '#login_error' ).exists() ).toBe( false );
} );

test( 'a failed answer that never reached WordPress says so', async () => {
	const wrapper = await mountStep( verification(), async () => {
		throw Object.assign( new Error( '' ), { status: 0, code: 'admin_upstream_unreachable' } );
	} );
	await wrapper.find( 'form.admin-email-confirm-form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#login_error' ).text() ).toBe( 'WordPress cannot be reached right now. Please try again in a moment.' );
} );

test( 'the email and texts run nothing: the line is sanitised inline markup, a help URL that is not http(s) is dropped', async () => {
	const escaped = HOSTILE.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
	const wrapper = await mountStep( verification( {
		email: HOSTILE,
		helpUrl: 'javascript:window.__ran=1',
		texts: { ...verification().texts, current: 'Current administration email: <strong>' + escaped + '</strong><img src=x onerror="window.__ran=1">', why: '<b>Why</b>' },
	} ) );
	await settle();
	const line = wrapper.findAll( 'p.admin-email__details' )[ 1 ];
	expect( line.find( 'strong' ).text() ).toBe( HOSTILE );
	expect( wrapper.findAll( 'img' ) ).toHaveLength( 0 );
	const help = wrapper.findAll( 'p.admin-email__details' )[ 0 ].find( 'a' );
	expect( help.attributes( 'href' ) ).toBeUndefined();
	expect( help.text() ).toContain( '<b>Why</b>' );
	expect( window.__ran ).toBeUndefined();
} );

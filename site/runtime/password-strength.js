import { _x } from './text.js';
import { sameOriginUrl } from '../kit/LegacyHtml.js';

/*
 * An Adapter over core's `wp.passwordStrength` (password-strength-meter.js, with zxcvbn through
 * zxcvbn-async). The page's `screen_scripts` queue both, and they arrive through the screen
 * assets. zxcvbn itself is the one script the Adapter inserts: zxcvbn-async.js inserts it only on
 * the window's `load`, which has passed when a native page's screen scripts arrive, so
 * loadZxcvbn() inserts it from core's `_zxcvbnSettings.src`, a same-origin URL only. It maps the meter's score the way user-profile.js's check_pass_strength() does, and
 * decides nothing about what a password may be.
 */

const UNKNOWN = Object.freeze( { score: -1, label: '', className: '' } );

/**
 * The class and the label key of a score, as user-profile.js maps it: 2 is bad, 3 good, 4 strong,
 * 5 (the two passwords differ) short with the mismatch text, anything else short.
 */
const KEYS = { 2: [ 'bad', 'bad' ], 3: [ 'good', 'good' ], 4: [ 'strong', 'strong' ], 5: [ 'short', 'mismatch' ] };

/** Core's strings for the five answers (pwsL10n's, and the same text when pwsL10n is not there). */
const FALLBACK = {
	short: () => _x( 'Very weak', 'password strength', 'default' ),
	bad: () => _x( 'Weak', 'password strength', 'default' ),
	good: () => _x( 'Medium', 'password strength', 'default' ),
	strong: () => _x( 'Strong', 'password strength', 'default' ),
	mismatch: () => _x( 'Mismatch', 'password mismatch', 'default' ),
};

/**
 * The text core's pwsL10n gives for the answer, else core's own string.
 *
 * @param {string} key short, bad, good, strong or mismatch.
 * @return {string}
 */
function labelFor( key ) {
	const text = globalThis.pwsL10n?.[ key ];
	return typeof text === 'string' && text !== '' ? text : FALLBACK[ key ]();
}

// Whether zxcvbn's script was inserted during this visit.
let zxcvbnInserted = false;
// The srcs refused (another origin), each warned about once.
const zxcvbnRefused = new Set();

/**
 * Inserts zxcvbn's script once, async, as zxcvbn-async.js does from core's `_zxcvbnSettings.src`.
 * zxcvbn-async.js waits for the window's `load`, which has passed when a native page's screen
 * scripts arrive, so without this the meter never learns a strength. The screen assets give the
 * src root-relative; like every screen script, it is loaded only from the admin's own origin
 * (kit/LegacyHtml.js's sameOriginUrl()), and another origin's is refused with a warning. Nothing
 * is inserted when zxcvbn is there, when WordPress gave no settings, or a second time.
 *
 * @return {boolean} Whether the script was inserted now.
 */
export function loadZxcvbn() {
	const src = globalThis._zxcvbnSettings?.src;
	const document = globalThis.document;
	if ( zxcvbnInserted || typeof globalThis.zxcvbn !== 'undefined' || typeof src !== 'string' || src === '' || ! document ) {
		return false;
	}
	const url = sameOriginUrl( src, document.location?.origin );
	if ( url === null ) {
		if ( ! zxcvbnRefused.has( src ) ) {
			zxcvbnRefused.add( src );
			console.warn( 'Not loading zxcvbn: not on the admin origin.' );
		}
		return false;
	}
	const script = document.createElement( 'script' );
	script.src = url;
	script.type = 'text/javascript';
	script.async = true;
	document.head.appendChild( script );
	zxcvbnInserted = true;
	return true;
}

/**
 * The strength of a password, from core's meter.
 *
 * Until the meter (and zxcvbn) is loaded, and while it answers -1, it resolves
 * `{ score: -1, label: '', className: '' }`: the strength is not known.
 *
 * @param {string}   password   The password.
 * @param {string[]} disallowed Words that lower its entropy (the user's own fields).
 * @param {string}   confirm    The confirmation; a different, non-empty one scores 5.
 * @return {Promise<{score: number, label: string, className: string}>}
 */
export async function strength( password, disallowed, confirm ) {
	const meter = globalThis.wp?.passwordStrength?.meter;
	if ( typeof meter !== 'function' ) {
		return { ...UNKNOWN };
	}
	const score = meter( password, Array.isArray( disallowed ) ? disallowed : [], confirm );
	if ( typeof score !== 'number' || score === -1 ) {
		// The meter answers -1 until zxcvbn is loaded.
		loadZxcvbn();
		return { ...UNKNOWN };
	}
	const [ className, key ] = KEYS[ score ] ?? [ 'short', 'short' ];
	return { score, label: labelFor( key ), className };
}

/** The text core's pwsL10n gives for an unknown strength, else core's own string. */
export function unknownLabel() {
	const text = globalThis.pwsL10n?.unknown;
	return typeof text === 'string' && text !== '' ? text : _x( 'Password strength unknown', 'password strength', 'default' );
}

/**
 * Language selection: locale codes, direction, and switching the active
 * language (translations, <html lang>, <html dir>, re-render).
 */
import i18n from './i18n-instance.js';
import { DOMAIN, localeVersion } from './text.js';

const RTL = new Set( [ 'ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'arc', 'azb' ] );

/** 'ar-EG' -> 'ar'; used to derive the direction of a language. */
export const directionFor = ( code ) => ( RTL.has( String( code ).split( /[-_]/ )[ 0 ].toLowerCase() ) ? 'rtl' : 'ltr' );

/**
 * 'de-DE' -> 'de_DE', 'de-DE-formal' -> 'de_DE_formal': the form WordPress uses. A bare language
 * ('de') is kept as it is: the translations endpoint cannot say which `de_*` locale is installed.
 */
export const toWpLocale = ( tag ) => String( tag ).replaceAll( '-', '_' );

/** The browser's preferred languages as WordPress locale codes, plus English, without duplicates. */
export function browserLocales( navigatorLike = globalThis.navigator ) {
	const preferred = ( navigatorLike?.languages?.length ? navigatorLike.languages : [ navigatorLike?.language ] )
		.filter( Boolean )
		.map( toWpLocale );
	return [ ...new Set( [ ...preferred, 'en_US' ] ) ];
}

/** Human-readable name of a locale, in that locale's own language. */
export function localeName( code ) {
	try {
		const tag = code.replaceAll( '_', '-' );
		return new Intl.DisplayNames( [ tag ], { type: 'language' } ).of( tag );
	} catch {
		return code;
	}
}

/**
 * Makes `code` the active language: loads the skeleton's (plus any extra)
 * text domains, updates <html>, and re-renders translated text.
 */
export async function setLanguage( code, { dir = directionFor( code ), domains = [], document: doc = globalThis.document } = {} ) {
	// Lookups follow the current locale, so it is set to exactly the code being loaded.
	i18n.setLocale( { code, dir } );
	try {
		await i18n.load( [ ...domains, DOMAIN ], code );
	} finally {
		applyDocument( doc, code, dir );
		localeVersion.value++;
	}
}

function applyDocument( doc, code, dir ) {
	if ( doc ) {
		doc.documentElement.lang = code.replaceAll( '_', '-' );
		doc.documentElement.dir = dir === 'rtl' ? 'rtl' : 'ltr';
	}
}

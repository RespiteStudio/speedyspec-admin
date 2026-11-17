/**
 * Translation helper for the skeleton's own strings (text domain `wp-admin-site`).
 * Reading `localeVersion` inside `__` makes every render that uses it re-run
 * when the language changes.
 */
import { ref } from 'vue';
import i18n from './i18n-instance.js';

export const DOMAIN = 'wp-admin-site';
export const localeVersion = ref( 0 );

export function __( text ) {
	// eslint-disable-next-line no-unused-expressions
	localeVersion.value;
	return i18n.__( text, DOMAIN );
}

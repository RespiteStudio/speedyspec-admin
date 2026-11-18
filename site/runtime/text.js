/**
 * Translation functions for the skeleton's own code and templates. They are the
 * i18n instance's functions plus a read of `localeVersion`, so every render that
 * calls them runs again when the language changes. Callers pass the text domain
 * ('wp-admin-site') explicitly so that string extraction can see it.
 */
import { ref } from 'vue';
import i18n from './i18n-instance.js';

export const DOMAIN = 'wp-admin-site';
export const localeVersion = ref( 0 );

const reactive = ( fn ) => ( ...args ) => {
	// eslint-disable-next-line no-unused-expressions
	localeVersion.value;
	return fn( ...args );
};

export const __ = reactive( i18n.__ );
export const _x = reactive( i18n._x );
export const _n = reactive( i18n._n );
export const _nx = reactive( i18n._nx );
export const sprintf = i18n.sprintf;

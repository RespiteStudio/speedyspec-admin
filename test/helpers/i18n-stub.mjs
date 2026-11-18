// Source strings, as the i18n instance returns them without translations.
const format = ( text, args ) => {
	let next = 0;
	return String( text ).replace( /%(?:(\d+)\$)?s|%%/g, ( match, number ) => ( match === '%%' ? '%' : String( args[ number ? Number( number ) - 1 : next++ ] ) ) );
};
export const __ = ( text ) => text;
export const _x = ( text ) => text;
export const _n = ( single, plural, number ) => ( number === 1 ? single : plural );
export const _nx = ( single, plural, number ) => ( number === 1 ? single : plural );
export const sprintf = ( text, ...args ) => format( text, args );
export const getLocale = () => ( { code: 'en_US', dir: 'ltr' } );
export default { __, _x, _n, _nx, sprintf, getLocale };

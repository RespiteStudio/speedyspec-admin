// Node module-resolution hook for component tests: points the browser-only
// specifiers used by site/runtime components at the vendored Vue build and at
// test doubles.
const url = ( rel ) => new URL( rel, import.meta.url ).href;

export async function resolve( specifier, context, next ) {
	if ( specifier === 'vue' ) {
		return { url: url( '../../site/vendor/vue.esm-browser.prod.js' ), shortCircuit: true };
	}
	if ( specifier === '@wp-admin/i18n' ) {
		return { url: url( './i18n-stub.mjs' ), shortCircuit: true };
	}
	if ( specifier === './contracts-instance.js' ) {
		return { url: url( './contracts-instance-stub.mjs' ), shortCircuit: true };
	}
	return next( specifier, context );
}

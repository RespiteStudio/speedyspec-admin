// Test double of @wp-admin/api: records calls and answers with the handler a test sets.
export const calls = [];
let handler = async () => ( {} );

/** Sets what requests answer: `( method, route, payload ) => value`, or throw an ApiError. */
export function respondWith( fn ) {
	handler = fn;
}

export function reset() {
	calls.length = 0;
	handler = async () => ( {} );
}

const request = ( method ) => async ( route, payload ) => {
	calls.push( { method, route, payload } );
	return handler( method, route, payload );
};

export const get = request( 'GET' );
export const post = request( 'POST' );
export const del = request( 'DELETE' );
export default { get, post, del };

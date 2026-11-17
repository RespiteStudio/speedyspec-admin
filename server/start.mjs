import { createServer, configFromEnv } from './proxy.mjs';

let config;
try {
	config = configFromEnv();
} catch ( error ) {
	console.error( error.message );
	process.exit( 1 );
}

const server = createServer( config );
let listening = false;

// Logger only: once serving, an error that escapes a request must not take every other request down.
// Anything before the server is listening is a startup error and still ends the process.
for ( const event of [ 'uncaughtException', 'unhandledRejection' ] ) {
	process.on( event, ( error ) => {
		console.error( `Admin proxy ${event}:`, error );
		if ( ! listening ) {
			process.exit( 1 );
		}
	} );
}

server.listen( config.port, () => {
	listening = true;
	console.log( `Admin proxy listening on :${config.port}, upstream ${config.upstream}` );
} );

process.on( 'SIGTERM', () => {
	server.close( () => process.exit( 0 ) );
	server.closeIdleConnections?.();
	setTimeout( () => process.exit( 0 ), 2000 ).unref();
} );

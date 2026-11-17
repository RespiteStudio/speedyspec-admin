import { createServer, configFromEnv } from './proxy.mjs';

let config;
try {
	config = configFromEnv();
} catch ( error ) {
	console.error( error.message );
	process.exit( 1 );
}

const server = createServer( config );
server.listen( config.port, () => console.log( `Admin proxy listening on :${config.port}, upstream ${config.upstream}` ) );

process.on( 'SIGTERM', () => {
	server.close( () => process.exit( 0 ) );
	server.closeIdleConnections?.();
	setTimeout( () => process.exit( 0 ), 2000 ).unref();
} );

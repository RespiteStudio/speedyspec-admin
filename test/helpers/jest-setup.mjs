/**
 * Runs after the test framework in every test file (jest.config.mjs `setupFilesAfterEnv`).
 *
 * Jest fails the running test on a promise rejection nobody handles. One made as the file's last
 * test ends (in a timer that test left) would be printed and pass instead; node:test failed the
 * file for it. So the file waits two turns of the event loop, on real timers, before it ends: such
 * a rejection then still comes while the file runs, and fails it.
 */
import { afterAll, jest } from '@jest/globals';

const turn = () => new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

afterAll( async () => {
	jest.useRealTimers();
	await turn();
	await turn();
} );

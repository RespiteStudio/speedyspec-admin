// Run only by test/runner.test.mjs: a rejection nobody handles, made just as the last test ends.
import { test } from '@jest/globals';

test( 'the last test', () => {
	setTimeout( () => Promise.reject( new Error( 'Rejected after the last test.' ) ), 0 );
} );

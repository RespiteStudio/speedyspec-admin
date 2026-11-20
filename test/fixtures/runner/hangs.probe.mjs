// Run only by test/runner.test.mjs: a node:test-style test that never settles.
import test from '../../helpers/node-test-shim.mjs';

test( 'a hung shim test', () => new Promise( () => {} ) );

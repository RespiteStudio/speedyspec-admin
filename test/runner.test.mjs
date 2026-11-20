/**
 * The runner's guards: a hung test fails at the default time limit instead of holding the run,
 * and a promise rejection nobody handles fails the file, as node:test did. Each runs Jest on a
 * probe file of test/fixtures/runner/ (they are not test files of the suite).
 */
import { expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import config from '../jest.config.mjs';

const root = fileURLToPath( new URL( '..', import.meta.url ) );
const jestBin = fileURLToPath( new URL( '../node_modules/jest/bin/jest.js', import.meta.url ) );

function runProbe( name, args = [] ) {
	const run = spawnSync( process.execPath, [ jestBin, '--ci', '--testMatch', '<rootDir>/test/fixtures/runner/' + name, ...args ], {
		cwd: root,
		encoding: 'utf-8',
		env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' },
		timeout: 60_000,
	} );
	return { status: run.status, output: run.stdout + run.stderr };
}

test( 'the config sets a default time limit for every test', () => {
	expect( Number.isFinite( config.testTimeout ) ).toBe( true );
	expect( config.testTimeout ).toBeGreaterThan( 0 );
	expect( config.testTimeout ).toBeLessThanOrEqual( 60_000 );
} );

test( 'a node:test-style test without its own timeout fails at the default limit', () => {
	const { status, output } = runProbe( 'hangs.probe.mjs', [ '--testTimeout=300' ] );
	expect( status ).toBe( 1 );
	expect( output ).toMatch( /Exceeded timeout of 300 ms/ );
}, 60_000 );

test( 'a rejection nobody handles, made as the last test ends, fails the file', () => {
	const { status, output } = runProbe( 'rejects-late.probe.mjs' );
	expect( status ).toBe( 1 );
	expect( output ).toMatch( /Rejected after the last test\./ );
}, 60_000 );

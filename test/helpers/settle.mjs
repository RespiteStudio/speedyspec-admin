/**
 * Lets a component test's pending work finish: promise chains (API answers, Vue updates) and
 * what they start in turn. Each turn is one @vue/test-utils `flushPromises()`.
 *
 * settle( turns = 8 ): Promise<void>
 */
import { flushPromises } from '@vue/test-utils';

export async function settle( turns = 8 ) {
	for ( let i = 0; i < turns; i++ ) {
		await flushPromises();
	}
}

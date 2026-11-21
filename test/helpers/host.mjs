/**
 * Records what a page gives its host in a component test: the notices it adds, what it speaks
 * and where it sends the router. Each notice becomes an element with the id the page's focus
 * looks for (noticeElementId(), site/runtime/notices.js), as core/notices renders it.
 *
 * hostRecorder( { previous } ): { added, spoken, followed, previous, host() }
 *
 * `host()` gives the `router`, `speak` and `notices` values to provide.
 */
import { noticeElementId } from '../../site/runtime/notices.js';

/** The notice the comment pages show when WordPress cannot be reached. */
export const UNREACHABLE = 'WordPress cannot be reached right now. Please try again in a moment.';

export function hostRecorder( { previous = null } = {} ) {
	const record = { added: [], spoken: [], followed: [], previous };
	record.host = () => ( {
		router: {
			follow: async ( target ) => {
				record.followed.push( target );
				return true;
			},
			previousUrl: () => record.previous,
		},
		speak: ( message ) => record.spoken.push( message ),
		notices: {
			add: ( notice ) => {
				record.added.push( notice );
				const id = 'notice-' + record.added.length;
				const element = document.createElement( 'div' );
				element.id = noticeElementId( id );
				element.tabIndex = -1;
				element.textContent = notice.message;
				document.body.appendChild( element );
				return id;
			},
		},
	} );
	return record;
}

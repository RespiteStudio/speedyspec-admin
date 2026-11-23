import { computed } from 'vue';
import InlineMarkup from '../../../kit/InlineMarkup.js';

/*
 * The broken themes below the themes, as themes.php lists them on a single site (`.broken-themes`:
 * the heading, the sentence, and a table of each theme's name and error with the actions the user
 * may take): Resume (a paused theme), Delete and Install Parent Theme (a missing parent that
 * WordPress.org knows). WordPress decides the rows and their actions; the page runs them:
 *
 * - `resume( row )` posts its request and follows the answer;
 * - `delete( row )` asks the classic question and queues the delete;
 * - `install( row )` queues `themes/install` for the parent, whose result shows in the row
 *   (classic opens update.php instead: "covered, differs").
 *
 * As themes.php, a column of the table is there for Resume when a row can be resumed and for
 * Delete when a row can be deleted; the Install Parent Theme cell only in its row.
 *
 * Props: `broken` (`{ heading, intro, columns, rows }`), `states` (by stylesheet: `{ phase,
 * error }`, `phase` `deleting`, `installing` or `installed`).
 */
export default {
	name: 'BrokenThemes',
	components: { InlineMarkup },
	props: {
		broken: { type: Object, required: true },
		states: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'resume', 'delete', 'install' ],
	setup( props, { emit } ) {
		const rows = computed( () => ( Array.isArray( props.broken.rows ) ? props.broken.rows.filter( ( row ) => row && typeof row.stylesheet === 'string' ) : [] ) );
		const stateOf = ( row ) => props.states?.[ row.stylesheet ] ?? null;

		function act( name, row, event ) {
			event?.preventDefault?.();
			const phase = stateOf( row )?.phase;
			if ( phase === 'deleting' || phase === 'installing' || phase === 'installed' ) {
				return;
			}
			emit( name, row );
		}

		return {
			rows, stateOf, act,
			hasResume: computed( () => rows.value.some( ( row ) => row.resume ) ),
			hasDelete: computed( () => rows.value.some( ( row ) => row.delete ) ),
		};
	},
	template: `
		<div class="broken-themes">
			<h3>{{ broken.heading }}</h3>
			<p>{{ broken.intro }}</p>
			<table>
				<tr>
					<th>{{ broken.columns?.name }}</th>
					<th>{{ broken.columns?.description }}</th>
					<td v-if="hasResume"></td>
					<td v-if="hasDelete"></td>
				</tr>
				<tr v-for="row in rows" :key="row.stylesheet" :data-slug="row.stylesheet">
					<td><InlineMarkup :html="row.name ?? ''" /></td>
					<td><InlineMarkup :html="row.description ?? ''" /><div v-if="stateOf( row )?.error" class="notice notice-error notice-alt inline"><p>{{ stateOf( row ).error }}</p></div></td>
					<td v-if="hasResume"><a v-if="row.resume" href="#" class="button resume-theme" @click="act( 'resume', row, $event )">{{ row.resume.label }}</a></td>
					<td v-if="hasDelete"><a v-if="row.delete" href="#" class="button delete-theme" @click="act( 'delete', row, $event )">{{ stateOf( row )?.phase === 'deleting' ? $__( 'Deleting...', 'default' ) : row.delete.label }}</a></td>
					<td v-if="stateOf( row )?.phase === 'installed'"><span class="button button-disabled install-theme" aria-disabled="true">{{ $_x( 'Installed!', 'theme', 'default' ) }}</span></td>
					<td v-else-if="row.installParent"><a href="#" :class="[ 'button', 'install-theme', { 'updating-message': stateOf( row )?.phase === 'installing' } ]" @click="act( 'install', row, $event )">{{ stateOf( row )?.phase === 'installing' ? $__( 'Installing...', 'default' ) : row.installParent.label }}</a></td>
				</tr>
			</table>
		</div>
	`,
};

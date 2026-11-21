import LegacyHtml from '../../../kit/LegacyHtml.js';
import Format from '../dashboard-parts/format.js';

/*
 * The undo row of a comment moved to the Trash or marked as spam, as edit-comments.js builds it
 * from wp_comment_trashnotice()'s `#trash-undo-holder` / `#spam-undo-holder`
 * (`tr#undo-{id}.undo.untrash` or `.unspam`, one cell over the visible columns): the row's avatar,
 * the message WordPress gives ("Comment by %s moved to the Trash.") with the author, and Undo.
 * `current` marks it as the row the keyboard shortcuts are on (`vim-current`): it is one of the rows
 * j and k walk through, and `z` undoes there. Emits `undo`.
 */
export default {
	name: 'EditCommentsUndoRow',
	components: { LegacyHtml, Format },
	props: {
		id: { type: Number, required: true },
		undo: { type: Object, required: true },
		colspan: { type: Number, required: true },
		// Whether it is the row the keyboard shortcuts are on (`vim-current`).
		current: { type: Boolean, default: false },
	},
	emits: [ 'undo' ],
	setup( props ) {
		// The notice's kind (`trash` or `spam`) as WordPress gives it: its classes follow it.
		const kind = () => ( props.undo?.kind === 'spam' ? 'spam' : 'trash' );
		return { kind };
	},
	template: `
		<tr :id="'undo-' + id" :class="[ 'undo', 'un' + kind(), { 'vim-current': current } ]">
			<td :colspan="String( colspan )">
				<div :class="kind() + '-undo-inside'">
					<LegacyHtml v-if="undo.avatarHtml" tag="span" :html="undo.avatarHtml" />
					<img v-else-if="undo.avatar" alt="" :src="undo.avatar" class="avatar avatar-32 photo" height="32" width="32" loading="lazy" decoding="async" />
					<Format :text="undo.message ?? ''"><template #arg1><strong>{{ undo.author }}</strong></template></Format>
					{{ ' ' }}<span :class="[ 'undo', 'un' + kind() ]"><a href="#" role="button" class="vim-z vim-destructive aria-button-if-js" @click.prevent="$emit( 'undo' )">{{ $__( 'Undo', 'default' ) }}</a></span>
				</div>
			</td>
		</tr>
	`,
};

import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { decodeEntities } from '../../kit/Interpolate.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { adminHref } from './dashboard-parts/links.js';

export const QUICK_DRAFT_ROUTE = 'wp-admin/v1/dashboard/quick-draft';

// How long the newest draft stays highlighted after a save, as dashboard.js highlights it.
const HIGHLIGHT = 1000;

/**
 * Default implementation of core/dashboard-quick-draft: the Quick Draft widget, in the markup
 * wp_dashboard_quick_press() and wp_dashboard_recent_drafts() print (`#quick-press` with its
 * Title and Content fields and "Save Draft", then the user's recent drafts).
 *
 * Saving posts the title and content, with the auto-draft the data names, to
 * `wp-admin/v1/dashboard/quick-draft`, which saves them as the classic form does; as
 * dashboard.js does with the form WordPress sends back, the fields are emptied, the notice it
 * returns shows (with `role="alert"`), the drafts it returns replace the list, the newest is
 * highlighted when the save succeeded, and the Title field takes focus. The button is disabled
 * while saving. `saved` carries the answer. When the user may not edit posts, WordPress sends
 * `canEdit: false` and the widget shows nothing, as the classic widget.
 */
export default {
	name: 'DashboardQuickDraft',
	components: { SlotOutlet, InlineMarkup },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const title = ref( '' );
		const content = ref( '' );
		const saving = ref( false );
		const notice = shallowRef( null );
		const drafts = shallowRef( props.data.drafts ?? { items: [], viewAll: null } );
		const postId = ref( props.data.postId ?? 0 );
		const highlighted = ref( null );
		const titleField = ref( null );
		watch( () => props.data, ( data ) => {
			drafts.value = data.drafts ?? { items: [], viewAll: null };
			postId.value = data.postId ?? 0;
		} );

		const items = computed( () => ( Array.isArray( drafts.value?.items ) ? drafts.value.items : [] ) );
		// Strings with character references are kept out of the template, which would decode them.
		const placeholder = computed( () => decodeEntities( __( 'What&#8217;s on your mind?', 'default' ) ) );

		async function save() {
			if ( saving.value ) {
				return;
			}
			saving.value = true;
			try {
				const answer = await api.post( QUICK_DRAFT_ROUTE, { title: title.value, content: content.value, postId: postId.value } );
				title.value = '';
				content.value = '';
				notice.value = answer?.notice ?? null;
				drafts.value = answer?.drafts ?? drafts.value;
				postId.value = answer?.postId ?? postId.value;
				emit( 'saved', answer );
				if ( answer?.notice?.type !== 'error' && items.value[ 0 ] ) {
					highlighted.value = items.value[ 0 ].id;
					setTimeout( () => {
						highlighted.value = null;
					}, HIGHLIGHT );
				}
			} catch ( error ) {
				notice.value = { type: 'error', message: typeof error?.message === 'string' && error.message !== '' ? error.message : __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' ) };
			} finally {
				saving.value = false;
			}
			await nextTick();
			titleField.value?.focus?.();
		}

		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { title, content, saving, notice, drafts, items, highlighted, titleField, placeholder, save, slotContext, href: ( path ) => adminHref( path ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<template v-if="data.canEdit">
			<form name="post" :action="href( 'post.php' )" method="post" id="quick-press" class="hide-if-no-js" @submit.prevent="save">
				<div v-if="notice" :class="[ 'notice', 'notice-' + notice.type ]" role="alert"><p>{{ notice.message }}</p></div>

				<div class="input-text-wrap" id="title-wrap">
					<label for="title"><InlineMarkup :html="data.titleLabel ?? ''" /></label>
					<input ref="titleField" type="text" name="post_title" id="title" autocomplete="off" :value="title" @input="title = $event.target.value">
				</div>

				<div class="textarea-wrap" id="description-wrap">
					<label for="content">{{ $__( 'Content', 'default' ) }}</label>
					<textarea name="content" id="content" :placeholder="placeholder" class="mceEditor" rows="3" cols="15" autocomplete="off" :value="content" @input="content = $event.target.value"></textarea>
				</div>

				<p class="submit">
					<input type="submit" name="save" id="save-post" class="button button-primary" :value="$__( 'Save Draft', 'default' )" :disabled="saving">
					<br class="clear">
				</p>
			</form>

			<div v-if="! items.length" class="no-drafts">
				<p>{{ $__( 'There are no recent drafts.', 'default' ) }}</p>
			</div>
			<div v-else class="drafts">
				<p v-if="drafts.viewAll" class="view-all"><a :href="href( drafts.viewAll )">{{ $__( 'View all drafts', 'default' ) }}</a></p>
				<h2 class="hide-if-no-js">{{ $__( 'Your Recent Drafts', 'default' ) }}</h2>
				<ul>
					<li v-for="draft in items" :key="draft.id" :style="highlighted === draft.id ? { background: '#fffbe5' } : null">
						<div class="draft-title"><a :href="href( draft.url )" :aria-label="draft.ariaLabel">{{ draft.title }}</a><time :datetime="draft.isoDate">{{ draft.date }}</time></div>
						<p v-if="draft.excerpt" class="draft-content">{{ draft.excerpt }}</p>
					</li>
				</ul>
			</div>
		</template>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};

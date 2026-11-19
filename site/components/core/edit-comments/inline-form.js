import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { SCREEN_ASSETS } from '../../../kit/LegacyHtml.js';
import { mountQuicktagsEditor } from '../../../runtime/quicktags.js';

/*
 * The inline Quick Edit and Reply form of the Comments list: wp_comment_reply()'s table row
 * (`tr#replyrow.inline-edit-row`), always core's form (owner decision Q3: a plugin's filtered
 * form is not shown natively). The legend is Edit Comment or Reply to Comment; the comment's
 * text is the classic quicktags-only editor (`#replycontent`, runtime/quicktags.js) started with
 * the settings WordPress sends (`replyForm.quicktags`) once the page's screen assets are ready;
 * Quick Edit adds the Name, Email and URL fields. The button says Update Comment, Reply, or
 * Approve and Reply when WordPress says replying approves the comment.
 *
 * As edit-comments.js: Escape in the editor cancels (unless an input method is composing), Enter
 * in a Quick Edit field saves, and the error WordPress gives shows in the form.
 *
 * `form` is the page's reactive state of the form (`{ id, mode, content, author, email, url,
 * approve, sending, error }`), which the fields update. Emits `save` and `cancel`.
 */
export default {
	name: 'EditCommentsInlineForm',
	props: {
		form: { type: Object, required: true },
		colspan: { type: Number, required: true },
		quicktags: { type: Object, default: null },
	},
	emits: [ 'save', 'cancel' ],
	setup( props, { emit } ) {
		const host = ref( null );
		const mountEditor = inject( 'quicktagsEditor', mountQuicktagsEditor );
		const screenAssets = inject( SCREEN_ASSETS, null );
		let editor = null;
		let composing = false;
		onMounted( () => {
			if ( ! host.value ) {
				return;
			}
			editor = mountEditor( host.value, {
				id: 'replycontent',
				name: 'replycontent',
				value: props.form.content ?? '',
				settings: props.quicktags,
				onInput: ( value ) => {
					// eslint-disable-next-line vue/no-mutating-props -- the page's reactive form state.
					props.form.content = value;
				},
				ready: screenAssets?.ready,
			} );
			editor.focus?.();
		} );
		onBeforeUnmount( () => {
			editor?.destroy?.();
			editor = null;
		} );
		function onKeyup( event ) {
			if ( event?.key === 'Escape' && ! event.isComposing && ! composing ) {
				emit( 'cancel' );
			}
		}
		function onFieldKey( event ) {
			if ( event?.key === 'Enter' ) {
				event.preventDefault?.();
				emit( 'save' );
			}
		}
		const setField = ( name ) => ( event ) => {
			// eslint-disable-next-line vue/no-mutating-props -- the page's reactive form state.
			props.form[ name ] = String( event?.target?.value ?? '' );
		};
		return {
			host, onKeyup, onFieldKey, setField,
			onCompositionStart: () => {
				composing = true;
			},
			onCompositionEnd: () => {
				composing = false;
			},
		};
	},
	template: `
		<tr id="replyrow" class="inline-edit-row">
			<td :colspan="String( colspan )" class="colspanchange">
				<fieldset class="comment-reply">
					<legend>
						<span v-if="form.mode === 'edit'" id="editlegend">{{ $__( 'Edit Comment', 'default' ) }}</span>
						<span v-else id="replyhead">{{ $__( 'Reply to Comment', 'default' ) }}</span>
					</legend>
					<div id="replycontainer">
						<!-- translators: Hidden accessibility text. -->
						<label for="replycontent" class="screen-reader-text">{{ $__( 'Comment', 'default' ) }}</label>
						<div id="wp-replycontent-wrap" class="wp-core-ui wp-editor-wrap html-active">
							<div id="wp-replycontent-editor-container" ref="host" class="wp-editor-container" @keyup="onKeyup" @compositionstart="onCompositionStart" @compositionend="onCompositionEnd"></div>
						</div>
					</div>
					<div v-if="form.mode === 'edit'" id="edithead">
						<div class="inside">
							<label for="author-name">{{ $__( 'Name', 'default' ) }}</label>
							<input type="text" name="newcomment_author" size="50" :value="form.author" id="author-name" @input="setField( 'author' )( $event )" @keypress="onFieldKey" />
						</div>
						<div class="inside">
							<label for="author-email">{{ $__( 'Email', 'default' ) }}</label>
							<input type="text" name="newcomment_author_email" size="50" class="code" :value="form.email" id="author-email" @input="setField( 'email' )( $event )" @keypress="onFieldKey" />
						</div>
						<div class="inside">
							<label for="author-url">{{ $__( 'URL', 'default' ) }}</label>
							<input type="text" id="author-url" name="newcomment_author_url" class="code" size="103" :value="form.url" @input="setField( 'url' )( $event )" @keypress="onFieldKey" />
						</div>
					</div>
					<div id="replysubmit" class="submit">
						<p class="reply-submit-buttons">
							<button type="button" class="save button button-primary" :disabled="form.sending" @click="$emit( 'save' )">
								<span v-if="form.mode === 'edit'" id="savebtn">{{ $__( 'Update Comment', 'default' ) }}</span>
								<span v-else id="replybtn">{{ form.approve ? $__( 'Approve and Reply', 'default' ) : $_x( 'Reply', 'verb', 'default' ) }}</span>
							</button>
							{{ ' ' }}<button type="button" class="cancel button" @click="$emit( 'cancel' )">{{ $__( 'Cancel', 'default' ) }}</button>
							{{ ' ' }}<span :class="[ 'waiting', 'spinner', { 'is-active': form.sending } ]"></span>
						</p>
						<div :class="[ 'notice', 'notice-error', 'notice-alt', 'inline', { hidden: ! form.error } ]"><p class="error">{{ form.error }}</p></div>
					</div>
					<input type="hidden" name="action" id="action" :value="form.mode === 'edit' ? 'edit-comment' : 'replyto-comment'" />
					<input type="hidden" name="comment_ID" id="comment_ID" :value="String( form.id )" />
					<input type="hidden" name="comment_post_ID" id="comment_post_ID" :value="String( form.postId ?? '' )" />
				</fieldset>
			</td>
		</tr>
	`,
};

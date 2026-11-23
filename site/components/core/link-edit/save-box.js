import LegacyHtml from '../../../kit/LegacyHtml.js';

/** The Visit Link address: http(s) as it is, anything else none (`#`). Pure. */
export const visitHref = ( url ) => ( typeof url === 'string' && /^https?:\/\//i.test( url.trim() ) ? url.trim() : '#' );

/**
 * The Save box of the link form (link_submit_meta_box()): the hidden Save button that Return
 * presses, Visit Link (an existing link's address, in a new tab), "Keep this link private"
 * (`link_visible` N), the plugins' `post_submitbox_start` output, Delete (when WordPress gives
 * it), the Add Link or Update Link button and the plugins' `submitlink_box` output, both through
 * kit/LegacyHtml with their scripts.
 *
 * Props: `save` (the data's Save box), `private` (v-model:private), `sending`. Emits `remove`
 * for Delete.
 */
export default {
	name: 'LinkSaveBox',
	components: { LegacyHtml },
	props: {
		save: { type: Object, required: true },
		private: { type: Boolean, default: false },
		sending: { type: Boolean, default: false },
	},
	emits: [ 'update:private', 'remove' ],
	setup( props, { emit } ) {
		return {
			visitHref,
			setPrivate: ( event ) => emit( 'update:private', Boolean( event?.target?.checked ) ),
			remove: () => emit( 'remove' ),
		};
	},
	template: `
		<div class="submitbox" id="submitlink">
			<div id="minor-publishing">
				<div style="display:none;">
					<input type="submit" name="save" id="save" class="button" :value="$__( 'Save', 'default' )" :disabled="sending" />
				</div>
				<div id="minor-publishing-actions">
					<div id="preview-action">
						<a v-if="save.visitUrl" class="preview button" :href="visitHref( save.visitUrl )" target="_blank">{{ $__( 'Visit Link', 'default' ) }}</a>
					</div>
				</div>
				<div id="misc-publishing-actions">
					<div class="misc-pub-section misc-pub-private">
						<label for="link_private" class="selectit"><input id="link_private" name="link_visible" type="checkbox" value="N" :checked="private" @change="setPrivate" />{{ ' ' }}{{ $__( 'Keep this link private', 'default' ) }}</label>
					</div>
				</div>
			</div>
			<div id="major-publishing-actions">
				<LegacyHtml v-if="save.submitHtml?.start" :html="save.submitHtml.start" />
				<div id="delete-action">
					<a v-if="save.delete" class="submitdelete deletion" href="#" @click.prevent="remove">{{ $__( 'Delete', 'default' ) }}</a>
				</div>
				<div id="publishing-action">
					<input name="save" type="submit" class="button button-primary button-large" id="publish" :value="save.label" :disabled="sending" />
				</div>
				<div class="clear"></div>
			</div>
			<LegacyHtml v-if="save.submitHtml?.inside" :html="save.submitHtml.inside" />
			<div class="clear"></div>
		</div>
	`,
};

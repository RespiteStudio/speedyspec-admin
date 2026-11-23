import { nextTick, ref } from 'vue';
import { __ } from '../../../runtime/text.js';
import Format from '../dashboard-parts/format.js';

/*
 * The parent of the comment in the Edit Comment form's Save box: "In reply to:" and, with
 * threading, its Edit link and dropdown (`#comment-parent-div`), with what comment.js does with
 * them (comment.js:110-165). WordPress chooses the parents offered (`parentChoices`).
 */

/**
 * The dropdown's options, as edit-form-comment.php prints them: "None (top-level comment)"
 * (value 0), the choices, then the current parent when it is not among them. Pure.
 *
 * @param {{current: object|null, choices: object[]}|null} choices The data's `parentChoices`.
 * @return {Array<{value: string, label: string, author: string}>} The options.
 */
export function parentOptions( choices ) {
	if ( ! choices || typeof choices !== 'object' ) {
		return [];
	}
	const option = ( choice ) => ( { value: String( choice.id ), label: String( choice.label ?? '' ), author: String( choice.author ?? '' ) } );
	const listed = ( Array.isArray( choices.choices ) ? choices.choices : [] ).filter( ( choice ) => choice && choice.id !== undefined ).map( option );
	const current = choices.current && choices.current.id !== undefined ? [ option( choices.current ) ] : [];
	return [ { value: '0', label: __( 'None (top-level comment)', 'default' ), author: '' }, ...listed, ...current ];
}

/**
 * What comment.js shows after OK: "None" for no parent, else the option's author
 * (`data-author`), else its text. Pure.
 */
export function parentDisplay( options, value ) {
	if ( String( value ) === '0' ) {
		return __( 'None', 'default' );
	}
	const chosen = options.find( ( option ) => option.value === String( value ) );
	return chosen ? chosen.author || chosen.label : '';
}

/**
 * The "In reply to" part of the Save box. `parent` is the data's `parent` (the parent shown, with
 * its link) or null, `choices` the data's `parentChoices` (null: no dropdown), `parentId` the
 * comment's parent as loaded; `modelValue` is the dropdown's value (a string), which the page
 * sends with the save, and `update:modelValue` its changes.
 *
 * Edit opens the dropdown (focus on it); OK shows the chosen parent (parentDisplay()) and closes;
 * Cancel puts back the parent as loaded and its display, and closes. Focus goes back to Edit when
 * it closes.
 */
export default {
	name: 'CommentEditParent',
	components: { Format },
	props: {
		parent: { type: Object, default: null },
		choices: { type: Object, default: null },
		parentId: { type: Number, default: 0 },
		modelValue: { type: String, default: '0' },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit } ) {
		const open = ref( false );
		const shown = ref( null ); // Null: the display as loaded.
		const editLink = ref( null );
		const select = ref( null );
		const close = () => {
			open.value = false;
			nextTick( () => editLink.value?.focus?.() );
		};
		return {
			open, shown, editLink, select,
			options: () => parentOptions( props.choices ),
			onChange: ( event ) => emit( 'update:modelValue', String( event?.target?.value ?? '0' ) ),
			edit() {
				if ( ! open.value ) {
					open.value = true;
					nextTick( () => select.value?.focus?.() );
				}
			},
			ok() {
				shown.value = parentDisplay( parentOptions( props.choices ), props.modelValue );
				close();
			},
			cancel() {
				emit( 'update:modelValue', String( props.parentId ) );
				shown.value = null;
				close();
			},
		};
	},
	template: `
		<div class="misc-pub-section misc-pub-reply-to">
			<span id="comment-parent-display"><Format :text="$__( 'In reply to: %s', 'default' )"><template #arg1><b><template v-if="shown !== null">{{ shown }}</template><template v-else-if="parent"><a v-if="parent.url" :href="parent.url">{{ parent.title }}</a><template v-else>{{ parent.title }}</template></template><template v-else>{{ $__( 'None', 'default' ) }}</template></b></template></Format></span>
			<template v-if="choices">
				{{ ' ' }}<a ref="editLink" href="#edit_comment_parent" class="edit-comment-parent hide-if-no-js" :style="{ display: open ? 'none' : '' }" @click.prevent="edit"><span aria-hidden="true">{{ $__( 'Edit', 'default' ) }}</span> <span class="screen-reader-text">{{ $__( 'Edit parent comment', 'default' ) }}</span></a>
				<fieldset id="comment-parent-div" class="hide-if-js" :style="{ display: open ? 'block' : 'none' }">
					<legend class="screen-reader-text">{{ $__( 'Parent comment', 'default' ) }}</legend>
					<label for="comment_parent">{{ $__( 'Parent comment', 'default' ) }}</label>
					<select ref="select" name="comment_parent" id="comment_parent" :value="modelValue" @change="onChange">
						<option v-for="option in options()" :key="option.value" :value="option.value" :data-author="option.value === '0' ? null : option.author" :selected="option.value === modelValue">{{ option.label }}</option>
					</select>
					<input type="hidden" id="hidden_comment_parent" :value="String( parentId )" />
					<p>
						<a href="#edit_comment_parent" class="save-comment-parent hide-if-no-js button" @click.prevent="ok">{{ $__( 'OK', 'default' ) }}</a>
						{{ ' ' }}<a href="#edit_comment_parent" class="cancel-comment-parent hide-if-no-js button-cancel" @click.prevent="cancel">{{ $__( 'Cancel', 'default' ) }}</a>
					</p>
				</fieldset>
			</template>
		</div>
	`,
};

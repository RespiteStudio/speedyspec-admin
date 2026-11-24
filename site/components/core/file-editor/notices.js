import { computed } from 'vue';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { _n, sprintf } from '../../../runtime/text.js';

/*
 * The notices of the file editors.
 *
 * - FileEditorNotice: one notice of the page data (wp_admin_notice() on the classic screens):
 *   its markup through InlineMarkup, its type's classes (`inline` in the form), dismissible with
 *   its button; type `none` is classic's plain paragraph (the not-writable text).
 * - SaveNotice: a notice theme-plugin-editor.js adds with `tmpl-wp-file-editor-notice`: the save's
 *   message (text), WordPress's error notice (inline markup, the PHP error's message as text in a
 *   `pre`), or the lint errors' count with the "Update anyway" checkbox.
 */

const classesOf = ( type, inline, dismissible ) => [ 'notice', 'notice-' + type, { inline, 'is-dismissible': dismissible } ];

export const FileEditorNotice = {
	name: 'FileEditorNotice',
	components: { InlineMarkup },
	props: {
		notice: { type: Object, required: true },
		inline: { type: Boolean, default: false },
		dismissLabel: { type: String, default: '' },
	},
	emits: [ 'dismiss' ],
	setup( props ) {
		const plain = computed( () => props.notice.type === 'none' );
		const classes = computed( () => classesOf( props.notice.type, props.inline, props.notice.dismissible === true ) );
		return { plain, classes };
	},
	template: `
		<p v-if="plain" :data-notice="notice.id"><InlineMarkup :html="notice.markup ?? ''" /></p>
		<div v-else :class="classes" :data-notice="notice.id">
			<p><InlineMarkup :html="notice.markup ?? ''" /></p>
			<button v-if="notice.dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss' )"><span class="screen-reader-text">{{ dismissLabel }}</span></button>
		</div>
	`,
};

export const SaveNotice = {
	name: 'FileEditorSaveNotice',
	components: { InlineMarkup },
	props: {
		// The state's notice (file-editor/state.js), or null with `lintCount`.
		notice: { type: Object, default: null },
		// The lint errors the code editor shows (the `lint_errors` notice), 0 for none.
		lintCount: { type: Number, default: 0 },
		labels: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'dismiss', 'update-anyway' ],
	setup( props ) {
		const lint = computed( () => props.notice === null && props.lintCount > 0 );
		const lintText = computed( () => sprintf(
			/* translators: %s: Error count. */
			_n( 'There is %s error which must be fixed before you can update this file.', 'There are %s errors which must be fixed before you can update this file.', props.lintCount, 'default' ),
			String( props.lintCount )
		) );
		const classes = computed( () => classesOf( lint.value ? 'error' : props.notice?.type ?? 'info', true, ! lint.value && props.notice?.dismissible === true ) );
		const checkboxId = 'el-lint-' + Math.random().toString( 36 ).slice( 2 );
		return { lint, lintText, classes, checkboxId };
	},
	template: `
		<div :class="classes" :data-code="lint ? 'lint_errors' : notice?.code">
			<template v-if="lint">
				<p>{{ lintText }}</p>
				<p>
					<input :id="checkboxId" type="checkbox" @change="$emit( 'update-anyway' )">
					<label :for="checkboxId">{{ labels.lintErrors }}</label>
				</p>
			</template>
			<template v-else>
				<p v-if="notice.markup !== null"><InlineMarkup :html="notice.markup" /></p>
				<p v-else>{{ notice.text }}</p>
				<pre v-if="notice.message">{{ notice.message }}</pre>
			</template>
			<button v-if="! lint && notice.dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss' )"><span class="screen-reader-text">{{ labels.dismiss }}</span></button>
		</div>
	`,
};

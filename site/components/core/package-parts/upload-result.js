import { computed } from 'vue';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';

/*
 * The overwrite comparison an upload result shows when the package is already installed, as
 * Plugin_Installer_Skin::do_overwrite() and Theme_Installer_Skin::do_overwrite() print it: the
 * heading, the comparison table, the notice (or, when the overwrite is blocked, its reasons), the
 * expired text, and Replace current with uploaded (or Replace installed with uploaded) and Cancel
 * and go back. Add Plugins and Add Themes show it the same way.
 *
 * Everything WordPress decides is data: the texts, the rows and which values differ, whether the
 * overwrite is blocked and its reasons. What plugins filtered (the table, the actions) is plugin
 * output, shown through kit/LegacyHtml.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * Props: `overwrite` (the result's `overwrite`), `busy`. Emits `overwrite( comparison )` (the
 * replace action) and `cancel` (Cancel and go back), neither while `busy`.
 */
export const UploadOverwrite = {
	name: 'UploadOverwrite',
	components: { LegacyHtml, InlineMarkup },
	props: {
		overwrite: { type: Object, required: true },
		busy: { type: Boolean, default: false },
	},
	emits: [ 'overwrite', 'cancel' ],
	setup( props, { emit } ) {
		function replace( event ) {
			event?.preventDefault?.();
			if ( ! props.busy ) {
				emit( 'overwrite', props.overwrite );
			}
		}

		function cancel( event ) {
			event?.preventDefault?.();
			if ( ! props.busy ) {
				emit( 'cancel' );
			}
		}

		return {
			replace,
			cancel,
			rows: computed( () => list( props.overwrite.rows ).filter( ( row ) => row && typeof row === 'object' ) ),
			warnings: computed( () => list( props.overwrite.warnings ).filter( ( warning ) => typeof warning === 'string' ) ),
		};
	},
	template: `
		<h2 class="update-from-upload-heading">{{ overwrite.heading }}</h2>
		<LegacyHtml v-if="typeof overwrite.tableHtml === 'string'" :html="overwrite.tableHtml" />
		<table v-else class="update-from-upload-comparison"><tbody>
			<tr><th></th><th>{{ overwrite.columns?.current }}</th><th>{{ overwrite.columns?.uploaded }}</th></tr>
			<tr v-for="( row, index ) in rows" :key="index"><td class="name-label">{{ row.label }}</td><td>{{ row.current }}</td><td :class="{ warning: row.differs === true }">{{ row.uploaded }}</td></tr>
		</tbody></table>
		<p v-if="! overwrite.blocked" class="update-from-upload-notice"><InlineMarkup :html="warnings[ 0 ] ?? ''" /></p>
		<template v-else>
			<p>{{ overwrite.blockedIntro }}</p>
			<ul class="ul-disc"><li v-for="( reason, index ) in warnings" :key="index">{{ reason }}</li></ul>
		</template>
		<p class="update-from-upload-expired hidden">{{ overwrite.expired }}</p>
		<LegacyHtml v-if="typeof overwrite.actionsHtml === 'string'" class="update-from-upload-actions" :html="overwrite.actionsHtml" />
		<p v-else class="update-from-upload-actions"><template v-if="! overwrite.blocked"><a class="button button-primary update-from-upload-overwrite" href="#" @click="replace">{{ overwrite.label }}</a>{{ ' ' }}</template><a class="button" href="#" @click="cancel">{{ overwrite.cancelLabel }}</a></p>
	`,
};

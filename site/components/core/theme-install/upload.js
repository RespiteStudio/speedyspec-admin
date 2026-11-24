import { computed, ref } from 'vue';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { adminHref } from '../dashboard-parts/links.js';

/*
 * The upload of Add Themes: install_themes_upload()'s form (`p.install-help`, `form.wp-upload-form`,
 * `#themezip` and `#install-theme-submit`), and, once a package is sent, the result in its place,
 * as `update.php`'s `upload-theme` step prints it with Theme_Installer_Skin: the heading, the
 * upgrader's lines, then either the complete actions (Live Preview, Activate, Go to Themes page)
 * or the overwrite comparison (Theme_Installer_Skin::do_overwrite()). The page runs them through
 * package-parts/upload-flow.js.
 *
 * Everything WordPress decides is data: the texts, the log, the actions and where they lead, the
 * comparison's rows, which values differ, whether the overwrite is blocked and its reasons. What
 * plugins filtered (the comparison table, the overwrite actions, the complete actions) is plugin
 * output, shown through kit/LegacyHtml.
 *
 * As common.js does for `form.wp-upload-form`, Install Now is disabled until a file is chosen.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The upload form. Props: `upload` (the data's `upload`), `busy`. Emits `submit( file )`. */
export const ThemeUploadForm = {
	name: 'ThemeUploadForm',
	props: {
		upload: { type: Object, required: true },
		busy: { type: Boolean, default: false },
	},
	emits: [ 'submit' ],
	setup( props, { emit } ) {
		const input = ref( null );
		const chosen = ref( false );

		function onChange() {
			chosen.value = ( input.value?.files?.length ?? 0 ) > 0 || text( input.value?.value ) !== '';
		}

		function onSubmit( event ) {
			event?.preventDefault?.();
			if ( ! props.busy ) {
				emit( 'submit', input.value?.files?.[ 0 ] ?? null );
			}
		}

		return { input, chosen, onChange, onSubmit };
	},
	template: `
		<p class="install-help">{{ upload.help }}</p>
		<form method="post" enctype="multipart/form-data" class="wp-upload-form" @submit="onSubmit">
			<label class="screen-reader-text" for="themezip">{{ upload.fileLabel }}</label>
			<input ref="input" type="file" id="themezip" name="themezip" accept=".zip" @change="onChange" />
			{{ ' ' }}<input type="submit" name="install-theme-submit" id="install-theme-submit" class="button" :value="upload.submitLabel" :disabled="! chosen || busy" />
		</form>
	`,
};

/**
 * The result of an upload. Props: `result` (the route's answer), `busy`. Emits `activate( action )`
 * (Activate's request), `overwrite( comparison )` (Replace installed with uploaded), `cancel`
 * (Cancel and go back), `open( path )` (Live Preview, Go to Themes page). What plugins filter
 * there is plugin output; its admin links open through the router's document rule.
 */
export const ThemeUploadResult = {
	name: 'ThemeUploadResult',
	components: { LegacyHtml, InlineMarkup },
	props: {
		result: { type: Object, required: true },
		busy: { type: Boolean, default: false },
	},
	emits: [ 'activate', 'overwrite', 'cancel', 'open' ],
	setup( props, { emit } ) {
		const overwrite = computed( () => ( props.result.overwrite && typeof props.result.overwrite === 'object' ? props.result.overwrite : null ) );

		function run( action, event ) {
			event?.preventDefault?.();
			if ( props.busy ) {
				return;
			}
			if ( action.request ) {
				emit( 'activate', action );
			} else if ( typeof action.path === 'string' && action.path !== '' ) {
				emit( 'open', action.path );
			}
		}

		function replace( event ) {
			event?.preventDefault?.();
			if ( ! props.busy ) {
				emit( 'overwrite', overwrite.value );
			}
		}

		function cancel( event ) {
			event?.preventDefault?.();
			if ( ! props.busy ) {
				emit( 'cancel' );
			}
		}

		return {
			overwrite, run, replace, cancel,
			actions: computed( () => list( props.result.actions ).filter( ( action ) => typeof action?.label === 'string' ) ),
			log: computed( () => list( props.result.log ).filter( ( line ) => typeof line === 'string' ) ),
			rows: computed( () => list( overwrite.value?.rows ).filter( ( row ) => row && typeof row === 'object' ) ),
			warnings: computed( () => list( overwrite.value?.warnings ).filter( ( warning ) => typeof warning === 'string' ) ),
			href: ( action ) => ( action.request ? '#' : adminHref( text( action.path ) ) || '#' ),
		};
	},
	template: `
		<div class="wp-admin-theme-upload-result">
			<h2>{{ result.heading }}</h2>
			<p v-for="( line, index ) in log" :key="index"><InlineMarkup :html="line" /></p>
			<template v-if="overwrite">
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
			</template>
			<template v-else>
				<LegacyHtml v-if="typeof result.actionsHtml === 'string'" :html="result.actionsHtml" />
				<p v-else-if="actions.length > 0"><template v-for="( action, index ) in actions" :key="action.key ?? index"><template v-if="index > 0">{{ ' | ' }}</template><a :class="{ activatelink: action.key === 'activate', 'hide-if-no-customize': action.key === 'preview', 'load-customize': action.key === 'preview' }" :href="href( action )" @click="run( action, $event )">{{ action.label }}</a></template></p>
			</template>
		</div>
	`,
};

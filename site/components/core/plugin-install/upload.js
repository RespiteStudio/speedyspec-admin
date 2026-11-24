import { computed, ref } from 'vue';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { adminHref } from '../dashboard-parts/links.js';
import { UploadOverwrite } from '../package-parts/upload-result.js';

/*
 * The upload of Add Plugins: install_plugins_upload()'s form (`.upload-plugin`, `form.wp-upload-form`,
 * `#pluginzip` and `#install-plugin-submit`), what plugins print after it (`install_plugins_upload`,
 * kit/LegacyHtml), and, once a package is sent, the result in its place, as `update.php`'s
 * `upload-plugin` step prints it with Plugin_Installer_Skin: the heading, the upgrader's lines, then
 * either the complete actions or the overwrite comparison (Plugin_Installer_Skin::do_overwrite()).
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

/**
 * The upload form. Props: `upload` (the data's `upload`), `busy`. Emits `submit( file )`. What
 * plugins print after the form is plugin output; its admin links open through the router.
 */
export const UploadForm = {
	name: 'PluginUploadForm',
	components: { LegacyHtml },
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
			const file = input.value?.files?.[ 0 ] ?? null;
			if ( props.busy ) {
				return;
			}
			emit( 'submit', file );
		}

		return { input, chosen, onChange, onSubmit };
	},
	template: `
		<div class="upload-plugin">
			<p class="install-help">{{ upload.help }}</p>
			<form method="post" enctype="multipart/form-data" class="wp-upload-form" @submit="onSubmit">
				<label class="screen-reader-text" for="pluginzip">{{ upload.fileLabel }}</label>
				<input ref="input" type="file" id="pluginzip" name="pluginzip" accept=".zip" @change="onChange" />
				{{ ' ' }}<input type="submit" name="install-plugin-submit" id="install-plugin-submit" class="button" :value="upload.submitLabel" :disabled="! chosen || busy" />
			</form>
		</div>
		<LegacyHtml v-if="typeof upload.hooksHtml === 'string'" :html="upload.hooksHtml" />
	`,
};

/**
 * The result of an upload. Props: `result` (the route's answer), `busy`. Emits `activate( action )`
 * (Activate Plugin's request), `overwrite( comparison )` (Replace current with uploaded), `cancel`
 * (Cancel and go back). The overwrite comparison is the one Add Themes shows too
 * (package-parts/upload-result.js). What plugins filter there is plugin output; its admin links
 * open through the router.
 */
export const UploadResult = {
	name: 'PluginUploadResult',
	components: { LegacyHtml, InlineMarkup, UploadOverwrite },
	props: {
		result: { type: Object, required: true },
		busy: { type: Boolean, default: false },
	},
	emits: [ 'activate', 'overwrite', 'cancel' ],
	setup( props, { emit } ) {
		const overwrite = computed( () => ( props.result.overwrite && typeof props.result.overwrite === 'object' ? props.result.overwrite : null ) );
		const actions = computed( () => list( props.result.actions ).filter( ( action ) => typeof action?.label === 'string' ) );

		function run( action, event ) {
			if ( action.request ) {
				event?.preventDefault?.();
				if ( ! props.busy ) {
					emit( 'activate', action );
				}
			}
		}

		return {
			overwrite,
			actions,
			log: computed( () => list( props.result.log ).filter( ( line ) => typeof line === 'string' ) ),
			href: ( action ) => ( action.request ? '#' : adminHref( text( action.path ) ) || '#' ),
			run,
		};
	},
	template: `
		<div class="wp-admin-plugin-upload-result">
			<h2>{{ result.heading }}</h2>
			<p v-for="( line, index ) in log" :key="index"><InlineMarkup :html="line" /></p>
			<UploadOverwrite v-if="overwrite" :overwrite="overwrite" :busy="busy" @overwrite="( comparison ) => $emit( 'overwrite', comparison )" @cancel="$emit( 'cancel' )" />
			<template v-else>
				<LegacyHtml v-if="typeof result.actionsHtml === 'string'" :html="result.actionsHtml" />
				<p v-else-if="actions.length > 0"><template v-for="( action, index ) in actions" :key="action.key ?? index"><template v-if="index > 0">{{ ' ' }}</template><a :class="{ button: action.request, 'button-primary': action.request }" :href="href( action )" @click="run( action, $event )">{{ action.label }}</a></template></p>
			</template>
		</div>
	`,
};

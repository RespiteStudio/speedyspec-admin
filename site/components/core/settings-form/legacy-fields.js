import LegacyHtml from '../../../kit/LegacyHtml.js';

/**
 * Rows of the fields plugins add to a settings screen with add_settings_field(), in the
 * classic markup of do_settings_fields(); their titles and controls are the plugins' own
 * markup and scripts (see kit/LegacyHtml.js; `assets` is the endpoint's `legacySections`).
 * A field whose callback failed shows a message instead. Shared by the settings screens.
 */
export const LegacyRows = {
	name: 'LegacyRows',
	components: { LegacyHtml },
	props: {
		fields: { type: Array, default: () => [] },
		assets: { type: Object, default: () => ( {} ) },
	},
	template: `
		<tr v-for="field in fields" :key="field.id" :class="field.class || null" :data-legacy-field="field.id">
			<th scope="row">
				<label v-if="field.labelFor" :for="field.labelFor"><LegacyHtml tag="span" :html="field.title" /></label>
				<LegacyHtml v-else tag="span" :html="field.title" />
			</th>
			<td>
				<p v-if="field.error" class="wp-admin-field-error wp-admin-legacy-failure" role="alert">{{ $__( 'This setting could not be displayed.', 'wp-admin-site' ) }}</p>
				<LegacyHtml v-else :html="field.html" :assets="assets" />
			</td>
		</tr>
	`,
};

/**
 * Sections plugins add to a settings screen with add_settings_section(), after the
 * screen's tables, in the classic markup of do_settings_sections().
 */
export const LegacySections = {
	name: 'LegacySections',
	components: { LegacyHtml, LegacyRows },
	props: {
		sections: { type: Array, default: () => [] },
		assets: { type: Object, default: () => ( {} ) },
	},
	template: `
		<div v-for="section in sections" :key="section.id" class="wp-admin-legacy-section" :data-legacy-section="section.id">
			<LegacyHtml v-if="section.before" :html="section.before" :assets="assets" />
			<h2 v-if="section.title"><LegacyHtml tag="span" :html="section.title" /></h2>
			<p v-if="section.error" class="wp-admin-field-error wp-admin-legacy-failure" role="alert">{{ $__( 'This section could not be displayed.', 'wp-admin-site' ) }}</p>
			<LegacyHtml v-else-if="section.html" :html="section.html" :assets="assets" />
			<table v-if="section.fields.length" class="form-table" role="presentation"><tbody><LegacyRows :fields="section.fields" :assets="assets" /></tbody></table>
			<LegacyHtml v-if="section.after" :html="section.after" :assets="assets" />
		</div>
	`,
};

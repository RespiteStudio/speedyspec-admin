import LegacyHtml from '../../../kit/LegacyHtml.js';

/**
 * Rows of the fields plugins add to General Settings with add_settings_field(), in the
 * classic markup of do_settings_fields(); their titles and controls are the plugins' own
 * markup (see kit/LegacyHtml.js). Part of the page's implementation.
 */
export const LegacyRows = {
	name: 'LegacyRows',
	components: { LegacyHtml },
	props: {
		fields: { type: Array, default: () => [] },
	},
	template: `
		<tr v-for="field in fields" :key="field.id" :class="field.class || null" :data-legacy-field="field.id">
			<th scope="row">
				<label v-if="field.labelFor" :for="field.labelFor"><LegacyHtml tag="span" :html="field.title" /></label>
				<LegacyHtml v-else tag="span" :html="field.title" />
			</th>
			<td><LegacyHtml :html="field.html" /></td>
		</tr>
	`,
};

/**
 * Sections plugins add to General Settings with add_settings_section(), after the
 * screen's table, in the classic markup of do_settings_sections().
 */
export const LegacySections = {
	name: 'LegacySections',
	components: { LegacyHtml, LegacyRows },
	props: {
		sections: { type: Array, default: () => [] },
	},
	template: `
		<div v-for="section in sections" :key="section.id" class="wp-admin-legacy-section" :data-legacy-section="section.id">
			<LegacyHtml v-if="section.before" :html="section.before" />
			<h2 v-if="section.title"><LegacyHtml tag="span" :html="section.title" /></h2>
			<LegacyHtml v-if="section.html" :html="section.html" />
			<table v-if="section.fields.length" class="form-table" role="presentation"><tbody><LegacyRows :fields="section.fields" /></tbody></table>
			<LegacyHtml v-if="section.after" :html="section.after" />
		</div>
	`,
};

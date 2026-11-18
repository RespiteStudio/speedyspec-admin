/**
 * The Site Language selector of General Settings (part of the page's implementation).
 * As `wp_dropdown_languages()`: the installed languages, and the ones that can be
 * installed in an "Available" group when there are any.
 */
export default {
	name: 'SiteLanguage',
	props: {
		modelValue: { type: String, default: '' },
		languages: { type: Array, default: () => [] },
		error: { type: String, default: '' },
	},
	emits: [ 'update:modelValue' ],
	computed: {
		installed() {
			return this.languages.filter( ( language ) => language.installed );
		},
		available() {
			return this.languages.filter( ( language ) => ! language.installed );
		},
	},
	template: `
		<select name="WPLANG" id="WPLANG" :aria-invalid="error ? 'true' : null" :aria-describedby="error ? 'WPLANG-error' : null" @change="$emit( 'update:modelValue', $event.target.value )">
			<template v-if="available.length">
				<optgroup :label="$_x( 'Installed', 'translations', 'default' )">
					<option v-for="language in installed" :key="language.value" :value="language.value" :lang="language.lang || null" :selected="language.value === modelValue" data-installed="1">{{ language.label }}</option>
				</optgroup>
				<optgroup :label="$_x( 'Available', 'translations', 'default' )">
					<option v-for="language in available" :key="language.value" :value="language.value" :lang="language.lang || null" :selected="language.value === modelValue">{{ language.label }}</option>
				</optgroup>
			</template>
			<template v-else>
				<option v-for="language in installed" :key="language.value" :value="language.value" :lang="language.lang || null" :selected="language.value === modelValue" data-installed="1">{{ language.label }}</option>
			</template>
		</select>
	`,
};

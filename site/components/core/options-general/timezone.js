import Interpolate from '../../../kit/Interpolate.js';

/**
 * The Timezone selector of General Settings (part of the page's implementation): the
 * timezones grouped as `wp_timezone_choice()` groups them, the description, and the
 * Universal time, local time and daylight saving texts of the saved settings.
 */
export default {
	name: 'TimezoneChoice',
	components: { Interpolate },
	props: {
		modelValue: { type: String, default: '' },
		groups: { type: Array, default: () => [] },
		preview: { type: Object, required: true },
		describedBy: { type: String, default: null },
		error: { type: String, default: '' },
	},
	emits: [ 'update:modelValue' ],
	template: `
		<select id="timezone_string" name="timezone_string" :aria-describedby="describedBy" :aria-invalid="error ? 'true' : null" @change="$emit( 'update:modelValue', $event.target.value )">
			<template v-for="( group, index ) in groups" :key="index">
				<optgroup v-if="group.group" :label="group.group" dir="auto">
					<option v-for="option in group.options" :key="option.value" :value="option.value" :selected="option.value === modelValue" dir="auto">{{ option.label }}</option>
				</optgroup>
				<template v-else>
					<option v-for="option in group.options" :key="option.value" :value="option.value" :selected="option.value === modelValue" dir="auto">{{ option.label }}</option>
				</template>
			</template>
		</select>
		<p class="description" id="timezone-description"><Interpolate :text="$__( 'Choose either a city in the same timezone as you or a %s (Coordinated Universal Time) time offset.', 'default' )" :args="[ { tag: 'abbr', text: 'UTC' } ]" /></p>
		<p class="timezone-info">
			<span id="utc-time"><Interpolate :text="preview.utcTime.format" :args="[ { tag: 'code', text: preview.utcTime.value } ]" /></span>
			{{ ' ' }}<span v-if="preview.localTime" id="local-time"><Interpolate :text="preview.localTime.format" :args="[ { tag: 'code', text: preview.localTime.value } ]" /></span>
		</p>
		<p v-if="preview.dstNotice" class="timezone-info">
			<span><template v-for="( sentence, index ) in preview.dstNotice" :key="index"><br v-if="index === 1">{{ index > 0 ? ' ' : '' }}<Interpolate :text="sentence.format" :args="sentence.value === null ? [] : [ { tag: 'code', text: sentence.value } ]" /></template></span>
		</p>
	`,
};

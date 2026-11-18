import { computed, onBeforeUnmount, watch } from 'vue';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Button from '../../kit/Button.js';
import Interpolate from '../../kit/Interpolate.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { LegacyRows, LegacySections } from './settings-form/legacy-fields.js';
import { useSettingsForm } from './settings-form/use-settings-form.js';
import { FIELDS, KEEP_INPUT, sizeValue } from './options-media/state.js';
import { shownSettings } from './options-media/help.js';

const ROUTE = 'wp-admin/v1/settings/media';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './options-media/help.js';

/**
 * Default implementation of core/options-media: the Media Settings screen.
 *
 * The markup is the classic screen's: the "Image sizes" table, the "Embeds" table when
 * plugins add fields to its section, and on a single site the "Uploading Files" table, in
 * its field order and with its headings, labels, descriptions, ids and classes. The rows
 * are core/settings-field instances inside core/form-table, so that a plugin can replace the
 * page, a table or the row component, or add modules to the page's slots; the classic
 * full-width row of the year- and month-based folders checkbox (`td.td-full`) is the
 * screen's own markup. The upload paths are shown only while they can be edited (the
 * router data has them), as on the classic screen.
 *
 * The fields plugins add with add_settings_field() are rendered at the end of the table
 * whose section they name (`default`, `embeds`, `uploads`), and their sections after the
 * tables. Saving is the shared settings form's (settings-form/use-settings-form.js), which
 * sends the checkboxes the page data lists in `unshown` at every save (ruling P7).
 */
export default {
	name: 'OptionsMedia',
	components: { Contracted, SlotOutlet, Button, Interpolate, LegacyRows, LegacySections, InlineMarkup },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const form = useSettingsForm( {
			data: () => props.data,
			route: ROUTE,
			fields: FIELDS,
			keepInput: KEEP_INPUT,
			onSaved( next ) {
				emit( 'saved', next );
			},
		} );
		const { settings, errors, errorMarkup } = form;

		// The help follows the settings shown, also after a save (see options-media/help.js).
		watch( settings, ( value ) => {
			shownSettings.value = value;
		}, { immediate: true } );
		onBeforeUnmount( () => {
			if ( shownSettings.value === settings.value ) {
				shownSettings.value = null;
			}
		} );

		const rows = {
			default: computed( () => form.legacyRows( 'default' ) ),
			embeds: computed( () => form.legacyRows( 'embeds' ) ),
			uploads: computed( () => form.legacyRows( 'uploads' ) ),
		};
		// The classic screen prints the Uploading Files table on a single site only.
		const uploadsTable = computed( () => settings.value.multisite !== true );

		/** Errors of the controls of a grouped row, each in an element its control references. */
		const errorsOf = ( ...fields ) => fields.filter( ( field ) => errors.value[ field ] ).map( ( field ) => ( { field, message: errors.value[ field ], markup: errorMarkup.value[ field ] ?? '' } ) );

		// Strings with markup are kept out of the template, whose attribute values cannot hold their quotes.
		const text = {
			/* translators: %s: wp-content/uploads */
			defaultFolder: computed( () => __( 'Default is %s', 'default' ) ),
		};
		const defaultFolder = [ { tag: 'code', text: 'wp-content/uploads' } ];

		return { ...form, rows, uploadsTable, errorsOf, text, defaultFolder, sizeValue };
	},
	template: `
		<div class="wp-admin-options-media options-media-php">
			<form ref="form" method="post" @submit.prevent="save" @input="onFormEdit" @change="onFormEdit">
				<SlotOutlet name="before-fields" :context="slotContext" />

				<h2 id="wp-settings-section-image-sizes" class="title">{{ $__( 'Image sizes', 'default' ) }}</h2>
				<p>{{ $__( 'The sizes listed below determine the maximum dimensions in pixels to use when adding an image to the Media Library.', 'default' ) }}</p>

				<Contracted id="core/form-table">
					<Contracted contract="core/settings-field" id="thumbnail_size" :label="$__( 'Thumbnail size', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Thumbnail size', 'default' ) }}</span></legend>
							<label for="thumbnail_size_w">{{ $__( 'Width', 'default' ) }}</label>
							<input name="thumbnail_size_w" type="number" step="1" min="0" id="thumbnail_size_w" :value="values.thumbnail_size_w" @input="values.thumbnail_size_w = sizeValue( $event.target.value )" class="small-text" v-bind="aria( 'thumbnail_size_w' )">
							<br>
							<label for="thumbnail_size_h">{{ $__( 'Height', 'default' ) }}</label>
							<input name="thumbnail_size_h" type="number" step="1" min="0" id="thumbnail_size_h" :value="values.thumbnail_size_h" @input="values.thumbnail_size_h = sizeValue( $event.target.value )" class="small-text" v-bind="aria( 'thumbnail_size_h' )">
						</fieldset>
						<input name="thumbnail_crop" type="checkbox" id="thumbnail_crop" value="1" :checked="values.thumbnail_crop" @change="values.thumbnail_crop = $event.target.checked" v-bind="aria( 'thumbnail_crop' )">
						<label for="thumbnail_crop">{{ $__( 'Crop thumbnail to exact dimensions (normally thumbnails are proportional)', 'default' ) }}</label>
						<p v-for="item in errorsOf( 'thumbnail_size_w', 'thumbnail_size_h', 'thumbnail_crop' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error"><InlineMarkup v-if="item.markup" :html="item.markup" /><template v-else>{{ item.message }}</template></p>
					</Contracted>

					<Contracted contract="core/settings-field" id="medium_size" :label="$__( 'Medium size', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Medium size', 'default' ) }}</span></legend>
							<label for="medium_size_w">{{ $__( 'Max Width', 'default' ) }}</label>
							<input name="medium_size_w" type="number" step="1" min="0" id="medium_size_w" :value="values.medium_size_w" @input="values.medium_size_w = sizeValue( $event.target.value )" class="small-text" v-bind="aria( 'medium_size_w' )">
							<br>
							<label for="medium_size_h">{{ $__( 'Max Height', 'default' ) }}</label>
							<input name="medium_size_h" type="number" step="1" min="0" id="medium_size_h" :value="values.medium_size_h" @input="values.medium_size_h = sizeValue( $event.target.value )" class="small-text" v-bind="aria( 'medium_size_h' )">
						</fieldset>
						<p v-for="item in errorsOf( 'medium_size_w', 'medium_size_h' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error"><InlineMarkup v-if="item.markup" :html="item.markup" /><template v-else>{{ item.message }}</template></p>
					</Contracted>

					<Contracted contract="core/settings-field" id="large_size" :label="$__( 'Large size', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Large size', 'default' ) }}</span></legend>
							<label for="large_size_w">{{ $__( 'Max Width', 'default' ) }}</label>
							<input name="large_size_w" type="number" step="1" min="0" id="large_size_w" :value="values.large_size_w" @input="values.large_size_w = sizeValue( $event.target.value )" class="small-text" v-bind="aria( 'large_size_w' )">
							<br>
							<label for="large_size_h">{{ $__( 'Max Height', 'default' ) }}</label>
							<input name="large_size_h" type="number" step="1" min="0" id="large_size_h" :value="values.large_size_h" @input="values.large_size_h = sizeValue( $event.target.value )" class="small-text" v-bind="aria( 'large_size_h' )">
						</fieldset>
						<p v-for="item in errorsOf( 'large_size_w', 'large_size_h' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error"><InlineMarkup v-if="item.markup" :html="item.markup" /><template v-else>{{ item.message }}</template></p>
					</Contracted>

					<LegacyRows :fields="rows.default.value" :assets="legacy" />
				</Contracted>

				<template v-if="rows.embeds.value.length">
					<h2 id="wp-settings-section-embeds" class="title">{{ $__( 'Embeds', 'default' ) }}</h2>
					<Contracted id="core/form-table">
						<LegacyRows :fields="rows.embeds.value" :assets="legacy" />
					</Contracted>
				</template>

				<template v-if="uploadsTable">
					<h2 id="wp-settings-section-uploading-files" class="title">{{ $__( 'Uploading Files', 'default' ) }}</h2>
					<Contracted id="core/form-table">
						<Contracted v-if="has( 'upload_path' )" contract="core/settings-field" id="upload_path" :label="$__( 'Store uploads in this folder', 'default' )" :error="errors.upload_path" :error-markup="errorMarkup.upload_path">
							<input name="upload_path" type="text" id="upload_path" :value="values.upload_path" @input="values.upload_path = $event.target.value" class="regular-text code" v-bind="aria( 'upload_path' )">
							<p class="description"><Interpolate :text="text.defaultFolder.value" :args="defaultFolder" /></p>
						</Contracted>

						<Contracted v-if="has( 'upload_url_path' )" contract="core/settings-field" id="upload_url_path" :label="$__( 'Full URL path to files', 'default' )" :error="errors.upload_url_path" :error-markup="errorMarkup.upload_url_path">
							<input name="upload_url_path" type="text" id="upload_url_path" :value="values.upload_url_path" @input="values.upload_url_path = $event.target.value" class="regular-text code" v-bind="aria( 'upload_url_path' )">
							<p class="description">{{ $__( 'Configuring this is optional. By default, it should be blank.', 'default' ) }}</p>
						</Contracted>

						<tr v-if="has( 'uploads_use_yearmonth_folders' )" data-field="uploads_use_yearmonth_folders">
							<td colspan="2" class="td-full">
								<label for="uploads_use_yearmonth_folders">
									<input name="uploads_use_yearmonth_folders" type="checkbox" id="uploads_use_yearmonth_folders" value="1" :checked="values.uploads_use_yearmonth_folders" @change="values.uploads_use_yearmonth_folders = $event.target.checked" v-bind="aria( 'uploads_use_yearmonth_folders' )">
									{{ $__( 'Organize my uploads into month- and year-based folders', 'default' ) }}
								</label>
								<p v-if="errors.uploads_use_yearmonth_folders" id="uploads_use_yearmonth_folders-error" class="wp-admin-field-error"><InlineMarkup v-if="errorMarkup.uploads_use_yearmonth_folders" :html="errorMarkup.uploads_use_yearmonth_folders" /><template v-else>{{ errors.uploads_use_yearmonth_folders }}</template></p>
							</td>
						</tr>

						<LegacyRows :fields="rows.uploads.value" :assets="legacy" />
					</Contracted>
				</template>

				<SlotOutlet name="after-fields" :context="slotContext" />

				<LegacySections :sections="sections" :assets="legacy" />

				<p class="submit">
					<Button variant="primary" type="submit" id="submit" name="submit" :disabled="saving" :busy="saving">{{ $__( 'Save Changes', 'default' ) }}</Button>
				</p>

				<SlotOutlet name="after-submit" :context="slotContext" />
			</form>
		</div>
	`,
};

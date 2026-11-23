/**
 * The Advanced box of the link form (link_advanced_meta_box()): the Image Address, the RSS
 * Address, the Notes and the Rating, whose choices come from the data (`ratings`); without a
 * rating (Add) the first choice shows, as a browser shows a select with none selected.
 * v-model: `{ image, rss, notes, rating }`, text.
 */
export default {
	name: 'LinkAdvancedBox',
	props: {
		modelValue: { type: Object, required: true },
		ratings: { type: Array, default: () => [] },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit } ) {
		return {
			set: ( name ) => ( event ) => emit( 'update:modelValue', { ...props.modelValue, [ name ]: String( event?.target?.value ?? '' ) } ),
		};
	},
	template: `
		<table class="links-table" cellpadding="0">
			<tr>
				<th scope="row"><label for="link_image">{{ $__( 'Image Address', 'default' ) }}</label></th>
				<td><input type="text" name="link_image" class="code" id="link_image" maxlength="255" :value="modelValue.image" @input="set( 'image' )( $event )" /></td>
			</tr>
			<tr>
				<th scope="row"><label for="rss_uri">{{ $__( 'RSS Address', 'default' ) }}</label></th>
				<td><input name="link_rss" class="code" type="text" id="rss_uri" maxlength="255" :value="modelValue.rss" @input="set( 'rss' )( $event )" /></td>
			</tr>
			<tr>
				<th scope="row">
					<label for="link_notes">
						<!-- translators: Label for the Notes textarea in the Link Manager edit screen. -->
						{{ $_x( 'Notes', 'Link manager notes field label', 'default' ) }}
					</label>
				</th>
				<td><textarea name="link_notes" id="link_notes" rows="10" :value="modelValue.notes" @input="set( 'notes' )( $event )"></textarea></td>
			</tr>
			<tr>
				<th scope="row"><label for="link_rating">{{ $__( 'Rating', 'default' ) }}</label></th>
				<td><select name="link_rating" id="link_rating" size="1" :value="modelValue.rating" @change="set( 'rating' )( $event )">
					<option v-for="rating in ratings" :key="rating" :value="String( rating )">{{ rating }}</option>
				</select>{{ '\\u00a0' }}{{ $__( '(Leave at 0 for no rating.)', 'default' ) }}
				</td>
			</tr>
		</table>
	`,
};

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const kit = await import( '../site/kit/index.js' );

const { h } = Vue;
afterEach( unmountAll );

test( 'the kit exports exactly its eleven components and its version', () => {
	assert.deepEqual( Object.keys( kit ).sort(), [ 'Button', 'CheckboxField', 'FormTable', 'InlineMarkup', 'Interpolate', 'LegacyHtml', 'Notice', 'RadioGroup', 'SelectField', 'Spinner', 'TextField', 'VERSION' ] );
} );

test( 'the kit version is semantic and 1.3.0: InlineMarkup (1.1), Interpolate function tags (1.2), then LegacyHtml screen assets (1.3)', () => {
	assert.match( kit.VERSION, /^\d+\.\d+\.\d+$/ );
	assert.equal( kit.VERSION, '1.3.0' );
} );

/** Renders `component` with `props` and collects update:modelValue payloads. */
function control( component, props, { inTable = false } = {} ) {
	const updates = [];
	const node = () => h( component, { ...props, 'onUpdate:modelValue': ( value ) => updates.push( value ) } );
	const view = mount( inTable ? () => h( kit.FormTable, null, { default: node } ) : node );
	return { view, updates };
}

function assertAssociated( view, controlTag ) {
	const label = find( view.container, byTag( 'label' ) );
	const input = find( view.container, byTag( controlTag ) );
	const description = find( view.container, byClass( 'description' ) );
	assert.ok( input.props.id, 'control has an id' );
	assert.equal( label.props.for, input.props.id, 'label is for the control' );
	assert.equal( input.props[ 'aria-describedby' ], description.props.id, 'control is described by the description' );
	return { label, input, description };
}

for ( const inTable of [ false, true ] ) {
	const where = inTable ? ' in a FormTable' : '';

	test( 'TextField associates label and description and emits update:modelValue' + where, () => {
		const { view, updates } = control( kit.TextField, { label: 'Site Title', description: 'Shown in the title bar.', modelValue: 'Old', name: 'blogname' }, { inTable } );
		const { label, input, description } = assertAssociated( view, 'input' );
		assert.equal( textOf( label ), 'Site Title' );
		assert.equal( textOf( description ), 'Shown in the title bar.' );
		assert.ok( hasClass( input, 'regular-text' ) );
		assert.equal( input.props.value, 'Old' );
		assert.equal( input.props.name, 'blogname', 'other attributes go to the input' );
		input.props.onInput( { target: { value: 'New' } } );
		assert.deepEqual( updates, [ 'New' ] );
		if ( inTable ) {
			assert.ok( find( view.container, byClass( 'form-table' ) ) );
			assert.equal( find( view.container, byTag( 'th' ) ).props.scope, 'row' );
		}
	} );

	test( 'SelectField associates label and description and emits the option value' + where, () => {
		const options = [ { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' } ];
		const { view, updates } = control( kit.SelectField, { label: 'Week Starts On', description: 'First day.', modelValue: 1, options }, { inTable } );
		const { input } = assertAssociated( view, 'select' );
		assert.deepEqual( findAll( input, byTag( 'option' ) ).map( textOf ), [ 'Sunday', 'Monday' ] );
		input.props.onChange( { target: { value: '0' } } );
		assert.deepEqual( updates, [ 0 ] );
	} );

	test( 'CheckboxField associates label and description and emits the checked state' + where, () => {
		const { view, updates } = control( kit.CheckboxField, { label: 'Anyone can register', description: 'Membership.', modelValue: false }, { inTable } );
		const { input } = assertAssociated( view, 'input' );
		assert.equal( input.props.type, 'checkbox' );
		input.props.onChange( { target: { checked: true } } );
		assert.deepEqual( updates, [ true ] );
	} );

	test( 'RadioGroup names its fieldset with the label, describes it and emits the chosen value' + where, () => {
		const options = [ { value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' } ];
		const { view, updates } = control( kit.RadioGroup, { label: 'Mode', description: 'Pick one.', modelValue: 'a', options }, { inTable } );
		const fieldset = find( view.container, byTag( 'fieldset' ) );
		const legend = find( fieldset, byTag( 'legend' ) );
		const description = find( fieldset, byClass( 'description' ) );
		assert.equal( textOf( legend ), 'Mode' );
		assert.equal( fieldset.props[ 'aria-describedby' ], description.props.id );
		const radios = findAll( fieldset, byTag( 'input' ) );
		const labels = findAll( fieldset, byTag( 'label' ) );
		assert.deepEqual( labels.map( ( l ) => l.props.for ), radios.map( ( r ) => r.props.id ) );
		assert.equal( radios[ 0 ].props.checked, true );
		assert.equal( radios[ 0 ].props.name, radios[ 1 ].props.name );
		radios[ 1 ].props.onChange( {} );
		assert.deepEqual( updates, [ 'b' ] );
	} );
}

test( 'RadioGroup takes a name, passes other attributes to the fieldset and keys options by position', () => {
	const options = [ { value: 1, label: 'Number one' }, { value: '1', label: 'Text one' } ];
	const { view, updates } = control( kit.RadioGroup, { label: 'Mode', name: 'mode', modelValue: '1', options, 'data-extra': 'x' } );
	const fieldset = find( view.container, byTag( 'fieldset' ) );
	assert.equal( fieldset.props[ 'data-extra' ], 'x' );
	assert.equal( find( view.container, ( el ) => el.props[ 'data-extra' ] === 'x' && el !== fieldset ), null, 'not repeated elsewhere' );
	const radios = findAll( fieldset, byTag( 'input' ) );
	assert.equal( radios.length, 2 );
	assert.deepEqual( radios.map( ( r ) => r.props.name ), [ 'mode', 'mode' ] );
	assert.deepEqual( radios.map( ( r ) => r.props.checked ), [ false, true ] );
	radios[ 0 ].props.onChange( {} );
	assert.deepEqual( updates, [ 1 ] );
} );

test( 'controls without an id get distinct generated ids; a given id is used', () => {
	const view = mount( () => [ h( kit.TextField, { label: 'A' } ), h( kit.TextField, { label: 'B' } ), h( kit.TextField, { label: 'C', id: 'blogname' } ) ] );
	const ids = findAll( view.container, byTag( 'input' ) ).map( ( i ) => i.props.id );
	assert.equal( new Set( ids ).size, 3 );
	assert.equal( ids[ 2 ], 'blogname' );
	assert.match( ids[ 0 ], /^[A-Za-z][A-Za-z0-9_-]*$/ );
} );

test( 'a control without a description has no aria-describedby; disabled is passed on', () => {
	const view = mount( () => h( kit.TextField, { label: 'A', disabled: true } ) );
	const input = find( view.container, byTag( 'input' ) );
	assert.equal( input.props[ 'aria-describedby' ], null );
	assert.equal( input.props.disabled, true );
	assert.equal( find( view.container, byClass( 'description' ) ), null );
} );

test( 'Button uses the classic classes and passes clicks on', () => {
	let clicks = 0;
	const view = mount( () => h( kit.Button, { variant: 'primary', onClick: () => clicks++ }, { default: () => 'Save Changes' } ) );
	const button = find( view.container, byTag( 'button' ) );
	assert.ok( hasClass( button, 'button' ) && hasClass( button, 'button-primary' ) );
	assert.equal( button.props.type, 'button' );
	assert.equal( textOf( button ), 'Save Changes' );
	button.props.onClick();
	assert.equal( clicks, 1 );
} );

test( 'Notice renders classic markup and a named dismiss button', () => {
	let dismissed = 0;
	const view = mount( () => h( kit.Notice, { type: 'error', dismissible: true, onDismiss: () => dismissed++ }, { default: () => h( 'p', 'Broken.' ) } ) );
	const notice = find( view.container, byClass( 'notice' ) );
	assert.ok( hasClass( notice, 'notice-error' ) && hasClass( notice, 'is-dismissible' ) );
	const button = find( notice, byClass( 'notice-dismiss' ) );
	assert.equal( textOf( button ).trim(), 'Dismiss this notice.' );
	button.props.onClick();
	assert.equal( dismissed, 1 );
} );

test( 'Spinner is a status with a translated accessible name', async () => {
	const view = mount( () => h( kit.Spinner ) );
	await flush();
	const spinner = find( view.container, byClass( 'spinner' ) );
	assert.equal( spinner.props.role, 'status' );
	assert.equal( view.text().trim(), 'Loading…' );
} );

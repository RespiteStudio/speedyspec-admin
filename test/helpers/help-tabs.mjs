/**
 * Drives the Help panel (core/help-tabs) in a component test: mounts it with a page's own help
 * merged with the router's, as the frame does, and reads its tabs.
 *
 * openHelp( help, routerHelp, page, provide ): VueWrapper
 * tabs( wrapper ), titles( wrapper ), selected( wrapper ), flat( found )
 */
import HelpTabs, { mergeHelp } from '../../site/components/core/help-tabs.js';
import { mountPart } from './mount.mjs';

/** Mounts the Help panel with `help` (the page's own) merged with `routerHelp` for `page`. */
export function openHelp( help, routerHelp, page, provide = {} ) {
	const { tabs: merged, sidebar } = mergeHelp( help, routerHelp, page );
	return mountPart( HelpTabs, { props: { tabs: merged, sidebar }, provide } );
}

/** The tab buttons. */
export const tabs = ( wrapper ) => wrapper.findAll( '[role="tab"]' );

/** The tab titles, in order. */
export const titles = ( wrapper ) => tabs( wrapper ).map( ( tab ) => tab.text() );

/** The titles of the selected tabs. */
export const selected = ( wrapper ) => tabs( wrapper ).filter( ( tab ) => tab.attributes( 'aria-selected' ) === 'true' ).map( ( tab ) => tab.text() );

/** An element's text with its whitespace collapsed. */
export const flat = ( found ) => found.text().replace( /\s+/g, ' ' );

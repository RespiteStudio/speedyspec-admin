import { createApi } from './api.js';

const api = createApi( { fetch: ( ...args ) => globalThis.fetch( ...args ) } );

export default api;
export const { get, post, del, setNonce, setBase, onUnauthorized } = api;

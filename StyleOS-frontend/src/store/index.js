import { createStore,applyMiddleware } from 'redux';
import thunk from 'redux-thunk';

import reducer from '../reducers/index';

// B2 — bagStore/wishlistStore previously lived only in memory: a page
// refresh mid-browse (before checkout turns the bag into a real backend
// cart) silently wiped everything the user had added. Persisting just
// these two slices survives refresh/tab-close without touching any
// reducer logic.
const PERSIST_KEY = 'styleos_client_cart_state';
const PERSISTED_SLICES = ['bagStore', 'wishlistStore'];

// Every consumer of bagStore/wishlistStore (Navbar's badge count, in
// particular — it renders on every single route) assumes a plain array
// and calls .length/.map on it directly with no guard, exactly like the
// reducers' own defaults always were. Anything malformed read back from
// localStorage — a stale shape from an older build, a hand-edited value,
// storage shared with another tab running different code — must never
// be handed to Redux as preloaded state, or it crashes every page in the
// app, not just the one that wrote it.
function loadPersistedState() {
    try {
        const raw = localStorage.getItem(PERSIST_KEY);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return undefined;
        const safe = {};
        PERSISTED_SLICES.forEach(key => {
            if (Array.isArray(parsed[key])) safe[key] = parsed[key];
        });
        return Object.keys(safe).length ? safe : undefined;
    } catch (e) {
        return undefined;
    }
}

const store = createStore(reducer, loadPersistedState(), applyMiddleware(thunk));

store.subscribe(() => {
    try {
        const state = store.getState();
        const toPersist = {};
        PERSISTED_SLICES.forEach(key => { toPersist[key] = state[key]; });
        localStorage.setItem(PERSIST_KEY, JSON.stringify(toPersist));
    } catch (e) {
        // Storage full/unavailable — persistence is a nice-to-have, not
        // worth breaking the app over.
    }
});

export default store;


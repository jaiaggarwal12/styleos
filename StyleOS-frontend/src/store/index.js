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

function loadPersistedState() {
    try {
        const raw = localStorage.getItem(PERSIST_KEY);
        return raw ? JSON.parse(raw) : undefined;
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


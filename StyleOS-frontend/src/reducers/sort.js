import {
    SORT
} from '../actions/sort';

const defaultSortState = null;

export default function sort( state = defaultSortState , action ){
    switch(action.type){
        case SORT:
            // Redux's combineReducers throws synchronously if a reducer
            // ever returns undefined — falling back to the current state
            // keeps a stray sort(undefined) call a no-op instead of a
            // crash on every subsequent dispatch.
            return action.sortBy === undefined ? state : action.sortBy;
        default:
            return state;
    }
}
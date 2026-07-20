export const sorter = ( products , sortParameter ) =>{
    // Copy before sorting. On a default Home visit (no search, no filters)
    // `products` is the SAME array reference as the Redux productStore slice,
    // and native .sort() mutates in place — so sorting silently reordered
    // the store itself for every other consumer and broke reference-equality
    // checks. [...products] keeps this a pure transform.
    const list = Array.isArray(products) ? [...products] : [];
    if( sortParameter === 'Price: Low to High' ){
        return list.sort( ( a , b ) => {
            return a.price - b.price;
        } );
    }
    if( sortParameter === 'Price: High to Low' ){
        return list.sort( ( a , b ) => {
            return b.price - a.price;
        } );
    }
    if( sortParameter === 'Customer Rating' ){
        return list.sort( ( a , b ) => {
            return b.rating - a.rating;
        } );
    }
    if( sortParameter === 'Better Discount' ){
        return list.sort( ( a , b ) => {
            return b.discountPercent - a.discountPercent;
        } );
    }
    if( sortParameter === 'Most Reviewed' ){
        return list.sort( ( a , b ) => {
            return b.numberOfReviews - a.numberOfReviews;
        } );
    }
    if( sortParameter === 'Recently Added' ){
        return list.sort( ( a , b ) => {
            return b.postedAt - a.postedAt;
        } );
    }
    return list;
}
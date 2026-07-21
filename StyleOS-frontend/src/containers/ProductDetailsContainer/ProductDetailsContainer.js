import {React,useState,useEffect} from 'react';
import './ProductDetailsContainer.css';
import { useSelector , useDispatch } from 'react-redux';
import { addItemToWishlist , removeItemFromWishlist } from '../../actions/wishlist';
import { Link } from "react-router-dom";
import { nFormatter , isInWishList , isInBag } from '../../helpers/general';
import { addItemToBag , setSize} from '../../actions/bag';
import { openModal } from '../../actions/modals';
export default function ProductDetailsContainer({product}) {
    const sizes = product.sizes && product.sizes.length > 0 ? product.sizes : ['S', 'M', 'L', 'XL'];
    const dispatch = useDispatch();
    const {wishlist , bag} = useSelector(state => {
        return {
            wishlist: state.wishlistStore,
            bag: state.bagStore
        }
    });
    let isAddedToWishlist = isInWishList( wishlist , product );
    let isAddedToBag = isInBag( bag , product );
    const [selectedSize,setSelectedSize] = useState(null);
    // Reflect the already-chosen size for an in-bag product. Previously this
    // called setSelectedSize during render, forcing a wasted extra render
    // every pass; an effect keyed on the bag/product runs it after commit,
    // the correct React way.
    useEffect(() => {
        const inBag = (bag || []).find(item => item.id === product.id);
        if (inBag && inBag.size !== selectedSize) {
            setSelectedSize(inBag.size);
        }
    }, [bag, product.id, selectedSize]);
    return (
        <div className="product-details-container" >
            <h2 className="product-brandname" >{product.brandName}</h2>
            <p className="product-name" >{product.productName}</p>
            <div className="product-rating-count" >
                <span className="rating" >{product.rating}</span>
                <span className="star-icon" > <i className="fas fa-star"></i> | </span>
                <span className="no-of-reviews" >  {nFormatter(product.numberOfReviews,1)} Ratings </span>   
            </div>
            <div className="product-price-details" >
                <span className="final-price" > Rs. {product.price} </span> &nbsp;
                <span className="original-price" > Rs. {product.originalPrice} </span> &nbsp;
                <span className="discount-percentage" > ({product.discountPercent}% OFF) </span>
                <p className="tax-detail" > inclusive of all taxes </p>
            </div>
            <div className="product-size-details" >
                <p className="select-size-title" > SELECT SIZE </p>
                {
                    sizes.map((size,index)=>{
                        return(
                            <>
                                <input 
                                    type="radio" 
                                    name= {`size-${product.id}`}
                                    value={size} 
                                    className="size-radio-input"
                                    id={ product.id + index}
                                    onClick = {() => {
                                        if( isAddedToBag ){
                                            dispatch(setSize(product,size));
                                        }
                                        else {
                                            setSelectedSize(size) 
                                        }}
                                    }
                                    checked={selectedSize === size}
                                />
                                <label className="detail-size-label" htmlFor={product.id + index} >
                                    <span className="detail-size-number" > {size} </span>
                                </label>
                            </>
                        )
                    })
                }
            </div>
            <div className="product-actions" >
                <>
                    <button
                        style={isAddedToBag ? {display:'none'} : {display:'inline'} }
                        className="bag-handler-button"
                        onClick={()=>{ 
                            if( selectedSize === null ){
                                window.alert("Please select a size");
                            }
                            else
                                dispatch(addItemToBag(product , selectedSize));
                        }}
                    >
                        <i className="fas fa-shopping-bag"></i>
                        &nbsp;
                        ADD TO BAG
                    </button>
                    <button
                        style={isAddedToBag ? {display:'inline'} : {display:'none'} }
                        className="bag-handler-button"
                        onClick={()=>{
                            dispatch(openModal('bag'))
                        }}
                    >
                        GO TO BAG
                        &nbsp;
                        <i className="fas fa-arrow-right"></i>
                    </button>
                </>
                <>
                    <button
                        style={isAddedToWishlist ? {display:'none'} : {display:'inline'} }
                        className="wishlist-handler-button  add-to-wishlist-button"
                        onClick={()=>{dispatch(addItemToWishlist(product));}}
                    >
                        <i className="far fa-heart"></i>
                        &nbsp;
                        WISHLIST
                    </button>
                    <button
                        style={isAddedToWishlist ? {display:'inline'} : {display:'none'} }
                        className="wishlist-handler-button remove-from-wishlist-button"
                        onClick={()=>{dispatch(removeItemFromWishlist(product));}}
                    >
                        <i className="fas fa-heart" style={{color:"red"}} ></i>
                        &nbsp;
                        WISHLISTED
                    </button>
                </>
                
            </div>
        </div>
    )
}

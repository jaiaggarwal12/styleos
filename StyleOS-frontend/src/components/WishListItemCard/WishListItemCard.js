import React from 'react'
import './WishListItemCard.css'
import {Link} from 'react-router-dom';
import {useDispatch} from 'react-redux';
import {addItemToWishlist,removeItemFromWishlist} from '../../actions/wishlist';
import {addItemToBag} from '../../actions/bag';
export default function WishListItemCard({ item }) {
    const dispatch = useDispatch();
    const thumbnail = Array.isArray(item.images) ? item.images[0] : item.images;
    return (
        <div className="wishlist-item-card">
            <Link to={`/product/${item.id}`}>
                <div className="wishlist-item-image-container">
                    {thumbnail
                        ? <img src={thumbnail} alt="product" className="wishlist-item-image" loading="lazy" onError={e => { e.target.style.display = 'none'; }}/>
                        : <span className="wishlist-item-placeholder">👕</span>
                    }
                </div>
                <div className="wishlist-item-details flex-column ">
                    <div className="wishlist-item-name">{item.productName}</div>
                    <div className="wishlist-item-price">
                        <span className="wishlist-item-price" > Rs.{item.price} </span>
                        <span className="wishlist-item-original-price" > Rs.{item.originalPrice} </span> 
                        <span className="wishlist-item discount" > ({item.discountPercent} %) <span className="wishlist-item-percent-off" >OFF</span></span> 
                    </div>
                </div>
            </Link>
            <div className="wishlist-item-action center" >
                <button 
                    className="remove-item-button" 
                    onClick={()=> dispatch(removeItemFromWishlist(item))} 
                >
                    <i className="fas fa-times-circle"></i>
                </button>
                <button 
                    className="move-to-bag-button" 
                    onClick={()=> { dispatch(addItemToBag(item)); }}
                >
                    MOVE TO BAG
                </button>
            </div>
        </div>
    )
}

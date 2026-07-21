import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './BagContainer.css';
import {BagItemCard , Empty} from '../../components/index';
import {emptyBag} from '../../actions/bag';
import {closeModal} from '../../actions/modals';
import {useDispatch, useSelector} from 'react-redux';
import { findTotal } from '../../helpers/general';
import { cart as cartApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function BagContainer() {
    const bag = useSelector(state => state.bagStore);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [creatingCart, setCreatingCart] = useState(false);
    // A4 — checkout empties the in-progress selection (it's been turned
    // into a real cart), but past carts must stay reachable from the Bag,
    // not vanish. Sourced from the real backend, same records Collab reads,
    // so both surfaces show the same history.
    const [pastCarts, setPastCarts] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoadingHistory(true);
        setHistoryError(false);
        cartApi.list()
            .then(carts => setPastCarts(Array.isArray(carts) ? carts : []))
            .catch(() => setHistoryError(true))
            .finally(() => setLoadingHistory(false));
    }, [user, bag.length]);

    // "Checkout" here means: turn the local bag into a REAL backend cart —
    // the same cart_id Kiya-built carts use — so it can generate a Squad
    // Cart and go through the exact same family-review flow, not a
    // separate, disconnected path just because it started from browsing
    // instead of a goal.
    async function checkOutHandler(){
        if (creatingCart) return;
        let checkoutCheck = true;
        bag.forEach(product => {
            if( product.size === undefined ){
                window.alert('Please select size for ' + product.productName);
                checkoutCheck = false;
            }
        })
        if (!checkoutCheck) return;

        if (!user) {
            window.alert('Please log in to check out.');
            dispatch(closeModal());
            navigate('/login');
            return;
        }

        setCreatingCart(true);
        try {
            const newCart = await cartApi.create('My Bag', '');
            const cartId = newCart.id || newCart.ID;
            for (const product of bag) {
                await cartApi.addItem(cartId, product.id, product.size, product.quantity || 1);
            }
            dispatch(emptyBag());
            dispatch(closeModal());
            navigate(`/cart/${cartId}`);
        } catch (err) {
            console.error(err);
            window.alert("Couldn't start checkout — please try again.");
        } finally {
            setCreatingCart(false);
        }
    }
    return (
        <div className="bag-container flex-row " >
            {
                bag.length === 0 ?
                <Empty />
                :
                bag.map((product,index) =>{
                    return (
                        <BagItemCard item={product} key={product.id} />
                    )
                })
            }
            {user && (pastCarts.length > 0 || loadingHistory || historyError) && (
                <div className="bag-history-section">
                    <p className="bag-history-title">Your carts</p>
                    {loadingHistory ? (
                        <p className="bag-history-loading">Loading...</p>
                    ) : historyError ? (
                        <p className="bag-history-loading">Couldn't load your past carts.</p>
                    ) : (
                        pastCarts.map(c => {
                            const cid = c.ID || c.id;
                            const name = c.NAME || c.name || 'My Bag';
                            const total = c.TOTAL_PRICE || c.totalPrice || 0;
                            const itemCount = (c.items || []).reduce((s, it) => s + (it.QUANTITY || it.quantity || 1), 0);
                            return (
                                <Link
                                    to={`/cart/${cid}`}
                                    key={cid}
                                    className="bag-history-row"
                                    onClick={() => dispatch(closeModal())}
                                >
                                    <span className="bag-history-name">{name}</span>
                                    <span className="bag-history-meta">{itemCount} item{itemCount === 1 ? '' : 's'} · ₹{total.toLocaleString('en-IN')}</span>
                                </Link>
                            );
                        })
                    )}
                </div>
            )}
            <div className="bag-action" >
                <div className="total-amount center" >
                    <p>₹ { findTotal(bag) }</p>
                </div>
                <div
                    className={`checkout center ${ bag.length > 0 && !creatingCart ? "" : "inactive"} `}
                    onClick={ checkOutHandler }
                >
                    {/* Both branches render a single <span> element, never a
                        bare text node swapping with a fragment. React removes
                        the old child by DOM reference on that swap, so if
                        anything has re-wrapped the text node (Google Translate
                        wraps text in <font> tags) removeChild throws
                        NotFoundError and the whole app unmounts. Keeping it
                        element-to-element makes the reconciliation safe. */}
                    <p>
                        {creatingCart
                            ? <span>Preparing your cart...</span>
                            : <span>Checkout <i className="fas fa-arrow-circle-right"></i></span>}
                    </p>
                </div>
            </div>
        </div>
    )
}

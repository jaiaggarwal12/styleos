import React, { useState, useEffect } from 'react';
import { ProductDetailsContainer, ProductSamplesContainer } from '../containers/index';
import { ProductSampleCarousel } from '../components/index';
import { Breadcrumb } from '../components/index.js';
import { useParams, useNavigate } from "react-router-dom";
import { products as productsApi } from '../services/api';
import { normalizeProduct } from '../helpers/normalizeProduct';

export default function Product() {
    const { productID } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | ok | not_found

    useEffect(() => {
        setStatus('loading');
        setProduct(null);
        productsApi.get(productID)
            .then(raw => setProduct(normalizeProduct(raw)))
            .then(() => setStatus('ok'))
            .catch(() => setStatus('not_found'));
    }, [productID]);

    if (status === 'loading') {
        return <div style={{ padding: 60, textAlign: 'center' }}>Loading product...</div>;
    }
    if (status === 'not_found' || !product) {
        return (
            <div style={{ padding: 60, textAlign: 'center' }}>
                <p>Product not found.</p>
                <button className="product-back-btn" onClick={() => navigate(-1)}>← Go back</button>
            </div>
        );
    }

    return (
        <div>
            {/* B1 — a product opened from ANYWHERE (Collab, Wedding Matrix,
                Wardrobe) previously had no way back except the Breadcrumb,
                which always dead-ends at Home and loses that context.
                navigate(-1) returns to wherever the user actually came from. */}
            <button className="product-back-btn" onClick={() => navigate(-1)}>← Back</button>
            <Breadcrumb addItem={product} />
            <ProductSampleCarousel product={product}/>
            <ProductSamplesContainer product={product} />
            <ProductDetailsContainer product={product} />
        </div>
    )
}

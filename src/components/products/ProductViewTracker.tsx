"use client";

import { useEffect } from "react";

import {
  type RecentlyViewedProduct,
  useRecentlyViewedStore,
} from "@/store/recently-viewed-store";

type ProductViewTrackerProps = {
  product: RecentlyViewedProduct;
};

export default function ProductViewTracker({
  product,
}: ProductViewTrackerProps) {
  const addProduct =
    useRecentlyViewedStore(
      (state) => state.addProduct,
    );

  const {
    productId,
    name,
    slug,
    price,
    image,
    stockStatus,
    productType,
    averageRating,
    ratingCount,
  } = product;

  useEffect(() => {
    addProduct({
      productId,
      name,
      slug,
      price,
      image,
      stockStatus,
      productType,
      averageRating,
      ratingCount,
    });
  }, [
    addProduct,
    productId,
    name,
    slug,
    price,
    image,
    stockStatus,
    productType,
    averageRating,
    ratingCount,
  ]);

  return null;
}
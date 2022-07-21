/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Product } from './models/product.interface';

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  constructor(private http: HttpClient) {}
  baseUrl = `./api/products`;

  /* Begin product service mock
  products: Product[] = [];

  fetch(): Observable<Product[]> {
    return of(this.products);
  }

  get(productId: string): Observable<Product | undefined> {
    const product = this.products.find((p) => p.product_id === productId);
    return of(product);
  }

  delete(product: Product) {
    this.products = this.products.filter(
      (p) => p.product_id !== product.product_id
    );
    return this.fetch();
  }

  patch(product: Product) {
    this.products = this.products.filter(
      (p) => p.product_id !== product.product_id
    );
    this.products = [...this.products, product];
    return of(this.products);
  }

  post(product: Product) {
    const p = this.products.find((p) => p.product_id === product.product_id);
    if (p) {
      this.products = this.products.filter(
        (p) => p.product_id !== product.product_id
      );
      this.products = [...this.products, product];
    } else {
      this.products.push({
        ...product,
        product_id: this.uuid(),
      });
    }
    return of(this.products);
  }

  uuid = () => {
    var uuidValue = '',
      k,
      randomValue;
    for (k = 0; k < 32; k++) {
      randomValue = (Math.random() * 16) | 0;

      if (k == 8 || k == 12 || k == 16 || k == 20) {
        uuidValue += '-';
      }
      uuidValue += (
        k == 12 ? 4 : k == 16 ? (randomValue & 3) | 8 : randomValue
      ).toString(16);
    }
    return uuidValue;
  };
 End product service mock */

  fetch(): Observable<Product[]> {
    return this.http.get<Product[]>(this.baseUrl);
  }

  get(productId: string): Observable<Product> {
    const url = `${this.baseUrl}/${productId}`;
    return this.http.get<Product>(url);
  }

  delete(product: Product) {
    const url = `${this.baseUrl}/${product.product_id}`;
    return this.http.delete<Product>(url);
  }

  patch(product: Product) {
    const url = `${this.baseUrl}/${product.product_id}`;
    return this.http.patch<Product>(url, product);
  }

  post(product: Product) {
    return this.http.post<Product>(this.baseUrl, product);
  }
}

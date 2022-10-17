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

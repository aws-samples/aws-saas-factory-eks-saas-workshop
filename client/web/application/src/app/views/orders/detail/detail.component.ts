/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, merge, Observable } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import { Product } from '../../products/models/product.interface';
import { ProductService } from '../../products/product.service';
import { Order } from '../models/order.interface';
import { OrderProduct } from '../models/orderproduct.interface';
import { OrdersService } from '../orders.service';
@Component({
  selector: 'app-detail',
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.scss'],
})
export class DetailComponent implements OnInit {
  orderId$: Observable<string> | undefined;
  order$: Observable<Order> | undefined;
  productsWithName$: Observable<OrderProduct[]> | undefined;
  taxRate = 0.0899;
  constructor(
    private route: ActivatedRoute,
    private orderSvc: OrdersService,
    private productSvc: ProductService
  ) {}

  ngOnInit(): void {
    this.orderId$ = this.route.params.pipe(map((o) => o['orderId']));
    this.order$ = this.orderId$.pipe(switchMap((o) => this.orderSvc.get(o)));
    const allProducts$ = this.productSvc.fetch();
    this.productsWithName$ = combineLatest([this.order$, allProducts$]).pipe(
      filter(([order, allProducts]) => !!order && !!allProducts),
      map(([order, allProducts]) => {
        return order.products.map((op) => {
          const product = allProducts.find(
            (p) => p.product_id === op.productId
          );
          return {
            ...op,
            name: product?.name || '',
          };
        });
      })
    );
  }

  today() {
    return new Date();
  }

  sum(op: OrderProduct) {
    return op.price * op.quantity;
  }

  total(op: OrderProduct, tax?: number) {
    return this.sum(op) + (tax || 0);
  }

  subTotal(order: Order) {
    return order.products
      .map((op) => op.price * op.quantity)
      .reduce((acc, curr) => acc + curr);
  }

  final(order: Order) {
    return this.subTotal(order) + (order.tax || 0);
  }
}

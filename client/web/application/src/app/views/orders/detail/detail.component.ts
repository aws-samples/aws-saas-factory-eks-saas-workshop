/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
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
  orderProducts$: Observable<OrderProduct[]> | undefined;
  taxRate = 0.0899;
  constructor(private route: ActivatedRoute, private orderSvc: OrdersService) {}

  ngOnInit(): void {
    this.orderId$ = this.route.params.pipe(map((o) => o['orderId']));
    this.order$ = this.orderId$.pipe(switchMap((o) => this.orderSvc.get(o)));
    this.orderProducts$ = this.order$.pipe(map((o) => o.products));
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

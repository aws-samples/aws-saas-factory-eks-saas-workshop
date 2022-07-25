import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { Order } from '../models/order.interface';
import { OrdersService } from '../orders.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent implements OnInit {
  displayedColumns: string[] = ['name', 'lineItems', 'total'];
  orders$: Observable<Order[]>;
  constructor(private orderSvc: OrdersService, private router: Router) {
    this.orders$ = of([
      {
        id: '1',
        name: 'first order',
        products: [
          {
            productId: '2',
            price: 3.33,
            quantity: 1,
          },
        ],
      },
    ]);
  }

  ngOnInit(): void {
    // this.orders$ = this.orderSvc.fetch();
  }

  sum(order: Order): number {
    return order.products
      .map((p) => p.price * p.quantity)
      .reduce((acc, curr) => acc + curr);
  }
}

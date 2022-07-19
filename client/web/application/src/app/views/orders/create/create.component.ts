import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Product } from '../../products/models/product.interface';
import { ProductService } from '../../products/product.service';
import { Order } from '../models/order.interface';
import { OrdersService } from '../orders.service';

interface LineItem {
  product: Product;
  quantity?: number;
}
@Component({
  selector: 'app-create',
  templateUrl: './create.component.html',
  styleUrls: ['./create.component.scss'],
})
export class CreateComponent implements OnInit {
  orderForm: FormGroup;
  orderProducts: LineItem[] = [];
  error = '';
  constructor(
    private fb: FormBuilder,
    private productSvc: ProductService,
    private orderSvc: OrdersService,
    private router: Router
  ) {
    this.orderForm = this.fb.group({
      name: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.productSvc.fetch().subscribe((products) => {
      this.orderProducts = products.map((p) => ({ product: p }));
    });
    this.orderForm = this.fb.group({
      name: ['', Validators.required],
    });
  }

  get name() {
    return this.orderForm.get('name');
  }

  add(op: LineItem) {
    const orderProduct = this.orderProducts.find(
      (p) => p?.product.product_id === op.product.product_id
    );
    this.orderProducts = this.orderProducts.map((p) => {
      if (p.product?.product_id === orderProduct?.product?.product_id) {
        p = {
          ...orderProduct,
          quantity: orderProduct.quantity ? orderProduct.quantity + 1 : 1,
        };
      }
      return p;
    });
  }

  remove(op: LineItem) {
    const orderProduct = this.orderProducts.find(
      (p) => p?.product.product_id === op.product.product_id
    );
    this.orderProducts = this.orderProducts.map((p) => {
      if (p.product?.product_id === orderProduct?.product?.product_id) {
        p = {
          ...orderProduct,
          quantity:
            orderProduct.quantity && orderProduct.quantity > 1
              ? orderProduct.quantity - 1
              : undefined,
        };
      }
      return p;
    });
  }

  submit() {
    const val: Order = {
      ...this.orderForm?.value,
      products: this.orderProducts
        .filter((p) => !!p.quantity)
        .map((p) => ({
          productId: p.product.product_id,
          price: p.product.price,
          quantity: p.quantity,
        })),
    };
    this.orderSvc.create(val).subscribe(() => this.router.navigate(['orders']));
  }
}

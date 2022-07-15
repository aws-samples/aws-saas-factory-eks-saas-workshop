/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { Product } from '../models/product.interface';
import { ProductService } from '../product.service';

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  styles: ['td > a { cursor: pointer; } '],
})
export class ProductListComponent implements OnInit {
  products$: Observable<Product[]>;

  constructor(private productSvc: ProductService, private router: Router) {}

  ngOnInit(): void {
    this.refresh();
  }

  onEdit(product: Product) {
    this.router.navigate(['products', 'edit', product.product_id]);
    return false;
  }

  onRemove(product: Product) {
    this.productSvc.delete(product);
    this.refresh();
  }

  onCreate() {
    this.router.navigate(['products', 'create']);
  }

  refresh() {
    this.products$ = this.productSvc.fetch();
  }
}

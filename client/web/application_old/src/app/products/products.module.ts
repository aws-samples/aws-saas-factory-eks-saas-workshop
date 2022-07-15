/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ProductsRoutingModule } from './products-routing.module';
import { ProductListComponent } from './product-list/product-list.component';
import { ProductCreateComponent } from './product-create/product-create.component';
import { ProductEditComponent } from './product-edit/product-edit.component';

// 3P components
import { PopoverModule } from 'ngx-bootstrap/popover';

@NgModule({
  declarations: [ProductListComponent, ProductCreateComponent, ProductEditComponent],
  imports: [
    CommonModule,
    FormsModule,
    PopoverModule.forRoot(),
    ProductsRoutingModule,
    ReactiveFormsModule,
  ],
})
export class ProductsModule {}

/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { OrdersRoutingModule } from './orders-routing.module';
import { OrdersListComponent } from './orders-list/orders-list.component';
import { OrdersCreateComponent } from './orders-create/orders-create.component';
import { OrdersDetailComponent } from './orders-detail/orders-detail.component';

import { PopoverModule } from 'ngx-bootstrap/popover';

@NgModule({
  declarations: [OrdersListComponent, OrdersCreateComponent, OrdersDetailComponent],
  imports: [
    CommonModule,
    FormsModule,
    OrdersRoutingModule,
    PopoverModule.forRoot(),
    ReactiveFormsModule,
  ],
})
export class OrdersModule {}

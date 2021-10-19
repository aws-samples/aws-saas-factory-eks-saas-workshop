/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProductService } from '../product.service';

@Component({
  selector: 'app-product-create',
  templateUrl: './product-create.component.html',
  styles: [],
})
export class ProductCreateComponent implements OnInit {
  constructor(
    private router: Router,
    private productSvc: ProductService,
    private fb: FormBuilder
  ) {}
  productForm: FormGroup;
  files: File[];

  ngOnInit(): void {
    this.productForm = this.fb.group({
      name: ['', Validators.required],
      price: ['', Validators.required],
      description: '',
    });
  }

  submit() {
    this.productSvc.post(this.productForm.value).subscribe(
      () => {
        this.router.navigate(['products']);
      },
      (err) => {
        alert(err);
        console.error(err);
      }
    );
  }

  cancel() {
    this.router.navigate(['products']);
  }

  onSelect(event: { addedFiles: any }) {
    console.log(event);
    this.files.push(...event.addedFiles);
  }

  onRemove(event: File) {
    console.log(event);
    this.files.splice(this.files.indexOf(event), 1);
  }
}

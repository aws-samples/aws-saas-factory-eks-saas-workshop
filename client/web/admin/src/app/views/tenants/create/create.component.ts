import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { TenantsService } from '../tenants.service';

@Component({
  selector: 'app-create',
  templateUrl: './create.component.html',
  styleUrls: ['./create.component.scss'],
})
export class CreateComponent implements OnInit {
  submitting = false;
  tenantForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required]),
    companyName: new FormControl('', [Validators.required]),
    plan: new FormControl('', [Validators.required]),
  });
  constructor(private tenantSvc: TenantsService, private router: Router) {}

  ngOnInit(): void {}

  submit() {
    this.submitting = true;
    const user = {
      ...this.tenantForm.value,
    };

    this.tenantSvc.createTenant(user).subscribe({
      next: () => {
        this.submitting = false;
        this.router.navigate(['tenants']);
      },
      error: (err: any) => {
        console.error(err);
        this.submitting = false;
      },
    });
  }

  public get name() {
    return this.tenantForm.get('name');
  }

  public get email() {
    return this.tenantForm.get('email');
  }

  public get companyName() {
    return this.tenantForm.get('companyName');
  }

  public get plan() {
    return this.tenantForm.get('plan');
  }
}

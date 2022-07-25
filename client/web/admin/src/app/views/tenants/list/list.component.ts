import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Tenant } from '../models/tenant';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent implements OnInit {
  tenants$ = new Observable<Tenant[]>();
  displayedColumns = ['tenant_id', 'companyName', 'email', 'plan'];
  constructor() {}

  ngOnInit(): void {}
}

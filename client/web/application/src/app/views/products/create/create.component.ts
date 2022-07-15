import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-create',
  templateUrl: './create.component.html',
  styleUrls: ['./create.component.scss'],
})
export class CreateComponent implements OnInit {
  form: FormGroup = this.fb.group({});
  constructor(private fb: FormBuilder) {
    // this.form = this.fb.group({});
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      name: '',
      gender: '',
      dob: '',
      address: '',
      country: '',
      email: [
        null,
        [
          Validators.required,
          Validators.pattern('^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$'),
        ],
      ],
      password: [null, [Validators.required, Validators.minLength(6)]],
    });
  }

  isError(field: string, key: string) {
    const errors = this.form.get(field)?.errors;
    return errors && errors[key];
  }
}

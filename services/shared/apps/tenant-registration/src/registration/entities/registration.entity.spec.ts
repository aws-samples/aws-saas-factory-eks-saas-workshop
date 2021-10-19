/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { PLAN_TYPE } from '../../models/types';
import { Registration } from './registration.entity';

describe('Registration.Entity', () => {
  let sut: Registration;

  it('should handle undefined inputs', () => {
    sut = new Registration(
      '12345',
      'bob@mail.com',
      PLAN_TYPE.Premium,
      undefined,
    );
    expect(sut.Path).toBe('');
  });

  it('should trim non alpha characters', () => {
    sut = new Registration(
      '12345',
      'bob@mail.com',
      PLAN_TYPE.Premium,
      "Bob's wholesale foods",
    );
    expect(sut.Path).toBe('bobswholesalefoods');
  });

  it('should lowercase inputs', () => {
    sut = new Registration(
      '12345',
      'fred@flintstone.com',
      PLAN_TYPE.Basic,
      'FREDS BASIC BURGERS',
    );
    expect(sut.Path).toBe('fredsbasicburgers');
  });
});

/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
export function getTimeString() {
  const date = new Date();
  const yyyy = date.getFullYear().toString();
  const MM = pad(date.getMonth() + 1, 2);
  const dd = pad(date.getDate(), 2);
  const hh = pad(date.getHours(), 2);
  const mm = pad(date.getMinutes(), 2);
  const ss = pad(date.getSeconds(), 2);
  return yyyy + MM + dd + hh + mm + ss;
}

function pad(n: number, l: number) {
  let str = '' + n;
  while (str.length < l) {
    str = '0' + str;
  }
  return str;
}

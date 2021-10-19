/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
export interface ConfigParams {
  clearHashAfterLogin: boolean;
  clientId: string;
  issuer: string;
  nonceStateSeparator: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  sessionChecksEnabled: boolean;
  showDebugInformation: boolean;
  silentRefreshRedirectUri: string;
  silentRefreshTimeout: number;
  start_checksession: boolean;
  strictDiscoveryDocumentValidation: boolean;
  timeoutFactor: number;
  useSilentRefresh: boolean;
  cognitoDomain?: string;
}

#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

if [ -z "$STACKS" ]; then export STACKS=$(aws cloudformation describe-stacks);fi
export REGION=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AWSRegion") | .OutputValue')
export COGNITO_USER_POOL_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export COGNITO_CLIENT_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantAppClientId") | .OutputValue')
export PRODUCTTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ProductTable") | .OutputValue')
export ELBURL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ELBURL") | .OutputValue')
export IAM_ROLE_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="RoleUsedByTVM") | .OutputValue')


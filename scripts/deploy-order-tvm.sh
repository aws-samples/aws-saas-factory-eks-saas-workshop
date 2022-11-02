#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
if [ -z "$STACKS" ]; then export STACKS=$(aws cloudformation describe-stacks);fi
export REGION=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AWSRegion") | .OutputValue')
export COGNITO_USER_POOL_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export COGNITO_CLIENT_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantAppClientId") | .OutputValue')
export ORDERTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="OrderTable") | .OutputValue')
export ELBURL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ELBURL") | .OutputValue')

CWD=$(pwd)
cd ./services

TENANTPATH=app CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-order:withtvm envsubst < ./apps/application/order/k8s/template.txt > ./apps/application/order/k8s/manifest.yaml
kubectl apply -f ./apps/application/order/k8s/manifest.yaml


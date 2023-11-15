#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export STACKS=$(aws cloudformation describe-stacks)
export USERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export APPCLIENTID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantAppClientId") | .OutputValue')
export REGION=$(aws configure get region)
export ELBURL=$(kubectl get svc -l istio=ingress -n istio-ingress -o json | jq -r '.items[0].status.loadBalancer.ingress[0].hostname')
export IAM_ROLE_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="RoleUsedByTVM") | .OutputValue')
export PRODUCTTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ProductTable") | .OutputValue')
export ORDERTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="OrderTable") | .OutputValue')
export EKSSTACKNAME=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="EksStackRenderedName") | .OutputValue')


envsubst < template.txt > values.yaml

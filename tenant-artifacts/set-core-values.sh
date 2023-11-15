#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export STACKS=$(aws cloudformation describe-stacks)
export USERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminUserPoolId") | .OutputValue')
export APPCLIENTID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminAppClientId") | .OutputValue')
export REGION=$(aws configure get region)
export ELBURL=$(kubectl get svc -l istio=ingress -n istio-ingress -o json | jq -r '.items[0].status.loadBalancer.ingress[0].hostname')
export TENANT_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="TenantTable") | .OutputValue')
export AUTH_INFO_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AuthInfoTable") | .OutputValue')
export TENANT_STACK_MAPPING_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="TenantStackMappingTable") | .OutputValue')
export PRODUCTTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ProductTable") | .OutputValue')
export ORDERTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="OrderTable") | .OutputValue')
export IAM_ROLE_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="RoleUsedByTVM") | .OutputValue')


envsubst < template.txt > helm/core-services/values.yaml

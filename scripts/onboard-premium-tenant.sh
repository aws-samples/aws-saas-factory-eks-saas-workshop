#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0


export AWS_PAGER=""
STACKS=$(aws cloudformation describe-stacks)
export USERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export EMAIL='premium-tier-user@saasco.com'
export PASSWORD='ABCdef123*'

export HOST=$(kubectl get svc -l istio=ingress -n istio-ingress -o json | jq -r '.items[0].status.loadBalancer.ingress[0].hostname')
export SERVER=http://$HOST/api/registration

#Onboard premium tier tenant
curl -H 'Content-Type: application/json' \
       -H "Host: $HOST" \
       -d "{\"name\":\"premium-tier-user\",\"email\":\"EMAIL\",\"companyName\":\"premium-tier-tenant\",\"plan\":\"premium\"}" \
       -X POST \
       $SERVER
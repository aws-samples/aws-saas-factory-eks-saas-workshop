#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0


export AWS_PAGER=""
STACKS=$(aws cloudformation describe-stacks)
export USERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export EMAILBASIC='basic-tier-user@saasco.com'
export EMAILSTANDARD='standard-tier-user@saasco.com'
export PASSWORD='ABCdef123*'

export HOST=$(kubectl get svc -l istio=ingress -n istio-ingress -o json | jq -r '.items[0].status.loadBalancer.ingress[0].hostname')
export SERVER=http://$HOST/api/registration

#Onboard basic tier tenant
curl -H 'Content-Type: application/json' \
       -H "Host: $HOST" \
       -d "{\"name\":\"basic-tier-user\",\"email\":\"$EMAILBASIC\",\"companyName\":\"Basic-tier-tenant\",\"plan\":\"basic\"}" \
       -X POST \
       $SERVER


#Onboard standard tier tenant
curl -H 'Content-Type: application/json' \
       -H "Host: $HOST" \
       -d "{\"name\":\"standard-tier-user\",\"email\":\"$EMAILSTANDARD\",\"companyName\":\"standard-tier-tenant\",\"plan\":\"standard\"}" \
       -X POST \
       $SERVER


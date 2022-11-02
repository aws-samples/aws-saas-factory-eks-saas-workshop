#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
if [ -z "$STACKS" ]; then export STACKS=$(aws cloudformation describe-stacks);fi
export REGION=$(echo $STACKS | jq -r '.Stacks[].Outputs[] | select(.OutputKey=="AWSRegion") | .OutputValue' 2> /dev/null)
export USERPOOLID=$(echo $STACKS | jq -r '.Stacks[].Outputs[] | select(.OutputKey=="AdminUserPoolId") | .OutputValue' 2> /dev/null)
export APPCLIENTID=$(echo $STACKS | jq -r '.Stacks[].Outputs[] | select(.OutputKey=="AdminAppClientId") | .OutputValue' 2> /dev/null)
export TENANT_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[].Outputs[] | select(.OutputKey=="TenantTable") | .OutputValue' 2> /dev/null)
export AUTH_INFO_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[].Outputs[] | select(.OutputKey=="AuthInfoTable") | .OutputValue' 2> /dev/null)
export TENANT_STACK_MAPPING_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[].Outputs[] | select(.OutputKey=="TenantStackMappingTable") | .OutputValue' 2> /dev/null)
export TENANTREGISTRATIONSERVICEECR=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="TenantRegistrationServiceECR") | .OutputValue')

CWD=$(pwd)
cd ./services
REGISTRY=$(echo $TENANTREGISTRATIONSERVICEECR| cut -d'/' -f 1)

#Logs into our private ECR so we can push this image
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
# Logs into public ECR so we can pull the images referenced in this dockerfile
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
docker build -t tenant-registration-svc:latest -f Dockerfile.tenant-registration .
docker tag tenant-registration-svc:latest $TENANTREGISTRATIONSERVICEECR:latest
docker push $TENANTREGISTRATIONSERVICEECR:latest

CONTAINERIMAGE=$TENANTREGISTRATIONSERVICEECR:latest envsubst < ./apps/shared/tenant-registration/k8s/template.txt > ./apps/shared/tenant-registration/k8s/template.yaml
kubectl apply -f ./apps/shared/tenant-registration/k8s/template.yaml



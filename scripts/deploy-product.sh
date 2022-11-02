#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
if [ -z "$STACKS" ]; then export STACKS=$(aws cloudformation describe-stacks);fi
export REGION=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AWSRegion") | .OutputValue')
export COGNITO_USER_POOL_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export COGNITO_CLIENT_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantAppClientId") | .OutputValue')
export PRODUCTTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ProductTable") | .OutputValue')
export ELBURL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ELBURL") | .OutputValue')
export PRODUCTSERVICEECR=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ProductServiceECR") | .OutputValue')

CWD=$(pwd)
cd ./services
REGISTRY=$(echo $PRODUCTSERVICEECR| cut -d'/' -f 1)

#Logs into our private ECR so we can push this image
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
# Logs into public ECR so we can pull the images referenced in this dockerfile
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
docker build -t product-svc:latest -f Dockerfile.product .
docker tag product-svc:latest $PRODUCTSERVICEECR:latest
docker push $PRODUCTSERVICEECR:latest

TENANTPATH=app CONTAINERIMAGE=$PRODUCTSERVICEECR:latest envsubst < ./apps/application/product/k8s/template.txt > ./apps/application/product/k8s/manifest.yaml
kubectl apply -f ./apps/application/product/k8s/manifest.yaml


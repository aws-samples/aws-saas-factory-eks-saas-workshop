#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export TENANTMANAGEMENTECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantMangementECR'].OutputValue" --output text)
export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export USERPOOLID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminUserPoolId'].OutputValue" --output text)
export APPCLIENTID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminAppClientId'].OutputValue" --output text)
export TENANT_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantTable'].OutputValue" --output text)
export AUTH_INFO_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AuthInfoTable'].OutputValue" --output text)
# ELBURL=$(aws cloudformation describe-stacks --stack-name EksStack --query "Stacks[0].Outputs[?OutputKey=='ELBURL'].OutputValue" --output text)
CWD=$(pwd)
cd ./services/shared
REGISTRY=$(echo $TENANTMANAGEMENTECR| cut -d'/' -f 1)
TENANTREGCONTAINERNAME=$(echo $TENANTMANAGEMENTECR| cut -d'/' -f 2)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t tenant-mgmt-svc:latest -f Dockerfile.tenant-management .
docker tag tenant-mgmt-svc:latest $TENANTMANAGEMENTECR:latest
docker push $TENANTMANAGEMENTECR:latest

echo "The following values will need to be plugged into the Tenant Management Kubernetes manifest before deployment."
echo "**PLEASE DO NOT CLOSE THIS WINDOW**"
echo 'TENANT_MANGEMENT_ECR_REPO:' $TENANTMANAGEMENTECR
cd $CWD

envsubst < ./services/shared/apps/tenant-management/k8s/partial-template.txt > ./services/shared/apps/tenant-management/k8s/template.yaml

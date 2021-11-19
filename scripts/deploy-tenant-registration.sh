#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export TENANTREGISTRATIONECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantRegistrationECR'].OutputValue" --output text)
export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export USERPOOLID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminUserPoolId'].OutputValue" --output text)
export APPCLIENTID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminAppClientId'].OutputValue" --output text)
export TENANT_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantTable'].OutputValue" --output text)
export AUTH_INFO_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AuthInfoTable'].OutputValue" --output text)
export TENANT_STACK_MAPPING_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantStackMappingTable'].OutputValue" --output text)
# ELBURL=$(aws cloudformation describe-stacks --stack-name EksStack --query "Stacks[0].Outputs[?OutputKey=='ELBURL'].OutputValue" --output text)
CWD=$(pwd)

cd ./services/shared
REGISTRY=$(echo $TENANTREGISTRATIONECR| cut -d'/' -f 1)
TENANTREGCONTAINERNAME=$(echo $TENANTREGISTRATIONECR| cut -d'/' -f 2)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t tenant-reg-svc:latest -f Dockerfile.tenant-registration .
docker tag tenant-reg-svc:latest $TENANTREGISTRATIONECR:latest
docker push $TENANTREGISTRATIONECR:latest

echo "The following values will need to be plugged into the Tenant Registration Kubernetes manifest before deployment."
echo "**PLEASE DO NOT CLOSE THIS WINDOW**"
echo 'TENANT_REGISTRATION_ECR_REPO:' $TENANTREGISTRATIONECR

cd $CWD

envsubst < ./services/shared/apps/tenant-registration/k8s/partial-template.txt > ./services/shared/apps/tenant-registration/k8s/template.yaml



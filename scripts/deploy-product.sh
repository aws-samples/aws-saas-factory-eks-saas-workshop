#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export PRODUCTSERVICEECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='ProductServiceECR'].OutputValue" --output text)
export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='PooledTenantUserPoolId'].OutputValue" --output text)
export COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='PooledTenantAppClientId'].OutputValue" --output text)
export PRODUCTTABLE=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='ProductTable'].OutputValue" --output text)

CWD=$(pwd)
cd ./services/application
REGISTRY=$(echo $PRODUCTSERVICEECR| cut -d'/' -f 1)
TENANTREGCONTAINERNAME=$(echo $PRODUCTSERVICEECR| cut -d'/' -f 2)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t product-svc:latest -f Dockerfile.product .
docker tag product-svc:latest $PRODUCTSERVICEECR:latest
docker push $PRODUCTSERVICEECR:latest

cd $CWD
echo '************************' 
echo '************************' 
echo ""
echo "PRODUCT_SERVICE_ECR_REPO:" $PRODUCTSERVICEECR
echo "AWS_REGION:" $REGION
echo "IAM_ROLE_ARN:" $IAM_ROLE_ARN
echo "COGNITO_USER_POOL_ID:" $COGNITO_USER_POOL_ID
echo "COGNITO_CLIENT_ID:" $COGNITO_CLIENT_ID
echo "COGNITO_REGION:" $REGION
echo "PRODUCT_TABLE_NAME:" $PRODUCTTABLE
echo "ELB_URL:" $ELBURL
echo "TENANT_PATH: app";

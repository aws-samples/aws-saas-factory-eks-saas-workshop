#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export ORDERSERVICEECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='OrderServiceECR'].OutputValue" --output text)
export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='PooledTenantUserPoolId'].OutputValue" --output text)
export COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='PooledTenantAppClientId'].OutputValue" --output text)
export ORDERTABLE=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='OrderTable'].OutputValue" --output text)

CWD=$(pwd)
cd ./services/application
REGISTRY=$(echo $ORDERSERVICEECR| cut -d'/' -f 1)
TENANTREGCONTAINERNAME=$(echo $ORDERSERVICEECR| cut -d'/' -f 2)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t order-svc:latest -f Dockerfile.order .
docker tag order-svc:latest $ORDERSERVICEECR:latest
docker push $ORDERSERVICEECR:latest

cd $CWD
echo '************************' 
echo '************************' 
echo ""
echo "ORDER_SERVICE_ECR_REPO:" $ORDERSERVICEECR
echo "AWS_REGION:" $REGION
echo "IAM_ROLE_ARN:" $IAM_ROLE_ARN
echo "COGNITO_USER_POOL_ID:" $COGNITO_USER_POOL_ID
echo "COGNITO_CLIENT_ID:" $COGNITO_CLIENT_ID
echo "COGNITO_REGION:" $REGION
echo "ORDER_TABLE_NAME:" $ORDERTABLE
echo "ELB_URL:" $ELBURL
echo "TENANT_PATH: app";

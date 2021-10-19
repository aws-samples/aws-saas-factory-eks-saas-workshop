#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

USERPOOLID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminUserPoolId'].OutputValue" --output text)
APPCLIENTID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminAppClientId'].OutputValue" --output text)
ADMINAPPLICATIONECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminApplicationECR'].OutputValue" --output text)
REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)

cat << EoF > ./client/web/admin/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'http://$ELBURL',
};

EoF
cat << EoF > ./client/web/admin/src/environments/environment.ts
export const environment = {
  production: true,
  apiUrl: 'http://$ELBURL',
};
EoF

cat << EoF > ./client/web/admin/src/aws-exports.js
const awsmobile = {
    "aws_project_region": "$REGION",
    "aws_cognito_region": "$REGION",
    "aws_user_pools_id": "$USERPOOLID",
    "aws_user_pools_web_client_id": "$APPCLIENTID",
};


export default awsmobile;
EoF

cd ./client/web/admin
REGISTRY=$(echo $ADMINAPPLICATIONECR| cut -d'/' -f 1)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t eks-admin-app:latest .
docker tag eks-admin-app:latest $ADMINAPPLICATIONECR:latest
docker push $ADMINAPPLICATIONECR:latest

echo "The following values will need to be plugged into the Admin Service Kubernetes manifest before deployment."
echo "**PLEASE DO NOT CLOSE THIS WINDOW**"
echo "";
echo "APPLICATION_ECR_REPO:" $ADMINAPPLICATIONECR
echo "ELB_URL:" $ELBURL
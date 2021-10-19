#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export APPLICATIONECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='ApplicationECR'].OutputValue" --output text)
export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)

cat << EoF > ./client/web/application/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'http://$ELBURL',
};

EoF
cat << EoF > ./client/web/application/src/environments/environment.ts
export const environment = {
  production: true,
  apiUrl: 'http://$ELBURL',
};
EoF
CWD=$(pwd)
cd ./client/web/application
REGISTRY=$(echo $APPLICATIONECR| cut -d'/' -f 1)
APPLICATIONIMAGENAME=$(echo $APPLICATIONECR| cut -d'/' -f 2)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t app-image:latest .
docker tag app-image:latest $APPLICATIONECR:latest
docker push $APPLICATIONECR:latest

cd $CWD
echo '************************' 
echo '************************' 
echo ''
echo 'APPLICATION_ECR_REPO:' $APPLICATIONECR
echo 'ELB_URL:' $ELBURL
echo 'TENANT_PATH: app' 
echo ''
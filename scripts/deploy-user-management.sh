#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export USERMANAGEMENTECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='UserManagementECR'].OutputValue" --output text)
export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export USERPOOLID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminUserPoolId'].OutputValue" --output text)
export APPCLIENTID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminAppClientId'].OutputValue" --output text)
CWD=$(pwd)
cd ./services/shared
REGISTRY=$(echo $USERMANAGEMENTECR| cut -d'/' -f 1)

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t user-mgmt-svc:latest -f Dockerfile.user-management .
docker tag user-mgmt-svc:latest $USERMANAGEMENTECR:latest
docker push $USERMANAGEMENTECR:latest

echo "The following values will need to be plugged into the User Management Kubernetes manifest before deployment."
echo "**PLEASE DO NOT CLOSE THIS WINDOW**"
echo ""
echo 'USER_MANAGEMENT_ECR_REPO:' $USERMANAGEMENTECR
cd $CWD

envsubst < ./services/shared/apps/user-management/k8s/partial-template.txt > ./services/shared/apps/user-management/k8s/template.yaml

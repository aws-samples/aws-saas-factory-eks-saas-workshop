#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
CWD=$(pwd)

# Turn off output paging
export AWS_PAGER=""

nvm use 18

#Install modern yarn
corepack enable
corepack prepare yarn@3.2.4 --activate

#Create CodeCommit repo
REGION=$(aws configure get region)
aws codecommit get-repository --repository-name aws-saas-factory-eks-workshop
if [[ $? -ne 0 ]]; then
     echo "aws-saas-factory-eks-workshop codecommit repo is not present, will create one now"
     aws codecommit create-repository --repository-name aws-saas-factory-eks-workshop --repository-description "CodeCommit repo for SaaS Factory EKS Workshop"
fi

REPO_URL="codecommit::${REGION}://aws-saas-factory-eks-workshop"
git remote add cc $REPO_URL
if [[ $? -ne 0 ]]; then
    echo "Setting url to remote cc"
    git remote set-url cc $REPO_URL
fi
pip3 install git-remote-codecommit    
git push --set-upstream cc main --force
git remote rm cc
git branch -u origin/main main

STACKS=$(aws cloudformation describe-stacks)
export ELBURL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ELBURL") | .OutputValue')
export CODEBUILD_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="EksCodebuildArn") | .OutputValue')

cd cdk/on-your-own/root
yarn && yarn run build 
cdk bootstrap  
cdk deploy \
 --parameters eksElbUrl=$ELBURL \
 --parameters eksCodeBuildArn=$CODEBUILD_ARN \

if [[ $? -ne 0 ]]; then
#    exit 1
  echo ERROR!
fi

# Re-export it as we've deployed more artifacts
export STACKS=$(aws cloudformation describe-stacks)

export ADMINUSERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminUserPoolId") | .OutputValue')
export AUTH_INFO_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[].Outputs[] | select(.OutputKey=="AuthInfoTable") | .OutputValue' 2> /dev/null)
export EKSSAAS_STACKMETADATA_TABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="EksSaaSStackMetadataTable") | .OutputValue')
export IAM_ROLE_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="RoleUsedByTVM") | .OutputValue')
export POOLED_TENANT_APPCLIENT_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantAppClientId") | .OutputValue')
export POOLED_TENANT_USERPOOL_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')

# aws cognito-idp admin-set-user-password --user-pool-id $ADMINUSERPOOLID --username admin@saas.com --password "Admin123*" --permanent

# aws dynamodb put-item \
# --table-name $AUTH_INFO_TABLE_NAME \
# --item "{\"tenant_path\": {\"S\": \"app\"}, \"user_pool_type\": {\"S\": \"pooled\"}, \"user_pool_id\": {\"S\": \"$POOLED_TENANT_USERPOOL_ID\"}, \"client_id\": {\"S\": \"$POOLED_TENANT_APPCLIENT_ID\"}}" \
# --return-consumed-capacity TOTAL        

# # Record the EKS SaaS stack metadata in the dynamo table that was made in root-stack
# aws dynamodb put-item \
# --table-name $EKSSAAS_STACKMETADATA_TABLE \
# --item "{\"StackName\": {\"S\": \"eks-saas\"}, \"ELBURL\": {\"S\": \"$ELBURL\"}, \"CODEBUILD_ARN\": {\"S\": \"$CODEBUILD_ARN\"}, \"IAM_ROLE_ARN\": {\"S\": \"$IAM_ROLE_ARN\"}}" \
# --return-consumed-capacity TOTAL

cd $CWD
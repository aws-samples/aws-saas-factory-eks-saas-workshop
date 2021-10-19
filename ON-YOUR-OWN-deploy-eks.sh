#!/bin/bash

#Deploys an Amazon EKS cluster. 
#Once deployment is complete, copy the output values and apply to cdk/root/lib/root-stack.ts
cd cdk/eks
yarn && yarn run build 
cdk bootstrap  
cdk deploy 

export ELBURL=$(aws cloudformation describe-stacks --stack-name EksStack --query "Stacks[0].Outputs[?OutputKey=='ELBURL'].OutputValue" --output text)
export CODEBUILD_ARN=$(aws cloudformation describe-stacks --stack-name EksStack --query "Stacks[0].Outputs[?OutputKey=='EksCodebuildArn'].OutputValue" --output text)
export IAM_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name EksStack --query "Stacks[0].Outputs[?OutputKey=='RoleUsedByTVM'].OutputValue" --output text)

echo "export ELBURL=${ELBURL}" | tee -a ~/.bash_profile
echo "export IAM_ROLE_ARN=${IAM_ROLE_ARN}" | tee -a ~/.bash_profile
echo "export CODEBUILD_ARN=${CODEBUILD_ARN}" | tee -a ~/.bash_profile

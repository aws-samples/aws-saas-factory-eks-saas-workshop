#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
CWD=$(pwd)

# Install awscli v2
curl -O "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
unzip -o awscli-exe-linux-x86_64.zip
sudo ./aws/install
rm awscli-exe-linux-x86_64.zip

echo "Installing helper tools"
sudo yum -y install jq gettext bash-completion moreutils

# Install yq (yaml query)
echo 'yq() {
  docker run --rm -i -v "${PWD}":/workdir mikefarah/yq "$@"
}' | tee -a ~/.bashrc && source ~/.bashrc


echo "Set Environment Variables"
# Set AWS region in env and awscli config
echo "export AWS_REGION=${AWS_REGION}" | tee -a ~/.bash_profile

cat << EOF > ~/.aws/config
[default]
region = ${AWS_REGION}
output = json
EOF

echo Set accountID
ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
echo "export ACCOUNT_ID=${ACCOUNT_ID}" | tee -a ~/.bash_profile

echo Set EKS cluster name
EKS_CLUSTER_NAME=$(aws eks list-clusters --region ${AWS_REGION} --query clusters --output text)
echo "export EKS_CLUSTER_NAME=${EKS_CLUSTER_NAME}" | tee -a ~/.bash_profile
echo "export CLUSTER_NAME=${EKS_CLUSTER_NAME}" | tee -a ~/.bash_profile

echo Set EKS node group name
    EKS_NODEGROUP=$(aws eks list-nodegroups --cluster ${EKS_CLUSTER_NAME} | jq -r '.nodegroups[0]')
    echo "export EKS_NODEGROUP=${EKS_NODEGROUP}" | tee -a ~/.bash_profile

export STACKS=$(aws cloudformation describe-stacks)
export ELBURL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ELBURL") | .OutputValue')
export CODEBUILD_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="EksCodebuildArn") | .OutputValue')
export IAM_ROLE_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="RoleUsedByTVM") | .OutputValue')
export ADMINUSERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminUserPoolId") | .OutputValue')

aws cognito-idp admin-set-user-password --user-pool-id ${ADMINUSERPOOLID} --username admin@saas.com --password "Admin123*" --permanent

echo "export ELBURL=${ELBURL}" | tee -a ~/.bash_profile
echo "export IAM_ROLE_ARN=${IAM_ROLE_ARN}" | tee -a ~/.bash_profile
echo "export CODEBUILD_ARN=${CODEBUILD_ARN}" | tee -a ~/.bash_profile

export AUTH_INFO_TABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AuthInfoTable") | .OutputValue')
export POOLED_TENANT_USERPOOL_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export POOLED_TENANT_APPCLIENT_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantAppClientId") | .OutputValue')
export EKSSAAS_STACKMETADATA_TABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="EksSaaSStackMetadataTable") | .OutputValue')

aws dynamodb put-item \
--table-name ${AUTH_INFO_TABLE} \
--item "{\"tenant_path\": {\"S\": \"app\"}, \"user_pool_type\": {\"S\": \"pooled\"}, \"user_pool_id\": {\"S\": \"$POOLED_TENANT_USERPOOL_ID\"}, \"client_id\": {\"S\": \"$POOLED_TENANT_APPCLIENT_ID\"}}" \
--return-consumed-capacity TOTAL        

#Create CodeCommit repo
export AWS_PAGER=""
#REGION=$(aws configure get region)
aws codecommit get-repository --repository-name aws-saas-factory-eks-workshop
if [[ $? -ne 0 ]]; then
     echo "aws-saas-factory-eks-workshop codecommit repo is not present, will create one now"
     aws codecommit create-repository --repository-name aws-saas-factory-eks-workshop --repository-description "CodeCommit repo for SaaS Factory EKS Workshop"
fi

REPO_URL="codecommit::${AWS_REGION}://aws-saas-factory-eks-workshop"
git remote add cc $REPO_URL
if [[ $? -ne 0 ]]; then
    echo "Setting url to remote cc"
    git remote set-url cc $REPO_URL
fi
pip3 install git-remote-codecommit    
git push --set-upstream cc main --force
git remote rm cc
git branch -u origin/main main

#Create CodeBuild role
echo "Creating a new role which will be used by our CodeBuild project to describe our EKS Instances"
TRUST="{ \"Version\": \"2012-10-17\", \"Statement\": [ { \"Effect\": \"Allow\", \"Principal\": { \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\" }, \"Action\": \"sts:AssumeRole\" } ] }"
echo '{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Action": "eks:Describe*", "Resource": "*" }, { "Effect": "Allow", "Action": "iam:*", "Resource": "*" }, { "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" }, { "Effect": "Allow", "Action": "dynamodb:*", "Resource": "*" } ] }' > /tmp/iam-role-policy
aws iam create-role --role-name EksSaasCodeBuildRole --assume-role-policy-document "$TRUST" --output text --query 'Role.Arn'
# Adding sleep of 10 secs to address sporadic exception due to Throttling or Rate exceeded
sleep 10
aws iam put-role-policy --role-name EksSaasCodeBuildRole --policy-name eks-saas-code-build-policy --policy-document file:///tmp/iam-role-policy

echo "Updating the AWS Auth config map with the CodeBuild role"
ROLE="    - rolearn: arn:aws:iam::$ACCOUNT_ID:role/EksSaasCodeBuildRole\n      username: build\n      groups:\n        - system:masters"
eksctl create iamidentitymapping --cluster eksworkshop-eksctl --arn arn:aws:iam::$ACCOUNT_ID:role/EksSaasCodeBuildRole --group system:masters --username admin

#Update context to the role EksSaasCodeBuildRole, which was used to create the EKS cluster.
aws eks update-kubeconfig --name eksworkshop-eksctl --role-arn arn:aws:iam::$ACCOUNT_ID:role/EksSaasCodeBuildRole

# Record the EKS SaaS stack metadata in the dynamo table that was made in root-stack
aws dynamodb put-item \
--table-name $EKSSAAS_STACKMETADATA_TABLE \
--item "{\"StackName\": {\"S\": \"eks-saas\"}, \"ELBURL\": {\"S\": \"$ELBURL\"}, \"CODEBUILD_ARN\": {\"S\": \"arn:aws:iam::$ACCOUNT_ID:role/EksSaasCodeBuildRole\"}, \"IAM_ROLE_ARN\": {\"S\": \"$IAM_ROLE_ARN\"}}" \
--return-consumed-capacity TOTAL

cd $CWD
#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
CWD=$(pwd)

echo "Installing kubectl"
curl -LO https://dl.k8s.io/release/v1.23.6/bin/linux/amd64/kubectl
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

export NVM_DIR=$HOME/.nvm;
source $NVM_DIR/nvm.sh;

nvm use 16

echo "Installing Node and CDK"
npm install -g aws-cdk@2.22.0

echo "Upgrading AWS CLI"
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

echo "Installing helper tools"
sudo yum -y install jq gettext bash-completion moreutils

export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
export AWS_REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.region')
export AWS_DEFAULT_REGION=$AWS_REGION
test -n "$AWS_REGION" && echo AWS_REGION is "$AWS_REGION" || echo AWS_REGION is not set
echo "export ACCOUNT_ID=${ACCOUNT_ID}" | tee -a ~/.bash_profile
echo "export AWS_REGION=${AWS_REGION}" | tee -a ~/.bash_profile
echo "export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}" | tee -a ~/.bash_profile
aws configure set default.region ${AWS_REGION}
aws configure get default.region

echo Resizing Cloud9 instance EBS Volume
sh scripts/resize-cloud9-ebs-volume.sh 40

for command in kubectl jq envsubst aws
  do
    which $command &>/dev/null && echo "$command in path" || echo "$command NOT FOUND"
  done

kubectl completion bash >>  ~/.bash_completion
. /etc/profile.d/bash_completion.sh
. ~/.bash_completion

cd $CWD

aws sts get-caller-identity --query Arn | grep saas-factory-eks-workshop-admin -q && echo "IAM role valid. You can continue setting up the EKS Cluster." || echo "IAM role NOT valid. Do not proceed with creating the EKS Cluster or you won't be able to authenticate. Ensure you assigned the role to your EC2 instance as detailed in the README.md of the eks-saas repo"


#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
CWD=$(pwd)

echo "Installing kubectl"
curl -LO https://dl.k8s.io/release/v1.25.0/bin/linux/amd64/kubectl
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

export NVM_DIR=$HOME/.nvm;
source $NVM_DIR/nvm.sh;

nvm use 18

echo "Installing Node and CDK"
npm install -g aws-cdk

echo "Installing yarn"
corepack enable
corepack prepare yarn@3.2.4 --activate

echo "Upgrading AWS CLI"
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install --update

echo "Installing helper tools"
sudo yum -y install jq gettext bash-completion moreutils

echo "Installing Helm"
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 > get_helm.sh
chmod 700 get_helm.sh
./get_helm.sh -v 3.12.3

echo "Installing eksctl"
# for ARM systems, set ARCH to: `arm64`, `armv6` or `armv7`
ARCH=amd64
PLATFORM=$(uname -s)_$ARCH
curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$PLATFORM.tar.gz"
tar -xzf eksctl_$PLATFORM.tar.gz -C /tmp && rm eksctl_$PLATFORM.tar.gz
sudo mv /tmp/eksctl /usr/local/bin

echo "Installing Hey load generator"
curl -sLO "https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64"
chmod +x hey_linux_amd64
sudo mv hey_linux_amd64 /usr/local/bin/hey


export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
export AWS_REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.region')
export AWS_DEFAULT_REGION=$AWS_REGION
export ELBURL=$(aws cloudformation describe-stacks --query "Stacks[].Outputs[]" | jq -r '.[] | select(.OutputKey | startswith("ELBURL")) | .OutputValue')
test -n "$AWS_REGION" && echo AWS_REGION is "$AWS_REGION" || echo AWS_REGION is not set
echo "export ACCOUNT_ID=${ACCOUNT_ID}" | tee -a ~/.bash_profile
echo "export AWS_REGION=${AWS_REGION}" | tee -a ~/.bash_profile
echo "export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}" | tee -a ~/.bash_profile
echo "export ELBURL=${ELBURL}" | tee -a ~/.bashrc
aws configure set default.region ${AWS_REGION}
aws configure get default.region

#echo Resizing Cloud9 instance EBS Volume
sh scripts/resize-cloud9-ebs-volume.sh 40

for command in kubectl jq envsubst aws
  do
    which $command &>/dev/null && echo "$command in path" || echo "$command NOT FOUND"
  done

kubectl completion bash >>  ~/.bash_completion
. /etc/profile.d/bash_completion.sh
. ~/.bash_completion

UPDATE_KUBECONFIG=$(aws cloudformation describe-stacks --query "Stacks[].Outputs[]" | jq -r '.[] | select(.OutputKey | startswith("eksworkshopeksctlConfigCommand")) | .OutputValue')
eval $UPDATE_KUBECONFIG

cd $CWD
# resource our bash config to ensure we're binding to the right version of the AWS CLI (v2, vs. v1)
. ~/.bashrc
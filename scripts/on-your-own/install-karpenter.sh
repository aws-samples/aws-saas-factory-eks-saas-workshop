#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
CWD=$(pwd)

export CLUSTER_NAME=$(eksctl get clusters -o json | jq -r '.[0].Name')
#export AWS_REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.region')
export AWS_REGION="$(aws configure get region)"
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export CLUSTER_ENDPOINT="$(aws eks describe-cluster --name ${CLUSTER_NAME} --query "cluster.endpoint" --output text)"

echo Cluster Name:$CLUSTER_NAME AWS Region:$AWS_REGION Account ID:$AWS_ACCOUNT_ID Cluster Endpoint:$CLUSTER_ENDPOINT


# Instances launched by Karpenter must run with an InstanceProfile that grants permissions necessary to run containers and configure networking. 
# Karpenter discovers the InstanceProfile using the name KarpenterNodeRole-${ClusterName}.
TEMPOUT=$(mktemp)

curl -fsSL https://karpenter.sh/docs/getting-started/getting-started-with-karpenter/cloudformation.yaml  > $TEMPOUT \
&& aws cloudformation deploy \
  --stack-name "Karpenter-${CLUSTER_NAME}" \
  --template-file "${TEMPOUT}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${CLUSTER_NAME}"

# Grant access to instances using the profile to connect to the cluster. 
# This command adds the Karpenter node role to your aws-auth configmap, allowing nodes with this role to connect to the cluster.
eksctl create iamidentitymapping \
  --username system:node:{{EC2PrivateDNSName}} \
  --cluster "${CLUSTER_NAME}" \
  --arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}" \
  --group system:bootstrappers \
  --group system:nodes

kubectl describe configmap -n kube-system aws-auth

# Associate the OIDC provider with the cluster
eksctl utils associate-iam-oidc-provider --cluster ${CLUSTER_NAME} --approve

# Create a Kubernetes service account and AWS IAM Role, and associate them using IRSA to let Karpenter launch instances.
eksctl create iamserviceaccount \
  --cluster "${CLUSTER_NAME}" --name karpenter --namespace karpenter \
  --role-name "${CLUSTER_NAME}-karpenter" \
  --attach-policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/KarpenterControllerPolicy-${CLUSTER_NAME}" \
  --role-only \
  --approve

export KARPENTER_IAM_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${CLUSTER_NAME}-karpenter"

# Verify if the Service Account was created
eksctl get iamserviceaccount --cluster $CLUSTER_NAME --namespace karpenter    

aws iam create-service-linked-role --aws-service-name spot.amazonaws.com || true

# Helm install Karpenter
#KARPENTER_VERSION=$(curl -sL "https://api.github.com/repos/aws/karpenter/releases/latest" | jq -r ".tag_name") && echo "Karpenter's Latest release version: $KARPENTER_VERSION" && export KARPENTER_VERSION
export KARPENTER_VERSION=v0.30.0
echo Your Karpenter version is: $KARPENTER_VERSION
docker logout public.ecr.aws
helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version ${KARPENTER_VERSION} --namespace karpenter --create-namespace \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=${KARPENTER_IAM_ROLE_ARN} \
  --set settings.aws.clusterName=${CLUSTER_NAME} \
  --set settings.aws.clusterEndpoint=${CLUSTER_ENDPOINT} \
  --set settings.aws.defaultInstanceProfile=KarpenterNodeInstanceProfile-${CLUSTER_NAME} \
  --set settings.aws.interruptionQueueName=${CLUSTER_NAME} \
  --wait

# Run helm list to verify installation
helm list -n karpenter

#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/setenv-tenant-registration.sh
CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-tenant-registration:latest envsubst < ./services/apps/shared/tenant-registration/k8s/template.txt > ./services/apps/shared/tenant-registration/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/tenant-registration/k8s/manifest.yaml

source ./scripts/setenv-tenant-management.sh
envsubst < ./services/apps/shared/tenant-management/k8s/template.txt > ./services/apps/shared/tenant-management/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/tenant-management/k8s/manifest.yaml

source ./scripts/setenv-user-management.sh
envsubst < ./services/apps/shared/user-management/k8s/template.txt > ./services/apps/shared/user-management/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/user-management/k8s/manifest.yaml

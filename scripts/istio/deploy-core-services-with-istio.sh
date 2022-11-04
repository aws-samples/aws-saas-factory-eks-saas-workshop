#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/istio/setenv-tenant-registration-with-istio.sh
CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-tenant-registration:latest envsubst < ./services/apps/shared/tenant-registration/k8s/template.txt > ./services/apps/shared/tenant-registration/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/tenant-registration/k8s/manifest.yaml

source ./scripts/istio/setenv-tenant-management-with-istio.sh
envsubst < ./services/apps/shared/tenant-management/k8s/template.istio.txt > ./services/apps/shared/tenant-management/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/tenant-management/k8s/manifest.yaml

source ./scripts/istio/setenv-user-management-with-istio.sh
envsubst < ./services/apps/shared/user-management/k8s/template.txt > ./services/apps/shared/user-management/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/user-management/k8s/manifest.yaml

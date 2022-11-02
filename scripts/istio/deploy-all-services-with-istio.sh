#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

#Shared services
kubectl delete -f ./services/apps/shared/tenant-registration/k8s/manifest.yaml
kubectl delete -f ./services/apps/shared/tenant-management/k8s/manifest.yaml
kubectl delete -f ./services/apps/shared/user-management/k8s/manifest.yaml

#Application services
kubectl delete -f ./client/web/application/k8s/manifest.yaml
kubectl delete -f ./services/apps/application/product/k8s/manifest.yaml
kubectl delete -f ./services/apps/application/order/k8s/manifest.yaml


source ./scripts/istio/setenv-tenant-registration-with-istio.sh
CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-tenant-registration:latest envsubst < ./services/apps/shared/tenant-registration/k8s/template.txt > ./services/apps/shared/tenant-registration/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/tenant-registration/k8s/manifest.yaml

source ./scripts/istio/setenv-tenant-management-with-istio.sh
envsubst < ./services/apps/shared/tenant-management/k8s/template.istio.txt > ./services/apps/shared/tenant-management/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/tenant-management/k8s/manifest.yaml

source ./scripts/istio/setenv-user-management-with-istio.sh
envsubst < ./services/apps/shared/user-management/k8s/template.txt > ./services/apps/shared/user-management/k8s/manifest.yaml
kubectl apply -f ./services/apps/shared/user-management/k8s/manifest.yaml


source ./scripts/istio/setenv-application-with-istio.sh
TENANTPATH=lab5 envsubst < ./client/web/application/k8s/template.istio.txt > ./client/web/application/k8s/manifest.yaml
kubectl apply -f ./client/web/application/k8s/manifest.yaml

source ./scripts/istio/setenv-product-with-istio.sh
TENANTPATH=lab5 CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-product:latest envsubst < ./services/apps/application/product/k8s/template.istio.txt > ./services/apps/application/product/k8s/manifest.yaml
kubectl apply -f ./services/apps/application/product/k8s/manifest.yaml

source ./scripts/istio/setenv-order-with-istio.sh
TENANTPATH=lab5 CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-order:latest CONTAINERIMAGEV2=public.ecr.aws/o2b5n0j5/eks-saas-order:v2 envsubst < ./services/apps/application/order/k8s/template.istio.txt > ./services/apps/application/order/k8s/manifest.yaml
kubectl apply -f ./services/apps/application/order/k8s/manifest.yaml

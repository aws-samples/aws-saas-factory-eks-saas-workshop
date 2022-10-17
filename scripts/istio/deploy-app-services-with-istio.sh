#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/istio/setenv-application-with-istio.sh
TENANTPATH=lab5 envsubst < ./client/web/application/k8s/template.istio.txt > ./client/web/application/k8s/template.yaml
kubectl apply -f ./client/web/application/k8s/template.yaml

source ./scripts/istio/setenv-product-with-istio.sh
TENANTPATH=lab5 CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-product:latest envsubst < ./services/apps/application/product/k8s/template.istio.txt > ./services/apps/application/product/k8s/template.yaml
kubectl apply -f ./services/apps/application/product/k8s/template.yaml

source ./scripts/istio/setenv-order-with-istio.sh
TENANTPATH=lab5 CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-order:latest CONTAINERIMAGEV2=public.ecr.aws/o2b5n0j5/eks-saas-order:v2 envsubst < ./services/apps/application/order/k8s/template.istio.txt > ./services/apps/application/order/k8s/template.yaml
kubectl apply -f ./services/apps/application/order/k8s/template.yaml
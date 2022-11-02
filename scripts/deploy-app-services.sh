#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/setenv-application.sh
TENANTPATH=app envsubst < ./client/web/application/k8s/template.txt > ./client/web/application/k8s/manifest.yaml
kubectl apply -f ./client/web/application/k8s/manifest.yaml

source ./scripts/setenv-product.sh
TENANTPATH=app CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-product:latest envsubst < ./services/apps/application/product/k8s/template.txt > ./services/apps/application/product/k8s/manifest.yaml
kubectl apply -f ./services/apps/application/product/k8s/manifest.yaml

source ./scripts/setenv-order.sh
TENANTPATH=app CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-order:latest envsubst < ./services/apps/application/order/k8s/template.txt > ./services/apps/application/order/k8s/manifest.yaml
kubectl apply -f ./services/apps/application/order/k8s/manifest.yaml

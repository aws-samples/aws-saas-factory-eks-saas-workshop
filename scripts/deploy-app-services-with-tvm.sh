#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/setenv-product.sh
TENANTPATH=app CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-product:withtvm envsubst < ./services/apps/application/product/k8s/template.txt > ./services/apps/application/product/k8s/template.yaml
kubectl apply -f ./services/apps/application/product/k8s/template.yaml

source ./scripts/setenv-order.sh
TENANTPATH=app CONTAINERIMAGE=public.ecr.aws/o2b5n0j5/eks-saas-order:withtvm envsubst < ./services/apps/application/order/k8s/template.txt > ./services/apps/application/order/k8s/template.yaml
kubectl apply -f ./services/apps/application/order/k8s/template.yaml

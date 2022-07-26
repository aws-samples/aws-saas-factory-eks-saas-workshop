#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/deploy-application.sh
TENANTPATH=app envsubst < ./client/web/application/k8s/template.txt > ./client/web/application/k8s/template.yaml
kubectl apply -f ./client/web/application/k8s/template.yaml

source ./scripts/deploy-product.sh
TENANTPATH=app envsubst < ./services/apps/application/product/k8s/template.txt > ./services/apps/application/product/k8s/template.yaml
kubectl apply -f ./services/apps/application/product/k8s/template.yaml

source ./scripts/deploy-order.sh
TENANTPATH=app envsubst < ./services/apps/application/order/k8s/template.txt > ./services/apps/application/order/k8s/template.yaml
kubectl apply -f ./services/apps/application/order/k8s/template.yaml

kubectl rollout restart deploy application
kubectl rollout restart deploy product
kubectl rollout restart deploy order

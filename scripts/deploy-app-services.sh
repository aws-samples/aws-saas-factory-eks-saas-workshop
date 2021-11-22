#!/bin/bash

source ./scripts/deploy-application.sh
TENANTPATH=app envsubst < ./client/web/application/k8s/template.txt > ./client/web/application/k8s/template.yaml
kubectl apply -f ./client/web/application/k8s/template.yaml

source ./scripts/deploy-product.sh
TENANTPATH=app envsubst < ./services/application/apps/product/k8s/template.txt > ./services/application/apps/product/k8s/template.yaml
kubectl apply -f ./services/application/apps/product/k8s/template.yaml

source ./scripts/deploy-order.sh
TENANTPATH=app envsubst < ./services/application/apps/order/k8s/template.txt > ./services/application/apps/order/k8s/template.yaml
kubectl apply -f ./services/application/apps/order/k8s/template.yaml

kubectl rollout restart deploy application
kubectl rollout restart deploy product
kubectl rollout restart deploy order

#!/bin/bash

source ./scripts/deploy-admin.sh
envsubst < ./client/web/admin/k8s/template.txt > ./client/web/admin/k8s/template.yaml
kubectl apply -f ./client/web/admin/k8s/template.yaml

source ./scripts/deploy-tenant-registration.sh
envsubst < ./services/shared/apps/tenant-registration/k8s/template.txt > ./services/shared/apps/tenant-registration/k8s/template.yaml
kubectl apply -f ./services/shared/apps/tenant-registration/k8s/template.yaml

source ./scripts/deploy-tenant-management.sh
envsubst < ./services/shared/apps/tenant-management/k8s/template.txt > ./services/shared/apps/tenant-management/k8s/template.yaml
kubectl apply -f ./services/shared/apps/tenant-management/k8s/template.yaml

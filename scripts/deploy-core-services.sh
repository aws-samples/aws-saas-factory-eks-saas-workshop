#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/deploy-admin.sh
envsubst < ./client/web/admin/k8s/template.txt > ./client/web/admin/k8s/template.yaml
kubectl apply -f ./client/web/admin/k8s/template.yaml

source ./scripts/deploy-tenant-registration.sh
envsubst < ./services/apps/shared/tenant-registration/k8s/template.txt > ./services/apps/shared/tenant-registration/k8s/template.yaml
kubectl apply -f ./services/apps/shared/tenant-registration/k8s/template.yaml

source ./scripts/deploy-tenant-management.sh
envsubst < ./services/apps/shared/tenant-management/k8s/template.txt > ./services/apps/shared/tenant-management/k8s/template.yaml
kubectl apply -f ./services/apps/shared/tenant-management/k8s/template.yaml

source ./scripts/deploy-user-management.sh
envsubst < ./services/apps/shared/user-management/k8s/template.txt > ./services/apps/shared/user-management/k8s/template.yaml
kubectl apply -f ./services/apps/shared/user-management/k8s/template.yaml

kubectl rollout restart deploy admin-application
kubectl rollout restart deploy tenant-registration
kubectl rollout restart deploy tenant-management
kubectl rollout restart deploy user-management

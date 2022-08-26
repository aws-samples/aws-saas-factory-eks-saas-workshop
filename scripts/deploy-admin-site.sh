#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

source ./scripts/setenv-admin.sh
envsubst < ./client/web/admin/k8s/template.txt > ./client/web/admin/k8s/template.yaml
kubectl apply -f ./client/web/admin/k8s/template.yaml


#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

#Shared services
kubectl delete -f ./services/apps/shared/tenant-registration/k8s/template.yaml
kubectl delete -f ./services/apps/shared/tenant-management/k8s/template.yaml
kubectl delete -f ./services/apps/shared/user-management/k8s/template.yaml

#Application services
kubectl delete -f ./client/web/application/k8s/template.yaml
kubectl delete -f ./services/apps/application/product/k8s/template.yaml
kubectl delete -f ./services/apps/application/order/k8s/template.yaml

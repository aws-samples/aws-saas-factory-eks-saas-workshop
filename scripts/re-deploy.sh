#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

ADMINAPPLICATIONECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminApplicationECR'].OutputValue" --output text)
APPLICATIONECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='ApplicationECR'].OutputValue" --output text)
TENANTMANGEMENTECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantMangementECR'].OutputValue" --output text)
TENANTREGISTRATIONECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantRegistrationECR'].OutputValue" --output text)
PRODUCTECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='ProductServiceECR'].OutputValue" --output text)
ORDERECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='OrderServiceECR'].OutputValue" --output text)

docker tag eks-admin-app:latest $ADMINAPPLICATIONECR:latest
docker push $ADMINAPPLICATIONECR:latest
docker tag app-image:latest $APPLICATIONECR:latest
docker push $APPLICATIONECR:latest
docker tag tenant-reg-svc:latest $TENANTREGISTRATIONECR:latest
docker push $TENANTREGISTRATIONECR:latest
docker tag tenant-mgmt-svc:latest $TENANTMANGEMENTECR:latest
docker push $TENANTMANGEMENTECR:latest
docker tag product-svc:latest $PRODUCTECR:latest
docker push $PRODUCTECR:latest
docker tag order-svc:latest $ORDERECR:latest
docker push $ORDERECR:latest


kubectl rollout restart deploy admin-application
kubectl rollout restart deploy application
kubectl rollout restart deploy tenant-registration
kubectl rollout restart deploy tenant-management
kubectl rollout restart deploy product
kubectl rollout restart deploy order


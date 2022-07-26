#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
export TENANTREGISTRATIONECR=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantRegistrationECR'].OutputValue" --output text)
export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export USERPOOLID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminUserPoolId'].OutputValue" --output text)
export APPCLIENTID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminAppClientId'].OutputValue" --output text)
export TENANT_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantTable'].OutputValue" --output text)
export AUTH_INFO_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AuthInfoTable'].OutputValue" --output text)
export TENANT_STACK_MAPPING_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='TenantStackMappingTable'].OutputValue" --output text)

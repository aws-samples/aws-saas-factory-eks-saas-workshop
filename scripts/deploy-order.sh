#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='PooledTenantUserPoolId'].OutputValue" --output text)
export COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='PooledTenantAppClientId'].OutputValue" --output text)
export ORDERTABLE=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='OrderTable'].OutputValue" --output text)
export ELBURL=$(aws cloudformation describe-stacks --stack-name EksStack --query "Stacks[0].Outputs[?OutputKey=='ELBURL'].OutputValue" --output text)
export TENANTPATH='app'

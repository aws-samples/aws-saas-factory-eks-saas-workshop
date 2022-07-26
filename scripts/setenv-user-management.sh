#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export REGION=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AWSRegion'].OutputValue" --output text)
export USERPOOLID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminUserPoolId'].OutputValue" --output text)
export APPCLIENTID=$(aws cloudformation describe-stacks --stack-name RootStack --query "Stacks[0].Outputs[?OutputKey=='AdminAppClientId'].OutputValue" --output text)

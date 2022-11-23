#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

export STACKS=$(aws cloudformation describe-stacks)
export REGION=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AWSRegion") | .OutputValue')
export USERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminUserPoolId") | .OutputValue')
export APPCLIENTID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminAppClientId") | .OutputValue')

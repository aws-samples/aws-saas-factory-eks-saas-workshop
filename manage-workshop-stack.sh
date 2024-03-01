#!/bin/bash -x
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

STACK_OPERATION="$1"

for i in {1..3}; do
    echo "iteration number: $i"
    if bash -xe _manage-workshop-stack.sh "$STACK_OPERATION" "$REPO_URL" "$REPO_BRANCH_NAME"; then
        echo "successfully completed execution"
        exit 0
    else
        sleep "$((15*i))"
    fi
done

echo "failed to complete execution"
exit 1

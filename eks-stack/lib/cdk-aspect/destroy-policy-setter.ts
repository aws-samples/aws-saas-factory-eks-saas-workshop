// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { IConstruct } from 'constructs';
import { CfnResource, IAspect, RemovalPolicy } from 'aws-cdk-lib';

export class DestroyPolicySetter implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}

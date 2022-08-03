import { Construct } from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
export declare function getCodeBuildRole(parent: Construct, account: string, region: string): iam.Role;

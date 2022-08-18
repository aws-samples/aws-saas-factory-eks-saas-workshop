import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
export declare function getCodeBuildRole(parent: Construct, account: string, region: string): iam.Role;

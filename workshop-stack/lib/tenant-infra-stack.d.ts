import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
export interface TenantInfraStackProps extends NestedStackProps {
    elbUrl: string;
}
export declare class TenantInfraStack extends NestedStack {
    nodeRole: iam.IRole;
    pipelineFunction: lambda.Function;
    pooledTenantUserPoolId: string;
    pooledTenantAppClientId: string;
    constructor(scope: Construct, id: string, props?: TenantInfraStackProps);
}

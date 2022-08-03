import { Construct, NestedStack, NestedStackProps } from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
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

import * as cdk from '@aws-cdk/core';
export interface ClusterStackProps extends cdk.StackProps {
    vpcId: string;
    cloud9EnvironmentId: string;
    codeBuildRoleArn: string;
}
export declare class ClusterStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: ClusterStackProps);
}

import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
export interface EksStackProps extends NestedStackProps {
    vpcId: string;
    cloud9EnvironmentId: string;
    codeBuildRoleArn: string;
}
export declare class EksStack extends NestedStack {
    elbUrl: string;
    nodeGroupRole: iam.IRole;
    codeBuildRole: iam.IRole;
    constructor(scope: Construct, id: string, props: EksStackProps);
}

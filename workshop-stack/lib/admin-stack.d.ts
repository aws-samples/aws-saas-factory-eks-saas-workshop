import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface AdminStackProps extends NestedStackProps {
    elbUrl: string;
}
export declare class AdminStack extends NestedStack {
    userPoolId: string;
    appClientId: string;
    issuer: string;
    constructor(scope: Construct, id: string, props?: AdminStackProps);
}

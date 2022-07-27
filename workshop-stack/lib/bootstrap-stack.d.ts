import * as cdk from '@aws-cdk/core';
export interface BootstrapStackProps extends cdk.StackProps {
    sourceZipFile: string;
    sourceZipFileChecksum: string;
}
export declare class BootstrapStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: BootstrapStackProps);
}

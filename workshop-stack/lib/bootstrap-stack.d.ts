import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface BootstrapStackProps extends cdk.StackProps {
    sourceZipFile: string;
    sourceZipFileChecksum: string;
}
export declare class BootstrapStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BootstrapStackProps);
}

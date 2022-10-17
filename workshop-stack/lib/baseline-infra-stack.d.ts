import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
export interface BaselineStackProps extends NestedStackProps {
    UserPoolId: string;
    AppClientId: string;
    elbUrl: string;
    TimeString: string;
    EksCodeBuildArn: string;
}
export declare class BaselineInfraStack extends NestedStack {
    tenantTable: dynamodb.Table;
    tenantTableName: string;
    authInfoTable: dynamodb.Table;
    authInfoTableName: string;
    productTable: dynamodb.Table;
    productTableName: string;
    orderTable: dynamodb.Table;
    orderTableName: string;
    eksSaaSStackMetadataTable: dynamodb.Table;
    eksSaaSStackMetadataTableName: string;
    tenantStackMappingTable: dynamodb.Table;
    tenantStackMappingTableName: string;
    tenantRegistrationEcrUri: string;
    codeBuildRole: iam.Role;
    productServiceUri: string;
    dynamicAssumeRoleArn: string;
    constructor(scope: Construct, id: string, props?: BaselineStackProps);
}

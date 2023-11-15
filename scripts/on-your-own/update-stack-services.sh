#!/bin/bash

########
# MOVE this elsewhere and delete
########

export STACKS=$(aws cloudformation describe-stacks)
export USERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminUserPoolId") | .OutputValue')
export APPCLIENTID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminAppClientId") | .OutputValue')
export REGION=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AWSRegion") | .OutputValue')
export ELBURL=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ELBURL") | .OutputValue')
export TENANT_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="TenantTable") | .OutputValue')
export AUTH_INFO_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AuthInfoTable") | .OutputValue')
export TENANT_STACK_MAPPING_TABLE_NAME=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="TenantStackMappingTable") | .OutputValue')
export PRODUCTTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="ProductTable") | .OutputValue')
export ORDERTABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="OrderTable") | .OutputValue')
export IAM_ROLE_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="RoleUsedByTVM") | .OutputValue')
export CODEBUILD_ARN=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="EksCodebuildArn") | .OutputValue')
export POOLED_TENANT_APPCLIENT_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantAppClientId") | .OutputValue')
export POOLED_TENANT_USERPOOL_ID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="PooledTenantUserPoolId") | .OutputValue')
export EKSSAAS_STACKMETADATA_TABLE=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="EksSaaSStackMetadataTable") | .OutputValue')
export ADMINUSERPOOLID=$(echo $STACKS | jq -r '.Stacks[]?.Outputs[]? | select(.OutputKey=="AdminUserPoolId") | .OutputValue')

aws cognito-idp admin-set-user-password --user-pool-id $ADMINUSERPOOLID --username admin@saas.com --password "Admin123*" --permanent

aws dynamodb put-item \
--table-name $AUTH_INFO_TABLE_NAME \
--item "{\"tenant_path\": {\"S\": \"app\"}, \"user_pool_type\": {\"S\": \"pooled\"}, \"user_pool_id\": {\"S\": \"$POOLED_TENANT_USERPOOL_ID\"}, \"client_id\": {\"S\": \"$POOLED_TENANT_APPCLIENT_ID\"}}" \
--return-consumed-capacity TOTAL        

# Record the EKS SaaS stack metadata in the dynamo table that was made in root-stack
aws dynamodb put-item \
--table-name $EKSSAAS_STACKMETADATA_TABLE \
--item "{\"StackName\": {\"S\": \"eks-saas\"}, \"ELBURL\": {\"S\": \"$ELBURL\"}, \"CODEBUILD_ARN\": {\"S\": \"$CODEBUILD_ARN\"}, \"IAM_ROLE_ARN\": {\"S\": \"$IAM_ROLE_ARN\"}}" \
--return-consumed-capacity TOTAL

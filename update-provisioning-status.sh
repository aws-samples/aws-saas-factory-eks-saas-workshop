#!/bin/bash -x
: "${TENANTSTACKTABLE:=$1}"
: "${TENANTNAME:=$2}"

aws dynamodb update-item \
--table-name $TENANTSTACKTABLE \
--key '{"TenantName":{"S":"'$TENANTNAME'"}}' \
--update-expression "SET #D=:d" \
--expression-attribute-names '{"#D":"DeploymentStatus"}' \
--expression-attribute-values '{":d":{"S":"Provisioned"}}'
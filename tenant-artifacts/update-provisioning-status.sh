#!/bin/bash -x
: "${TENANTSTACKTABLE:=$1}"
: "${TENANTPATH:=$2}"

aws dynamodb update-item \
--table-name $TENANTSTACKTABLE \
--key '{"TenantName":{"S":"'$TENANTPATH'"}}' \
--update-expression "SET #D=:d" \
--expression-attribute-names '{"#D":"DeploymentStatus"}' \
--expression-attribute-values '{":d":{"S":"Provisioned"}}'
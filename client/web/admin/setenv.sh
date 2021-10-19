#!/bin/bash
#set -x
: "${ELBURL:=$1}"
: "${REGION:=$2}"
: "${USERPOOLID:=$3}"
: "${APPCLIENTID:=$4}"

cat << EoF > ./src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'http://$ELBURL',
};

EoF
cat << EoF > ./src/environments/environment.ts
export const environment = {
  production: true,
  apiUrl: 'http://$ELBURL',
};
EoF

cat << EoF > ./src/aws-exports.js
const awsmobile = {
    "aws_project_region": "$REGION",
    "aws_cognito_region": "$REGION",
    "aws_user_pools_id": "$USERPOOLID",
    "aws_user_pools_web_client_id": "$APPCLIENTID",
};


export default awsmobile;
EoF

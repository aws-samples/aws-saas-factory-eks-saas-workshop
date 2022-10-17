# #!/bin/bash

# #echo "Running Cloud9 environment setup. Installs tooling and required software to help execute the labs in the workshop"
# #aws s3 cp s3://ee-assets-prod-us-east-1/modules/f858611c30174390bceaaa3e6e4b0a6f/v1/envsetup.sh . && chmod +x ./envsetup.sh && ./envsetup.sh ; source ~/.bash_profile

# #echo "Clone the EKS SaaS repository"
# #git clone https://github.com/mobytoby/saas-factory-eks-workshop.git

# #echo "Helm install Nginx Ingress controller. Use the config file nginx-ingress-config.yaml to set additional parameters"
# #cd scripts/templates
# #helm repo add nginx-stable https://helm.nginx.com/stable
# #helm repo update
# #helm install controller --values nginx-ingress-config.yaml nginx-stable/nginx-ingress

# #echo "Waiting for the NLB to be created"
# #sleep 180

# #echo "Retrieve the Load Balancer URL"
# #export ELB_URL=$(kubectl get svc controller-nginx-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
# #echo http://${ELB_URL}

# #echo "Replace the ingress master with the above Load balancer URL"
# #sed -i -e 's,ELB_URL,'$ELB_URL',g' ingress-master-resource.yaml

# #echo "Deploy the Ingress master resource"
# #kubectl apply -f ingress-master-resource.yaml

# echo "Creating a new role which will be used by our CodeBuild project to describe our EKS Instances"
# TRUST="{ \"Version\": \"2012-10-17\", \"Statement\": [ { \"Effect\": \"Allow\", \"Principal\": { \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\" }, \"Action\": \"sts:AssumeRole\" } ] }"
# echo '{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Action": "eks:Describe*", "Resource": "*" }, { "Effect": "Allow", "Action": "iam:*", "Resource": "*" }, { "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" }, { "Effect": "Allow", "Action": "dynamodb:*", "Resource": "*" } ] }' > /tmp/iam-role-policy
# aws iam create-role --role-name EksSaasCodeBuildRole --assume-role-policy-document "$TRUST" --output text --query 'Role.Arn'
# # Adding sleep of 10 secs to address sporadic exception due to Throttling or Rate exceeded
# sleep 10
# aws iam put-role-policy --role-name EksSaasCodeBuildRole --policy-name eks-saas-code-build-policy --policy-document file:///tmp/iam-role-policy

# echo "Updating the AWS Auth config map with the CodeBuild role"
# ROLE="    - rolearn: arn:aws:iam::$ACCOUNT_ID:role/EksSaasCodeBuildRole\n      username: build\n      groups:\n        - system:masters"
# kubectl get -n kube-system configmap/aws-auth -o yaml | awk "/mapRoles: \|/{print;print \"$ROLE\";next}1" > /tmp/aws-auth-patch.yml
# kubectl patch configmap/aws-auth -n kube-system --patch "$(cat /tmp/aws-auth-patch.yml)"

# echo "Creating a new role which will be used by the Token Vending Machine (TVM)"
# EKS_NODE_GROUP_ROLE_NAME=$(aws cloudformation describe-stack-resources --stack-name $STACK_NAME | jq -r '.StackResources[] | select(.ResourceType=="AWS::IAM::Role") | .PhysicalResourceId')
# TRUST="{ \"Version\": \"2012-10-17\", \"Statement\": [ { \"Effect\": \"Allow\", \"Principal\": { \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:role/${EKS_NODE_GROUP_ROLE_NAME}\" }, \"Action\": \"sts:AssumeRole\" } ] }"
# echo '{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:BatchGetItem","dynamodb:Query","dynamodb:Scan","dynamodb:DescribeTable"], "Resource": "arn:aws:dynamodb:'${AWS_REGION}':'${ACCOUNT_ID}':table/*" }] }' > /tmp/dynamic-role-policy
# aws iam create-role --role-name EksSaasDynamicAssumeRole --assume-role-policy-document "$TRUST" --output text --query 'Role.Arn'
# aws iam put-role-policy --role-name EksSaasDynamicAssumeRole --policy-name eks-saas-dynamic-assume-policy --policy-document file:///tmp/dynamic-role-policy
# export IAM_ROLE_ARN=$(aws iam get-role --role-name EksSaasDynamicAssumeRole --output text --query 'Role.Arn')

# echo "Attaching an inline policy to the existing Node Instance Role that gives our nodes more AWS Permissions"
# aws iam create-policy --policy-name eks-saas-inline-policy --policy-document file://eks-node-instance-policy.json
# aws iam attach-role-policy --role-name $EKS_NODE_GROUP_ROLE_NAME --policy-arn arn:aws:iam::$ACCOUNT_ID:policy/eks-saas-inline-policy

# echo "export ELBURL=${ELB_URL}" | tee -a ~/.bash_profile
# echo "export IAM_ROLE_ARN=${IAM_ROLE_ARN}" | tee -a ~/.bash_profile
# echo "export CODEBUILD_ARN=arn:aws:iam::$ACCOUNT_ID:role/EksSaasCodeBuildRole" | tee -a ~/.bash_profile


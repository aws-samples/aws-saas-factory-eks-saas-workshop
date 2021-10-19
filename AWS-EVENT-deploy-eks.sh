

# Deploys an Amazon EKS cluster. 
# Once deployment is complete, copy the output values and apply to cdk/root/lib/root-stack.ts

cd cdk/existing-eks-stack
yarn && yarn run build 
cdk bootstrap  
cdk deploy 

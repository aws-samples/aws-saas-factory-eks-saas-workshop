# SaaS Factory SaaS EKS Workshop

## Security notice — credentials

**If you deployed a version of this workshop dated before this notice, treat its administrator
password as public.** Earlier revisions set the administrator account
(`admin@saas.com`) to a fixed password committed to this repository, so every deployment
shared the same known credential on an account that administers every tenant. The same
applied to the tenant users created by `scripts/onboard-tenants.sh` and to the Grafana admin
account in `tenant-artifacts/README.md`. If you have such a deployment, change those
passwords or delete the deployment.

This workshop no longer ships any password. You supply them at deploy time:

```bash
# Administrator account (CDK)
cdk deploy -c adminPassword='<a value you choose>'

# Tenant users (scripts/onboard-tenants.sh)
export PASSWORD='<a value you choose>'

# Admin password reset (scripts/on-your-own/update-stack-services.sh)
export ADMIN_PASSWORD='<a value you choose>'
```

Each must satisfy the relevant Cognito user pool's password policy. Synthesis and the scripts
fail with an explicit message if a value is missing, rather than falling back to a default.

**Where the administrator password remains visible.** It is passed to a CloudFormation custom
resource, so it appears in the deployed stack's resource properties and in the custom
resource's Lambda invocation event. Treat it as readable by anyone with CloudFormation or
CloudWatch Logs read access on the deploying account. Use a value you have not used anywhere
else, and delete the stack when you have finished the workshop.

This is workshop code for learning multi-tenant patterns on EKS. It is not intended for
production use as-is.

## About this workshop

The code provided here is intended to accompany the SaaS Factory EKS Workshop. The workshop is a series of hands-on labs through which participants build up, step-by-step, a functioning multi-tenant EKS environment. This workshop explores key architectural strategies that are used to address the various key tenets of SaaS solutions including isolation, identity, data partitioning, routing, deployment, and operational considerations and specifically how these are realized in EKS. Once complete with this workshop, participants will have a better understanding of the EKS-flavor of multi-tenancy, and be better able to understand the EKS SaaS reference solution, also produced by the SaaS Factory team.

[Workshop Narrative Here](https://catalog.us-east-1.prod.workshops.aws/workshops/02d7d511-9af8-417f-abda-3708e9c0c749/en-US)


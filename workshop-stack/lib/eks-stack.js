"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EksStack = void 0;
const core_1 = require("@aws-cdk/core");
const eks = require("@aws-cdk/aws-eks");
const iam = require("@aws-cdk/aws-iam");
const node_role_policy_doc_1 = require("./node-role-policy-doc");
const KeyName = 'workshop';
class EksStack extends core_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // CodeBuild role is supplied by the caller from the BUILD_ROLE_ARN environment variable.
        this.codeBuildRole = iam.Role.fromRoleArn(this, 'CodeBuildRole', props.codeBuildRoleArn);
        // Create our EKS cluster.
        const cluster = new eks.Cluster(this, 'Cluster', {
            version: eks.KubernetesVersion.V1_21,
            clusterName: 'eksworkshop-eksctl',
            defaultCapacity: 2,
            mastersRole: this.codeBuildRole,
        });
        //Export this for later use in the TVM
        const role = cluster.defaultNodegroup.role;
        role === null || role === void 0 ? void 0 : role.attachInlinePolicy(new iam.Policy(this, 'saas-inline-policy', {
            document: node_role_policy_doc_1.default,
        }));
        this.nodeGroupRole = role;
        // The OIDC provider isn't initialized unless we access it
        cluster.openIdConnectProvider;
        // Allow Cloud9 environment to make changes to the cluster.
        cluster.awsAuth.addMastersRole(this.codeBuildRole);
        //Create Ingress
        const ingressControllerReleaseName = 'controller';
        const ingressChart = cluster.addHelmChart('IngressController', {
            chart: 'nginx-ingress',
            repository: 'https://helm.nginx.com/stable',
            release: ingressControllerReleaseName,
            values: {
                controller: {
                    publishService: {
                        enabled: true,
                    },
                    service: {
                        annotations: {
                            'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
                            'service.beta.kubernetes.io/aws-load-balancer-backend-protocol': 'http',
                            'service.beta.kubernetes.io/aws-load-balancer-ssl-ports': '443',
                            'service.beta.kubernetes.io/aws-load-balancer-connection-idle-timeout': '3600',
                        },
                        targetPorts: {
                            https: 'http',
                        },
                    },
                },
            },
        });
        const albAddress = new eks.KubernetesObjectValue(this, 'elbAddress', {
            cluster,
            objectType: 'Service',
            objectName: `${ingressControllerReleaseName}-nginx-ingress`,
            jsonPath: '.status.loadBalancer.ingress[0].hostname',
        });
        const masterIngress = cluster.addManifest('masterIngressResource', {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'Ingress',
            metadata: {
                name: 'workshop-ingress-master',
                annotations: {
                    'kubernetes.io/ingress.class': 'nginx',
                    'nginx.org/mergeable-ingress-type': 'master',
                },
            },
            spec: {
                rules: [
                    {
                        host: albAddress.value,
                    },
                ],
            },
        });
        masterIngress.node.addDependency(ingressChart);
        this.elbUrl = albAddress.value;
        const dynamoDbDoc = new iam.PolicyDocument({
            assignSids: false,
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'dynamodb:GetItem',
                        'dynamodb:PutItem',
                        'dynamodb:BatchGetItem',
                        'dynamodb:Query',
                        'dynamodb:Scan',
                        'dynamodb:DescribeTable',
                    ],
                    resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/*`],
                }),
            ],
        });
        const roleUsedByTokenVendingMachine = new iam.Role(this, 'DynamicAssumeRole', {
            assumedBy: this.nodeGroupRole,
            inlinePolicies: {
                dynamoPolicy: dynamoDbDoc,
            },
        });
        new core_1.CfnOutput(this, 'ELBURL', { value: this.elbUrl });
        new core_1.CfnOutput(this, 'EksCodebuildArn', { value: this.codeBuildRole.roleArn });
        new core_1.CfnOutput(this, 'RoleUsedByTVM', { value: roleUsedByTokenVendingMachine.roleArn });
    }
}
exports.EksStack = EksStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWtzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWtzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdDQUFtRjtBQUduRix3Q0FBd0M7QUFHeEMsd0NBQXdDO0FBS3hDLGlFQUF1RDtBQUV2RCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUM7QUFPM0IsTUFBYSxRQUFTLFNBQVEsa0JBQVc7SUFLdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFvQjtRQUM1RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUd4Qix5RkFBeUY7UUFDeEYsSUFBSSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTFGLDBCQUEwQjtRQUMxQixNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUMvQyxPQUFPLEVBQUUsR0FBRyxDQUFDLGlCQUFpQixDQUFDLEtBQUs7WUFDcEMsV0FBVyxFQUFFLG9CQUFvQjtZQUNqQyxlQUFlLEVBQUUsQ0FBQztZQUNsQixXQUFXLEVBQUUsSUFBSSxDQUFDLGFBQWE7U0FDaEMsQ0FBQyxDQUFDO1FBRUgsc0NBQXNDO1FBQ3RDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxnQkFBaUIsQ0FBQyxJQUFJLENBQUM7UUFDNUMsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLGtCQUFrQixDQUN0QixJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3pDLFFBQVEsRUFBRSw4QkFBaUI7U0FDNUIsQ0FBQyxFQUNGO1FBQ0YsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFFMUIsMERBQTBEO1FBQzFELE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQztRQUU5QiwyREFBMkQ7UUFDM0QsT0FBTyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBR25ELGdCQUFnQjtRQUNoQixNQUFNLDRCQUE0QixHQUFHLFlBQVksQ0FBQztRQUVsRCxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO1lBQzdELEtBQUssRUFBRSxlQUFlO1lBQ3RCLFVBQVUsRUFBRSwrQkFBK0I7WUFDM0MsT0FBTyxFQUFFLDRCQUE0QjtZQUNyQyxNQUFNLEVBQUU7Z0JBQ04sVUFBVSxFQUFFO29CQUNWLGNBQWMsRUFBRTt3QkFDZCxPQUFPLEVBQUUsSUFBSTtxQkFDZDtvQkFDRCxPQUFPLEVBQUU7d0JBQ1AsV0FBVyxFQUFFOzRCQUNYLG1EQUFtRCxFQUFFLEtBQUs7NEJBQzFELCtEQUErRCxFQUFFLE1BQU07NEJBQ3ZFLHdEQUF3RCxFQUFFLEtBQUs7NEJBQy9ELHNFQUFzRSxFQUFFLE1BQU07eUJBQy9FO3dCQUNELFdBQVcsRUFBRTs0QkFDWCxLQUFLLEVBQUUsTUFBTTt5QkFDZDtxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNuRSxPQUFPO1lBQ1AsVUFBVSxFQUFFLFNBQVM7WUFDckIsVUFBVSxFQUFFLEdBQUcsNEJBQTRCLGdCQUFnQjtZQUMzRCxRQUFRLEVBQUUsMENBQTBDO1NBQ3JELENBQUMsQ0FBQztRQUVILE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsdUJBQXVCLEVBQUU7WUFDakUsVUFBVSxFQUFFLHNCQUFzQjtZQUNsQyxJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRTtnQkFDUixJQUFJLEVBQUUseUJBQXlCO2dCQUMvQixXQUFXLEVBQUU7b0JBQ1gsNkJBQTZCLEVBQUUsT0FBTztvQkFDdEMsa0NBQWtDLEVBQUUsUUFBUTtpQkFDN0M7YUFDRjtZQUNELElBQUksRUFBRTtnQkFDSixLQUFLLEVBQUU7b0JBQ0w7d0JBQ0UsSUFBSSxFQUFFLFVBQVUsQ0FBQyxLQUFLO3FCQUN2QjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsYUFBYSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFL0MsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBRS9CLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztZQUN6QyxVQUFVLEVBQUUsS0FBSztZQUNqQixVQUFVLEVBQUU7Z0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO29CQUN4QixPQUFPLEVBQUU7d0JBQ1Asa0JBQWtCO3dCQUNsQixrQkFBa0I7d0JBQ2xCLHVCQUF1Qjt3QkFDdkIsZ0JBQWdCO3dCQUNoQixlQUFlO3dCQUNmLHdCQUF3QjtxQkFDekI7b0JBQ0QsU0FBUyxFQUFFLENBQUMsb0JBQW9CLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sVUFBVSxDQUFDO2lCQUN2RSxDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLDZCQUE2QixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDNUUsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQzdCLGNBQWMsRUFBRTtnQkFDZCxZQUFZLEVBQUUsV0FBVzthQUMxQjtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3RELElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEVBQUUsS0FBSyxFQUFFLDZCQUE2QixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFFekYsQ0FBQztDQUNGO0FBMUhELDRCQTBIQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5lc3RlZFN0YWNrLCBOZXN0ZWRTdGFja1Byb3BzLCBDb25zdHJ1Y3QsIENmbk91dHB1dH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5cbmltcG9ydCAqIGFzIGVrcyBmcm9tICdAYXdzLWNkay9hd3MtZWtzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdAYXdzLWNkay9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ0Bhd3MtY2RrL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnQGF3cy1jZGsvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjciBmcm9tICdAYXdzLWNkay9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnQGF3cy1jZGsvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ0Bhd3MtY2RrL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBub2RlUm9sZVBvbGljeURvYyBmcm9tICcuL25vZGUtcm9sZS1wb2xpY3ktZG9jJztcblxuY29uc3QgS2V5TmFtZSA9ICd3b3Jrc2hvcCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWtzU3RhY2tQcm9wcyBleHRlbmRzIE5lc3RlZFN0YWNrUHJvcHMge1xuICB2cGNJZDogc3RyaW5nXG4gIGNsb3VkOUVudmlyb25tZW50SWQ6IHN0cmluZ1xuICBjb2RlQnVpbGRSb2xlQXJuOiBzdHJpbmdcbn1cbmV4cG9ydCBjbGFzcyBFa3NTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgZWxiVXJsOiBzdHJpbmc7XG4gIG5vZGVHcm91cFJvbGU6IGlhbS5JUm9sZTtcbiAgY29kZUJ1aWxkUm9sZTogaWFtLklSb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFa3NTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cblxuICAgIC8vIENvZGVCdWlsZCByb2xlIGlzIHN1cHBsaWVkIGJ5IHRoZSBjYWxsZXIgZnJvbSB0aGUgQlVJTERfUk9MRV9BUk4gZW52aXJvbm1lbnQgdmFyaWFibGUuXG4gICAgIHRoaXMuY29kZUJ1aWxkUm9sZSA9IGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdDb2RlQnVpbGRSb2xlJywgcHJvcHMuY29kZUJ1aWxkUm9sZUFybik7XG5cbiAgICAvLyBDcmVhdGUgb3VyIEVLUyBjbHVzdGVyLlxuICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWtzLkNsdXN0ZXIodGhpcywgJ0NsdXN0ZXInLCB7XG4gICAgICB2ZXJzaW9uOiBla3MuS3ViZXJuZXRlc1ZlcnNpb24uVjFfMjEsXG4gICAgICBjbHVzdGVyTmFtZTogJ2Vrc3dvcmtzaG9wLWVrc2N0bCcsXG4gICAgICBkZWZhdWx0Q2FwYWNpdHk6IDIsXG4gICAgICBtYXN0ZXJzUm9sZTogdGhpcy5jb2RlQnVpbGRSb2xlLFxuICAgIH0pO1xuXG4gICAgLy9FeHBvcnQgdGhpcyBmb3IgbGF0ZXIgdXNlIGluIHRoZSBUVk1cbiAgICBjb25zdCByb2xlID0gY2x1c3Rlci5kZWZhdWx0Tm9kZWdyb3VwIS5yb2xlO1xuICAgIHJvbGU/LmF0dGFjaElubGluZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5KHRoaXMsICdzYWFzLWlubGluZS1wb2xpY3knLCB7XG4gICAgICAgIGRvY3VtZW50OiBub2RlUm9sZVBvbGljeURvYyxcbiAgICAgIH0pXG4gICAgKTtcbiAgICB0aGlzLm5vZGVHcm91cFJvbGUgPSByb2xlO1xuICAgIFxuICAgIC8vIFRoZSBPSURDIHByb3ZpZGVyIGlzbid0IGluaXRpYWxpemVkIHVubGVzcyB3ZSBhY2Nlc3MgaXRcbiAgICBjbHVzdGVyLm9wZW5JZENvbm5lY3RQcm92aWRlcjtcblxuICAgIC8vIEFsbG93IENsb3VkOSBlbnZpcm9ubWVudCB0byBtYWtlIGNoYW5nZXMgdG8gdGhlIGNsdXN0ZXIuXG4gICAgY2x1c3Rlci5hd3NBdXRoLmFkZE1hc3RlcnNSb2xlKHRoaXMuY29kZUJ1aWxkUm9sZSk7XG5cblxuICAgIC8vQ3JlYXRlIEluZ3Jlc3NcbiAgICBjb25zdCBpbmdyZXNzQ29udHJvbGxlclJlbGVhc2VOYW1lID0gJ2NvbnRyb2xsZXInO1xuXG4gICAgY29uc3QgaW5ncmVzc0NoYXJ0ID0gY2x1c3Rlci5hZGRIZWxtQ2hhcnQoJ0luZ3Jlc3NDb250cm9sbGVyJywge1xuICAgICAgY2hhcnQ6ICduZ2lueC1pbmdyZXNzJyxcbiAgICAgIHJlcG9zaXRvcnk6ICdodHRwczovL2hlbG0ubmdpbnguY29tL3N0YWJsZScsXG4gICAgICByZWxlYXNlOiBpbmdyZXNzQ29udHJvbGxlclJlbGVhc2VOYW1lLFxuICAgICAgdmFsdWVzOiB7XG4gICAgICAgIGNvbnRyb2xsZXI6IHtcbiAgICAgICAgICBwdWJsaXNoU2VydmljZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHNlcnZpY2U6IHtcbiAgICAgICAgICAgIGFubm90YXRpb25zOiB7XG4gICAgICAgICAgICAgICdzZXJ2aWNlLmJldGEua3ViZXJuZXRlcy5pby9hd3MtbG9hZC1iYWxhbmNlci10eXBlJzogJ25sYicsXG4gICAgICAgICAgICAgICdzZXJ2aWNlLmJldGEua3ViZXJuZXRlcy5pby9hd3MtbG9hZC1iYWxhbmNlci1iYWNrZW5kLXByb3RvY29sJzogJ2h0dHAnLFxuICAgICAgICAgICAgICAnc2VydmljZS5iZXRhLmt1YmVybmV0ZXMuaW8vYXdzLWxvYWQtYmFsYW5jZXItc3NsLXBvcnRzJzogJzQ0MycsXG4gICAgICAgICAgICAgICdzZXJ2aWNlLmJldGEua3ViZXJuZXRlcy5pby9hd3MtbG9hZC1iYWxhbmNlci1jb25uZWN0aW9uLWlkbGUtdGltZW91dCc6ICczNjAwJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0YXJnZXRQb3J0czoge1xuICAgICAgICAgICAgICBodHRwczogJ2h0dHAnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGFsYkFkZHJlc3MgPSBuZXcgZWtzLkt1YmVybmV0ZXNPYmplY3RWYWx1ZSh0aGlzLCAnZWxiQWRkcmVzcycsIHtcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBvYmplY3RUeXBlOiAnU2VydmljZScsXG4gICAgICBvYmplY3ROYW1lOiBgJHtpbmdyZXNzQ29udHJvbGxlclJlbGVhc2VOYW1lfS1uZ2lueC1pbmdyZXNzYCxcbiAgICAgIGpzb25QYXRoOiAnLnN0YXR1cy5sb2FkQmFsYW5jZXIuaW5ncmVzc1swXS5ob3N0bmFtZScsXG4gICAgfSk7XG5cbiAgICBjb25zdCBtYXN0ZXJJbmdyZXNzID0gY2x1c3Rlci5hZGRNYW5pZmVzdCgnbWFzdGVySW5ncmVzc1Jlc291cmNlJywge1xuICAgICAgYXBpVmVyc2lvbjogJ25ldHdvcmtpbmcuazhzLmlvL3YxJyxcbiAgICAgIGtpbmQ6ICdJbmdyZXNzJyxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIG5hbWU6ICd3b3Jrc2hvcC1pbmdyZXNzLW1hc3RlcicsXG4gICAgICAgIGFubm90YXRpb25zOiB7XG4gICAgICAgICAgJ2t1YmVybmV0ZXMuaW8vaW5ncmVzcy5jbGFzcyc6ICduZ2lueCcsXG4gICAgICAgICAgJ25naW54Lm9yZy9tZXJnZWFibGUtaW5ncmVzcy10eXBlJzogJ21hc3RlcicsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgc3BlYzoge1xuICAgICAgICBydWxlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGhvc3Q6IGFsYkFkZHJlc3MudmFsdWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgbWFzdGVySW5ncmVzcy5ub2RlLmFkZERlcGVuZGVuY3koaW5ncmVzc0NoYXJ0KTtcblxuICAgIHRoaXMuZWxiVXJsID0gYWxiQWRkcmVzcy52YWx1ZTtcblxuICAgIGNvbnN0IGR5bmFtb0RiRG9jID0gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICBhc3NpZ25TaWRzOiBmYWxzZSxcbiAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6QmF0Y2hHZXRJdGVtJyxcbiAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAnZHluYW1vZGI6RGVzY3JpYmVUYWJsZScsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvKmBdLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByb2xlVXNlZEJ5VG9rZW5WZW5kaW5nTWFjaGluZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRHluYW1pY0Fzc3VtZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IHRoaXMubm9kZUdyb3VwUm9sZSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIGR5bmFtb1BvbGljeTogZHluYW1vRGJEb2MsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUxCVVJMJywgeyB2YWx1ZTogdGhpcy5lbGJVcmwgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRWtzQ29kZWJ1aWxkQXJuJywgeyB2YWx1ZTogdGhpcy5jb2RlQnVpbGRSb2xlLnJvbGVBcm4gfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUm9sZVVzZWRCeVRWTScsIHsgdmFsdWU6IHJvbGVVc2VkQnlUb2tlblZlbmRpbmdNYWNoaW5lLnJvbGVBcm4gfSk7XG5cbiAgfVxufVxuIl19
"use strict";
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantInfraStack = void 0;
const core_1 = require("@aws-cdk/core");
const cognito = require("@aws-cdk/aws-cognito");
class TenantInfraStack extends core_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const pooledTenantPool = new cognito.UserPool(this, 'PooledTenantsPool', {
            userInvitation: {
                emailSubject: 'Temporary password for environment EKS SaaS Application',
                emailBody: `<b>Welcome to the SaaS Application for EKS Workshop!</b> <br>
    <br>
    You can log into the app <a href="http://${props === null || props === void 0 ? void 0 : props.elbUrl}/app/index.html">here</a>. If that link doesn't work, you can copy this URL into your browser: http://${props === null || props === void 0 ? void 0 : props.elbUrl}/app/index.html
    <br>
    Your username is: <b>{username}</b>
    <br>
    Your temporary password is: <b>{####}</b>
    <br>`,
            },
            userPoolName: 'eks-ws-pooled',
            customAttributes: {
                'tenant-id': new cognito.StringAttribute({ mutable: false }),
                'company-name': new cognito.StringAttribute({ mutable: false }),
                email: new cognito.StringAttribute({ mutable: true }),
            },
        });
        const pooledTenantAppClient = pooledTenantPool.addClient('PooledUserPoolClient', {
            generateSecret: false,
            authFlows: {
                adminUserPassword: true,
                custom: true,
                userSrp: true,
            },
            oAuth: {
                flows: {
                    implicitCodeGrant: true,
                    authorizationCodeGrant: true,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.PHONE,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [`https://${props === null || props === void 0 ? void 0 : props.elbUrl}/app`],
            },
            preventUserExistenceErrors: true,
        });
        this.pooledTenantUserPoolId = pooledTenantPool.userPoolId;
        this.pooledTenantAppClientId = pooledTenantAppClient.userPoolClientId;
    }
}
exports.TenantInfraStack = TenantInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVuYW50LWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVuYW50LWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQUVILHdDQUF5RTtBQUd6RSxnREFBZ0Q7QUFNaEQsTUFBYSxnQkFBaUIsU0FBUSxrQkFBVztJQU0vQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2RSxjQUFjLEVBQUU7Z0JBQ2QsWUFBWSxFQUFFLHlEQUF5RDtnQkFDdkUsU0FBUyxFQUFFOzsrQ0FFNEIsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE1BQU0seUdBQXlHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxNQUFNOzs7OztTQUt6SzthQUNGO1lBQ0QsWUFBWSxFQUFFLGVBQWU7WUFDN0IsZ0JBQWdCLEVBQUU7Z0JBQ2hCLFdBQVcsRUFBRSxJQUFJLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7Z0JBQzVELGNBQWMsRUFBRSxJQUFJLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7Z0JBQy9ELEtBQUssRUFBRSxJQUFJLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUM7YUFDdEQ7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLHFCQUFxQixHQUFHLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsRUFBRTtZQUMvRSxjQUFjLEVBQUUsS0FBSztZQUNyQixTQUFTLEVBQUU7Z0JBQ1QsaUJBQWlCLEVBQUUsSUFBSTtnQkFDdkIsTUFBTSxFQUFFLElBQUk7Z0JBQ1osT0FBTyxFQUFFLElBQUk7YUFDZDtZQUNELEtBQUssRUFBRTtnQkFDTCxLQUFLLEVBQUU7b0JBQ0wsaUJBQWlCLEVBQUUsSUFBSTtvQkFDdkIsc0JBQXNCLEVBQUUsSUFBSTtpQkFDN0I7Z0JBQ0QsTUFBTSxFQUFFO29CQUNOLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSztvQkFDeEIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxLQUFLO29CQUN4QixPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU07b0JBQ3pCLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTztpQkFDM0I7Z0JBQ0QsWUFBWSxFQUFFLENBQUMsV0FBVyxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsTUFBTSxNQUFNLENBQUM7YUFDL0M7WUFDRCwwQkFBMEIsRUFBRSxJQUFJO1NBQ2pDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxzQkFBc0IsR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUM7UUFDMUQsSUFBSSxDQUFDLHVCQUF1QixHQUFHLHFCQUFxQixDQUFDLGdCQUFnQixDQUFDO0lBRXhFLENBQUM7Q0FDRjtBQXZERCw0Q0F1REMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTUlULTBcbiAqL1xuXG5pbXBvcnQgeyBDb25zdHJ1Y3QsIE5lc3RlZFN0YWNrLCBOZXN0ZWRTdGFja1Byb3BzIH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnQGF3cy1jZGsvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnQGF3cy1jZGsvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2duaXRvJztcblxuZXhwb3J0IGludGVyZmFjZSBUZW5hbnRJbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBOZXN0ZWRTdGFja1Byb3BzIHtcbiAgZWxiVXJsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBUZW5hbnRJbmZyYVN0YWNrIGV4dGVuZHMgTmVzdGVkU3RhY2sge1xuICBub2RlUm9sZTogaWFtLklSb2xlO1xuICBwaXBlbGluZUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHBvb2xlZFRlbmFudFVzZXJQb29sSWQ6IHN0cmluZztcbiAgcG9vbGVkVGVuYW50QXBwQ2xpZW50SWQ6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IFRlbmFudEluZnJhU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgcG9vbGVkVGVuYW50UG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdQb29sZWRUZW5hbnRzUG9vbCcsIHtcbiAgICAgIHVzZXJJbnZpdGF0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogJ1RlbXBvcmFyeSBwYXNzd29yZCBmb3IgZW52aXJvbm1lbnQgRUtTIFNhYVMgQXBwbGljYXRpb24nLFxuICAgICAgICBlbWFpbEJvZHk6IGA8Yj5XZWxjb21lIHRvIHRoZSBTYWFTIEFwcGxpY2F0aW9uIGZvciBFS1MgV29ya3Nob3AhPC9iPiA8YnI+XG4gICAgPGJyPlxuICAgIFlvdSBjYW4gbG9nIGludG8gdGhlIGFwcCA8YSBocmVmPVwiaHR0cDovLyR7cHJvcHM/LmVsYlVybH0vYXBwL2luZGV4Lmh0bWxcIj5oZXJlPC9hPi4gSWYgdGhhdCBsaW5rIGRvZXNuJ3Qgd29yaywgeW91IGNhbiBjb3B5IHRoaXMgVVJMIGludG8geW91ciBicm93c2VyOiBodHRwOi8vJHtwcm9wcz8uZWxiVXJsfS9hcHAvaW5kZXguaHRtbFxuICAgIDxicj5cbiAgICBZb3VyIHVzZXJuYW1lIGlzOiA8Yj57dXNlcm5hbWV9PC9iPlxuICAgIDxicj5cbiAgICBZb3VyIHRlbXBvcmFyeSBwYXNzd29yZCBpczogPGI+eyMjIyN9PC9iPlxuICAgIDxicj5gLFxuICAgICAgfSxcbiAgICAgIHVzZXJQb29sTmFtZTogJ2Vrcy13cy1wb29sZWQnLFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICAndGVuYW50LWlkJzogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogZmFsc2UgfSksXG4gICAgICAgICdjb21wYW55LW5hbWUnOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiBmYWxzZSB9KSxcbiAgICAgICAgZW1haWw6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcG9vbGVkVGVuYW50QXBwQ2xpZW50ID0gcG9vbGVkVGVuYW50UG9vbC5hZGRDbGllbnQoJ1Bvb2xlZFVzZXJQb29sQ2xpZW50Jywge1xuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICBjdXN0b206IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBIT05FLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogW2BodHRwczovLyR7cHJvcHM/LmVsYlVybH0vYXBwYF0sXG4gICAgICB9LFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXG4gICAgfSk7XG4gICAgdGhpcy5wb29sZWRUZW5hbnRVc2VyUG9vbElkID0gcG9vbGVkVGVuYW50UG9vbC51c2VyUG9vbElkO1xuICAgIHRoaXMucG9vbGVkVGVuYW50QXBwQ2xpZW50SWQgPSBwb29sZWRUZW5hbnRBcHBDbGllbnQudXNlclBvb2xDbGllbnRJZDtcblxuICB9XG59XG4iXX0=
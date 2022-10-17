"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminStack = void 0;
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
class AdminStack extends aws_cdk_lib_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const adminPool = new cognito.UserPool(this, 'AdminUserPool', {
            userInvitation: {
                emailSubject: 'SaaS Admin temporary password for environment EKS SaaS Solution',
                emailBody: `<b>Welcome to SaaS Admin App for EKS!</b> <br>
        <br>
        You can log into the app <a href="http://${props === null || props === void 0 ? void 0 : props.elbUrl}/admin">here</a>.
        <br>
        Your username is: <b>{username}</b>
        <br>
        Your temporary password is: <b>{####}</b>
        <br>`,
            },
        });
        new cognito.UserPoolDomain(this, 'UserPoolDomain', {
            userPool: adminPool,
            cognitoDomain: {
                domainPrefix: `admin-pool-${this.account}`,
            },
        });
        const appClient = adminPool.addClient('AdminUserPoolClient', {
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
                callbackUrls: [`https://${props === null || props === void 0 ? void 0 : props.elbUrl}/admin`],
            },
            preventUserExistenceErrors: true,
        });
        new cognito.CfnUserPoolUser(this, 'AdminUser', {
            userPoolId: adminPool.userPoolId,
            desiredDeliveryMediums: ['EMAIL'],
            forceAliasCreation: false,
            /* userAttributes: [
               { name: 'email', value: "admin@eks-saas.com" },
               { name: 'email_verified', value: 'true' },
             ],
             username: "admin@eks-saas.com",
             */
            userAttributes: [
                { name: 'email', value: "admin@saas.com" },
                { name: 'email_verified', value: 'true' },
            ],
            username: "admin@saas.com",
        });
        this.userPoolId = adminPool.userPoolId;
        this.appClientId = appClient.userPoolClientId;
        this.issuer = adminPool.userPoolProviderUrl;
    }
}
exports.AdminStack = AdminStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhZG1pbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7O0dBR0c7QUFDSCw2Q0FBMkQ7QUFFM0QsbURBQW1EO0FBTW5ELE1BQWEsVUFBVyxTQUFRLHlCQUFXO0lBS3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDNUQsY0FBYyxFQUFFO2dCQUNkLFlBQVksRUFBRSxpRUFBaUU7Z0JBQy9FLFNBQVMsRUFBRTs7bURBRWdDLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxNQUFNOzs7OzthQUtuRDthQUNOO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRCxRQUFRLEVBQUUsU0FBUztZQUNuQixhQUFhLEVBQUU7Z0JBQ2IsWUFBWSxFQUFFLGNBQWMsSUFBSSxDQUFDLE9BQU8sRUFBRTthQUMzQztTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMscUJBQXFCLEVBQUU7WUFDM0QsY0FBYyxFQUFFLEtBQUs7WUFDckIsU0FBUyxFQUFFO2dCQUNULGlCQUFpQixFQUFFLElBQUk7Z0JBQ3ZCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLE9BQU8sRUFBRSxJQUFJO2FBQ2Q7WUFDRCxLQUFLLEVBQUU7Z0JBQ0wsS0FBSyxFQUFFO29CQUNMLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLHNCQUFzQixFQUFFLElBQUk7aUJBQzdCO2dCQUNELE1BQU0sRUFBRTtvQkFDTixPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUs7b0JBQ3hCLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSztvQkFDeEIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNO29CQUN6QixPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU87aUJBQzNCO2dCQUNELFlBQVksRUFBRSxDQUFDLFdBQVcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE1BQU0sUUFBUSxDQUFDO2FBQ2pEO1lBQ0QsMEJBQTBCLEVBQUUsSUFBSTtTQUNqQyxDQUFDLENBQUM7UUFFSCxJQUFJLE9BQU8sQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUM3QyxVQUFVLEVBQUUsU0FBUyxDQUFDLFVBQVU7WUFDaEMsc0JBQXNCLEVBQUUsQ0FBQyxPQUFPLENBQUM7WUFDakMsa0JBQWtCLEVBQUUsS0FBSztZQUMxQjs7Ozs7ZUFLRztZQUNGLGNBQWMsRUFBRTtnQkFDZCxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFO2dCQUMxQyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO2FBQzFDO1lBQ0QsUUFBUSxFQUFFLGdCQUFnQjtTQUUzQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7UUFDdkMsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLENBQUMsZ0JBQWdCLENBQUM7UUFDOUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsbUJBQW1CLENBQUM7SUFDOUMsQ0FBQztDQUNGO0FBekVELGdDQXlFQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNSVQtMFxuICovXG5pbXBvcnQgeyBOZXN0ZWRTdGFjaywgTmVzdGVkU3RhY2tQcm9wc30gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcblxuZXhwb3J0IGludGVyZmFjZSBBZG1pblN0YWNrUHJvcHMgZXh0ZW5kcyBOZXN0ZWRTdGFja1Byb3BzIHtcbiAgZWxiVXJsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBBZG1pblN0YWNrIGV4dGVuZHMgTmVzdGVkU3RhY2sge1xuICB1c2VyUG9vbElkOiBzdHJpbmc7XG4gIGFwcENsaWVudElkOiBzdHJpbmc7XG4gIGlzc3Vlcjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogQWRtaW5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBhZG1pblBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnQWRtaW5Vc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJJbnZpdGF0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogJ1NhYVMgQWRtaW4gdGVtcG9yYXJ5IHBhc3N3b3JkIGZvciBlbnZpcm9ubWVudCBFS1MgU2FhUyBTb2x1dGlvbicsXG4gICAgICAgIGVtYWlsQm9keTogYDxiPldlbGNvbWUgdG8gU2FhUyBBZG1pbiBBcHAgZm9yIEVLUyE8L2I+IDxicj5cbiAgICAgICAgPGJyPlxuICAgICAgICBZb3UgY2FuIGxvZyBpbnRvIHRoZSBhcHAgPGEgaHJlZj1cImh0dHA6Ly8ke3Byb3BzPy5lbGJVcmx9L2FkbWluXCI+aGVyZTwvYT4uXG4gICAgICAgIDxicj5cbiAgICAgICAgWW91ciB1c2VybmFtZSBpczogPGI+e3VzZXJuYW1lfTwvYj5cbiAgICAgICAgPGJyPlxuICAgICAgICBZb3VyIHRlbXBvcmFyeSBwYXNzd29yZCBpczogPGI+eyMjIyN9PC9iPlxuICAgICAgICA8YnI+YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB1c2VyUG9vbDogYWRtaW5Qb29sLFxuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGBhZG1pbi1wb29sLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXBwQ2xpZW50ID0gYWRtaW5Qb29sLmFkZENsaWVudCgnQWRtaW5Vc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IHRydWUsXG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QSE9ORSxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtgaHR0cHM6Ly8ke3Byb3BzPy5lbGJVcmx9L2FkbWluYF0sXG4gICAgICB9LFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXG4gICAgfSk7XG5cbiAgICBuZXcgY29nbml0by5DZm5Vc2VyUG9vbFVzZXIodGhpcywgJ0FkbWluVXNlcicsIHtcbiAgICAgIHVzZXJQb29sSWQ6IGFkbWluUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzaXJlZERlbGl2ZXJ5TWVkaXVtczogWydFTUFJTCddLFxuICAgICAgZm9yY2VBbGlhc0NyZWF0aW9uOiBmYWxzZSxcbiAgICAgLyogdXNlckF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyBuYW1lOiAnZW1haWwnLCB2YWx1ZTogXCJhZG1pbkBla3Mtc2Fhcy5jb21cIiB9LFxuICAgICAgICB7IG5hbWU6ICdlbWFpbF92ZXJpZmllZCcsIHZhbHVlOiAndHJ1ZScgfSxcbiAgICAgIF0sXG4gICAgICB1c2VybmFtZTogXCJhZG1pbkBla3Mtc2Fhcy5jb21cIixcbiAgICAgICovXG4gICAgICB1c2VyQXR0cmlidXRlczogW1xuICAgICAgICB7IG5hbWU6ICdlbWFpbCcsIHZhbHVlOiBcImFkbWluQHNhYXMuY29tXCIgfSxcbiAgICAgICAgeyBuYW1lOiAnZW1haWxfdmVyaWZpZWQnLCB2YWx1ZTogJ3RydWUnIH0sXG4gICAgICBdLFxuICAgICAgdXNlcm5hbWU6IFwiYWRtaW5Ac2Fhcy5jb21cIixcblxuICAgIH0pO1xuICAgIHRoaXMudXNlclBvb2xJZCA9IGFkbWluUG9vbC51c2VyUG9vbElkO1xuICAgIHRoaXMuYXBwQ2xpZW50SWQgPSBhcHBDbGllbnQudXNlclBvb2xDbGllbnRJZDtcbiAgICB0aGlzLmlzc3VlciA9IGFkbWluUG9vbC51c2VyUG9vbFByb3ZpZGVyVXJsO1xuICB9XG59XG4iXX0=
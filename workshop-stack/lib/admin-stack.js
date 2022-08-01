"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminStack = void 0;
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
const core_1 = require("@aws-cdk/core");
const cognito = require("@aws-cdk/aws-cognito");
class AdminStack extends core_1.NestedStack {
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
                { name: 'email', value: "tobuck@amazon.com" },
                { name: 'email_verified', value: 'true' },
            ],
            username: "tobuck@amazon.com",
        });
        this.userPoolId = adminPool.userPoolId;
        this.appClientId = appClient.userPoolClientId;
        this.issuer = adminPool.userPoolProviderUrl;
    }
}
exports.AdminStack = AdminStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhZG1pbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7O0dBR0c7QUFDSCx3Q0FBd0U7QUFDeEUsZ0RBQWdEO0FBTWhELE1BQWEsVUFBVyxTQUFRLGtCQUFXO0lBS3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDNUQsY0FBYyxFQUFFO2dCQUNkLFlBQVksRUFBRSxpRUFBaUU7Z0JBQy9FLFNBQVMsRUFBRTs7bURBRWdDLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxNQUFNOzs7OzthQUtuRDthQUNOO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRCxRQUFRLEVBQUUsU0FBUztZQUNuQixhQUFhLEVBQUU7Z0JBQ2IsWUFBWSxFQUFFLGNBQWMsSUFBSSxDQUFDLE9BQU8sRUFBRTthQUMzQztTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMscUJBQXFCLEVBQUU7WUFDM0QsY0FBYyxFQUFFLEtBQUs7WUFDckIsU0FBUyxFQUFFO2dCQUNULGlCQUFpQixFQUFFLElBQUk7Z0JBQ3ZCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLE9BQU8sRUFBRSxJQUFJO2FBQ2Q7WUFDRCxLQUFLLEVBQUU7Z0JBQ0wsS0FBSyxFQUFFO29CQUNMLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLHNCQUFzQixFQUFFLElBQUk7aUJBQzdCO2dCQUNELE1BQU0sRUFBRTtvQkFDTixPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUs7b0JBQ3hCLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSztvQkFDeEIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNO29CQUN6QixPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU87aUJBQzNCO2dCQUNELFlBQVksRUFBRSxDQUFDLFdBQVcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE1BQU0sUUFBUSxDQUFDO2FBQ2pEO1lBQ0QsMEJBQTBCLEVBQUUsSUFBSTtTQUNqQyxDQUFDLENBQUM7UUFFSCxJQUFJLE9BQU8sQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUM3QyxVQUFVLEVBQUUsU0FBUyxDQUFDLFVBQVU7WUFDaEMsc0JBQXNCLEVBQUUsQ0FBQyxPQUFPLENBQUM7WUFDakMsa0JBQWtCLEVBQUUsS0FBSztZQUMxQjs7Ozs7ZUFLRztZQUNGLGNBQWMsRUFBRTtnQkFDZCxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFO2dCQUM3QyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO2FBQzFDO1lBQ0QsUUFBUSxFQUFFLG1CQUFtQjtTQUU5QixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7UUFDdkMsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLENBQUMsZ0JBQWdCLENBQUM7UUFDOUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsbUJBQW1CLENBQUM7SUFDOUMsQ0FBQztDQUNGO0FBekVELGdDQXlFQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNSVQtMFxuICovXG5pbXBvcnQgeyBOZXN0ZWRTdGFjaywgTmVzdGVkU3RhY2tQcm9wcywgQ29uc3RydWN0fSBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnQGF3cy1jZGsvYXdzLWNvZ25pdG8nO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFkbWluU3RhY2tQcm9wcyBleHRlbmRzIE5lc3RlZFN0YWNrUHJvcHMge1xuICBlbGJVcmw6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEFkbWluU3RhY2sgZXh0ZW5kcyBOZXN0ZWRTdGFjayB7XG4gIHVzZXJQb29sSWQ6IHN0cmluZztcbiAgYXBwQ2xpZW50SWQ6IHN0cmluZztcbiAgaXNzdWVyOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBBZG1pblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGFkbWluUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdBZG1pblVzZXJQb29sJywge1xuICAgICAgdXNlckludml0YXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnU2FhUyBBZG1pbiB0ZW1wb3JhcnkgcGFzc3dvcmQgZm9yIGVudmlyb25tZW50IEVLUyBTYWFTIFNvbHV0aW9uJyxcbiAgICAgICAgZW1haWxCb2R5OiBgPGI+V2VsY29tZSB0byBTYWFTIEFkbWluIEFwcCBmb3IgRUtTITwvYj4gPGJyPlxuICAgICAgICA8YnI+XG4gICAgICAgIFlvdSBjYW4gbG9nIGludG8gdGhlIGFwcCA8YSBocmVmPVwiaHR0cDovLyR7cHJvcHM/LmVsYlVybH0vYWRtaW5cIj5oZXJlPC9hPi5cbiAgICAgICAgPGJyPlxuICAgICAgICBZb3VyIHVzZXJuYW1lIGlzOiA8Yj57dXNlcm5hbWV9PC9iPlxuICAgICAgICA8YnI+XG4gICAgICAgIFlvdXIgdGVtcG9yYXJ5IHBhc3N3b3JkIGlzOiA8Yj57IyMjI308L2I+XG4gICAgICAgIDxicj5gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBjb2duaXRvLlVzZXJQb29sRG9tYWluKHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHVzZXJQb29sOiBhZG1pblBvb2wsXG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogYGFkbWluLXBvb2wtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhcHBDbGllbnQgPSBhZG1pblBvb2wuYWRkQ2xpZW50KCdBZG1pblVzZXJQb29sQ2xpZW50Jywge1xuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICBjdXN0b206IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBIT05FLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogW2BodHRwczovLyR7cHJvcHM/LmVsYlVybH0vYWRtaW5gXSxcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIG5ldyBjb2duaXRvLkNmblVzZXJQb29sVXNlcih0aGlzLCAnQWRtaW5Vc2VyJywge1xuICAgICAgdXNlclBvb2xJZDogYWRtaW5Qb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNpcmVkRGVsaXZlcnlNZWRpdW1zOiBbJ0VNQUlMJ10sXG4gICAgICBmb3JjZUFsaWFzQ3JlYXRpb246IGZhbHNlLFxuICAgICAvKiB1c2VyQXR0cmlidXRlczogW1xuICAgICAgICB7IG5hbWU6ICdlbWFpbCcsIHZhbHVlOiBcImFkbWluQGVrcy1zYWFzLmNvbVwiIH0sXG4gICAgICAgIHsgbmFtZTogJ2VtYWlsX3ZlcmlmaWVkJywgdmFsdWU6ICd0cnVlJyB9LFxuICAgICAgXSxcbiAgICAgIHVzZXJuYW1lOiBcImFkbWluQGVrcy1zYWFzLmNvbVwiLFxuICAgICAgKi9cbiAgICAgIHVzZXJBdHRyaWJ1dGVzOiBbXG4gICAgICAgIHsgbmFtZTogJ2VtYWlsJywgdmFsdWU6IFwidG9idWNrQGFtYXpvbi5jb21cIiB9LFxuICAgICAgICB7IG5hbWU6ICdlbWFpbF92ZXJpZmllZCcsIHZhbHVlOiAndHJ1ZScgfSxcbiAgICAgIF0sXG4gICAgICB1c2VybmFtZTogXCJ0b2J1Y2tAYW1hem9uLmNvbVwiLFxuXG4gICAgfSk7XG4gICAgdGhpcy51c2VyUG9vbElkID0gYWRtaW5Qb29sLnVzZXJQb29sSWQ7XG4gICAgdGhpcy5hcHBDbGllbnRJZCA9IGFwcENsaWVudC51c2VyUG9vbENsaWVudElkO1xuICAgIHRoaXMuaXNzdWVyID0gYWRtaW5Qb29sLnVzZXJQb29sUHJvdmlkZXJVcmw7XG4gIH1cbn1cbiJdfQ==
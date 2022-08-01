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
        /*new cognito.CfnUserPoolUser(this, 'AdminUser', {
          userPoolId: adminPool.userPoolId,
          desiredDeliveryMediums: ['EMAIL'],
          forceAliasCreation: false,
          userAttributes: [
            { name: 'email', value: "ranraman@amazon.com" },
            { name: 'email_verified', value: 'true' },
          ],
          username: "ranraman@amazon.com",
          
        }); */
        this.userPoolId = adminPool.userPoolId;
        this.appClientId = appClient.userPoolClientId;
        this.issuer = adminPool.userPoolProviderUrl;
    }
}
exports.AdminStack = AdminStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhZG1pbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7O0dBR0c7QUFDSCx3Q0FBd0U7QUFDeEUsZ0RBQWdEO0FBTWhELE1BQWEsVUFBVyxTQUFRLGtCQUFXO0lBS3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDNUQsY0FBYyxFQUFFO2dCQUNkLFlBQVksRUFBRSxpRUFBaUU7Z0JBQy9FLFNBQVMsRUFBRTs7bURBRWdDLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxNQUFNOzs7OzthQUtuRDthQUNOO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRCxRQUFRLEVBQUUsU0FBUztZQUNuQixhQUFhLEVBQUU7Z0JBQ2IsWUFBWSxFQUFFLGNBQWMsSUFBSSxDQUFDLE9BQU8sRUFBRTthQUMzQztTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMscUJBQXFCLEVBQUU7WUFDM0QsY0FBYyxFQUFFLEtBQUs7WUFDckIsU0FBUyxFQUFFO2dCQUNULGlCQUFpQixFQUFFLElBQUk7Z0JBQ3ZCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLE9BQU8sRUFBRSxJQUFJO2FBQ2Q7WUFDRCxLQUFLLEVBQUU7Z0JBQ0wsS0FBSyxFQUFFO29CQUNMLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLHNCQUFzQixFQUFFLElBQUk7aUJBQzdCO2dCQUNELE1BQU0sRUFBRTtvQkFDTixPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUs7b0JBQ3hCLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSztvQkFDeEIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNO29CQUN6QixPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU87aUJBQzNCO2dCQUNELFlBQVksRUFBRSxDQUFDLFdBQVcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE1BQU0sUUFBUSxDQUFDO2FBQ2pEO1lBQ0QsMEJBQTBCLEVBQUUsSUFBSTtTQUNqQyxDQUFDLENBQUM7UUFFSDs7Ozs7Ozs7OztjQVVNO1FBQ04sSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxXQUFXLEdBQUcsU0FBUyxDQUFDLGdCQUFnQixDQUFDO1FBQzlDLElBQUksQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLG1CQUFtQixDQUFDO0lBQzlDLENBQUM7Q0FDRjtBQW5FRCxnQ0FtRUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IEFtYXpvbi5jb20sIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTUlULTBcbiAqL1xuaW1wb3J0IHsgTmVzdGVkU3RhY2ssIE5lc3RlZFN0YWNrUHJvcHMsIENvbnN0cnVjdH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2duaXRvJztcblxuZXhwb3J0IGludGVyZmFjZSBBZG1pblN0YWNrUHJvcHMgZXh0ZW5kcyBOZXN0ZWRTdGFja1Byb3BzIHtcbiAgZWxiVXJsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBBZG1pblN0YWNrIGV4dGVuZHMgTmVzdGVkU3RhY2sge1xuICB1c2VyUG9vbElkOiBzdHJpbmc7XG4gIGFwcENsaWVudElkOiBzdHJpbmc7XG4gIGlzc3Vlcjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogQWRtaW5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBhZG1pblBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnQWRtaW5Vc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJJbnZpdGF0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogJ1NhYVMgQWRtaW4gdGVtcG9yYXJ5IHBhc3N3b3JkIGZvciBlbnZpcm9ubWVudCBFS1MgU2FhUyBTb2x1dGlvbicsXG4gICAgICAgIGVtYWlsQm9keTogYDxiPldlbGNvbWUgdG8gU2FhUyBBZG1pbiBBcHAgZm9yIEVLUyE8L2I+IDxicj5cbiAgICAgICAgPGJyPlxuICAgICAgICBZb3UgY2FuIGxvZyBpbnRvIHRoZSBhcHAgPGEgaHJlZj1cImh0dHA6Ly8ke3Byb3BzPy5lbGJVcmx9L2FkbWluXCI+aGVyZTwvYT4uXG4gICAgICAgIDxicj5cbiAgICAgICAgWW91ciB1c2VybmFtZSBpczogPGI+e3VzZXJuYW1lfTwvYj5cbiAgICAgICAgPGJyPlxuICAgICAgICBZb3VyIHRlbXBvcmFyeSBwYXNzd29yZCBpczogPGI+eyMjIyN9PC9iPlxuICAgICAgICA8YnI+YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB1c2VyUG9vbDogYWRtaW5Qb29sLFxuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGBhZG1pbi1wb29sLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXBwQ2xpZW50ID0gYWRtaW5Qb29sLmFkZENsaWVudCgnQWRtaW5Vc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IHRydWUsXG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QSE9ORSxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtgaHR0cHM6Ly8ke3Byb3BzPy5lbGJVcmx9L2FkbWluYF0sXG4gICAgICB9LFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvKm5ldyBjb2duaXRvLkNmblVzZXJQb29sVXNlcih0aGlzLCAnQWRtaW5Vc2VyJywge1xuICAgICAgdXNlclBvb2xJZDogYWRtaW5Qb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNpcmVkRGVsaXZlcnlNZWRpdW1zOiBbJ0VNQUlMJ10sXG4gICAgICBmb3JjZUFsaWFzQ3JlYXRpb246IGZhbHNlLFxuICAgICAgdXNlckF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyBuYW1lOiAnZW1haWwnLCB2YWx1ZTogXCJyYW5yYW1hbkBhbWF6b24uY29tXCIgfSxcbiAgICAgICAgeyBuYW1lOiAnZW1haWxfdmVyaWZpZWQnLCB2YWx1ZTogJ3RydWUnIH0sXG4gICAgICBdLFxuICAgICAgdXNlcm5hbWU6IFwicmFucmFtYW5AYW1hem9uLmNvbVwiLFxuICAgICAgXG4gICAgfSk7ICovXG4gICAgdGhpcy51c2VyUG9vbElkID0gYWRtaW5Qb29sLnVzZXJQb29sSWQ7XG4gICAgdGhpcy5hcHBDbGllbnRJZCA9IGFwcENsaWVudC51c2VyUG9vbENsaWVudElkO1xuICAgIHRoaXMuaXNzdWVyID0gYWRtaW5Qb29sLnVzZXJQb29sUHJvdmlkZXJVcmw7XG4gIH1cbn1cbiJdfQ==
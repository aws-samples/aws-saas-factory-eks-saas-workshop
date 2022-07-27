"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onEventHandler = void 0;
const aws_sdk_1 = require("aws-sdk");
async function onEventHandler(event) {
    console.log(JSON.stringify(event, null, 4));
    const ec2 = new aws_sdk_1.EC2();
    if (event.RequestType === 'Create') {
        const { IamInstanceProfileAssociations } = await ec2.describeIamInstanceProfileAssociations({
            Filters: [
                {
                    Name: 'instance-id',
                    Values: [event.ResourceProperties.InstanceId]
                }
            ]
        }).promise();
        console.log(JSON.stringify(IamInstanceProfileAssociations, null, 4));
        if ((IamInstanceProfileAssociations === null || IamInstanceProfileAssociations === void 0 ? void 0 : IamInstanceProfileAssociations.length) == 1) {
            const associationId = IamInstanceProfileAssociations[0].AssociationId;
            if (associationId) {
                await ec2.replaceIamInstanceProfileAssociation({
                    IamInstanceProfile: {
                        Arn: event.ResourceProperties.InstanceProfileArn
                    },
                    AssociationId: associationId
                }).promise();
            }
        }
        else {
            await ec2.associateIamInstanceProfile({
                IamInstanceProfile: {
                    Arn: event.ResourceProperties.InstanceProfileArn
                },
                InstanceId: event.ResourceProperties.InstanceId
            }).promise();
        }
    }
    return {
        PhysicalResourceId: '',
    };
}
exports.onEventHandler = onEventHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxxQ0FBOEI7QUFFdkIsS0FBSyxVQUFVLGNBQWMsQ0FBQyxLQUFxQjtJQUN0RCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTVDLE1BQU0sR0FBRyxHQUFHLElBQUksYUFBRyxFQUFFLENBQUM7SUFFdEIsSUFBSSxLQUFLLENBQUMsV0FBVyxLQUFLLFFBQVEsRUFBRTtRQUNoQyxNQUFNLEVBQUUsOEJBQThCLEVBQUUsR0FBRyxNQUFNLEdBQUcsQ0FBQyxzQ0FBc0MsQ0FBQztZQUN4RixPQUFPLEVBQUU7Z0JBQ0w7b0JBQ0ksSUFBSSxFQUFFLGFBQWE7b0JBQ25CLE1BQU0sRUFBRSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUM7aUJBQ2hEO2FBQ0o7U0FDSixDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFYixPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFckUsSUFBSSxDQUFBLDhCQUE4QixhQUE5Qiw4QkFBOEIsdUJBQTlCLDhCQUE4QixDQUFFLE1BQU0sS0FBSSxDQUFDLEVBQUU7WUFDN0MsTUFBTSxhQUFhLEdBQUcsOEJBQThCLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDO1lBQ3RFLElBQUksYUFBYSxFQUFFO2dCQUNmLE1BQU0sR0FBRyxDQUFDLG9DQUFvQyxDQUFDO29CQUMzQyxrQkFBa0IsRUFBRTt3QkFDaEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0I7cUJBQ25EO29CQUNELGFBQWEsRUFBRSxhQUFhO2lCQUMvQixDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7YUFDaEI7U0FDSjthQUFNO1lBQ0gsTUFBTSxHQUFHLENBQUMsMkJBQTJCLENBQUM7Z0JBQ2xDLGtCQUFrQixFQUFFO29CQUNoQixHQUFHLEVBQUUsS0FBSyxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQjtpQkFDbkQ7Z0JBQ0QsVUFBVSxFQUFFLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVO2FBQ2xELENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztTQUNoQjtLQUNKO0lBQ0QsT0FBTztRQUNILGtCQUFrQixFQUFFLEVBQUU7S0FDekIsQ0FBQTtBQUNMLENBQUM7QUF2Q0Qsd0NBdUNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBPbkV2ZW50UmVxdWVzdCwgT25FdmVudFJlc3BvbnNlIH0gZnJvbSAnQGF3cy1jZGsvY3VzdG9tLXJlc291cmNlcy9saWIvcHJvdmlkZXItZnJhbWV3b3JrL3R5cGVzJztcbmltcG9ydCB7IEVDMiB9IGZyb20gJ2F3cy1zZGsnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb25FdmVudEhhbmRsZXIoZXZlbnQ6IE9uRXZlbnRSZXF1ZXN0KTogUHJvbWlzZTxPbkV2ZW50UmVzcG9uc2U+IHtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgNCkpO1xuXG4gICAgY29uc3QgZWMyID0gbmV3IEVDMigpO1xuXG4gICAgaWYgKGV2ZW50LlJlcXVlc3RUeXBlID09PSAnQ3JlYXRlJykge1xuICAgICAgICBjb25zdCB7IElhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9ucyB9ID0gYXdhaXQgZWMyLmRlc2NyaWJlSWFtSW5zdGFuY2VQcm9maWxlQXNzb2NpYXRpb25zKHtcbiAgICAgICAgICAgIEZpbHRlcnM6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIE5hbWU6ICdpbnN0YW5jZS1pZCcsXG4gICAgICAgICAgICAgICAgICAgIFZhbHVlczogW2V2ZW50LlJlc291cmNlUHJvcGVydGllcy5JbnN0YW5jZUlkXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfSkucHJvbWlzZSgpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KElhbUluc3RhbmNlUHJvZmlsZUFzc29jaWF0aW9ucywgbnVsbCwgNCkpO1xuXG4gICAgICAgIGlmIChJYW1JbnN0YW5jZVByb2ZpbGVBc3NvY2lhdGlvbnM/Lmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICBjb25zdCBhc3NvY2lhdGlvbklkID0gSWFtSW5zdGFuY2VQcm9maWxlQXNzb2NpYXRpb25zWzBdLkFzc29jaWF0aW9uSWQ7XG4gICAgICAgICAgICBpZiAoYXNzb2NpYXRpb25JZCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGVjMi5yZXBsYWNlSWFtSW5zdGFuY2VQcm9maWxlQXNzb2NpYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICBJYW1JbnN0YW5jZVByb2ZpbGU6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEFybjogZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLkluc3RhbmNlUHJvZmlsZUFyblxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBBc3NvY2lhdGlvbklkOiBhc3NvY2lhdGlvbklkXG4gICAgICAgICAgICAgICAgfSkucHJvbWlzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgZWMyLmFzc29jaWF0ZUlhbUluc3RhbmNlUHJvZmlsZSh7XG4gICAgICAgICAgICAgICAgSWFtSW5zdGFuY2VQcm9maWxlOiB7XG4gICAgICAgICAgICAgICAgICAgIEFybjogZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLkluc3RhbmNlUHJvZmlsZUFyblxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgSW5zdGFuY2VJZDogZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzLkluc3RhbmNlSWRcbiAgICAgICAgICAgIH0pLnByb21pc2UoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBQaHlzaWNhbFJlc291cmNlSWQ6ICcnLFxuICAgIH1cbn0iXX0=